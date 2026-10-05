import { NextResponse } from "next/server";
import {
  Keypair,
  PublicKey,
  TransactionInstruction,
} from "@solana/web3.js";
import { buyerAtaCreateIx, createCoinIx, feeTransferIx, freshCurveMinOut, nativeBuyIx } from "@/lib/pump";
import { CUSTOM_FEE_SOL, FIRST_BUY_MAX_SOL, FIRST_BUY_MIN_SOL, solToLamports, tier } from "@/lib/pricing";
import { connection, treasuryPubkey } from "@/lib/rpc";
import { anchorSeedPairs, compileV0, simulate, v0Transaction } from "@/lib/sim";
import { generateIdentity, generateImage } from "@/lib/minimax";
import { uploadToIpfs } from "@/lib/ipfs";

export const maxDuration = 60;

interface Identity {
  name: string;
  symbol: string;
  description: string;
  image_prompt: string;
}

export async function POST(req: Request) {
  let body: {
    mode?: "ai" | "custom";
    theme?: string;
    identity?: Identity;
    metadataUri?: string;
    imageUri?: string;
    tier?: string;
    customer?: string;
    firstBuySol?: number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad body" }, { status: 400 });
  }

  const t = tier(body.tier ?? "ignition");
  const isCustom = body.mode === "custom";
  const launchFee = isCustom ? CUSTOM_FEE_SOL : 0.25;
  const firstBuy =
    body.firstBuySol !== undefined &&
    body.firstBuySol >= FIRST_BUY_MIN_SOL &&
    body.firstBuySol <= FIRST_BUY_MAX_SOL
      ? body.firstBuySol
      : t.firstBuySol;
  if (!body.customer) {
    return NextResponse.json({ error: "customer missing" }, { status: 400 });
  }
  let customer: PublicKey;
  try {
    customer = new PublicKey(body.customer);
  } catch {
    return NextResponse.json({ error: "bad customer key" }, { status: 400 });
  }

  const treasury = treasuryPubkey();
  if (!treasury) {
    return NextResponse.json({ error: "service not configured" }, { status: 503 });
  }

  // 1. identity (generate if the client did not already)
  let identity = body.identity;
  let metadataUri = body.metadataUri;
  let imageUri = body.imageUri;
  try {
    if (!identity || !metadataUri || !imageUri) {
      if (isCustom) {
        return NextResponse.json(
          { error: "custom mode needs identity + metadataUri + imageUri" },
          { status: 400 }
        );
      }
      if (!body.theme || body.theme.length < 3) {
        return NextResponse.json({ error: "theme missing" }, { status: 400 });
      }
      identity = await generateIdentity(body.theme.slice(0, 200));
      const { bytes } = await generateImage(identity.image_prompt);
      const up = await uploadToIpfs(bytes, identity);
      metadataUri = up.metadataUri;
      imageUri = up.imageUri;
    }
  } catch (e) {
    return NextResponse.json(
      { error: `identity failed: ${(e as Error).message}` },
      { status: 502 }
    );
  }
  if (
    !identity ||
    identity.name.length > 32 ||
    identity.symbol.length > 10 ||
    !metadataUri ||
    !imageUri
  ) {
    return NextResponse.json(
      { error: "bad identity (name ≤ 32 chars, symbol ≤ 10)" },
      { status: 400 }
    );
  }

  // 2. build the launch transaction
  const conn = connection();
  const mint = Keypair.generate();
  const solIn = solToLamports(firstBuy);
  const minOut = freshCurveMinOut(solIn);

  let mayhem = Keypair.generate().publicKey;
  for (let round = 0; round < 3; round++) {
    const ixs: TransactionInstruction[] = [
      createCoinIx({
        mint: mint.publicKey,
        creator: customer,
        name: identity!.name,
        symbol: identity!.symbol,
        uri: metadataUri!,
        mayhemState: mayhem,
      }),
      buyerAtaCreateIx(customer, customer, mint.publicKey),
      nativeBuyIx({
        mint: mint.publicKey,
        buyer: customer,
        creator: customer,
        solIn,
        minOut,
      }),
      feeTransferIx(customer, treasury, solToLamports(launchFee)),
    ];
    const { message } = await compileV0(conn, customer, ixs);
    const tx = v0Transaction(message);
    const out = await simulate(conn, tx);
    if (out.ok) break;
    const pairs = anchorSeedPairs(out.logs);
    const mayhemPair = pairs.find((p) => p.name === "mayhem_state" && p.right);
    if (!mayhemPair) {
      const logs = out.logs.slice(-6).join(" | ");
      return NextResponse.json(
        { error: `simulation failed: ${logs}` },
        { status: 502 }
      );
    }
    try {
      mayhem = new PublicKey(mayhemPair.right);
    } catch {
      return NextResponse.json({ error: "bad seed pair" }, { status: 502 });
    }
  }

  // 3. final build + server signature (mint keypair only; customer signs client-side)
  const ixs: TransactionInstruction[] = [
    createCoinIx({
      mint: mint.publicKey,
      creator: customer,
      name: identity!.name,
      symbol: identity!.symbol,
      uri: metadataUri!,
      mayhemState: mayhem,
    }),
    buyerAtaCreateIx(customer, customer, mint.publicKey),
    nativeBuyIx({
      mint: mint.publicKey,
      buyer: customer,
      creator: customer,
      solIn,
      minOut,
    }),
    feeTransferIx(customer, treasury, solToLamports(launchFee)),
  ];
  const { message } = await compileV0(conn, customer, ixs);
  const tx = v0Transaction(message);
  tx.sign([mint]);

  return NextResponse.json({
    txB64: Buffer.from(tx.serialize()).toString("base64"),
    mint: mint.publicKey.toBase58(),
    needsSolLamports: (
      8_000_000n + solToLamports(firstBuy) + solToLamports(launchFee)
    ).toString(),
    tier: t.id,
    mode: isCustom ? "custom" : "ai",
    identity,
    imageUri,
    metadataUri,
  });
}

export function GET() {
  return NextResponse.json({ error: "POST only" }, { status: 405 });
}
