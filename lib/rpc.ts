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

let cached: SwarmWallet[] | null = null;

/** Boost wallets. Derived deterministically from SWARM_SEED
 * (sha256(seed || u32le(i)) as the ed25519 seed) — one 32-byte secret gives
 * up to SWARM_SIZE wallets, which fits Vercel's env limits. Falls back to
 * SWARM_WALLETS / SWARM_WALLETS_1..N (base64 JSON arrays) when no seed. */
export function swarmWallets(): SwarmWallet[] {
  if (cached) return cached;
  cached = [];
  const seedB64 = process.env.SWARM_SEED;
  if (seedB64) {
    const seed = Buffer.from(seedB64, "base64");
    for (let i = 0; i < SWARM_SIZE; i++) {
      const h = createHash("sha256")
        .update(seed)
        .update(Buffer.from([i & 0xff, (i >> 8) & 0xff, (i >> 16) & 0xff, (i >> 24) & 0xff]))
        .digest();
      const kp = Keypair.fromSeed(h);
      cached.push({ pubkey: kp.publicKey.toBase58(), kp });
    }
    return cached;
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
        cached.push({ pubkey: kp.publicKey.toBase58(), kp });
      }
    } catch {
      /* skip bad chunk */
    }
  }
  return cached;
}
