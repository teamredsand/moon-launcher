/** Simulation self-heal: discover seeds-constrained slots (mayhem_state etc.)
 * from anchor ConstraintSeeds errors, exactly like the proven Python
 * launcher (launcher.py, beeznet/83QpuraL live launches 2026-10-04).
 *
 * Log shape:
 *   "Program log: AnchorError caused by account: mayhem_state."
 *   "Program log: Left:"  <next line: what we passed>
 *   "Program log: Right:" <next line: expected PDA>
 */

import {
  Connection,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";

export interface SeedPair {
  name: string;
  left: string;
  right: string;
}

export function anchorSeedPairs(logs: string[]): SeedPair[] {
  const pairs: SeedPair[] = [];
  let name = "";
  let left: string | null = null;
  let right: string | null = null;
  const flush = () => {
    if (left && right) pairs.push({ name, left, right });
    name = "";
    left = right = null;
  };
  for (let i = 0; i < logs.length; i++) {
    const s = logs[i].trim();
    const m = s.match(/^Program log: AnchorError caused by account: (\S+?)\./);
    if (m) {
      name = m[1];
    } else if (s === "Program log: Left:" && i + 1 < logs.length) {
      left = logs[i + 1].replace("Program log: ", "").trim();
    } else if (s === "Program log: Right:" && i + 1 < logs.length) {
      right = logs[i + 1].replace("Program log: ", "").trim();
      flush();
    }
  }
  return pairs;
}

export interface SimOutcome {
  ok: boolean;
  logs: string[];
  err?: unknown;
  units?: number;
}

export async function simulate(
  conn: Connection,
  tx: VersionedTransaction
): Promise<SimOutcome> {
  const res = await conn.simulateTransaction(tx, {
    sigVerify: false,
    replaceRecentBlockhash: true,
  });
  return {
    ok: res.value.err ? false : true,
    logs: res.value.logs ?? [],
    err: res.value.err ?? undefined,
    units: res.value.unitsConsumed,
  };
}

export interface BuiltLaunch {
  ixs: TransactionInstruction[];
  payer: PublicKey;
  signers: KeypairImport[];
}

type KeypairImport = { publicKey: PublicKey }; // structural, avoids circular import

/** Build a v0 message with a recent blockhash. */
export async function compileV0(
  conn: Connection,
  payer: PublicKey,
  ixs: TransactionInstruction[]
): Promise<{ message: TransactionMessage; blockhash: string }> {
  const { blockhash } = await conn.getLatestBlockhash();
  return {
    message: new TransactionMessage({
      payerKey: payer,
      instructions: ixs,
      recentBlockhash: blockhash,
    }),
    blockhash,
  };
}

export function v0Transaction(
  message: TransactionMessage
): VersionedTransaction {
  return new VersionedTransaction(message.compileToV0Message());
}
