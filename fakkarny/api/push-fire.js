// Called by QStash at a reminder's time. Sends the web push if the reminder is still current.
import webpush from "web-push";
import { redis, SITE, FIRE_SECRET } from "./_lib.js";

webpush.setVapidDetails(SITE, process.env.VAPID_PUBLIC_KEY || "", process.env.VAPID_PRIVATE_KEY || "");

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  if (!FIRE_SECRET || req.query.k !== FIRE_SECRET) return res.status(401).end();

  const { device = "", id = "", at = 0 } = req.body || {};
  try {
    const raw = await redis(["HGET", `rem:${device}`, id]);
    if (!raw) return res.status(200).json({ skipped: "gone" });
    const item = JSON.parse(raw);
    if (item.at !== at) return res.status(200).json({ skipped: "moved" });

    const subRaw = await redis(["GET", `sub:${device}`]);
    if (!subRaw) return res.status(200).json({ skipped: "no_sub" });

    const payload = JSON.stringify({ title: item.title, body: item.body, tag: id.split("|")[0], url: item.url });
    try {
      await webpush.sendNotification(JSON.parse(subRaw), payload, { TTL: 3600, urgency: "high" });
    } catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) { await redis(["DEL", `sub:${device}`]); return res.status(200).json({ skipped: "expired" }); }
      throw e;
    }
    await redis(["HDEL", `rem:${device}`, id]);
    return res.status(200).json({ sent: true });
  } catch (err) {
    console.error("push fire failed", err && err.message);
    return res.status(500).json({ error: "fire_failed" });
  }
}
