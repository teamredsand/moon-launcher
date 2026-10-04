import Link from "next/link";
import { MoonLogo } from "@/components/moon-logo";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { CUSTOM_FEE_SOL, TIERS } from "@/lib/pricing";
import { listLaunches } from "@/lib/launches";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://moonlauncher.app";

const services = [
  {
    slug: "/launch/custom",
    name: "Custom launch",
    price: "0.15 SOL",
    priceNote: "flat fee",
    points: [
      "You write the name, the symbol, and the text.",
      "You upload the image.",
      "One signature. The coin is live.",
    ],
  },
  {
    slug: "/launch/boost",
    name: "Swarm buy",
    price: "25% of deposit",
    priceNote: "margin on the amount",
    points: [
      "Pick any coin on pump.fun.",
      "Up to 1000 wallets buy it.",
      "All tokens go to your wallet.",
    ],
  },
  {
    slug: "/launch/ai",
    name: "AI launch",
    price: "from 0.25 SOL",
    priceNote: "AI makes everything",
    badge: "Most used",
    points: [
      "AI makes the name, the symbol, the text, and the image.",
      "One launch transaction.",
      "Optional boost with 100 or 250 wallets.",
    ],
  },
];

const steps = [
  {
    title: "Pick a service",
    body: "Use AI for everything. Or write your own name, text, and image. Or boost a coin that already exists.",
  },
  {
    title: "Sign one transaction",
    body: "Connect your wallet. Sign one transaction. This transaction creates the coin. It also buys the first tokens for your wallet.",
  },
  {
    title: "Add more buyers (optional)",
    body: "Pay for a boost. Up to 1000 wallets buy your coin. Then all tokens move to your wallet. You control the supply.",
  },
];

const faqs = [
  {
    q: "Do you keep my money?",
    a: "No. You pay with your wallet. The service holds no funds.",
  },
  {
    q: "Who owns the coin?",
    a: "Your wallet owns the coin. Your wallet holds the tokens. The service has no key to your wallet.",
  },
  {
    q: "What is a boost?",
    a: "A boost is a set of small buys. Each wallet buys 0.0005 SOL of your coin. Then all tokens move to your wallet.",
  },
  {
    q: "Can I get my SOL back?",
    a: "No. All payments are final. The buys give you tokens, not SOL.",
  },
  {
    q: "Does this service give financial advice?",
    a: "No. This service is a tool. Crypto has risk. Prices go up and down. Do your own research.",
  },
  {
    q: "Which wallets work?",
    a: "Phantom and Solflare work. Use a wallet that you control.",
  },
];

export default async function Home() {
  const launches = (await listLaunches()).slice(0, 8);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "MoonLauncher",
    url: siteUrl,
    applicationCategory: "FinanceApplication",
    operatingSystem: "Web",
    description:
      "MoonLauncher makes coins on pump.fun. The service makes the name, the symbol, the text, and the image.",
    offers: [
      { "@type": "Offer", name: "custom launch", price: String(CUSTOM_FEE_SOL), priceCurrency: "SOL" },
      ...Object.values(TIERS).map((t) => ({
        "@type": "Offer",
        name: t.id,
        price: String(t.feeSol),
        priceCurrency: "SOL",
      })),
    ],
  };

  return (
    <div className="mx-auto max-w-5xl px-4">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* Hero */}
      <section className="flex flex-col items-center gap-6 py-20 text-center sm:py-28">
        <MoonLogo className="size-12 text-primary" />
        <h1 className="max-w-2xl text-4xl font-bold tracking-tight text-balance sm:text-5xl">
          Launch, boost &amp; swarm tokens on pump.fun
        </h1>
        <p className="max-w-xl text-muted-foreground text-balance">
          AI makes the identity, or you write it. Up to 1000 wallets buy. Your
          wallet keeps the tokens.
        </p>
        <p className="text-sm text-muted-foreground">
          Pick a service below. No key sharing. Your wallet keeps the tokens.
        </p>
      </section>

      <Separator />

      {/* Services */}
      <section id="services" className="scroll-mt-20 py-16">
        <h2 className="mb-8 text-2xl font-semibold tracking-tight">Services</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {services.map((s) => (
            <Card
              key={s.slug}
              className="flex h-full flex-col"
            >
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>{s.name}</CardTitle>
                  {s.badge && <Badge>{s.badge}</Badge>}
                </div>
                <p className="text-3xl font-bold">{s.price}</p>
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
        <p className="mt-4 text-sm text-muted-foreground">
          These are start prices. They can change.
        </p>
      </section>

      {/* How it works */}
      <section id="how" className="scroll-mt-20 py-16">
        <h2 className="mb-8 text-2xl font-semibold tracking-tight">
          How it works
        </h2>
        <ol className="grid gap-4 sm:grid-cols-3">
          {steps.map((s, i) => (
            <li key={s.title} className="h-full">
              <Card className="flex h-full flex-col">
                <CardHeader>
                  <span className="text-primary font-mono text-sm">
                    0{i + 1}
                  </span>
                  <CardTitle>{s.title}</CardTitle>
                </CardHeader>
                <CardContent className="flex-1">
                  <p className="text-sm text-muted-foreground">{s.body}</p>
                </CardContent>
              </Card>
            </li>
          ))}
        </ol>
      </section>

      {/* Launches */}
      <section id="launches" className="scroll-mt-20 py-16">
        <h2 className="mb-8 text-2xl font-semibold tracking-tight">
          Recent launches
        </h2>
        {launches.length === 0 ? (
          <p className="text-muted-foreground">
            No launches yet. Be the first.
          </p>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-4">
            {launches.map((l) => (
              <li key={l.mint} className="h-full">
                <Card className="flex h-full flex-col">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={l.imageUri}
                    alt={`Image of the coin ${l.name}`}
                    className="aspect-square w-full rounded-md object-cover"
                    loading="lazy"
                  />
                  <CardHeader className="flex-1 p-3">
                    <CardTitle className="truncate text-sm">
                      {l.symbol}
                    </CardTitle>
                    <CardDescription className="truncate">
                      {l.name}
                    </CardDescription>
                  </CardHeader>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* FAQ */}
      <section id="faq" className="scroll-mt-20 py-16">
        <h2 className="mb-8 text-2xl font-semibold tracking-tight">
          Questions
        </h2>
        <div className="space-y-4">
          {faqs.map((f) => (
            <Card key={f.q}>
              <CardHeader>
                <CardTitle className="text-base">{f.q}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{f.a}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
