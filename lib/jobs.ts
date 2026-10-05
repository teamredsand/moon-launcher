/** Swarm job engine: server-driven state machine for swarm buys.
 * States: awaiting_payment → buying → consolidating → done (or expired).
 * advance() is idempotent and rate-limited — browsers, bots, the API, and
 * the cron tick can all poke it safely. */

import { Connection, PublicKey } from "@solana/web3.js";
import { randomBytes } from "crypto";
import { consolidateChunk, fireBurst, progress } from "./boost";
import { swarmQuote } from "./pricing";
import { storeGet, storeSet } from "./store";
import { treasuryPubkey } from "./rpc";

export type JobState =
  | "awaiting_payment"
  | "buying"
  | "consolidating"
  | "done"
  | "expired"
  | "failed";

export interface SwarmJob {
  id: string;
  mint: string;
  customer: string; // consolidation target pubkey
  perBuySol: number;
  buys: number;
  depositLamports: string; // exact amount the payment must carry
  memo: string; // unique payment reference (Solana memo program)
  state: JobState;
  done: number;
  target: number;
  paymentSig?: string;
  callbackUrl?: string;
  apiKeyName?: string;
  tg?: { chatId: number | string; messageId?: number };
  error?: string;
  lastAdvance?: number; // ms epoch (advance throttle)
  createdAt: string;
  expiresAt: string;
}

export const MEMO_PROGRAM_ID = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";
const JOB_TTL_S = 24 * 3600;
const PAY_WINDOW_MS = 30 * 60 * 1000;
const ADVANCE_MIN_INTERVAL_MS = 10_000;

const jobKey = (id: string) => `job:${id}`;
const ACTIVE_KEY = "jobs:active";
const SCAN_KEY = "jobs:scan:until";

export async function createJob(input: {
  mint: string;
  customer: string;
  perBuySol: number;
  buys: number;
  callbackUrl?: string;
  apiKeyName?: string;
  tg?: { chatId: number | string };
}): Promise<SwarmJob> {
  const q = swarmQuote(input.perBuySol, input.buys);
  if (!q.valid) throw new Error(q.reason);
  const id = "sw_" + randomBytes(8).toString("hex");
  const now = Date.now();
  const job: SwarmJob = {
    id,
    mint: input.mint,
    customer: input.customer,
    perBuySol: q.perBuySol,
    buys: q.buys,
    depositLamports: String(Math.ceil(q.depositSol * 1e9)),
    memo: `SW:${id}`,
    state: "awaiting_payment",
    done: 0,
    target: q.buys,
    callbackUrl: input.callbackUrl,
    apiKeyName: input.apiKeyName,
    tg: input.tg,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + PAY_WINDOW_MS).toISOString(),
  };
  await storeSet(jobKey(id), job, JOB_TTL_S);
  const active = (await storeGet<string[]>(ACTIVE_KEY)) ?? [];
  active.push(id);
  await storeSet(ACTIVE_KEY, active);
  return job;
}

export async function getJob(id: string): Promise<SwarmJob | null> {
  return storeGet<SwarmJob>(jobKey(id));
}

async function saveJob(job: SwarmJob): Promise<void> {
  await storeSet(jobKey(job.id), job, JOB_TTL_S);
}

/** Persist out-of-band updates (e.g. telegram messageId from notify). */
export async function updateJob(job: SwarmJob): Promise<void> {
  await saveJob(job);
}

async function deactivate(id: string): Promise<void> {
  const active = (await storeGet<string[]>(ACTIVE_KEY)) ?? [];
  await storeSet(
    ACTIVE_KEY,
    active.filter((x) => x !== id)
  );
}

export async function activeJobs(): Promise<SwarmJob[]> {
  const ids = (await storeGet<string[]>(ACTIVE_KEY)) ?? [];
  const jobs = await Promise.all(ids.map((id) => getJob(id)));
  return jobs.filter((j): j is SwarmJob => j !== null);
}

export type JobEvent = "paid" | "progress" | "done" | "expired" | "failed";

