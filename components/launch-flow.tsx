"use client";

import { useCallback, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { Button } from "@/components/ui/button";
import { BoostStep } from "@/components/boost-step";
import { trackEvent } from "@/lib/gtag";
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

type Phase = "theme" | "identity" | "signing" | "confirming" | "launched";

export function LaunchFlow({ initialTier }: { initialTier: TierId }) {
  const { connection } = useConnection();
  const { publicKey, signTransaction, connected } = useWallet();

  const [phase, setPhase] = useState<Phase>("theme");
  const [theme, setTheme] = useState("");
  const [tierId, setTierId] = useState<TierId>(initialTier);
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [firstBuy, setFirstBuy] = useState<number>(TIERS[initialTier].firstBuySol);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [metadataUri, setMetadataUri] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [coinUrl, setCoinUrl] = useState<string | null>(null);
  const [mint, setMint] = useState<string | null>(null);
  const t = TIERS[tierId];

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
      setPreviewUri(json.previewUri ?? null);
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
      const needs = firstBuy + t.feeSol + 0.01;
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
          firstBuySol: firstBuy,
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
      setPhase("launched");
    } catch (e) {
      setError((e as Error).message);
      setPhase("identity");
    } finally {
      setBusy(false);
    }
  }, [publicKey, signTransaction, identity, metadataUri, imageUri, tierId, t, firstBuy, connection]);


  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-12">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">
          AI launch
        </h1>
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

      {/* Step 1: theme + tier — hidden once the identity exists */}
      {phase === "theme" && (
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
                    onClick={() => {
                      setTierId(x.id);
                      setFirstBuy(TIERS[x.id].firstBuySol);
                    }}
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
                    <span className="block text-xs text-muted-foreground">
                      {x.wallets > 0
                        ? `${x.wallets} wallets buy from launch`
                        : "no swarm buys"}
                    </span>
                  </button>
                ))}
              </div>
              <p className="text-sm text-muted-foreground">
                {t.wallets > 0
                  ? `${t.wallets} wallets buy your coin from launch. All tokens go to your wallet.`
                  : "No boost. The coin starts with your first buy."}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="firstBuy">First buy (SOL)</Label>
              <Input
                id="firstBuy"
                type="number"
                min={0}
                max={10}
                step={0.01}
                value={firstBuy}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (!Number.isNaN(v) && v >= 0 && v <= 10) setFirstBuy(v);
                }}
              />
              <p className="text-sm text-muted-foreground">
                Your wallet buys this amount in the launch transaction. Like
                the first buy on pump.fun.
              </p>
            </div>
          </CardContent>
          <CardFooter>
            <Button onClick={() => { trackEvent("make_identity", { tier: tierId }); makeIdentity(); }} disabled={busy || theme.length < 3}>
              {busy ? "Working…" : "Make the identity"}
            </Button>
          </CardFooter>
        </Card>
      )}

      {/* working-through-state indicator while the AI runs */}
      {busy && phase === "theme" && (
        <Card>
          <CardContent className="flex items-center gap-3 pt-6 text-sm">
            <span className="inline-block size-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            Making the identity. The AI writes the coin and draws the image.
            This takes 10–40 seconds. Wait.
          </CardContent>
        </Card>
      )}

      {/* Step 2: preview + the only CTA — Launch */}
      {phase === "identity" && identity && (
        <Card>
          <CardHeader>
            <CardTitle>Step 2 — Launch</CardTitle>
            <CardDescription>
              This is your coin. Sign one transaction. It creates the coin and
              buys the first tokens. It also pays the service fee.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewUri ?? imageUri ?? ""}
                onError={(e) => {
                  const el = e.currentTarget;
                  if (imageUri && el.src !== imageUri) el.src = imageUri;
                }}
                alt={`Image of the coin ${identity.name}`}
                className="size-24 rounded-md object-cover"
              />
              <div className="space-y-1 text-sm">
                <p className="font-medium">
                  {identity.name}{" "}
                  <Badge variant="secondary">{identity.symbol}</Badge>
                </p>
                <p className="text-muted-foreground">{identity.description}</p>
                <p className="text-muted-foreground">
                  {t.wallets > 0
                    ? `${t.wallets} wallets buy from launch. All tokens go to your wallet.`
                    : "No swarm buys."}
                </p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              Your wallet pays {firstBuy} SOL for the first buy
              {t.wallets > 0
                ? ` and ${t.feeSol} SOL for the swarm to buy on launch`
                : ` and ${t.feeSol} SOL for the service`}
              .
            </p>
            {!connected && (
              <p className="text-sm">Connect your wallet to continue.</p>
            )}
          </CardContent>
          <CardFooter>
            <Button
              onClick={() => { trackEvent("launch_click", { tier: tierId, firstBuy }); signAndSend(); }}
              disabled={busy || !connected || !publicKey}
            >
              {busy ? "Working…" : "Launch"}
            </Button>
          </CardFooter>
        </Card>
      )}

      {(phase === "signing" || phase === "confirming") && (
        <Card>
          <CardContent className="flex items-center gap-3 pt-6">
            <span className="inline-block size-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            {phase === "signing"
              ? "Sign the transaction in your wallet…"
              : "The transaction is on the chain. Wait…"}
          </CardContent>
        </Card>
      )}

      {phase === "launched" && coinUrl && mint && (
        <>
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
              <p>The first tokens are in your wallet. You own the coin.</p>
            </CardContent>
          </Card>
          <BoostStep
            mint={mint}
            defaultChoice={t.wallets > 0 ? (t.id as "boost" | "moonshot") : null}
          />
        </>
      )}
    </div>
  );
}
