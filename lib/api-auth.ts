/** API key auth + per-key rate limiting for /v1 endpoints.
 * Keys come from SWARM_API_KEYS="key1:name1,key2:name2". */

import { storeIncr } from "./store";

export interface ApiAuth {
  ok: boolean;
  name?: string;
  error?: string;
}

const RATE_LIMIT_PER_MIN = 60;

export async function checkApiKey(req: Request): Promise<ApiAuth> {
  const key = req.headers.get("x-api-key") ?? "";
  const pairs = (process.env.SWARM_API_KEYS ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  for (const pair of pairs) {
    const [k, name] = pair.split(":");
    if (k && k === key) {
      const minute = Math.floor(Date.now() / 60_000);
      const n = await storeIncr(`rl:${name}:${minute}`, 120);
      if (n > RATE_LIMIT_PER_MIN) {
        return { ok: false, error: "rate limit exceeded (60/min)" };
      }
      return { ok: true, name: name?.trim() || "unknown" };
    }
  }
  return { ok: false, error: "missing or invalid x-api-key" };
}
