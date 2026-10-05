"use client";

import { useCallback, useRef, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { Button } from "@/components/ui/button";
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
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { BoostStep } from "@/components/boost-step";
import { trackEvent } from "@/lib/gtag";
import { CUSTOM_FEE_SOL, TIERS } from "@/lib/pricing";

interface Identity {
  name: string;
  symbol: string;
  description: string;
}

type Phase = "form" | "ready" | "signing" | "confirming" | "done";

const FIRST_BUY_SOL = TIERS.ignition.firstBuySol;

export function CustomFlow() {
  const { connection } = useConnection();
  const { publicKey, signTransaction, connected } = useWallet();

  const [phase, setPhase] = useState<Phase>("form");
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [description, setDescription] = useState("");
  const [firstBuy, setFirstBuy] = useState<number>(FIRST_BUY_SOL);
  const [website, setWebsite] = useState("");
  const [twitter, setTwitter] = useState("");
  const [telegram, setTelegram] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [metadataUri, setMetadataUri] = useState<string | null>(null);
  const [coinUrl, setCoinUrl] = useState<string | null>(null);
  const [mint, setMint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const formOk =
    name.trim().length > 0 &&
    name.length <= 32 &&
    symbol.trim().length > 0 &&
    symbol.length <= 10 &&
    file !== null;

  const upload = useCallback(async () => {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("name", name.trim());
      fd.append("symbol", symbol.trim().toUpperCase());
      fd.append("description", description.trim());
      if (website.trim()) fd.append("website", website.trim());
      if (twitter.trim()) fd.append("twitter", twitter.trim());
      if (telegram.trim()) fd.append("telegram", telegram.trim());
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "upload failed");
      setImageUri(j.imageUri);
      setMetadataUri(j.metadataUri);
      setPhase("ready");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [file, name, symbol, description, website, twitter, telegram]);

  const signAndSend = useCallback(async () => {
    if (!publicKey || !signTransaction || !metadataUri || !imageUri) return;
    setError(null);
    setBusy(true);
    try {
      const needs = firstBuy + CUSTOM_FEE_SOL + 0.01;
      const bal = await connection.getBalance(publicKey);
      if (bal < needs * LAMPORTS_PER_SOL) {
        throw new Error(
          `Your wallet needs at least ${needs.toFixed(2)} SOL. It has ${(bal / LAMPORTS_PER_SOL).toFixed(3)} SOL.`
        );
      }
      const identity: Identity = {
        name: name.trim(),
        symbol: symbol.trim().toUpperCase(),
        description: description.trim(),
      };
      const prep = await fetch("/api/prepare", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode: "custom",
          identity,
          metadataUri,
          imageUri,
          tier: "ignition",
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
          mode: "custom",
          tier: "ignition",
          identity,
          imageUri,
          metadataUri,
        }),
      });
      const cj = await conf.json();
      if (!conf.ok) throw new Error(cj.error ?? "confirm failed");
      setCoinUrl(cj.url);
      setPhase("done");
    } catch (e) {
      setError((e as Error).message);
      setPhase("ready");
    } finally {
      setBusy(false);
    }
  }, [publicKey, signTransaction, metadataUri, imageUri, name, symbol, description, firstBuy, connection]);

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-12">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">
          Custom launch
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

      {(phase === "form" || phase === "ready") && (
        <Card>
          <CardHeader>
            <CardTitle>Step 1 — Describe your coin</CardTitle>
            <CardDescription>
              You write the name, the symbol, and the text. You upload the
              image. The service builds the launch transaction. Flat fee:{" "}
              {CUSTOM_FEE_SOL} SOL. First buy: {FIRST_BUY_SOL} SOL.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={name}
                  maxLength={32}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="moon cheese"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="symbol">Symbol</Label>
                <Input
                  id="symbol"
                  value={symbol}
                  maxLength={10}
                  onChange={(e) => setSymbol(e.target.value)}
                  placeholder="CHEEZ"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="desc">Text</Label>
              <Textarea
                id="desc"
                value={description}
                maxLength={280}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="A short text about the coin."
                rows={3}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="website">Website (optional)</Label>
                <Input
                  id="website"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  placeholder="https://…"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="twitter">X / Twitter (optional)</Label>
                <Input
                  id="twitter"
                  value={twitter}
                  onChange={(e) => setTwitter(e.target.value)}
                  placeholder="https://x.com/…"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="telegram">Telegram (optional)</Label>
                <Input
                  id="telegram"
                  value={telegram}
                  onChange={(e) => setTelegram(e.target.value)}
                  placeholder="https://t.me/…"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="image">Image (max 5 MB)</Label>
              <Input
                id="image"
                ref={fileRef}
                type="file"
                accept="image/*"
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null);
                  setPhase("form");
                  setImageUri(null);
                  setMetadataUri(null);
                }}
              />
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
            {imageUri && (
              <div className="flex gap-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imageUri}
                  alt={`Image of the coin ${name}`}
                  className="size-24 rounded-md object-cover"
                />
                <div className="space-y-1 text-sm">
                  <p className="font-medium">
                    {name} <Badge variant="secondary">{symbol}</Badge>
                  </p>
                  <p className="text-muted-foreground">{description}</p>
                </div>
              </div>
            )}
          </CardContent>
          <CardFooter className="gap-2">
            <Button onClick={() => { trackEvent("custom_upload"); upload(); }} disabled={busy || !formOk}>
              {busy && phase === "form" ? "Uploading…" : "Check and upload"}
            </Button>
          </CardFooter>
        </Card>
      )}

      {phase === "ready" && (
        <Card>
          <CardHeader>
            <CardTitle>Step 2 — Sign the launch</CardTitle>
            <CardDescription>
              Sign one transaction. It creates the coin and buys the first
              tokens. It also pays the service fee.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <p>
              Your wallet pays {firstBuy} SOL for the first buy and{" "}
              {CUSTOM_FEE_SOL} SOL for the service.
            </p>
          </CardContent>
          <CardFooter>
            <Button
              onClick={() => { trackEvent("custom_launch_click", { firstBuy }); signAndSend(); }}
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

      {phase === "done" && coinUrl && (
        <Card className="border-primary">
          <CardHeader>
            <CardTitle>Your coin is live</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
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
            <p>
              The first tokens are in your wallet. You own the coin.
            </p>
          </CardContent>
        </Card>
      )}

      {phase === "done" && mint && <BoostStep mint={mint} />}
    </div>
  );
}
