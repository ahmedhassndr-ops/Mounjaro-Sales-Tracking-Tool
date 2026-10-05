// Shared helpers for the push functions. Files starting with "_" are not exposed as routes.
const URL_ = process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

export const SITE = process.env.SITE_URL || "https://fakkarny.vercel.app";
export const FIRE_SECRET = process.env.QSTASH_CURRENT_SIGNING_KEY || "";

// One Redis command over Upstash's REST API, e.g. redis(["GET", "key"]).
export async function redis(cmd) {
  const r = await fetch(URL_, {
    method: "POST",
    headers: { Authorization: "Bearer " + TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify(cmd),
  });
  const j = await r.json();
  if (j.error) throw new Error("redis: " + j.error);
  return j.result;
}
