import type { Metadata } from "next";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CUSTOM_FEE_SOL, SWARM_MAX_BUYS, TIERS } from "@/lib/pricing";

export const metadata: Metadata = {
  title: "Services",
  description:
    "Three ways to launch or boost a coin on pump.fun: custom launch, swarm buy, or full AI launch.",
};

const services = [
  {
    slug: "/launch/custom",
    name: "Custom launch",
    price: `${CUSTOM_FEE_SOL} SOL`,
    priceNote: "flat fee",
    points: [
      "You write the name, the symbol, and the text.",
      "You upload the image.",
      "We build the launch transaction.",
      "One signature. The coin is live.",
    ],
  },
  {
    slug: "/launch/boost",
    name: "Swarm buy",
    price: "Pick your price & volume",
    priceNote: `up to ${SWARM_MAX_BUYS} buys`,
    points: [
      `Pick any coin on pump.fun.`,
      `Up to ${SWARM_MAX_BUYS} wallets buy it.`,
      "A slider sets the amount and the buy count.",
      "All tokens go to your wallet.",
    ],
  },
  {
    slug: "/launch/ai",
    name: "AI launch",
    price: `from ${TIERS.ignition.feeSol} SOL`,
    priceNote: "AI makes everything",
    badge: "Most used",
    points: [
      "AI makes the name, the symbol, the text, and the image.",
      "One launch transaction.",
      "Optional boost with 100 or 250 wallets.",
      "All tokens go to your wallet.",
    ],
  },
];

export default function LaunchHubPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <h1 className="mb-2 text-2xl font-semibold tracking-tight">Services</h1>
      <p className="mb-8 text-muted-foreground">
        Pick a service. Connect your wallet. Pay with SOL.
      </p>
      <div className="grid gap-4 sm:grid-cols-3">
        {services.map((s) => (
          <Card key={s.slug} className="flex h-full flex-col">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>{s.name}</CardTitle>
                {s.badge && <Badge>{s.badge}</Badge>}
              </div>
              <p className="text-xl font-bold">{s.price}</p>
              <p className="text-sm text-muted-foreground">{s.priceNote}</p>
            </CardHeader>
            <CardContent className="flex-1">
              <CardDescription className="space-y-1">
                {s.points.map((p) => (
                  <p key={p}>{p}</p>
                ))}
              </CardDescription>
            </CardContent>
            <CardFooter>
              <Link
                href={s.slug}
                className={buttonVariants({ variant: "outline", className: "w-full" })}
              >
                Open {s.name}
              </Link>
            </CardFooter>
          </Card>
        ))}
      </div>
    </div>
  );
}
