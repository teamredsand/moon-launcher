/** Launches feed. Storage order: Vercel KV ("launches:list", the same store
 * the swarm jobs use) → GitHub contents file (data/launches.json) → memory. */

import { storeGet, storeSet } from "./store";

export interface LaunchRecord {
  mint: string;
  name: string;
  symbol: string;
  description: string;
  imageUri: string;
  metadataUri: string;
  tier: string;
  customer: string;
  launchSig: string;
  launchedAt: string;
}

const MEM: LaunchRecord[] = [];
const KV_KEY = "launches:list";
const MAX = 100;

export async function listLaunches(): Promise<LaunchRecord[]> {
  const fromKv = await storeGet<LaunchRecord[]>(KV_KEY);
  if (Array.isArray(fromKv) && fromKv.length > 0) return fromKv;
  if (process.env.GH_TOKEN && process.env.GH_REPO) {
    try {
      const res = await github("GET", "");
      const rec = JSON.parse(
        Buffer.from(res.content ?? "W10=", "base64").toString("utf8")
      ) as LaunchRecord[];
      if (Array.isArray(rec) && rec.length > 0) return rec;
    } catch {
      /* fall through to memory */
    }
  }
  return MEM;
}

export async function recordLaunch(rec: LaunchRecord): Promise<void> {
  MEM.unshift(rec);
  if (MEM.length > MAX) MEM.pop();
  const cur = (await storeGet<LaunchRecord[]>(KV_KEY)) ?? [];
  cur.unshift(rec);
  await storeSet(KV_KEY, cur.slice(0, MAX));
  if (process.env.GH_TOKEN && process.env.GH_REPO) {
    try {
      const gh = await github("GET", "");
      let list: LaunchRecord[] = [];
      if (gh.sha) {
        const parsed = JSON.parse(
          Buffer.from(gh.content ?? "W10=", "base64").toString("utf8")
        ) as LaunchRecord[];
        if (Array.isArray(parsed)) list = parsed;
      }
      list.unshift(rec);
      await github("PUT", "", {
        message: `launch: ${rec.symbol} (${rec.mint.slice(0, 8)})`,
        content: Buffer.from(JSON.stringify(list.slice(0, MAX), null, 2)).toString("base64"),
        sha: gh.sha,
      });
    } catch {
      /* KV copy already updated */
    }
  }
}

async function github(
  method: "GET" | "PUT",
  subpath: string,
  body?: Record<string, unknown>
): Promise<{ sha?: string; content?: string } & Record<string, unknown>> {
  const repo = process.env.GH_REPO!; // owner/name
  const branch = process.env.GH_BRANCH ?? "main";
  const url = `https://api.github.com/repos/${repo}/contents/data/launches.json?ref=${branch}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.GH_TOKEN}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "moonlauncher",
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok && res.status !== 404) {
    throw new Error(`github ${res.status}: ${JSON.stringify(json).slice(0, 200)}`);
  }
  return json as { sha?: string; content?: string };
}
