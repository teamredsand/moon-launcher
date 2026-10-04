import { NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { curveForMint } from "@/lib/pdas";
import { quoteCp } from "@/lib/pump";
import { swarmQuote } from "@/lib/pricing";
import { connection } from "@/lib/rpc";

export const maxDuration = 30;

/** Swarm quote: validates per-buy size + wallet count, returns the
 * calculated deposit (margin included) and live token estimates.
 * GET ?mint=..&perBuy=0.001&buys=100 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const mint = searchParams.get("mint");
  const perBuy = Number(searchParams.get("perBuy") ?? "0");
  const buys = Number(searchParams.get("buys") ?? "0");
  if (!mint) return NextResponse.json({ error: "mint missing" }, { status: 400 });
  const q = swarmQuote(perBuy, buys);

  const conn = connection();
  let curveOk = false;
  let tokensPerBuy: string | null = null;
  let totalTokens: string | null = null;
  try {
    const info = await conn.getAccountInfo(
      curveForMint(new PublicKey(mint))
    );
    if (info) {
      const d = info.data;
      for (let off = 40; off + 8 <= d.length; off += 8) {
        if (d.readBigUInt64LE(off) === 1_000_000_000_000_000n) {
          const vTok = d.readBigUInt64LE(off - 32);
          const vSol = d.readBigUInt64LE(off - 24);
          curveOk = true;
          if (q.valid && q.perBuySol > 0) {
            const out = quoteCp(vSol, vTok, BigInt(Math.floor(q.perBuySol * 1e9)), 100);
            tokensPerBuy = out.toString();
            totalTokens = (out * BigInt(q.buys)).toString();
          }
          break;
        }
      }
    }
  } catch {
    /* bad mint key */
  }

  return NextResponse.json({ ...q, curveOk, tokensPerBuy, totalTokens });
}
