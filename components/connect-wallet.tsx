"use client";

import "@solana/wallet-adapter-react-ui/styles.css";

import dynamic from "next/dynamic";

const WalletMultiButton = dynamic(
  () =>
    import("@solana/wallet-adapter-react-ui").then((m) => m.WalletMultiButton),
  { ssr: false }
);

/** The site's single call to action: connect a wallet. Same look as the
 * other buttons (the wallet-adapter CSS is overridden in globals.css). */
export function ConnectWallet() {
  return <WalletMultiButton />;
}
