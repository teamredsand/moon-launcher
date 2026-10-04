import { describe, expect, it } from "vitest";
import { Keypair, PublicKey } from "@solana/web3.js";
import {
  BUY_FEE_RECIPIENT,
  BUY_REFERRER,
  CREATE_DISC,
  NATIVE_BUY_DISC,
} from "../lib/constants";
import {
  bondingCurveV2ForMint,
  creatorVaultFor,
  curveForMint,
  findAta,
  mintAuthority,
  userVolumeAccumulatorFor,
} from "../lib/pdas";
import {
  anchorStr,
  buyerAtaCreateIx,
  createCoinIx,
  feeTransferIx,
  freshCurveMinOut,
  nativeBuyIx,
  quoteCp,
} from "../lib/pump";
import { anchorSeedPairs } from "../lib/sim";
import { TIERS, tier } from "../lib/pricing";

// ---- ground truth from live mainnet launches (2026-10-04) -------------------
const BEEZ_MINT = new PublicKey("4g9zm9i8T27tmSTZDo2dQDEN3yuREByJrfpFrtEaJWqh");
const MAIN = new PublicKey("9KHNtoY1zjLySFCoH4oo7p5h9MpJRTPmgRCphuyP2m7P");
const BEEZ_CURVE = "6vuXc8zNCtcaVjeApTHbaRxGUV2WGf1gVp1bEg2SDESd";
const BEEZ_VAULT = "CnYuWiQNerpPShcutoJ5zXm6VaQAHWyxPhtQeekgeeHL";
const BEEZ_CURVE_V2 = "GWHJGD586nZuCkatM8KKrRgYXoC54gyQtP7pLSCK4oXu";
const MAIN_VAULT_83 = "7tPSc9rz49Q11MHPbNtkU8KNCBaHgeXhz62YFKciuzTP"; // [9] creator vault
const MAIN_ACCUM = "88a84XRBHXZheRrzAU5JN958Bv5EfKGLsC6DrnmER2cz"; // [13]

describe("pda derivations (verified on-chain)", () => {
  it("curve PDA matches the beeznet launch", () => {
    expect(curveForMint(BEEZ_MINT).toBase58()).toBe(BEEZ_CURVE);
  });
  it("curve vault ATA matches", () => {
    expect(findAta(curveForMint(BEEZ_MINT), BEEZ_MINT).toBase58()).toBe(BEEZ_VAULT);
  });
  it("bonding-curve-v2 matches the launch buy slot [16]", () => {
    expect(bondingCurveV2ForMint(BEEZ_MINT).toBase58()).toBe(BEEZ_CURVE_V2);
  });
  it("creator vault matches the launch buy slot [9]", () => {
    expect(creatorVaultFor(MAIN).toBase58()).toBe(MAIN_VAULT_83);
  });
  it("user volume accumulator matches the launch buy slot [13]", () => {
    expect(userVolumeAccumulatorFor(MAIN).toBase58()).toBe(MAIN_ACCUM);
  });
  it("mint authority is a stable PDA", () => {
    expect(mintAuthority().toBase58()).toBe(mintAuthority().toBase58());
    expect(mintAuthority().toBase58()).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
  });
});

describe("quote math (pinned to the python-verified values)", () => {
  it("fresh curve min out matches python fixtures", () => {
    expect(freshCurveMinOut(20_000_000n, 1000)).toBe(636_941_618_531n);
    expect(freshCurveMinOut(20_000_000n, 0)).toBe(707_712_909_479n);
    expect(freshCurveMinOut(500_000_000n, 1000)).toBe(15_675_405_804_229n);
    expect(freshCurveMinOut(5_000_000n, 300)).toBe(171_705_318_622n);
  });
  it("quoteCp is monotonic and fee-haircut", () => {
    const small = quoteCp(30n * 10n ** 9n, 1073n * 10n ** 12n, 5_000_000n, 100);
    const big = quoteCp(30n * 10n ** 9n, 1073n * 10n ** 12n, 50_000_000n, 100);
    expect(big).toBeGreaterThan(small);
    const noFee = quoteCp(1000n, 1000n, 100n, 0);
    const withFee = quoteCp(1000n, 1000n, 100n, 1000);
    expect(withFee).toBeLessThan(noFee);
  });
});

