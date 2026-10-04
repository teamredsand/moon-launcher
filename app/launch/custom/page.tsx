import type { Metadata } from "next";
import { CustomFlow } from "@/components/custom-flow";

export const metadata: Metadata = {
  title: "Custom launch",
  description:
    "You write the name, the symbol, and the text. You upload the image. Sign one transaction. Your coin is live on pump.fun. Flat fee 0.15 SOL.",
};

export default function CustomLaunchPage() {
  return <CustomFlow />;
}
