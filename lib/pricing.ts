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
/** Flat fee for a user-described launch (no AI cost). */
export const CUSTOM_FEE_SOL = 0.15;

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

/* ---- swarm buy service (existing coin, up to 1000 wallets) ------------- */

export const SWARM_MARGIN = 0.25; // service keeps 25% of the deposit
export const SWARM_GAS_PER_BUY = 0.0022; // tx fee + ATA rent + buffer, SOL
export const SWARM_MIN_BUYS = 10;
export const SWARM_MAX_BUYS = 1000;
export const SWARM_MIN_DEPOSIT_SOL = 0.5;
export const SWARM_MAX_DEPOSIT_SOL = 50;
export const SWARM_MIN_PER_BUY_SOL = 0.0005;

export interface SwarmQuote {
  depositSol: number;
  buys: number;
  feeSol: number; // 25% margin
  gasSol: number; // buys * gas
  perBuySol: number; // what each wallet spends
  valid: boolean;
  reason?: string;
}

export function swarmQuote(depositSol: number, buys: number): SwarmQuote {
  const feeSol = depositSol * SWARM_MARGIN;
  const gasSol = buys * SWARM_GAS_PER_BUY;
  const pool = depositSol - feeSol - gasSol;
  const perBuySol = buys > 0 ? pool / buys : 0;
  let valid = true;
  let reason: string | undefined;
  if (buys < SWARM_MIN_BUYS || buys > SWARM_MAX_BUYS) {
    valid = false;
    reason = `buys must be ${SWARM_MIN_BUYS}–${SWARM_MAX_BUYS}`;
  } else if (depositSol < SWARM_MIN_DEPOSIT_SOL || depositSol > SWARM_MAX_DEPOSIT_SOL) {
    valid = false;
    reason = `deposit must be ${SWARM_MIN_DEPOSIT_SOL}–${SWARM_MAX_DEPOSIT_SOL} SOL`;
  } else if (perBuySol < SWARM_MIN_PER_BUY_SOL) {
    valid = false;
    const minDeposit = (gasSol + buys * SWARM_MIN_PER_BUY_SOL) / (1 - SWARM_MARGIN);
    reason = `deposit too small for ${buys} buys — needs at least ${minDeposit.toFixed(2)} SOL`;
  }
  return { depositSol, buys, feeSol, gasSol, perBuySol, valid, reason };
}