/** One step. Returns the event when the state changed, else null. */
export async function advanceJob(
  conn: Connection,
  job: SwarmJob,
  opts: { throttle?: boolean } = {}
): Promise<JobEvent | null> {
  if (job.state === "done" || job.state === "expired" || job.state === "failed") {
    return null;
  }
  if (opts.throttle && job.lastAdvance && Date.now() - job.lastAdvance < ADVANCE_MIN_INTERVAL_MS) {
    return null;
  }
  job.lastAdvance = Date.now();

  try {
    if (job.state === "awaiting_payment") {
      if (Date.now() > Date.parse(job.expiresAt)) {
        job.state = "expired";
        await saveJob(job);
        await deactivate(job.id);
        return "expired";
      }
      const sig = await findPayment(conn, job);
      if (!sig) {
        await saveJob(job);
        return null;
      }
      job.paymentSig = sig;
      job.state = "buying";
      await saveJob(job);
      return "paid";
    }

    const mint = new PublicKey(job.mint);
    const customer = new PublicKey(job.customer);
    const perBuy = BigInt(Math.floor(job.perBuySol * 1e9));

    if (job.state === "buying") {
      const pg = await progress(conn, mint, job.buys);
      job.done = pg.done;
      job.target = pg.target;
      if (pg.remaining > 0) {
        await fireBurst(conn, mint, customer, job.buys, perBuy);
      } else {
        job.state = "consolidating";
      }
      await saveJob(job);
      return job.state === "consolidating" ? "progress" : null;
    }

    if (job.state === "consolidating") {
      const moved = await consolidateChunk(conn, mint, customer, job.buys);
      if (moved === 0) {
        job.state = "done";
        job.done = job.target;
        await saveJob(job);
        await deactivate(job.id);
        return "done";
      }
      await saveJob(job);
      return null;
    }
  } catch (e) {
    job.error = (e as Error).message.slice(0, 300);
    await saveJob(job);
    // transient errors (RPC hiccups) stay retryable; only flag hard ones
    return null;
  }
  return null;
}

/** Scan recent treasury transfers for this job's memo + exact amount. */
async function findPayment(conn: Connection, job: SwarmJob): Promise<string | null> {
  const treasury = treasuryPubkey();
  if (!treasury) return null;
  const need = BigInt(job.depositLamports);
  const until = (await storeGet<string>(SCAN_KEY)) ?? undefined;
  const sigs = await conn.getSignaturesForAddress(treasury, {
    limit: 50,
    until,
  });
  if (sigs.length > 0) {
    // newest signature becomes the next scan's upper bound
    await storeSet(SCAN_KEY, sigs[0].signature);
  }
  for (const s of sigs) {
    if (s.err) continue;
    const tx = await conn.getTransaction(s.signature, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });
    if (!tx || tx.meta?.err) continue;
    const keys = tx.transaction.message.staticAccountKeys;
    let memoOk = false;
    let amountOk = false;
    for (const ci of tx.transaction.message.compiledInstructions) {
      const prog = keys[ci.programIdIndex]?.toBase58();
      if (prog === MEMO_PROGRAM_ID) {
        const text = Buffer.from(ci.data as Uint8Array).toString("utf8");
        if (text === job.memo) memoOk = true;
      }
      if (prog === "11111111111111111111111111111111") {
        const d = Buffer.from(ci.data as Uint8Array);
        if (d.length === 12 && d.readUInt32LE(0) === 2 && ci.accountKeyIndexes.length === 2) {
          const to = keys[ci.accountKeyIndexes[1]];
          if (to?.equals(treasury) && d.readBigUInt64LE(4) >= need) amountOk = true;
        }
      }
    }
    if (memoOk && amountOk) return s.signature;
  }
  return null;
}

/** Public, safe-to-show view of a job. */
export function publicJob(job: SwarmJob) {
  return {
    id: job.id,
    mint: job.mint,
    customer: job.customer,
    perBuySol: job.perBuySol,
    buys: job.buys,
    state: job.state,
    done: job.done,
    target: job.target,
    paymentSig: job.paymentSig ?? null,
    deposit: {
      address: treasuryPubkey()?.toBase58() ?? null,
      lamports: job.depositLamports,
      memo: job.memo,
    },
    error: job.error ?? null,
    createdAt: job.createdAt,
    expiresAt: job.expiresAt,
  };
}
