import { NextResponse } from "next/server";
import { swarmQuote } from "@/lib/pricing";
import { checkApiKey } from "@/lib/api-auth";

export const maxDuration = 30;

/** POST /v1/swarm/quote { perBuySol, buys } → price with breakdown. */
export async function POST(req: Request) {
  const auth = await checkApiKey(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }
  let body: { perBuySol?: number; buys?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad body" }, { status: 400 });
  }
  const q = swarmQuote(Number(body.perBuySol ?? 0), Number(body.buys ?? 0));
  if (!q.valid) return NextResponse.json({ error: q.reason }, { status: 400 });
  return NextResponse.json(q);
}
