import { NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { createJob, publicJob } from "@/lib/jobs";
import { connection } from "@/lib/rpc";
import { curveForMint } from "@/lib/pdas";

export const maxDuration = 30;

/** Create a swarm job. The browser (or API/bot wrappers) then shows the
 * deposit address + memo; the tick/advance endpoints drive the job. */
export async function POST(req: Request) {
  let body: {
    mint?: string;
    customer?: string;
    perBuy?: number;
    buys?: number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad body" }, { status: 400 });
  }
  const { mint, customer, perBuy, buys } = body;
  if (!mint || !customer || !perBuy || !buys) {
    return NextResponse.json({ error: "mint/customer/perBuy/buys required" }, { status: 400 });
  }
  try {
    const mintKey = new PublicKey(mint);
    new PublicKey(customer);
    // the coin must still trade on its bonding curve
    const info = await connection().getAccountInfo(curveForMint(mintKey));
    if (!info) {
      return NextResponse.json(
        { error: "no bonding curve found — the coin must still trade on pump.fun" },
        { status: 400 }
      );
    }
  } catch (e) {
    if (e instanceof NextResponse) throw e;
    return NextResponse.json({ error: "bad keys" }, { status: 400 });
  }
  try {
    const job = await createJob({
      mint,
      customer,
      perBuySol: perBuy,
      buys,
    });
    return NextResponse.json(publicJob(job));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
