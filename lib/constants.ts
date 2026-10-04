import { PublicKey } from "@solana/web3.js";

export const PUMP_PROGRAM_ID = new PublicKey(
  "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P"
);
export const TOKEN_2022_PROGRAM_ID = new PublicKey(
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
);
export const SYSTEM_PROGRAM_ID = new PublicKey(
  "11111111111111111111111111111111"
);
export const ATA_PROGRAM_ID = new PublicKey(
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
);
export const WSOL_MINT = new PublicKey(
  "So11111111111111111111111111111111111111112"
);

// ---- pump.fun create (disc d6904cec) fixed slots ---------------------------
// Layout captured and verified from live unified-program launches (2026-10):
//   [0] mint (signer)   [1] PDA("mint-authority") [2] curve PDA
//   [3] curve vault ATA  [4] global config        [5] creator/payer (signer)
//   [6] system           [7] Token-2022           [8] ATA program
//   [9] slot9           [10] slot10               [11] fee treasury
//   [12] mayhem_state PDA (seeds-constrained, discovered via sim self-heal)
//   [13] unconstrained   [14] event authority     [15] program
export const CREATE_DISC = Buffer.from("d6904cec5f8b31b4", "hex");
export const CREATE_TRAILER = Buffer.alloc(11); // captured verbatim; flags
export const GLOBAL_CONFIG = new PublicKey(
  "4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jjaxnjf"
);
export const CREATE_SLOT9 = new PublicKey(
  "MAyhSmzXzV1pTf7LsNkrNwkWKTo4ougAJ1PPg47MD4e"
);
export const CREATE_SLOT10 = new PublicKey(
  "13ec7XdrjF3h3YcqBTFDSReRcUFwbCnJaAQspM4j6DDJ"
);
export const CREATE_FEE_TREASURY = new PublicKey(
  "BwWK17cbHxwWBKZkUYvzxLcNQ1YVyaFezduWbtm2de6s"
);
export const EVENT_AUTHORITY = new PublicKey(
  "Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1"
);

// ---- native buy (disc 38fc7408, 18 accounts, trailing 0x01) -----------------
// Verbatim slots from a template proven live on 2026-10-04 (beeznet launch +
// 215 confirmed replayed swarm buys). Derived slots: [2] mint, [3] curve,
// [4] curve vault, [5] buyer ATA, [6] buyer, [9] creator vault,
// [13] user_volume_accumulator, [16] bonding-curve-v2.
export const NATIVE_BUY_DISC = Buffer.from("38fc74089edfcd5f", "hex");
export const NATIVE_BUY_TRAILING = Buffer.from("01", "hex");
export const BUY_FEE_RECIPIENT = new PublicKey(
  "62qc2CNXwrYqQScmEdiZFFAnJR262PxWEuNQtxfafNgV" // [1] W — authorized live
);
export const BUY_SLOT12 = new PublicKey(
  "Hq2wp8uJ9jCPsYgNHex8RtqdvMPfVGoYwjvF1ATiwn2Y" // [12] W
);
export const BUY_SLOT14 = new PublicKey(
  "8Wf5TiAheLUqBrKXeYg2JtAFFMWtKdG2BSFgqUcPVwTt" // [14]
);
export const BUY_SLOT15 = new PublicKey(
  "pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ" // [15]
);
export const BUY_REFERRER = new PublicKey(
  "5YxQFdt3Tr9zJLvkFccqXVUwhdTWJQc1fFg2YPbxvxeD" // [17] W — authorized live
);
export const BUY_SLOT0 = GLOBAL_CONFIG;

// fresh pump.fun curve virtual reserves at creation
export const FRESH_CURVE_VSOL = 30_000_000_000n;
export const FRESH_CURVE_VTOK = 1_073_000_000_000_000n;
export const LAMPORTS_PER_SOL = 1_000_000_000;
