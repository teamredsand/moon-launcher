import type { Metadata } from "next";
import { Suspense } from "react";
import { SwarmFlow } from "@/components/swarm-flow";

export const metadata: Metadata = {
  title: "Swarm buy",
  description:
    "Give a pump.fun coin address. Set the buy size and the wallet count. The price is calculated for you. All tokens go to your wallet.",
};

export default function BoostPage() {
  return (
    <Suspense>
      <SwarmFlow />
    </Suspense>
  );
}
