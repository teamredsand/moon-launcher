"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  SWARM_GAS_PER_BUY,
  SWARM_MARGIN,
  SWARM_MAX_BUYS,
  SWARM_MAX_DEPOSIT_SOL,
  SWARM_MIN_BUYS,
  SWARM_MIN_DEPOSIT_SOL,
  swarmQuote,
} from "@/lib/pricing";

type Phase = "setup" | "depositing" | "buying" | "consolidating" | "done";

export function SwarmFlow() {
  const { connection } = useConnection();
  const { publicKey, signTransaction, connected } = useWallet();

  const [mint, setMint] = useState("");
  const [deposit, setDeposit] = useState(2);
  const [buys, setBuys] = useState(100);
  const [phase, setPhase] = useState<Phase>("setup");
  const [progress, setProgress] = useState({ done: 0, target: 0 });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [curveOk, setCurveOk] = useState<boolean | null>(null);
  const [estTokens, setEstTokens] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const q = useMemo(() => swarmQuote(deposit, buys), [deposit, buys]);

  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);

  // live curve check + token estimate (debounced)
  useEffect(() => {
    setCurveOk(null);
    setEstTokens(null);
    if (mint.length < 32 || !q.valid) return;
    const id = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/boost/quote?mint=${encodeURIComponent(mint)}&deposit=${deposit}&buys=${buys}`
        );
        const j = await res.json();
        setCurveOk(Boolean(j.curveOk));
        if (j.totalTokens) {
          const n = Number(j.totalTokens) / 1e6;
          setEstTokens(n >= 1 ? `~${n.toLocaleString(undefined, { maximumFractionDigits: 1 })}M tokens` : `~${Math.round(n * 1e6).toLocaleString()} tokens`);
        }
      } catch {
        setCurveOk(null);
      }
    }, 600);
    return () => clearTimeout(id);
  }, [mint, deposit, buys, q.valid]);

  const payAndStart = useCallback(async () => {
    if (!publicKey || !signTransaction || !q.valid) return;
    setError(null);
    setBusy(true);
    try {
      const treasury = process.env.NEXT_PUBLIC_TREASURY;
      if (!treasury) throw new Error("service not configured");
      const bal = await connection.getBalance(publicKey);
      if (bal < (deposit + 0.005) * LAMPORTS_PER_SOL) {
        throw new Error(
          `Your wallet needs ${(deposit + 0.005).toFixed(2)} SOL. It has ${(bal / LAMPORTS_PER_SOL).toFixed(3)} SOL.`
        );
      }
      setPhase("depositing");
      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: publicKey,
          toPubkey: new PublicKey(treasury),
          lamports: Math.round(deposit * LAMPORTS_PER_SOL),
        })
      );
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = publicKey;
      const signed = await signTransaction(tx);
      const paymentSig = await connection.sendRawTransaction(signed.serialize());
      await connection.confirmTransaction(
        { signature: paymentSig, blockhash, lastValidBlockHeight },
        "confirmed"
      );

      setPhase("buying");
      const callBurst = async () => {
        const res = await fetch("/api/boost/burst", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            mint,
            customer: publicKey.toBase58(),
            tier: "swarm",
            buys,
            paymentSig,
          }),
        });
        const j = await res.json();
        if (!res.ok) throw new Error(j.error ?? "boost failed");
        setProgress({ done: j.done, target: j.target });
        if (j.phase === "consolidating") setPhase("consolidating");
        if (j.phase === "done") {
          if (timer.current) clearInterval(timer.current);
          setPhase("done");
        }
      };
      await callBurst();
      timer.current = setInterval(async () => {
        try { await callBurst(); } catch { /* keep polling */ }
      }, 20_000);
    } catch (e) {
      setError((e as Error).message);
      setPhase("setup");
    } finally {
      setBusy(false);
    }
  }, [publicKey, signTransaction, q.valid, deposit, buys, mint, connection]);

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-12">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Swarm buy</h1>
        {!connected && (
          <p className="text-sm text-muted-foreground">
            Connect your wallet in the top right.
          </p>
        )}
      </div>

      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-6 text-sm text-destructive">
            {error}
          </CardContent>
        </Card>
      )}

      {phase === "setup" && (
        <Card>
          <CardHeader>
            <CardTitle>Set up the buy</CardTitle>
            <CardDescription>
              Give the address of a coin on pump.fun. Up to {SWARM_MAX_BUYS}{" "}
              wallets buy it. All tokens go to your wallet. The service keeps{" "}
              {SWARM_MARGIN * 100}% of the deposit.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="mint">Coin address</Label>
              <Input
                id="mint"
                value={mint}
                onChange={(e) => setMint(e.target.value.trim())}
                placeholder="paste the pump.fun coin address"
                className="font-mono text-xs"
              />
              {curveOk === true && (
                <p className="text-sm text-primary">Coin found on the curve.</p>
              )}
              {curveOk === false && (
                <p className="text-sm text-destructive">
                  No bonding curve found. The coin must still trade on
                  pump.fun.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <Label htmlFor="deposit">Deposit</Label>
                <span className="font-mono">{deposit.toFixed(1)} SOL</span>
              </div>
              <input
                id="deposit"
                type="range"
                min={SWARM_MIN_DEPOSIT_SOL}
                max={SWARM_MAX_DEPOSIT_SOL}
                step={0.5}
                value={deposit}
                onChange={(e) => setDeposit(Number(e.target.value))}
                className="w-full accent-[var(--primary)]"
              />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <Label htmlFor="buys">Number of buys</Label>
                <span className="font-mono">{buys}</span>
              </div>
              <input
                id="buys"
                type="range"
                min={SWARM_MIN_BUYS}
                max={SWARM_MAX_BUYS}
                step={10}
                value={buys}
                onChange={(e) => setBuys(Number(e.target.value))}
                className="w-full accent-[var(--primary)]"
              />
            </div>

            <div className="rounded-md border border-border p-4 text-sm space-y-1 font-mono">
              <p>
                Deposit: <span className="text-foreground">{deposit.toFixed(2)} SOL</span>
              </p>
              <p className="text-muted-foreground">
                Service fee (25%): {q.feeSol.toFixed(3)} SOL
              </p>
              <p className="text-muted-foreground">
                Network costs ({buys} × {SWARM_GAS_PER_BUY}): {q.gasSol.toFixed(3)} SOL
              </p>
              <p>
                Per buy:{" "}
                <span className="text-primary">{q.perBuySol.toFixed(5)} SOL</span>
              </p>
              {estTokens && (
                <p className="text-muted-foreground">
                  You get {estTokens} (estimate).
                </p>
              )}
              {!q.valid && (
                <p className="text-destructive">{q.reason}</p>
              )}
              <p className="text-muted-foreground">
                Time: about {Math.ceil(buys / 6) * 20} seconds of buying, then
                the tokens move to your wallet.
              </p>
            </div>
          </CardContent>
          <CardFooter>
            <Button
              onClick={payAndStart}
              disabled={busy || !connected || !q.valid || curveOk === false || mint.length < 32}
            >
              {busy ? "Working…" : `Deposit ${deposit.toFixed(2)} SOL and start`}
            </Button>
          </CardFooter>
        </Card>
      )}

      {phase === "depositing" && (
        <Card>
          <CardContent className="pt-6">
            Sign the deposit in your wallet…
          </CardContent>
        </Card>
      )}

      {(phase === "buying" || phase === "consolidating") && (
        <Card className="border-primary">
          <CardHeader>
            <CardTitle>
              {phase === "buying" ? "Buying in progress" : "Moving your tokens"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {phase === "buying" ? (
              <p>
                {progress.done} of {progress.target} wallets bought. Keep this
                page open.
              </p>
            ) : (
              <p>
                All buys are done. The tokens are moving to your wallet. Keep
                this page open.
              </p>
            )}
            <Progress
              value={
                progress.target ? (progress.done / progress.target) * 100 : 0
              }
            />
          </CardContent>
        </Card>
      )}

      {phase === "done" && (
        <Card className="border-primary">
          <CardHeader>
            <CardTitle>Done</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>All tokens are in your wallet. You control the supply.</p>
            <p>
              <a
                href={`https://pump.fun/coin/${mint}`}
                target="_blank"
                rel="noreferrer"
                className="text-primary underline"
              >
                See the coin on pump.fun
              </a>
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
