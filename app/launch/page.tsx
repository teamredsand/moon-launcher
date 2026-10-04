import type { Metadata } from "next";
import { AppWalletProvider } from "@/components/wallet-provider";
import { LaunchFlow } from "@/components/launch-flow";
import { tier } from "@/lib/pricing";

export const metadata: Metadata = {
  title: "Launch a coin",
  description:
    "Write a theme. Sign one transaction. Your coin is live on pump.fun. Optional boost with 100 wallets.",
};

export default function LaunchPage({
  searchParams,
}: {
  searchParams: { tier?: string };
}) {
  const t = tier(searchParams.tier ?? "boost");
  return (
    <AppWalletProvider>
      <LaunchFlow initialTier={t.id} />
    </AppWalletProvider>
  );
}
