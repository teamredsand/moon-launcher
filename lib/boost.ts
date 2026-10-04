/** Boost engine: swarm wallets buy the customer's coin in small bursts.
 *
 * Client-driven: the customer's browser polls POST /api/boost/burst every
 * ~20s; each call fires one burst of BURST_SIZE buys (built + signed
 * server-side). Landed-only progress: a buyer's Token-2022 ATA for the mint
 * is created atomically with their buy, so progress = which swarm ATAs exist —
 * one batched getMultipleAccounts, no database needed. Consolidation to the
 * customer's wallet happens when the boost completes (ATAs closed, rent
 * recovered to the swarm wallets).
 */

import {
  Connection,
  Keypair,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { buyerAtaCreateIx, nativeBuyIx, quoteCp } from "./pump";
import { findAta } from "./pdas";
import { PUMP_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from "./constants";
import { swarmWallets } from "./rpc";

export const BUY_LAMPORTS = 500_000n; // 0.0005 SOL per swarm buy
export const BURST_SIZE = 6;
const SWARM_MIN_BALANCE_LAMPORTS = 4_000_000n; // buy + rents + fees

export function curveForMint(mint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("bonding-curve"), mint.toBuffer()],
    PUMP_PROGRAM_ID
  )[0];
}

async function curveState(
  conn: Connection,
  curve: PublicKey
): Promise<{ vSol: bigint; vTok: bigint } | null> {
  const info = await conn.getAccountInfo(curve);
  if (!info) return null;
  const d = info.data;
  for (let off = 40; off + 8 <= d.length; off += 8) {
    if (d.readBigUInt64LE(off) === 1_000_000_000_000_000n) {
      const vTok = d.readBigUInt64LE(off - 32);
      const vSol = d.readBigUInt64LE(off - 24);
      if (vSol >= 1_000_000_000n && vSol <= 1_000_000_000_000n) {
        return { vSol, vTok };
      }
    }
  }
  return null;
}

/** Wallets that already bought this mint (ATA exists — atomic with the buy). */
async function ownedWallets(
  conn: Connection,
  mint: PublicKey,
  limit?: number
): Promise<Set<string>> {
  const wallets = subset(limit);
  const atas = wallets.map((w) => findAta(w.kp.publicKey, mint));
  const used = new Set<string>();
  for (let i = 0; i < atas.length; i += 100) {
    const infos = await conn.getMultipleAccountsInfo(atas.slice(i, i + 100));
    infos.forEach((info, j) => {
      if (info) used.add(wallets[i + j].pubkey);
    });
  }
  return used;
}

/** Deterministic wallet subset for a tier (sorted by pubkey, first `limit`). */
function subset(limit?: number): Swarm[] {
  const all = [...swarmWallets()].sort((a, b) =>
    a.pubkey.localeCompare(b.pubkey)
  );
  return limit ? all.slice(0, limit) : all;
}

interface Swarm {
  pubkey: string;
  kp: Keypair;
}

export interface BoostProgress {
  done: number;
  target: number;
  remaining: number;
}

/** Progress = swarm wallets with an existing ATA for this mint. One batched
 * RPC round; survives server restarts and concurrent browsers. */
export async function progress(
  conn: Connection,
  mint: PublicKey,
  limit?: number
): Promise<BoostProgress> {
  const done = (await ownedWallets(conn, mint, limit)).size;
  const target = subset(limit).length;
  return { done, target, remaining: Math.max(target - done, 0) };
}

/** Eligible = funded enough for a self-paid buy and not yet bought. */
async function pickBuyers(
  conn: Connection,
  mint: PublicKey,
  n: number,
  limit?: number
): Promise<Keypair[]> {
  const wallets = subset(limit);
  const used = await ownedWallets(conn, mint, limit);
  const out: Keypair[] = [];
  for (const w of wallets) {
    if (out.length >= n) break;
    if (used.has(w.pubkey)) continue;
    const bal = await conn.getBalance(w.kp.publicKey);
    if (bal < SWARM_MIN_BALANCE_LAMPORTS) continue;
    out.push(w.kp);
  }
  return out;
}

