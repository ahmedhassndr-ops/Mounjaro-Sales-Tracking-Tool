// فكرني — AI parser. Turns an Egyptian Arabic voice transcript into tasks,
// or breaks a big task into small steps before its deadline.
// Runs on Groq's free tier (gpt-oss-120b, strict JSON schema). Needs GROQ_API_KEY in the
// Vercel project env. Without it the app silently falls back to the on-device parser (parser.js).
const KEY = process.env.GROQ_API_KEY;
const MODEL = "openai/gpt-oss-120b";

const TASK = {
  type: "object",
  properties: {
    title: { type: "string", description: "Short task title in Egyptian Arabic, no date/time words, first person verb ok (e.g. 'اتصل بماما', 'ميعاد الدكتور')" },
    emoji: { type: "string", description: "One fitting emoji, used as the task icon" },
    category: { type: "string", enum: ["health", "appointment", "people", "fitness", "water", "study", "errand", "work", "faith", "other"] },
    date: { type: ["string", "null"], description: "YYYY-MM-DD or null if no day implied" },
    time: { type: ["string", "null"], description: "HH:MM 24h or null" },
    repeat: { type: "string", enum: ["none", "daily", "weekly", "monthly"] },
    person: { type: ["string", "null"], description: "Person to call/visit if any" },
    priority: { type: "string", enum: ["normal", "high"], description: "high when the user says top priority, مهم, ضروري, أولوية, urgent" },
    notes: { type: "string", description: "Every concrete detail the user gave (amounts, accounts, banks, names, places, numbers), in Egyptian Arabic, short lines separated by newlines. Empty string if none." },
    send: {
      type: "object",
      description: "Only when the user wants a message sent to someone else at the task time (ابعت لـ، فكّر بابا، قول لفلان، بلّغ الموظفين). Otherwise all fields null.",
      properties: {
        to: { type: ["string", "null"], description: "Who receives it, as the user named them (بابا, الدكتور أيمن, فريق الصيدلية)" },
        phone: { type: ["string", "null"], description: "Phone digits only if the user said a number" },
        message: { type: ["string", "null"], description: "The message itself, written warmly in spoken Egyptian Arabic, addressed to the recipient, as the user would send it" },
      },
      required: ["to", "phone", "message"],
      additionalProperties: false,
    },
    isBig: { type: "boolean", description: "True for big tasks people procrastinate on (report, project, exam, presentation)" },
    steps: { type: "array", items: { type: "string" }, description: "For big tasks only: 3-5 tiny concrete steps in Egyptian Arabic; else empty" },
  },
  required: ["title", "emoji", "category", "date", "time", "repeat", "person", "priority", "notes", "send", "isBig", "steps"],
  additionalProperties: false,
};

const PARSE_SCHEMA = {
  type: "object",
  properties: {
    tasks: { type: "array", items: TASK },
    updates: {
      type: "array",
      description: "Changes to tasks the user already has (listed in the request). Empty if the user only adds new things.",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          remove: { type: "boolean", description: "true to delete the task" },
          done: { type: "boolean", description: "true if the user says they finished it" },
          date: { type: ["string", "null"], description: "new YYYY-MM-DD, or null to keep" },
          time: { type: ["string", "null"], description: "new HH:MM, or null to keep" },
          priority: { type: ["string", "null"], enum: ["normal", "high", null] },
          addNote: { type: ["string", "null"], description: "detail to append to the task's notes, or null" },
          summary: { type: "string", description: "What changed, in a few Egyptian Arabic words, e.g. 'خليتها الساعة ١١'" },
        },
        required: ["id", "remove", "done", "date", "time", "priority", "addNote", "summary"],
        additionalProperties: false,
      },
    },
    reply: { type: "string", description: "One short confirmation line. Spoken Egyptian Arabic like a friend texting (حطيت، شلت، فكرتك; never تم or MSA), max 10 words, no emoji, no ellipsis, no MSA words, no slogans" },
  },
  required: ["tasks", "updates", "reply"],
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

const REVIEW_SCHEMA = {
  type: "object",
  properties: {
    feedback: { type: "string", description: "2-3 short lines in spoken Egyptian Arabic, separated by newlines" },
    plan: {
      type: "object",
      properties: {
        items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          taskId: { type: ["string", "null"], description: "id of an existing task carried to tomorrow, or null for a new one" },
          title: { type: "string" },
          time: { type: ["string", "null"], description: "HH:MM 24h or null" },
          priority: { type: "string", enum: ["normal", "high"] },
        },
        required: ["taskId", "title", "time", "priority"],
        additionalProperties: false,
      },
        },
      },
      required: ["items"],
      additionalProperties: false,
    },
  },
  required: ["feedback", "plan"],
  additionalProperties: false,
};

