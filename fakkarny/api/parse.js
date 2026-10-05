// فكرني — AI parser. Turns an Egyptian Arabic voice transcript into tasks,
// or breaks a big task into small steps before its deadline.
// Needs ANTHROPIC_API_KEY in the Vercel project env. Without it the app
// silently falls back to the on-device parser (parser.js).
import Anthropic from "@anthropic-ai/sdk";

const client = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;

const TASK = {
  type: "object",
  properties: {
    title: { type: "string", description: "Short task title in Egyptian Arabic, no date/time words, first person verb ok (e.g. 'اتصل بماما', 'ميعاد الدكتور')" },
    emoji: { type: "string", description: "One fitting emoji" },
    category: { type: "string", enum: ["health", "appointment", "people", "fitness", "water", "study", "errand", "work", "faith", "other"] },
    date: { type: ["string", "null"], description: "YYYY-MM-DD or null if no day implied" },
    time: { type: ["string", "null"], description: "HH:MM 24h or null" },
    repeat: { type: "string", enum: ["none", "daily", "weekly", "monthly"] },
    person: { type: ["string", "null"], description: "Person to call/visit if any" },
    isBig: { type: "boolean", description: "True for big tasks people procrastinate on (report, project, exam, presentation)" },
    steps: { type: "array", items: { type: "string" }, description: "For big tasks only: 3-5 tiny concrete steps in Egyptian Arabic; else empty" },
  },
  required: ["title", "emoji", "category", "date", "time", "repeat", "person", "isBig", "steps"],
  additionalProperties: false,
};

const PARSE_SCHEMA = {
  type: "object",
  properties: {
    tasks: { type: "array", items: TASK },
    reply: { type: "string", description: "One short, warm, funny Egyptian Arabic confirmation line" },
  },
  required: ["tasks", "reply"],
  additionalProperties: false,
};

const BREAKDOWN_SCHEMA = {
  type: "object",
  properties: {
    steps: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          date: { type: "string", description: "YYYY-MM-DD" },
          minutes: { type: "integer" },
        },
        required: ["title", "date", "minutes"],
        additionalProperties: false,
      },
    },
    reply: { type: "string" },
  },
  required: ["steps", "reply"],
  additionalProperties: false,
};

const PARSE_SYSTEM = `You are the brain of "فكرني", an Egyptian reminders app. The user dictated a voice note (speech-to-text, may be messy, Egyptian dialect, may mix English).
Extract every separate thing they want to be reminded of as a task.
Rules:
- Resolve relative days (النهارده، بكرة، بعد بكرة، يوم الخميس، الأسبوع الجاي، أول الشهر) against the given current date/time.
- Egyptian time defaults: "الساعة ٣" with no period means 15:00; 8-11 with no period mean morning; الصبح=AM, الضهر≈13:00, العصر≈16:00, المغرب≈18:00, بالليل≈21:00, قبل النوم≈23:00.
- If a later item in the same sentence has no day, it usually shares the previous item's day.
- If only a time is given and it already passed today, use tomorrow.
- Titles: short, natural Egyptian Arabic, no filler (فكرني، عايز، لازم، ان) and no date/time words.
- "كل يوم" => daily, "كل جمعة/أسبوع" => weekly, "كل شهر" => monthly.
- Never invent tasks that were not said.`;

const BREAKDOWN_SYSTEM = `You are the anti-procrastination coach of "فكرني". Break the user's big task into 3-6 tiny, concrete, non-scary steps (each 10-45 minutes) spread across the days from today until ONE DAY BEFORE the real deadline (a safety buffer). The first step must be doable in 5-10 minutes today. Write step titles in short Egyptian Arabic. Reply line: one motivating, slightly funny Egyptian sentence.`;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  if (!client) return res.status(503).json({ error: "no_api_key" });

  const { mode = "parse", text = "", now, weekday, task, deadline } = req.body || {};
  if (mode === "parse" && (!text || text.length > 4000)) return res.status(400).json({ error: "bad_text" });

  const context = `Current local date/time: ${now} (${weekday}).`;
  const isBreakdown = mode === "breakdown";

  try {
    const response = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 4000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: {
        effort: "low",
        format: { type: "json_schema", schema: isBreakdown ? BREAKDOWN_SCHEMA : PARSE_SCHEMA },
      },
      system: isBreakdown ? BREAKDOWN_SYSTEM : PARSE_SYSTEM,
      messages: [{
        role: "user",
        content: isBreakdown
          ? `${context}\nBig task: ${task}\nReal deadline: ${deadline}`
          : `${context}\nVoice note:\n${text}`,
      }],
    });

    if (response.stop_reason === "refusal") return res.status(422).json({ error: "refused" });
    const block = response.content.find((b) => b.type === "text");
    if (!block) return res.status(502).json({ error: "empty" });
    return res.status(200).json({ ...JSON.parse(block.text), source: "ai" });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) return res.status(429).json({ error: "rate_limited" });
    if (err instanceof Anthropic.APIError) return res.status(502).json({ error: "upstream", status: err.status });
    return res.status(500).json({ error: "parse_failed" });
  }
}
