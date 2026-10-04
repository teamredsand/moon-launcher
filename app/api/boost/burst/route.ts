import { NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { consolidate, fireBurst, progress } from "@/lib/boost";
import { tier } from "@/lib/pricing";
import { connection, treasuryPubkey } from "@/lib/rpc";

export const maxDuration = 60;

const VERIFIED = new Set<string>();

/** One boost burst. The browser calls this every ~20s until done.
 * Body: { mint, customer, tier, paymentSig }. */
export async function POST(req: Request) {
  let body: {
    mint?: string;
    customer?: string;
    tier?: string;
    paymentSig?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad body" }, { status: 400 });
  }
  const { mint, customer } = body;
  if (!mint || !customer) {
    return NextResponse.json({ error: "mint/customer missing" }, { status: 400 });
  }
  const t = tier(body.tier ?? "boost");
  if (t.wallets === 0) {
    return NextResponse.json({ error: "tier has no boost" }, { status: 400 });
  }

  const conn = connection();
  const treasury = treasuryPubkey();
  if (!treasury) {
    return NextResponse.json({ error: "service not configured" }, { status: 503 });
  }

  let mintKey: PublicKey, customerKey: PublicKey;
  try {
    mintKey = new PublicKey(mint);
    customerKey = new PublicKey(customer);
  } catch {
    return NextResponse.json({ error: "bad keys" }, { status: 400 });
  }

  // verify the boost payment once (System transfer customer -> treasury)
  if (!VERIFIED.has(`${mint}:${body.paymentSig}`)) {
    if (!body.paymentSig) {
      return NextResponse.json(
        { error: "paymentSig missing — pay the boost first" },
        { status: 402 }
      );
    }
    const pay = await conn.getTransaction(body.paymentSig, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });
    const need = BigInt(Math.round(t.boostFeeSol * 1e9));
    let ok = false;
    if (pay && !pay.meta?.err) {
      const keyStr = pay.transaction.message.getAccountKeys({
        accountKeysFromLookups: pay.meta?.loadedAddresses,
      });
      // direct (compiled) transfer from the payer
      pay.transaction.message.compiledInstructions.forEach((ci) => {
        if (ok) return;
        const prog = keyStr.get(ci.programIdIndex);
        if (prog?.toBase58() !== "11111111111111111111111111111111") return;
        const d = Buffer.from(ci.data as Uint8Array);
        if (d.length !== 12 || d.readUInt32LE(0) !== 2) return;
        if (ci.accountKeyIndexes.length !== 2) return;
        const from = keyStr.get(ci.accountKeyIndexes[0]);
        const to = keyStr.get(ci.accountKeyIndexes[1]);
        if (!from?.equals(customerKey) || !to?.equals(treasury)) return;
        if (d.readBigUInt64LE(4) >= need) ok = true;
      });
    }
    if (!ok) {
      return NextResponse.json(
        { error: "payment not found or too small" },
        { status: 402 }
      );
    }
    VERIFIED.add(`${mint}:${body.paymentSig}`);
  }

  // fire one burst; if finished, consolidate to the customer
  const pg = await progress(conn, mintKey, t.wallets);
  let finalized = false;
  if (pg.remaining > 0) {
    await fireBurst(conn, mintKey, customerKey, t.wallets);
  } else {
    await consolidate(conn, mintKey, customerKey);
    finalized = true;
  }
  const after = await progress(conn, mintKey, t.wallets);
  return NextResponse.json({
    done: finalized ? after.target : after.done,
    target: after.target,
    remaining: finalized ? 0 : after.remaining,
    finalized,
  });
}