const REVIEW_SYSTEM = `You are the end-of-day coach of "فكرني", an Egyptian app that fights procrastination. You get today's done and missed tasks, goals, prayers, snooze count, and the user's own notes on what went well and what could be better.
Write:
- feedback: 2-3 short lines in spoken Egyptian Arabic (like a friend texting, no MSA, no emoji, no slogans). Line 1: one specific thing that went well today. Line 2: one concrete thing to do differently tomorrow, based on what you see (snoozing, overdue tasks, missed prayers, the user's notes). Optional line 3: one short push.
- plan.items: tomorrow's items, max 6. Include the missed tasks the user chose to carry (use their taskId) and anything new the user's notes clearly ask for (taskId null). Order by priority. Give realistic times: important or hard things in the morning, nothing between 00:00 and 07:00, keep a task's existing time if it had one, leave time null for small anytime things. Titles in short Egyptian Arabic.
Never invent tasks that are not implied by the input.`;

const ONBOARD_SCHEMA = {
  type: "object",
  properties: {
    intro: { type: "string", description: "One or two short lines in spoken Egyptian Arabic explaining the plan" },
    goals: {
      type: "object",
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" }, emoji: { type: "string" },
              target: { type: "integer" }, period: { type: "string", enum: ["day", "week"] }, unit: { type: "string" },
            },
            required: ["title", "emoji", "target", "period", "unit"], additionalProperties: false,
          },
        },
      },
      required: ["items"], additionalProperties: false,
    },
    reminders: {
      type: "object",
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" }, emoji: { type: "string" },
              time: { type: ["string", "null"] }, repeat: { type: "string", enum: ["none", "daily", "weekly", "monthly"] },
              priority: { type: "string", enum: ["normal", "high"] }, notes: { type: "string" },
            },
            required: ["title", "emoji", "time", "repeat", "priority", "notes"], additionalProperties: false,
          },
        },
      },
      required: ["items"], additionalProperties: false,
    },
  },
  required: ["intro", "goals", "reminders"],
  additionalProperties: false,
};

const ONBOARD_SYSTEM = `You set up "فكرني" (an Egyptian anti-procrastination reminders app) for a new user. You get their name, why they came (reasons) and, in their own words, what they want to achieve in a period.
Build a small, realistic starter plan they can actually keep:
- goals.items: 2-5 habit goals counted per day or per week (e.g. water 8 glasses/day, gym 3/week, study 1/day). Break big wishes into the daily or weekly habit that gets them there (lose 5 kg => walk daily + gym 3/week). If prayer is a reason, include "الصلاة في وقتها" 5/day.
- reminders.items: 2-6 recurring or one-off reminders with sensible times (medicine at a fixed time daily, call family weekly, weekly money review, a daily slot for the thing they keep postponing). No times between 00:00 and 07:00.
- Fewer, achievable items beat many. Nothing the user did not imply.
- intro: 1-2 short lines in spoken Egyptian Arabic, warm, no emoji, no MSA, no slogans.
- target is how many TIMES per period, never minutes: "أمشي ٣٠ دقيقة" is target 1 per day; water is 8 per day.
- Never put the same thing in both lists: medicine and fixed-time things are reminders, habits you count are goals.
- Titles: short first-person spoken Egyptian verbs, like the user would say them: آخد الدوا، أذاكر ساعة ديزاين، أمشي ٣٠ دقيقة، أوزن نفسي. Never MSA forms like أخذ، خذ، دراسة، مراجعة الوزن.
One emoji per item.`;

const PARSE_SYSTEM = `You are the brain of "فكرني", an Egyptian reminders app. The user dictated a voice note (speech-to-text, may be messy, Egyptian dialect, may mix English).
Extract every separate thing they want to be reminded of as a task.
Rules:
- Resolve relative days (النهارده، بكرة، بعد بكرة، يوم الخميس، الأسبوع الجاي، أول الشهر) against the given current date/time.
- Egyptian time defaults: "الساعة ٣" with no period means 15:00; 8-11 with no period mean morning, unless that hour already passed today and the evening one has not (at 17:30 "الساعة ١٠ النهارده" = 22:00); الصبح=AM, الضهر≈13:00, العصر≈16:00, المغرب≈18:00, بالليل≈21:00, قبل النوم≈23:00.
- If a later item in the same sentence has no day, it usually shares the previous item's day.
- If only a time is given and it already passed today, use tomorrow.
- Titles: short, natural Egyptian Arabic, no filler (فكرني، عايز، لازم، ان) and no date/time words.
- "كل يوم" => daily, "كل جمعة/أسبوع" => weekly, "كل شهر" => monthly.
- ONE request = ONE task. A long sentence that explains a single thing (who, how much, from which account, why) is one task: put the explanation in notes and keep the title short. Only make several tasks when the user asks for different things to happen.
  Example: "فكرني إني لسه محول لدكتور أيمن من صيدلية السلامة خمسين ألف من حساب CIB بتاع الصيدلية وعشرين ألف من السيفينجز في QNB، فكرني بيهم الساعة عشرة النهارده وخليها توب بريوريتي" => one task, title "أتابع تحويل دكتور أيمن (صيدلية السلامة)", time 10:00 today, priority high, notes "٥٠,٠٠٠ ج من حساب CIB بتاع الصيدلية\n٢٠,٠٠٠ ج من السيفينجز في QNB\nالإجمالي ٧٠,٠٠٠ ج".
- Keep numbers, amounts, bank and account names exactly as said. Fix obvious speech-to-text spelling mistakes in Egyptian words; write bank names and English terms in Latin letters (CIB, QNB, savings).
- If the user refers to something they already have (in the existing tasks list), e.g. "خلي ميعاد دكتور أيمن الساعة ١١" or "شيل تذكير الجيم" or "خلصت التحويل", return it in updates with that task's id instead of creating a new task.
- Messages to other people: "فكرني الساعة ٩ كل يوم ابعت لبابا ياخد دواه" => one daily 09:00 task, title "ابعت لبابا: الدوا", send.to "بابا", send.message "من فضلك يا بابا متنساش تاخد دواك دلوقتي". Fill send only when someone else should receive a message.
- Never invent tasks that were not said.`;