/** One burst of up to BURST_SIZE buys; returns wallets newly landed. */
export async function fireBurst(
  conn: Connection,
  mint: PublicKey,
  customer: PublicKey,
  limit?: number
): Promise<number> {
  const pool = await pickBuyers(conn, mint, BURST_SIZE, limit);
  if (pool.length === 0) return 0;
  const state = await curveState(conn, curveForMint(mint));
  if (!state) throw new Error("curve unreadable — coin not launched?");
  const estOut = quoteCp(state.vSol, state.vTok, BUY_LAMPORTS, 100);
  const minOut = (estOut * 9500n) / 10_000n;
  const { blockhash } = await conn.getLatestBlockhash();

  const landed = await Promise.all(
    pool.map(async (kp): Promise<number> => {
      const buyer = kp.publicKey;
      const ixs: TransactionInstruction[] = [
        buyerAtaCreateIx(buyer, buyer, mint),
        nativeBuyIx({ mint, buyer, creator: customer, solIn: BUY_LAMPORTS, minOut }),
      ];
      const msg = new TransactionMessage({
        payerKey: buyer,
        instructions: ixs,
        recentBlockhash: blockhash,
      }).compileToV0Message();
      const tx = new VersionedTransaction(msg);
      tx.sign([kp]);
      try {
        await conn.sendTransaction(tx, { maxRetries: 3 });
      } catch {
        return 0; // dropped — next burst retries with a fresh blockhash
      }
      await new Promise((r) => setTimeout(r, 4_000));
      const info = await conn.getAccountInfo(findAta(buyer, mint));
      return info ? 1 : 0;
    })
  );
  return landed.reduce((a, b) => a + b, 0);
}

/** Transfer every swarm-held balance of this mint to the customer and close
 * the ATAs (rent recovered). Idempotent; called at boost completion. */
export async function consolidate(
  conn: Connection,
  mint: PublicKey,
  customer: PublicKey
): Promise<number> {
  const wallets = swarmWallets();
  const { blockhash } = await conn.getLatestBlockhash();
  let moved = 0;
  for (const w of wallets) {
    const ata = findAta(w.kp.publicKey, mint);
    const info = await conn.getParsedAccountInfo(ata);
    const amountRaw =
      (info.value as { data?: { parsed?: { info?: { tokenAmount?: { amount?: string } } } } })
        ?.data?.parsed?.info?.tokenAmount?.amount;
    if (!amountRaw || BigInt(amountRaw) <= 0n) continue;
    const amount = BigInt(amountRaw);
    const ixs: TransactionInstruction[] = [
      buyerAtaCreateIx(customer, customer, mint), // idempotent
      t22Transfer(findAta(w.kp.publicKey, mint), findAta(customer, mint), w.kp.publicKey, amount),
      t22CloseAccount(ata, w.kp.publicKey),
    ];
    const msg = new TransactionMessage({
      payerKey: w.kp.publicKey,
      instructions: ixs,
      recentBlockhash: blockhash,
    }).compileToV0Message();
    const tx = new VersionedTransaction(msg);
    tx.sign([w.kp]);
    try {
      await conn.sendTransaction(tx, { maxRetries: 2 });
      moved += 1;
    } catch {
      // retried by the next finalize call
    }
  }
  return moved;
}

function t22Transfer(
  from: PublicKey,
  to: PublicKey,
  owner: PublicKey,
  amount: bigint
): TransactionInstruction {
  const data = Buffer.alloc(9);
  data.writeUInt8(12, 0);
  data.writeBigUInt64LE(amount, 1);
  return new TransactionInstruction({
    programId: TOKEN_2022_PROGRAM_ID,
    keys: [
      { pubkey: from, isSigner: false, isWritable: true },
      { pubkey: to, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: true, isWritable: false },
    ],
    data,
  });
}

function t22CloseAccount(
  ata: PublicKey,
  owner: PublicKey
): TransactionInstruction {
  return new TransactionInstruction({
    programId: TOKEN_2022_PROGRAM_ID,
    keys: [
      { pubkey: ata, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: true, isWritable: false },
    ],
    data: Buffer.from([9]),
  });
}
