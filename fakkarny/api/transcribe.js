// فكرني: speech-to-text. The app records audio with MediaRecorder and sends it here
// as base64 JSON; Whisper large-v3 on Groq (free tier, then ~$0.11 per audio hour)
// turns Egyptian Arabic with English words mixed in into text. Needs GROQ_API_KEY.
// Without it, GET reports ok:false and the app falls back to the browser's recognizer.
const KEY = process.env.GROQ_API_KEY;
const MAX_B64 = 4_000_000; // stays under Vercel's 4.5 MB request limit (~3 MB of audio)
// Whisper's prompt steers spelling and style: Egyptian dialect, English brand names in Latin.
const STYLE = "فكرني بكرة الساعة ١٠ إني حولت خمسين ألف جنيه من حساب CIB وعشرين ألف من الـ savings في QNB، وأكلم ماما بالليل.";

export default async function handler(req, res) {
  if (req.method === "GET") return res.status(200).json({ ok: !!KEY });
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  if (!KEY) return res.status(503).json({ error: "no_api_key" });

  const { audio = "", mime = "audio/webm", terms = [] } = req.body || {};
  if (!audio || audio.length > MAX_B64) return res.status(400).json({ error: "bad_audio" });

  // The user's own people names help Whisper spell them right.
  const names = (Array.isArray(terms) ? terms : [])
    .filter((t) => typeof t === "string" && t.trim() && t.length <= 30)
    .slice(0, 20);
  const prompt = (STYLE + (names.length ? " " + names.join("، ") : "")).slice(0, 600);

  const form = new FormData();
  form.append("model", "whisper-large-v3");
  form.append("language", "ar");
  form.append("temperature", "0");
  form.append("prompt", prompt);
  form.append("file", new Blob([Buffer.from(audio, "base64")], { type: mime }), "voice." + (mime.includes("mp4") ? "mp4" : "webm"));

  try {
    const r = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: "Bearer " + KEY },
      body: form,
    });
    if (r.status === 429) return res.status(429).json({ error: "rate_limited" });
    if (!r.ok) return res.status(502).json({ error: "upstream", status: r.status });
    const data = await r.json();
    return res.status(200).json({ text: (data.text || "").trim() });
  } catch (err) {
    return res.status(500).json({ error: "transcribe_failed" });
  }
}
