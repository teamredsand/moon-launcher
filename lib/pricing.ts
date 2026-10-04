import { LAMPORTS_PER_SOL } from "./constants";

export type TierId = "ignition" | "boost" | "moonshot";

export interface Tier {
  id: TierId;
  label: string;
  tagline: string;
  /** total service fee in SOL (launch part paid inside the launch tx) */
  feeSol: number;
  /** first-buy size in SOL the customer's launch tx pays */
  firstBuySol: number;
  /** swarm wallets that buy after launch (0 = none) */
  wallets: number;
  /** boost part (feeSol - ignition fee) — paid as a separate transfer */
  boostFeeSol: number;
  /** coin shows first on the front-page feed */
  featured: boolean;
  features: string[];
}

export const IGNITION_FEE_SOL = 0.25;

export const TIERS: Record<TierId, Tier> = {
  ignition: {
    id: "ignition",
    label: "Ignition",
    tagline: "A coin that doesn't land dead",
    feeSol: 0.25,
    firstBuySol: 0.02,
    wallets: 0,
    boostFeeSol: 0,
    featured: false,
    features: [
      "AI identity: image, name, symbol, description",
      "IPFS metadata hosted on pump.fun's own pinning",
      "Atomic launch + first buy in one transaction",
      "Your keys, your coin, your creator fees",
    ],
  },
  boost: {
    id: "boost",
    label: "Boost",
    tagline: "First-hour momentum",
    feeSol: 0.75,
    firstBuySol: 0.05,
    wallets: 100,
    boostFeeSol: 0.5,
    featured: false,
    features: [
      "Everything in Ignition",
      "100 unique wallets buy over ~30 minutes",
      "Tokens land in YOUR wallet",
      "Live boost progress in your browser",
    ],
  },
  moonshot: {
    id: "moonshot",
    label: "Moonshot",
    tagline: "Maximum thrust",
    feeSol: 1.75,
    firstBuySol: 0.1,
    wallets: 250,
    boostFeeSol: 1.5,
    featured: true,
    features: [
      "Everything in Boost (250 wallets, ~45 min)",
      "Featured on the MoonLauncher front page",
      "Priority boost queue",
    ],
  },
};

export const tier = (id: string): Tier =>
  TIERS[(id as TierId) in TIERS ? (id as TierId) : "ignition"];

export const solToLamports = (sol: number): bigint =>
  BigInt(Math.round(sol * LAMPORTS_PER_SOL));

/** SOL the customer's launch tx must carry: chain costs + first buy + fee. */
export function launchTxNeeds(t: Tier): bigint {
  // launch chain costs (mints/curve/ATA rents + fees) measured live
  const CHAIN_COSTS_LAMPORTS = 8_000_000n;
  return CHAIN_COSTS_LAMPORTS + solToLamports(t.firstBuySol) + solToLamports(t.feeSol);
}
