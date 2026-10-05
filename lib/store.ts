/** Persistence for swarm jobs. Uses Vercel KV (Upstash REST) when
 * KV_REST_API_URL/KV_REST_API_TOKEN are set; falls back to in-memory for
 * local dev. Enable the Upstash integration on Vercel for production. */

const MEM = new Map<string, { v: string; exp?: number }>();

function kvConfigured(): boolean {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

async function kv(cmd: string[]): Promise<unknown> {
  const res = await fetch(process.env.KV_REST_API_URL!, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(cmd),
    signal: AbortSignal.timeout(10_000),
  });
  const j = (await res.json()) as { result?: unknown; error?: string };
  if (j.error) throw new Error(`kv ${cmd[0]}: ${j.error}`);
  return j.result;
}

export async function storeGet<T>(key: string): Promise<T | null> {
  if (kvConfigured()) {
    const v = (await kv(["GET", key])) as string | null;
    return v ? (JSON.parse(v) as T) : null;
  }
  const e = MEM.get(key);
  if (!e) return null;
  if (e.exp && Date.now() > e.exp) {
    MEM.delete(key);
    return null;
  }
  return JSON.parse(e.v) as T;
}

export async function storeSet(
  key: string,
  value: unknown,
  ttlSeconds?: number
): Promise<void> {
  const v = JSON.stringify(value);
  if (kvConfigured()) {
    const cmd = ["SET", key, v];
    if (ttlSeconds) cmd.push("EX", String(ttlSeconds));
    await kv(cmd);
    return;
  }
  MEM.set(key, { v, exp: ttlSeconds ? Date.now() + ttlSeconds * 1000 : undefined });
}

export async function storeDel(key: string): Promise<void> {
  if (kvConfigured()) {
    await kv(["DEL", key]);
    return;
  }
  MEM.delete(key);
}

/** Increment a rate-limit counter; returns the new count. TTL on first hit. */
export async function storeIncr(key: string, ttlSeconds: number): Promise<number> {
  if (kvConfigured()) {
    const n = Number(await kv(["INCR", key]));
    if (n === 1) await kv(["EXPIRE", key, String(ttlSeconds)]);
    return n;
  }
  const n = ((await storeGet<number>(key)) ?? 0) + 1;
  await storeSet(key, n, ttlSeconds);
  return n;
}
