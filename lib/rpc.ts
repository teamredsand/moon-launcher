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

/** Boost wallets from SWARM_WALLETS (JSON array of base58 secrets). */
export function swarmWallets(): SwarmWallet[] {
  if (cached) return cached;
  const raw = process.env.SWARM_WALLETS;
  cached = [];
  if (raw) {
    try {
      const secrets = JSON.parse(raw) as string[];
      cached = secrets.map((s) => {
        const kp = Keypair.fromSecretKey(Buffer.from(s, "base64"));
        return { pubkey: kp.publicKey.toBase58(), kp };
      });
    } catch {
      cached = [];
    }
  }
  return cached;
}
