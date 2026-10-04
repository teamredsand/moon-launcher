import { NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { PUMP_PROGRAM_ID } from "@/lib/constants";
import { curveForMint } from "@/lib/pdas";
import { IGNITION_FEE_SOL, solToLamports, tier } from "@/lib/pricing";
import { connection, treasuryPubkey } from "@/lib/rpc";
import { recordLaunch } from "@/lib/launches";

export const maxDuration = 60;

/** Confirm a launch: wait for landing, verify the create ix + fee transfer,
 * record the launch, return the pump.fun URL. */
export async function POST(req: Request) {
  let body: {
    sig?: string;
    mint?: string;
    tier?: string;
    identity?: { name: string; symbol: string; description: string };
    imageUri?: string;
    metadataUri?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad body" }, { status: 400 });
  }
  const { sig, mint } = body;
  if (!sig || !mint) {
    return NextResponse.json({ error: "sig/mint missing" }, { status: 400 });
  }
  const t = tier(body.tier ?? "ignition");
  const conn = connection();
  const treasury = treasuryPubkey();

  // wait up to ~45s for confirmation
  let tx: Awaited<ReturnType<typeof conn.getTransaction>> = null;
  for (let i = 0; i < 15 && !tx; i++) {
    tx = await conn.getTransaction(sig, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });
    if (!tx) await new Promise((r) => setTimeout(r, 3_000));
  }
  if (!tx) {
    return NextResponse.json(
      { error: "transaction not found — it did not land" },
      { status: 404 }
    );
  }
  if (tx.meta?.err) {
    return NextResponse.json({ error: "transaction failed" }, { status: 400 });
  }

  // verify: our pump create ix for this mint is in the message
  const msg = tx.transaction.message;
  const keys = msg.staticAccountKeys.map((k) => k.toBase58());
  const mintKey = new PublicKey(mint);
  const curveKey = curveForMint(mintKey);
  const pumpCount = msg.compiledInstructions.some((ci) =>
    msg.staticAccountKeys[ci.programIdIndex]?.equals(PUMP_PROGRAM_ID)
  );
  if (!keys.includes(mintKey.toBase58()) || !keys.includes(curveKey.toBase58()) || !pumpCount) {
    return NextResponse.json(
      { error: "transaction does not launch this mint" },
      { status: 400 }
    );
  }

  // verify fee transfer to treasury (ignition fee part)
  let feeOk = false;
  const feeLamports = solToLamports(IGNITION_FEE_SOL);
  if (treasury && tx.meta) {
    const keyStr = tx.transaction.message.getAccountKeys({
      accountKeysFromLookups: tx.meta.loadedAddresses,
    });
    tx.meta.innerInstructions?.forEach((inner) => {
      inner.instructions.forEach((ix) => {
        if (feeOk) return;
        if (!("accounts" in ix)) return; // skip parsed instructions
        const prog = keyStr.get(ix.programIdIndex);
        if (prog?.toBase58() !== "11111111111111111111111111111111") return;
        const to = keyStr.get(ix.accounts[1]);
        if (!to?.equals(treasury)) return;
        const d = Buffer.from(ix.data);
        if (d.length < 12) return;
        const amount = d.readBigUInt64LE(4);
        if (amount >= feeLamports) feeOk = true;
      });
    });
  }

  const customer = keys[0]; // fee payer
  const identity = body.identity ?? {
    name: "Unknown",
    symbol: "???",
    description: "",
  };
  await recordLaunch({
    mint,
    name: identity.name,
    symbol: identity.symbol,
    description: identity.description,
    imageUri: body.imageUri ?? "",
    metadataUri: body.metadataUri ?? "",
    tier: t.id,
    customer,
    launchSig: sig,
    launchedAt: new Date().toISOString(),
  });

  return NextResponse.json({
    ok: true,
    feeVerified: feeOk,
    url: `https://pump.fun/coin/${mint}`,
  });
}
