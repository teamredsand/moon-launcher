"use client";

import "@solana/wallet-adapter-react-ui/styles.css";

import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { Button } from "@/components/ui/button";
import { trackEvent } from "@/lib/gtag";

/** The site's single call to action. Same shadcn Button as everything else:
 * disconnected → primary "Connect wallet" opens the wallet modal;
 * connected → outline button with the short address, click to disconnect. */
export function ConnectWallet() {
  const { publicKey, connected, connecting, disconnect } = useWallet();
  const { setVisible } = useWalletModal();

  if (connected && publicKey) {
    const s = publicKey.toBase58();
    return (
      <Button
        variant="outline"
        className="font-mono"
        onClick={() => { trackEvent("wallet_disconnect"); disconnect(); }}
        title="Disconnect"
      >
        {s.slice(0, 4)}…{s.slice(-4)}
      </Button>
    );
  }
  return (
    <Button onClick={() => { trackEvent("wallet_connect_click"); setVisible(true); }} disabled={connecting}>
      {connecting ? "Connecting…" : "Connect wallet"}
    </Button>
  );
}
