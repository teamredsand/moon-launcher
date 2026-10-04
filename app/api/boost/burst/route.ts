import { NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { consolidateChunk, fireBurst, progress } from "@/lib/boost";
import { tier, swarmQuote } from "@/lib/pricing";
import { connection, treasuryPubkey } from "@/lib/rpc";

export const maxDuration = 60;

/** Verified payments: key -> per-buy lamports (swarm mode) or 0n (tier boost). */
const VERIFIED = new Map<string, bigint>();

interface BurstBody {
  mint?: string;
  customer?: string;
  tier?: string; // "boost" | "moonshot" (AI add-on) or "swarm" (standalone)
  paymentSig?: string;
  buys?: number; // swarm mode: total buy count
}

/** One boost burst. The browser calls this every ~20s until done. */
export async function POST(req: Request) {
  let body: BurstBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad body" }, { status: 400 });
  }
  const { mint, customer } = body;
  if (!mint || !customer) {
    return NextResponse.json({ error: "mint/customer missing" }, { status: 400 });
  }
  const isSwarm = body.tier === "swarm";
  const t = tier(body.tier ?? "boost");
  const buys = Math.max(1, Math.min(1000, Math.floor(body.buys ?? t.wallets)));
  if (!isSwarm && t.wallets === 0) {
    return NextResponse.json({ error: "tier has no boost" }, { status: 400 });
  }
  const target = isSwarm ? buys : t.wallets;

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

  // verify the payment once; derive per-buy lamports from the ACTUAL
  // transferred amount (never trust the client)
  const vKey = `${mint}:${body.paymentSig}`;
  if (!VERIFIED.has(vKey)) {
    if (!body.paymentSig) {
      return NextResponse.json(
        { error: "paymentSig missing — pay first" },
        { status: 402 }
      );
    }
    const pay = await conn.getTransaction(body.paymentSig, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });
    if (!pay || pay.meta?.err) {
      return NextResponse.json({ error: "payment not found" }, { status: 402 });
    }
    const keyStr = pay.transaction.message.getAccountKeys({
      accountKeysFromLookups: pay.meta?.loadedAddresses,
    });
    let received = 0n;
    pay.transaction.message.compiledInstructions.forEach((ci) => {
      const prog = keyStr.get(ci.programIdIndex);
      if (prog?.toBase58() !== "11111111111111111111111111111111") return;
      const d = Buffer.from(ci.data as Uint8Array);
      if (d.length !== 12 || d.readUInt32LE(0) !== 2) return;
      if (ci.accountKeyIndexes.length !== 2) return;
      const from = keyStr.get(ci.accountKeyIndexes[0]);
      const to = keyStr.get(ci.accountKeyIndexes[1]);
      if (!from?.equals(customerKey) || !to?.equals(treasury)) return;
      received += d.readBigUInt64LE(4);
    });
    if (received === 0n) {
      return NextResponse.json(
        { error: "payment does not match customer/treasury" },
        { status: 402 }
      );
    }
    let perBuy: bigint;
    if (isSwarm) {
      const q = swarmQuote(Number(received) / 1e9, target);
      if (!q.valid) {
        return NextResponse.json({ error: q.reason }, { status: 402 });
      }
      perBuy = BigInt(Math.floor(q.perBuySol * 1e9));
    } else {
      const need = BigInt(Math.round(t.boostFeeSol * 1e9));
      if (received < need) {
        return NextResponse.json(
          { error: "payment too small" },
          { status: 402 }
        );
      }
      perBuy = 0n; // default burst amount
    }
    VERIFIED.set(vKey, perBuy);
  }

  const perBuy = VERIFIED.get(vKey);
  const pg = await progress(conn, mintKey, target);
  let phase: "buying" | "consolidating" | "done" = "buying";
  let consolidated = 0;
  if (pg.remaining > 0) {
    await fireBurst(
      conn,
      mintKey,
      customerKey,
      target,
      isSwarm ? perBuy : undefined
    );
  } else {
    phase = "consolidating";
    consolidated = await consolidateChunk(conn, mintKey, customerKey, target);
    const after = await progress(conn, mintKey, target);
    // consolidation done when no target wallet still holds an ATA with balance
    phase = consolidated === 0 ? "done" : "consolidating";
    return NextResponse.json({
      done: after.target,
      target: after.target,
      remaining: 0,
      phase,
    });
  }
  const after = await progress(conn, mintKey, target);
  return NextResponse.json({
    done: after.done,
    target: after.target,
    remaining: after.remaining,
    phase,
  });
}

/** Progress read without firing (poll while the user watches). */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const mint = searchParams.get("mint");
  const buys = Number(searchParams.get("buys") ?? "0");
  if (!mint) return NextResponse.json({ error: "mint missing" }, { status: 400 });
  try {
    const conn = connection();
    const pg = await progress(conn, new PublicKey(mint), buys || undefined);
    return NextResponse.json(pg);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
