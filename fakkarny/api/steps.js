// Steps from Apple Health. An iOS Shortcuts automation calls GET /api/steps?d=<device>&n=<steps today>;
// the app reads them back with GET /api/steps?d=<device>. Stored in Upstash Redis for 8 days.
import { redis } from "./_lib.js";

const DAY_TTL = 8 * 86400;

function cairoDate(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

export default async function handler(req, res) {
  const q = req.method === "POST" ? { ...req.query, ...(req.body || {}) } : req.query;
  const device = String(q.d || "");
  if (!/^[a-z0-9]{6,40}$/i.test(device)) return res.status(400).json({ error: "bad_device" });
  if (!process.env.UPSTASH_REDIS_REST_URL) return res.status(503).json({ error: "not_configured" });

  try {
    if (q.n != null && q.n !== "") {
      // Shortcuts may send "6,234" or "6234.0"
      const n = Math.round(Number(String(q.n).replace(/[^\d.]/g, "")));
      if (!Number.isFinite(n) || n < 0 || n > 200000) return res.status(400).json({ error: "bad_steps" });
      const date = /^\d{4}-\d{2}-\d{2}$/.test(String(q.date || "")) ? String(q.date) : cairoDate();
      await redis(["SET", `steps:${device}:${date}`, String(n), "EX", String(DAY_TTL)]);
      return res.status(200).json({ ok: true, date, steps: n });
    }
    const keys = Array.from({ length: 7 }, (_, i) => cairoDate(-i));
    const vals = await redis(["MGET", ...keys.map((k) => `steps:${device}:${k}`)]);
    const days = {};
    keys.forEach((k, i) => { if (vals && vals[i] != null) days[k] = Number(vals[i]); });
    return res.status(200).json({ days });
  } catch (err) {
    console.error("steps failed", err && err.message);
    return res.status(500).json({ error: "steps_failed" });
  }
}
