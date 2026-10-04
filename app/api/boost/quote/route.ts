import { NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { curveForMint } from "@/lib/pdas";
import { quoteCp } from "@/lib/pump";
import { swarmQuote } from "@/lib/pricing";
import { connection } from "@/lib/rpc";

export const maxDuration = 30;

/** Swarm quote: validates deposit/buys and estimates tokens per buy from the
 * live bonding curve. GET ?mint=..&deposit=2&buys=100 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const mint = searchParams.get("mint");
  const deposit = Number(searchParams.get("deposit") ?? "0");
  const buys = Number(searchParams.get("buys") ?? "0");
  if (!mint) return NextResponse.json({ error: "mint missing" }, { status: 400 });
  const q = swarmQuote(deposit, buys);

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
