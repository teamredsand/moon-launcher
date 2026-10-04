import type { Metadata } from "next";
import { LaunchFlow } from "@/components/launch-flow";
import { tier } from "@/lib/pricing";

export const metadata: Metadata = {
  title: "AI launch",
  description:
    "Write a theme. AI makes the name, the symbol, the text, and the image. Sign one transaction. Your coin is live on pump.fun.",
};

export default function AiLaunchPage({
  searchParams,
}: {
  searchParams: { tier?: string };
}) {
  const t = tier(searchParams.tier ?? "boost");
  return <LaunchFlow initialTier={t.id} />;
}
