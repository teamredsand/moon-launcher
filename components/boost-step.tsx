"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { TIERS, type TierId } from "@/lib/pricing";
import { trackEvent } from "@/lib/gtag";

type Choice = "boost" | "moonshot" | "custom" | null;
type Stage = "choose" | "paying" | "boosting" | "consolidating" | "done";

const OPTIONS: { id: Choice; title: string; price: string; note: string }[] = [
  {
    id: "boost",
    title: "Boost — 100 wallets",
    price: `+${TIERS.boost.boostFeeSol} SOL`,
    note: "100 wallets buy in small steps. About 30 minutes.",
  },
  {
    id: "moonshot",
    title: "Moonshot — 250 wallets",
    price: `+${TIERS.moonshot.boostFeeSol} SOL`,
    note: "250 wallets buy in small steps. About 45 minutes.",
  },
  {
    id: "custom",
    title: "Custom — pick your price & volume",
    price: "up to 1000 wallets",
    note: "Set the buy size and the wallet count yourself.",
  },
];

/** Post-launch boost step. Used by both the AI and the custom launch flow.
 * Boost types are selectable here — the pre-launch tier is only a default. */
export function BoostStep({
  mint,
  defaultChoice,
}: {
  mint: string;
  defaultChoice?: Choice;
}) {
  const { connection } = useConnection();
  const { publicKey, signTransaction } = useWallet();
  const [choice, setChoice] = useState<Choice>(defaultChoice ?? null);
  const [stage, setStage] = useState<Stage>("choose");
  const [prog, setProg] = useState({ done: 0, target: 0 });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);

  const t = choice === "moonshot" ? TIERS.moonshot : TIERS.boost;
  const tierId: TierId = choice === "moonshot" ? "moonshot" : "boost";

  const payAndStart = useCallback(async () => {
    if (!publicKey || !signTransaction || !choice || choice === "custom") return;
    setError(null);
    setBusy(true);
    try {
      const treasury = process.env.NEXT_PUBLIC_TREASURY;
      if (!treasury) throw new Error("service not configured");
      const bal = await connection.getBalance(publicKey);
      if (bal < (t.boostFeeSol + 0.005) * LAMPORTS_PER_SOL) {
        throw new Error(
          `Your wallet needs ${(t.boostFeeSol + 0.005).toFixed(2)} SOL. It has ${(bal / LAMPORTS_PER_SOL).toFixed(3)} SOL.`
        );
      }
      setStage("paying");
      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: publicKey,
          toPubkey: new PublicKey(treasury),
          lamports: Math.round(t.boostFeeSol * LAMPORTS_PER_SOL),
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

      setStage("boosting");
      const callBurst = async () => {
        const res = await fetch("/api/boost/burst", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            mint,
            customer: publicKey.toBase58(),
            tier: tierId,
            paymentSig,
          }),
        });
        const j = await res.json();
        if (!res.ok) throw new Error(j.error ?? "boost failed");
        setProg({ done: j.done, target: j.target });
        if (j.phase === "consolidating") setStage("consolidating");
        if (j.phase === "done") {
          if (timer.current) clearInterval(timer.current);
          setStage("done");
        }
      };
      await callBurst();
      timer.current = setInterval(async () => {
        try { await callBurst(); } catch { /* keep polling */ }
      }, 20_000);
    } catch (e) {
      setError((e as Error).message);
      setStage("choose");
    } finally {
      setBusy(false);
    }
  }, [publicKey, signTransaction, choice, t, tierId, mint, connection]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Step 3 — Boost (optional)</CardTitle>
        <CardDescription>
          Pick a boost type. Wallets buy your coin in small steps. All tokens
          go to your wallet.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && <p className="text-sm text-destructive">{error}</p>}

        {stage === "choose" && (
          <div className="space-y-2">
            {OPTIONS.map((o) =>
              o.id === "custom" ? (
                <Link
                  key={o.id}
                  href={`/launch/boost?mint=${mint}`}
                  className={buttonVariants({ variant: "outline", className: "w-full justify-between" })}
                >
                  <span>{o.title}</span>
                  <span className="text-muted-foreground">{o.price}</span>
                </Link>
              ) : (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => setChoice(o.id)}
                  className={
                    "flex w-full items-center justify-between rounded-md border p-3 text-left text-sm " +
                    (choice === o.id ? "border-primary bg-secondary" : "border-border")
                  }
                >
                  <span>{o.title}</span>
                  <span className="text-muted-foreground">{o.price}</span>
                </button>
              )
            )}
            {choice && choice !== "custom" && (
              <p className="text-sm text-muted-foreground">{OPTIONS.find((o) => o.id === choice)?.note}</p>
            )}
          </div>
        )}

        {stage === "paying" && (
          <p className="flex items-center gap-3 text-sm">
            <span className="inline-block size-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            Sign the payment in your wallet…
          </p>
        )}

        {(stage === "boosting" || stage === "consolidating") && (
          <div className="space-y-2 text-sm">
            <p>
              {stage === "boosting"
                ? `${prog.done} of ${prog.target} wallets bought. Keep this page open.`
                : "All buys are done. The tokens are moving to your wallet."}
            </p>
            <Progress value={prog.target ? (prog.done / prog.target) * 100 : 0} />
          </div>
        )}

        {stage === "done" && (
          <p className="text-sm">
            All tokens are in your wallet. The boost is complete.
          </p>
        )}
      </CardContent>
      {stage === "choose" && choice && choice !== "custom" && (
        <CardContent className="pt-0">
          <Button onClick={() => { trackEvent("boost_pay", { tier: tierId, mint }); payAndStart(); }} disabled={busy || !publicKey} className="w-full">
            {busy ? "Working…" : `Pay ${t.boostFeeSol} SOL and start`}
          </Button>
        </CardContent>
      )}
    </Card>
  );
}
