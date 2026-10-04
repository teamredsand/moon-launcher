import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { createHash } from "crypto";

export const SWARM_SIZE = 1000;

export function connection(): Connection {
  const url =
    process.env.RPC_URL ?? "https://api.mainnet-beta.solana.com";
  return new Connection(url, { commitment: "confirmed" });
}

/** Treasury public key (receives service fees). */
export function treasuryPubkey(): PublicKey | null {
  const kp = treasury();
  if (kp) return kp.publicKey;
  const pub = process.env.NEXT_PUBLIC_TREASURY;
  if (!pub) return null;
  try {
    return new PublicKey(pub);
  } catch {
    return null;
  }
}

/** Treasury keypair — only present on the server. */
export function treasury(): Keypair | null {
  const secret = process.env.TREASURY_SECRET_B64;
  if (!secret) return null;
  return Keypair.fromSecretKey(Buffer.from(secret, "base64"));
}

export interface SwarmWallet {
  pubkey: string;
  kp: Keypair;
}

const swarmCache = new Map<string, SwarmWallet[]>();

/** Boost wallets. Derived deterministically from SWARM_SEED:
 * sha256(seed || salt || u32le(i)) as the ed25519 seed. With a per-mint
 * salt, every job gets a fresh, unique set of addresses — no cross-coin
 * fingerprint. One 32-byte secret covers any number of jobs (and fits
 * Vercel's env limits). Falls back to SWARM_WALLETS / SWARM_WALLETS_1..N
 * (base64 JSON arrays) when no seed is set. */
export function swarmWallets(salt?: string): SwarmWallet[] {
  const key = salt ?? "";
  const hit = swarmCache.get(key);
  if (hit) return hit;
  if (swarmCache.size > 20) swarmCache.delete(swarmCache.keys().next().value!);
  const out: SwarmWallet[] = [];
  const seedB64 = process.env.SWARM_SEED;
  if (seedB64) {
    const seed = Buffer.from(seedB64, "base64");
    const saltBuf = salt ? Buffer.from(salt, "utf8") : Buffer.alloc(0);
    for (let i = 0; i < SWARM_SIZE; i++) {
      const h = createHash("sha256")
        .update(seed)
        .update(saltBuf)
        .update(Buffer.from([i & 0xff, (i >> 8) & 0xff, (i >> 16) & 0xff, (i >> 24) & 0xff]))
        .digest();
      const kp = Keypair.fromSeed(h);
      out.push({ pubkey: kp.publicKey.toBase58(), kp });
    }
    swarmCache.set(key, out);
    return out;
  }
  const raws: string[] = [];
  if (process.env.SWARM_WALLETS) raws.push(process.env.SWARM_WALLETS);
  for (let i = 1; i <= 20; i++) {
    const v = process.env[`SWARM_WALLETS_${i}`];
    if (v) raws.push(v);
  }
  for (const raw of raws) {
    try {
      const secrets = JSON.parse(raw) as string[];
      for (const s of secrets) {
        const kp = Keypair.fromSecretKey(Buffer.from(s, "base64"));
        out.push({ pubkey: kp.publicKey.toBase58(), kp });
      }
    } catch {
      /* skip bad chunk */
    }
  }
  swarmCache.set(key, out);
  return out;
}
