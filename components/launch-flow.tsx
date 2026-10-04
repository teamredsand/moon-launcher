"use client";

import "@solana/wallet-adapter-react-ui/styles.css";

import { useCallback, useEffect, useRef, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
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
import { Badge } from "@/components/ui/badge";
import { TIERS, type TierId } from "@/lib/pricing";

interface Identity {
  name: string;
  symbol: string;
  description: string;
}

type Phase =
  | "theme"
  | "identity"
  | "signing"
  | "confirming"
  | "launched"
  | "boostPay"
  | "boosting"
  | "done";

export function LaunchFlow({ initialTier }: { initialTier: TierId }) {
  const { connection } = useConnection();
  const { publicKey, signTransaction, connected } = useWallet();

  const [phase, setPhase] = useState<Phase>("theme");
  const [theme, setTheme] = useState("");
  const [tierId, setTierId] = useState<TierId>(initialTier);
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [metadataUri, setMetadataUri] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [coinUrl, setCoinUrl] = useState<string | null>(null);
  const [mint, setMint] = useState<string | null>(null);
  const [boost, setBoost] = useState({ done: 0, target: 0 });
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const t = TIERS[tierId];

  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);

  const makeIdentity = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/identity", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ theme }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "identity failed");
      setIdentity(json.identity);
      setImageUri(json.imageUri);
      setMetadataUri(json.metadataUri);
      setPhase("identity");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [theme]);

  const signAndSend = useCallback(async () => {
    if (!publicKey || !signTransaction || !identity || !metadataUri) return;
    setError(null);
    setBusy(true);
    try {
      // check wallet balance
      const needs = t.firstBuySol + t.feeSol + 0.01;
      const bal = await connection.getBalance(publicKey);
      if (bal < needs * LAMPORTS_PER_SOL) {
        throw new Error(
          `Your wallet needs at least ${needs.toFixed(2)} SOL. It has ${(bal / LAMPORTS_PER_SOL).toFixed(3)} SOL.`
        );
      }

      const prep = await fetch("/api/prepare", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          identity,
          metadataUri,
          imageUri,
          tier: tierId,
          customer: publicKey.toBase58(),
        }),
      });
      const pj = await prep.json();
      if (!prep.ok) throw new Error(pj.error ?? "prepare failed");
      setMint(pj.mint);

      setPhase("signing");
      const { VersionedTransaction } = await import("@solana/web3.js");
      const tx = VersionedTransaction.deserialize(
        Buffer.from(pj.txB64, "base64")
      );
      const signed = await signTransaction(tx);
      const sig = await connection.sendRawTransaction(signed.serialize(), {
        maxRetries: 3,
      });

      setPhase("confirming");
      const latest = await connection.getLatestBlockhash();
      await connection.confirmTransaction({ signature: sig, ...latest }, "confirmed");

      const conf = await fetch("/api/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sig,
          mint: pj.mint,
          tier: tierId,
          identity,
          imageUri,
          metadataUri,
        }),
      });
      const cj = await conf.json();
      if (!conf.ok) throw new Error(cj.error ?? "confirm failed");
      setCoinUrl(cj.url);
      setPhase(t.wallets > 0 ? "boostPay" : "done");
    } catch (e) {
      setError((e as Error).message);
      setPhase("identity");
    } finally {
      setBusy(false);
    }
  }, [publicKey, signTransaction, identity, metadataUri, imageUri, tierId, t, connection]);

  const payAndBoost = useCallback(async () => {
    if (!publicKey || !signTransaction || !mint) return;
    setError(null);
    setBusy(true);
    try {
      const treasury = process.env.NEXT_PUBLIC_TREASURY;
      if (!treasury) throw new Error("service not configured");
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

      setPhase("boosting");
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
        setBoost({ done: j.done, target: j.target });
        if (j.finalized) {
          if (timer.current) clearInterval(timer.current);
          setPhase("done");
        }
      };
      await callBurst();
      if (phase !== "done") {
        timer.current = setInterval(async () => {
          try { await callBurst(); } catch { /* keep polling */ }
        }, 20_000);
      }
    } catch (e) {
      setError((e as Error).message);
      setPhase("boostPay");
    } finally {
      setBusy(false);
    }
  }, [publicKey, signTransaction, mint, t, connection, tierId, phase]);

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-12">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">
          Launch a coin
        </h1>
        <WalletMultiButton />
      </div>

      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-6 text-sm text-destructive">
            {error}
          </CardContent>
        </Card>
      )}

      {/* Step 1: theme + tier */}
      {(phase === "theme" || phase === "identity") && (
        <Card>
          <CardHeader>
            <CardTitle>Step 1 — Write a theme</CardTitle>
            <CardDescription>
              Write a short theme. The service makes the name, the symbol, the
              text, and the image.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="theme">Theme</Label>
              <Input
                id="theme"
                value={theme}
                onChange={(e) => setTheme(e.target.value)}
                placeholder="a bee swarm that rules the internet"
              />
            </div>
            <div className="space-y-2">
              <Label>Tier</Label>
              <div className="grid grid-cols-3 gap-2">
                {Object.values(TIERS).map((x) => (
                  <button
                    key={x.id}
                    type="button"
                    onClick={() => setTierId(x.id)}
                    className={
                      "rounded-md border p-3 text-left text-sm " +
                      (tierId === x.id
                        ? "border-primary bg-secondary"
                        : "border-border")
                    }
                  >
                    <span className="block font-medium capitalize">{x.id}</span>
                    <span className="block text-muted-foreground">
                      {x.feeSol} SOL
                    </span>
                  </button>
                ))}
              </div>
              <p className="text-sm text-muted-foreground">
                {t.wallets > 0
                  ? `${t.wallets} wallets buy your coin. All tokens go to your wallet.`
                  : "No boost. The coin starts with your first buy."}
              </p>
            </div>
            {identity && imageUri && (
              <div className="flex gap-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imageUri}
                  alt={`Image of the coin ${identity.name}`}
                  className="size-24 rounded-md object-cover"
                />
                <div className="space-y-1 text-sm">
                  <p className="font-medium">
                    {identity.name}{" "}
                    <Badge variant="secondary">{identity.symbol}</Badge>
                  </p>
                  <p className="text-muted-foreground">{identity.description}</p>
                </div>
              </div>
            )}
          </CardContent>
          <CardFooter className="gap-2">
            <Button onClick={makeIdentity} disabled={busy || theme.length < 3}>
              {identity ? "Make a new identity" : "Make the identity"}
            </Button>
            {identity && phase === "identity" && (
              <Button variant="outline" onClick={() => setPhase("identity")} disabled>
                Keep this identity
              </Button>
            )}
          </CardFooter>
        </Card>
      )}

      {/* Step 2: sign */}
      {phase === "identity" && identity && (
        <Card>
          <CardHeader>
            <CardTitle>Step 2 — Sign the launch</CardTitle>
            <CardDescription>
              Connect your wallet. Sign one transaction. It creates the coin
              and buys the first tokens. It also pays the service fee.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>
              Your wallet pays {t.firstBuySol} SOL for the first buy and{" "}
              {t.feeSol} SOL total for the service.
            </p>
            {!connected && <p>Connect your wallet to continue.</p>}
          </CardContent>
          <CardFooter>
            <Button
              onClick={signAndSend}
              disabled={busy || !connected || !publicKey}
            >
              {busy ? "Working…" : "Sign and launch"}
            </Button>
          </CardFooter>
        </Card>
      )}

      {(phase === "signing" || phase === "confirming") && (
        <Card>
          <CardContent className="pt-6">
            {phase === "signing"
              ? "Sign the transaction in your wallet…"
              : "The transaction is on the chain. Wait…"}
          </CardContent>
        </Card>
      )}

      {coinUrl && (phase === "boostPay" || phase === "boosting" || phase === "done") && (
        <Card className="border-primary">
          <CardHeader>
            <CardTitle>Your coin is live</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              <a
                href={coinUrl}
                target="_blank"
                rel="noreferrer"
                className="text-primary underline"
              >
                See your coin on pump.fun
              </a>
            </p>
            {phase === "boostPay" && (
              <>
                <p>
                  Step 3 — Boost. Pay {t.boostFeeSol} SOL. Then {t.wallets}{" "}
                  wallets buy your coin in small steps. This takes about 30
                  minutes.
                </p>
                <Button onClick={payAndBoost} disabled={busy}>
                  {busy ? "Working…" : `Pay ${t.boostFeeSol} SOL and start`}
                </Button>
              </>
            )}
            {phase === "boosting" && (
              <div className="space-y-2">
                <p>
                  Boost in progress: {boost.done} of {boost.target} wallets
                  bought. Keep this page open.
                </p>
                <Progress
                  value={boost.target ? (boost.done / boost.target) * 100 : 0}
                />
              </div>
            )}
            {phase === "done" && (
              <p>
                All tokens are in your wallet. The boost is complete. You
                control the supply.
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
