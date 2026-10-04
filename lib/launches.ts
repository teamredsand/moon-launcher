/** Launches feed: a JSON array in the repo (data/launches.json), updated
 * through the GitHub contents API when GH_TOKEN + GH_REPO are configured,
 * with an in-memory fallback for local dev. */

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

export async function listLaunches(): Promise<LaunchRecord[]> {
  if (process.env.GH_TOKEN && process.env.GH_REPO) {
    try {
      const res = await github("GET", "");
      const rec = JSON.parse(
        Buffer.from(res.content ?? "W10=", "base64").toString("utf8")
      ) as LaunchRecord[];
      if (Array.isArray(rec)) return rec;
    } catch {
      /* fall through to memory */
    }
  }
  return MEM;
}

export async function recordLaunch(rec: LaunchRecord): Promise<void> {
  MEM.unshift(rec);
  if (MEM.length > 100) MEM.pop();
  if (process.env.GH_TOKEN && process.env.GH_REPO) {
    try {
      const cur = await github("GET", "");
      let sha: string | undefined;
      let list: LaunchRecord[] = [];
      if (!cur.sha) {
        list = [];
      } else {
        sha = cur.sha;
        list = JSON.parse(
          Buffer.from(cur.content ?? "W10=", "base64").toString("utf8")
        ) as LaunchRecord[];
        if (!Array.isArray(list)) list = [];
      }
      list.unshift(rec);
      await github("PUT", "", {
        message: `launch: ${rec.symbol} (${rec.mint.slice(0, 8)})`,
        content: Buffer.from(JSON.stringify(list.slice(0, 100), null, 2)).toString("base64"),
        sha,
      });
    } catch {
      /* memory copy already updated */
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