describe("instruction encoding", () => {
  it("anchorStr is u32 LE length + utf8", () => {
    expect(anchorStr("bee")).toEqual(
      Buffer.from([3, 0, 0, 0, 0x62, 0x65, 0x65])
    );
  });

  it("create ix: disc + name/symbol/uri + creator + 11-byte trailer, 16 accounts", () => {
    const mint = Keypair.generate().publicKey;
    const mayhem = Keypair.generate().publicKey;
    const ix = createCoinIx({
      mint,
      creator: MAIN,
      name: "beeznet",
      symbol: "BEES",
      uri: "https://ipfs.io/ipfs/abc",
      mayhemState: mayhem,
    });
    expect(ix.programId.toBase58()).toBe(
      "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P"
    );
    expect(ix.keys.length).toBe(16);
    expect(ix.keys[0]).toMatchObject({ isSigner: true, isWritable: true });
    expect(ix.keys[5].pubkey.toBase58()).toBe(MAIN.toBase58());
    expect(ix.keys[12].pubkey.toBase58()).toBe(mayhem.toBase58());
    const d = ix.data as Buffer;
    expect(d.subarray(0, 8).equals(CREATE_DISC)).toBe(true);
    const nameLen = d.readUInt32LE(8);
    expect(d.subarray(12, 12 + nameLen).toString("utf8")).toBe("beeznet");
    // creator is the 4th field after the 3 anchor strings
    const symLen = d.readUInt32LE(12 + nameLen);
    const uriAt = 16 + nameLen + symLen;
    const uriLen = d.readUInt32LE(uriAt);
    const creatorAt = uriAt + 4 + uriLen;
    expect(d.subarray(creatorAt, creatorAt + 32).toString("base64")).toBe(
      MAIN.toBuffer().toString("base64")
    );
    expect(d.length).toBe(creatorAt + 32 + 11); // creator + trailer
  });

  it("native buy ix: 18 accounts, derived slots, disc + <QQ> + 0x01", () => {
    const mint = Keypair.generate().publicKey;
    const buyer = Keypair.generate().publicKey;
    const ix = nativeBuyIx({
      mint,
      buyer,
      creator: buyer,
      solIn: 20_000_000n,
      minOut: 636_941_618_531n,
    });
    expect(ix.keys.length).toBe(18);
    expect((ix.data as Buffer).subarray(0, 8).equals(NATIVE_BUY_DISC)).toBe(true);
    expect((ix.data as Buffer).readBigUInt64LE(8)).toBe(20_000_000n);
    expect((ix.data as Buffer).readBigUInt64LE(16)).toBe(636_941_618_531n);
    expect((ix.data as Buffer)[24]).toBe(0x01);
    expect(ix.data.length).toBe(25);
    // derived slots
    expect(ix.keys[2].pubkey.toBase58()).toBe(mint.toBase58());
    expect(ix.keys[3].pubkey.toBase58()).toBe(curveForMint(mint).toBase58());
    expect(ix.keys[4].pubkey.toBase58()).toBe(
      findAta(curveForMint(mint), mint).toBase58()
    );
    expect(ix.keys[5].pubkey.toBase58()).toBe(
      findAta(buyer, mint).toBase58()
    );
    expect(ix.keys[6].pubkey.toBase58()).toBe(buyer.toBase58());
    expect(ix.keys[6].isSigner).toBe(true);
    expect(ix.keys[9].pubkey.toBase58()).toBe(creatorVaultFor(buyer).toBase58());
    expect(ix.keys[13].pubkey.toBase58()).toBe(
      userVolumeAccumulatorFor(buyer).toBase58()
    );
    expect(ix.keys[16].pubkey.toBase58()).toBe(bondingCurveV2ForMint(mint).toBase58());
    // proven-authorized verbatim slots
    expect(ix.keys[1].pubkey.toBase58()).toBe(BUY_FEE_RECIPIENT.toBase58());
    expect(ix.keys[17].pubkey.toBase58()).toBe(BUY_REFERRER.toBase58());
  });

  it("buyer ATA create ix is createIdempotent with 6 accounts", () => {
    const mint = Keypair.generate().publicKey;
    const owner = Keypair.generate().publicKey;
    const ix = buyerAtaCreateIx(owner, owner, mint);
    expect(ix.keys.length).toBe(6);
    expect(ix.data.length).toBe(1);
    expect(ix.data[0]).toBe(1);
    expect(ix.keys[1].pubkey.toBase58()).toBe(findAta(owner, mint).toBase58());
  });

  it("fee transfer goes to the treasury", () => {
    const treasury = Keypair.generate().publicKey;
    const ix = feeTransferIx(MAIN, treasury, 250_000_000n);
    expect(ix.keys[0].pubkey.toBase58()).toBe(MAIN.toBase58());
    expect(ix.keys[1].pubkey.toBase58()).toBe(treasury.toBase58());
  });
});

describe("sim self-heal parsing", () => {
  it("extracts anchor ConstraintSeeds left/right pairs", () => {
    const logs = [
      "Program 6EF8… invoke [1]",
      "Program log: Instruction: Create",
      "Program log: AnchorError caused by account: mayhem_state.",
      "Program log: Error Code: ConstraintSeeds. Error Number: 2006.",
      "Program log: Left:",
      "Program log: 3xN4Ydqb…",
      "Program log: Right:",
      "Program log: DjHS9Xcac3sx69rQG12NDNt72WNx2ugqVwQvHbEremvg",
      "Program 6EF8… failed: custom program error: 0x7d6",
    ];
    const pairs = anchorSeedPairs(logs);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].name).toBe("mayhem_state");
    expect(pairs[0].right).toBe("DjHS9Xcac3sx69rQG12NDNt72WNx2ugqVwQvHbEremvg");
  });
});

describe("pricing", () => {
  it("tiers are coherent", () => {
    for (const t of Object.values(TIERS)) {
      expect(t.feeSol).toBeGreaterThan(0);
      expect(t.boostFeeSol).toBe(t.feeSol - TIERS.ignition.feeSol);
      if (t.wallets > 0) expect(t.boostFeeSol).toBeGreaterThan(0);
    }
  });
  it("unknown tier falls back to ignition", () => {
    expect(tier("bogus").id).toBe("ignition");
  });
  it("launch tx budget covers costs + first buy + fee", () => {
    const t = TIERS.moonshot;
    expect(t.feeSol + t.firstBuySol).toBeLessThan(2); // fee sanity
    expect(TIERS.boost.boostFeeSol).toBe(TIERS.boost.feeSol - TIERS.ignition.feeSol);
  });
});
