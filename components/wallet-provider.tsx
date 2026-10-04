"use client";

import { useMemo } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import { clusterApiUrl } from "@solana/web3.js";
import type { Adapter } from "@solana/wallet-adapter-base";

export function AppWalletProvider({ children }: { children: React.ReactNode }) {
  const endpoint = useMemo(() => process.env.NEXT_PUBLIC_RPC_URL ?? clusterApiUrl("mainnet-beta"), []);
  const wallets = useMemo(() => [new PhantomWalletAdapter() as Adapter], []);
  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
