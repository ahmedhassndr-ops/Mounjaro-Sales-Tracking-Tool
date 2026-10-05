// فكرني: background reminders. The phone sends its push subscription plus the reminders of the
// next few days; each one is handed to QStash with a "deliver at" time, and QStash calls
// /api/push-fire at that moment, which sends the web push. Needs UPSTASH_REDIS_REST_URL/TOKEN,
// QSTASH_URL/TOKEN, QSTASH_CURRENT_SIGNING_KEY (used as the fire secret) and VAPID_PUBLIC_KEY.
import { redis, SITE, FIRE_SECRET } from "./_lib.js";

const QSTASH_URL = process.env.QSTASH_URL || "https://qstash.upstash.io";
const QSTASH_TOKEN = process.env.QSTASH_TOKEN;
const DAY = 86400000;
const WINDOW = 3 * DAY; // how far ahead reminders are scheduled; the app resyncs whenever it opens
const MAX_ITEMS = 150;

function clean(it) {
  const at = Math.round(Number(it && it.at));
  if (!it || typeof it.id !== "string" || !at) return null;
  return {
    id: it.id.slice(0, 80),
    at,
    title: String(it.title || "فكرني").slice(0, 120),
    body: String(it.body || "").slice(0, 300),
    url: typeof it.url === "string" && /^https:\/\/(wa\.me|api\.whatsapp\.com)\//.test(it.url) ? it.url.slice(0, 1500) : null,
  };
}

async function schedule(device, item) {
  const dest = `${SITE}/api/push-fire?k=${encodeURIComponent(FIRE_SECRET)}`;
  const r = await fetch(`${QSTASH_URL}/v2/publish/${dest}`, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + QSTASH_TOKEN,
      "Content-Type": "application/json",
      "Upstash-Not-Before": String(Math.floor(item.at / 1000)),
      "Upstash-Retries": "2",
    },
    body: JSON.stringify({ device, id: item.id, at: item.at }),
  });
  return r.ok;
}

export default async function handler(req, res) {
  if (req.method === "GET") return res.status(200).json({ ok: !!(QSTASH_TOKEN && process.env.VAPID_PUBLIC_KEY), publicKey: process.env.VAPID_PUBLIC_KEY || null });
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  if (!QSTASH_TOKEN) return res.status(503).json({ error: "not_configured" });

  const { action = "sync", device = "", sub = null, items = [] } = req.body || {};
  if (!/^[a-z0-9]{6,40}$/i.test(device)) return res.status(400).json({ error: "bad_device" });

  try {
    if (action === "unsub") {
      await redis(["DEL", `sub:${device}`, `rem:${device}`]);
      return res.status(200).json({ ok: true });
    }
    if (!sub || typeof sub.endpoint !== "string" || !sub.keys) return res.status(400).json({ error: "bad_sub" });
    await redis(["SET", `sub:${device}`, JSON.stringify(sub), "EX", String(60 * 60 * 24 * 60)]);

    const now = Date.now();
    const list = (Array.isArray(items) ? items : []).map(clean).filter((x) => x && x.at > now && x.at < now + WINDOW).slice(0, MAX_ITEMS);

    // replace the stored set; a scheduled message whose item changed or vanished is ignored when it fires
    await redis(["DEL", `rem:${device}`]);
    if (list.length) {
      const args = ["HSET", `rem:${device}`];
      list.forEach((x) => args.push(x.id, JSON.stringify(x)));
      await redis(args);
      await redis(["EXPIRE", `rem:${device}`, String(Math.ceil(WINDOW / 1000) + 3600)]);
    }

    // only publish what isn't already scheduled for the same time
    let scheduled = 0;
    for (const x of list) {
      const key = `sch:${device}:${x.id}`;
      const prev = await redis(["GET", key]);
      if (prev === String(x.at)) continue;
      if (await schedule(device, x)) {
        await redis(["SET", key, String(x.at), "PX", String(x.at - now + DAY)]);
        scheduled++;
      }
    }
    return res.status(200).json({ ok: true, items: list.length, scheduled });
  } catch (err) {
    console.error("push sync failed", err && err.message);
    return res.status(500).json({ error: "sync_failed" });
  }
}
