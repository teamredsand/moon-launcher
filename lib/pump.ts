import {
  AccountMeta,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  ATA_PROGRAM_ID,
  BUY_FEE_RECIPIENT,
  BUY_REFERRER,
  BUY_SLOT0,
  BUY_SLOT12,
  BUY_SLOT14,
  BUY_SLOT15,
  CREATE_DISC,
  CREATE_FEE_TREASURY,
  CREATE_SLOT10,
  CREATE_SLOT9,
  CREATE_TRAILER,
  EVENT_AUTHORITY,
  FRESH_CURVE_VSOL,
  FRESH_CURVE_VTOK,
  GLOBAL_CONFIG,
  NATIVE_BUY_DISC,
  NATIVE_BUY_TRAILING,
  PUMP_PROGRAM_ID,
  SYSTEM_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
} from "./constants";
import {
  bondingCurveV2ForMint,
  creatorVaultFor,
  curveForMint,
  findAta,
  mintAuthority,
  userVolumeAccumulatorFor,
} from "./pdas";

/** borsh string: u32 LE length + utf-8 bytes. */
export function anchorStr(s: string): Buffer {
  const b = Buffer.from(s, "utf8");
  const out = Buffer.alloc(4 + b.length);
  out.writeUInt32LE(b.length, 0);
  b.copy(out, 4);
  return out;
}

/** constant-product exact-in output with fee on input (bps). */
export function quoteCp(
  reserveIn: bigint,
  reserveOut: bigint,
  amountIn: bigint,
  feeBps = 100
): bigint {
  const effective = (amountIn * BigInt(10_000 - feeBps)) / 10_000n;
  const denom = reserveIn + effective;
  if (denom === 0n) return 0n;
  return (reserveOut * effective) / denom;
}

/** min tokens out for the FIRST buy on a fresh curve (1% fee + slippage). */
export function freshCurveMinOut(solIn: bigint, slippageBps = 1000): bigint {
  const quote = quoteCp(FRESH_CURVE_VSOL, FRESH_CURVE_VTOK, solIn, 100);
  return (quote * BigInt(10_000 - slippageBps)) / 10_000n;
}

export interface CreateCoinArgs {
  mint: PublicKey;
  creator: PublicKey;
  name: string;
  symbol: string;
  uri: string;
  mayhemState: PublicKey;
  slot13?: PublicKey;
}

/** pump.fun create instruction (disc d6904cec) — layout verified on-chain. */
export function createCoinIx(args: CreateCoinArgs): TransactionInstruction {
  const { mint, creator, name, symbol, uri, mayhemState } = args;
  const curve = curveForMint(mint);
  const curveAta = findAta(curve, mint);
  const slot13 = args.slot13 ?? PublicKey.default;
  const data = Buffer.concat([
    CREATE_DISC,
    anchorStr(name),
    anchorStr(symbol),
    anchorStr(uri),
    creator.toBuffer(),
    CREATE_TRAILER,
  ]);
  const accounts: AccountMeta[] = [
    { pubkey: mint, isSigner: true, isWritable: true },
    { pubkey: mintAuthority(), isSigner: false, isWritable: false },
    { pubkey: curve, isSigner: false, isWritable: true },
    { pubkey: curveAta, isSigner: false, isWritable: true },
    { pubkey: GLOBAL_CONFIG, isSigner: false, isWritable: false },
    { pubkey: creator, isSigner: true, isWritable: true },
    { pubkey: SYSTEM_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: ATA_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: CREATE_SLOT9, isSigner: false, isWritable: true },
    { pubkey: CREATE_SLOT10, isSigner: false, isWritable: false },
    { pubkey: CREATE_FEE_TREASURY, isSigner: false, isWritable: true },
    { pubkey: mayhemState, isSigner: false, isWritable: true },
    { pubkey: slot13, isSigner: false, isWritable: true },
    { pubkey: EVENT_AUTHORITY, isSigner: false, isWritable: false },
    { pubkey: PUMP_PROGRAM_ID, isSigner: false, isWritable: false },
  ];
  return new TransactionInstruction({
    programId: PUMP_PROGRAM_ID,
    keys: accounts,
    data,
  });
}

export interface NativeBuyArgs {
  mint: PublicKey;
  buyer: PublicKey;
  creator: PublicKey;
  solIn: bigint;
  minOut: bigint;
}

/**
 * Native pump.fun buy (disc 38fc7408, 18 accounts, trailing 0x01).
 * Every per-coin/per-buyer slot is derived; the verbatim slots come from a
 * template proven live (beeznet launch 2026-10-04 + 215 replayed buys).
 */
export function nativeBuyIx(args: NativeBuyArgs): TransactionInstruction {
  const { mint, buyer, creator, solIn, minOut } = args;
  const curve = curveForMint(mint);
  const data = Buffer.concat([
    NATIVE_BUY_DISC,
    u64le(solIn),
    u64le(minOut),
    NATIVE_BUY_TRAILING,
  ]);
  const accounts: AccountMeta[] = [
    { pubkey: BUY_SLOT0, isSigner: false, isWritable: false },
    { pubkey: BUY_FEE_RECIPIENT, isSigner: false, isWritable: true },
    { pubkey: mint, isSigner: false, isWritable: true },
    { pubkey: curve, isSigner: false, isWritable: true },
    { pubkey: findAta(curve, mint), isSigner: false, isWritable: true },
    { pubkey: findAta(buyer, mint), isSigner: false, isWritable: true },
    { pubkey: buyer, isSigner: true, isWritable: true },
    { pubkey: SYSTEM_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: creatorVaultFor(creator), isSigner: false, isWritable: true },
    { pubkey: EVENT_AUTHORITY, isSigner: false, isWritable: false },
    { pubkey: PUMP_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: BUY_SLOT12, isSigner: false, isWritable: true },
    { pubkey: userVolumeAccumulatorFor(buyer), isSigner: false, isWritable: true },
    { pubkey: BUY_SLOT14, isSigner: false, isWritable: false },
    { pubkey: BUY_SLOT15, isSigner: false, isWritable: false },
    { pubkey: bondingCurveV2ForMint(mint), isSigner: false, isWritable: true },
    { pubkey: BUY_REFERRER, isSigner: false, isWritable: true },
  ];
  return new TransactionInstruction({
    programId: PUMP_PROGRAM_ID,
    keys: accounts,
    data,
  });
}

/** createIdempotent for the buyer's Token-2022 ATA (the pump buy needs it). */
export function buyerAtaCreateIx(payer: PublicKey, owner: PublicKey, mint: PublicKey): TransactionInstruction {
  return new TransactionInstruction({
    programId: ATA_PROGRAM_ID,
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: findAta(owner, mint), isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: SYSTEM_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.from([1]),
  });
}

/** SOL transfer of the service fee to the treasury (same launch tx). */
export function feeTransferIx(from: PublicKey, treasury: PublicKey, lamports: bigint): TransactionInstruction {
  return SystemProgram.transfer({
    fromPubkey: from,
    toPubkey: treasury,
    lamports: Number(lamports),
  });
}

function u64le(n: bigint): Buffer {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(n, 0);
  return b;
}
