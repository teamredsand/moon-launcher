import { PublicKey } from "@solana/web3.js";
import {
  ATA_PROGRAM_ID,
  PUMP_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
} from "./constants";

/** bonding-curve PDA for a mint — verified live (beeznet/83QpuraL launches). */
export function curveForMint(mint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("bonding-curve"), mint.toBuffer()],
    PUMP_PROGRAM_ID
  )[0];
}

/** Token-2022 associated token account (ATA program derivation:
 * seeds [owner, tokenProgram, mint] — verified on-chain 2026-10-04). */
export function findAta(
  owner: PublicKey,
  mint: PublicKey,
  tokenProgram: PublicKey = TOKEN_2022_PROGRAM_ID
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [owner.toBuffer(), tokenProgram.toBuffer(), mint.toBuffer()],
    ATA_PROGRAM_ID
  )[0];
}

/** pump program global mint authority: PDA("mint-authority"). */
export function mintAuthority(): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("mint-authority")],
    PUMP_PROGRAM_ID
  )[0];
}

/** creator fee vault: PDA("creator-vault", creator) — verified from live buys. */
export function creatorVaultFor(creator: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("creator-vault"), creator.toBuffer()],
    PUMP_PROGRAM_ID
  )[0];
}

/** per-user volume accumulator: PDA("user_volume_accumulator", buyer). */
export function userVolumeAccumulatorFor(user: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("user_volume_accumulator"), user.toBuffer()],
    PUMP_PROGRAM_ID
  )[0];
}

/** bonding-curve-v2 PDA (per mint) — InvalidBondingCurveV2-constrained. */
export function bondingCurveV2ForMint(mint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("bonding-curve-v2"), mint.toBuffer()],
    PUMP_PROGRAM_ID
  )[0];
}
