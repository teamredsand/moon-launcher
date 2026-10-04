import type { Metadata } from "next";
import { SwarmFlow } from "@/components/swarm-flow";

export const metadata: Metadata = {
  title: "Swarm buy",
  description:
    "Give a pump.fun coin address. Up to 1000 wallets buy it. All tokens go to your wallet. The service keeps 25% of the deposit.",
};

export default function BoostPage() {
  return <SwarmFlow />;
}
