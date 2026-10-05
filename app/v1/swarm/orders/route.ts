import { NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { createJob, publicJob } from "@/lib/jobs";
import { checkApiKey } from "@/lib/api-auth";
import { connection } from "@/lib/rpc";
import { curveForMint } from "@/lib/pdas";

export const maxDuration = 30;

/** POST /v1/swarm/orders
 * { mint, customer, perBuySol, buys, callbackUrl? }
 * → order with deposit instructions (address + exact lamports + memo).
 * Pay with a System transfer carrying the memo; the tick detects it. */
export async function POST(req: Request) {
  const auth = await checkApiKey(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }
  let body: {
    mint?: string;
    customer?: string;
    perBuySol?: number;
    buys?: number;
    callbackUrl?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad body" }, { status: 400 });
  }
  const { mint, customer, perBuySol, buys } = body;
  if (!mint || !customer || !perBuySol || !buys) {
    return NextResponse.json(
      { error: "mint, customer, perBuySol, buys are required" },
      { status: 400 }
    );
  }
  if (body.callbackUrl && !/^https:\/\//.test(body.callbackUrl)) {
    return NextResponse.json({ error: "callbackUrl must be https" }, { status: 400 });
  }
  try {
    const mintKey = new PublicKey(mint);
    new PublicKey(customer);
    const info = await connection().getAccountInfo(curveForMint(mintKey));
    if (!info) {
      return NextResponse.json(
        { error: "no bonding curve found — the coin must still trade on pump.fun" },
        { status: 400 }
      );
    }
  } catch {
    return NextResponse.json({ error: "bad keys" }, { status: 400 });
  }
  try {
    const job = await createJob({
      mint,
      customer,
      perBuySol: perBuySol,
      buys,
      callbackUrl: body.callbackUrl,
      apiKeyName: auth.name,
    });
    return NextResponse.json(publicJob(job), { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
