import { Connection, Keypair, PublicKey } from "@solana/web3.js";

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

/** Boost wallets from SWARM_WALLETS (JSON array of base64 secrets) or from
 * chunked vars SWARM_WALLETS_1..N (Vercel 4 KB var limit). */
export function swarmWallets(): SwarmWallet[] {
  if (cached) return cached;
  cached = [];
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