const BREAKDOWN_SYSTEM = `You are the anti-procrastination coach of "فكرني". Break the user's big task into 3-6 tiny, concrete, non-scary steps (each 10-45 minutes) spread across the days from today until ONE DAY BEFORE the real deadline (a safety buffer). The first step must be doable in 5-10 minutes today. Write step titles in short Egyptian Arabic. Reply line: one sentence. Spoken Egyptian Arabic like a friend texting (حطيت، شلت، فكرتك; never تم or MSA), max 10 words, no emoji, no ellipsis, no MSA words, no slogans.`;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  if (!KEY) return res.status(503).json({ error: "no_api_key" });

  const { mode = "parse", text = "", now, weekday, task, deadline, existing = [] } = req.body || {};
  if (!["parse", "breakdown", "review", "onboard"].includes(mode)) return res.status(400).json({ error: "bad_mode" });
  if (mode === "parse" && (!text || text.length > 4000)) return res.status(400).json({ error: "bad_text" });
  const open = (Array.isArray(existing) ? existing : []).slice(0, 60)
    .map((t) => `${t.id} | ${String(t.title || "").slice(0, 80)} | ${t.date || "-"} ${t.time || ""}`).join("\n");

  const context = `Current local date/time: ${now} (${weekday}).`;
  const isBreakdown = mode === "breakdown", isReview = mode === "review", isOnboard = mode === "onboard";
  const { day = {}, profile = {} } = req.body || {};
  const user = isOnboard
    ? `${context}\nNew user (JSON):\n${JSON.stringify(profile).slice(0, 3000)}`
    : isReview
    ? `${context}\nToday's review data (JSON):\n${JSON.stringify(day).slice(0, 6000)}`
    : isBreakdown
    ? `${context}\nBig task: ${task}\nReal deadline: ${deadline}`
    : `${context}\nExisting tasks (id | title | date time):\n${open || "none"}\n\nVoice note:\n${text}`;
  const system = isOnboard ? ONBOARD_SYSTEM : isReview ? REVIEW_SYSTEM : isBreakdown ? BREAKDOWN_SYSTEM : PARSE_SYSTEM;
  const schema = isOnboard ? ONBOARD_SCHEMA : isReview ? REVIEW_SCHEMA : isBreakdown ? BREAKDOWN_SCHEMA : PARSE_SCHEMA;

  try {
    // Groq validates strict JSON after generation; retry when the model returns the wrong shape.
    let r, detail = "";
    for (let attempt = 0; attempt < 3; attempt++) {
      r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: "Bearer " + KEY, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: MODEL,
          temperature: 0.2 + attempt * 0.25,
          reasoning_effort: "medium",
          max_completion_tokens: 4000,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          response_format: {
            type: "json_schema",
            json_schema: { name: mode, strict: true, schema },
          },
        }),
      });
      if (r.ok || r.status !== 400) break;
      detail = (await r.text()).slice(0, 300);
      if (!detail.includes("json_validate_failed")) break;
    }
    if (r.status === 429) return res.status(429).json({ error: "rate_limited" });
    if (!r.ok) { if (!detail) detail = (await r.text()).slice(0, 300); console.error("groq", r.status, detail); return res.status(502).json({ error: "upstream", status: r.status }); }
    const data = await r.json();
    const content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (!content) return res.status(502).json({ error: "empty" });
    return res.status(200).json({ ...JSON.parse(content), source: "ai" });
  } catch (err) {
    console.error("parse_failed", err && err.message);
    return res.status(500).json({ error: "parse_failed" });
  }
}
