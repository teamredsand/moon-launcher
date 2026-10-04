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
import { TIERS } from "@/lib/pricing";
import { listLaunches } from "@/lib/launches";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://moonlauncher.app";

const steps = [
  {
    title: "Write a theme",
    body: "Type a theme. For example: 'a bee swarm that rules the internet'. The service makes the name, the symbol, the text, and the image.",
  },
  {
    title: "Sign one transaction",
    body: "Connect your wallet. Sign one transaction. This transaction creates the coin. It also buys the first tokens for your wallet.",
  },
  {
    title: "Add a boost (optional)",
    body: "Pay for a boost. Up to 100 wallets buy your coin. Then all tokens move to your wallet. You control the supply.",
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
    offers: Object.values(TIERS).map((t) => ({
      "@type": "Offer",
      name: t.id,
      price: String(t.feeSol),
      priceCurrency: "SOL",
    })),
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
          Launch a coin on pump.fun
        </h1>
        <p className="max-w-xl text-muted-foreground text-balance">
          Type a theme. The service makes the name, the symbol, the text, and
          the image. Your wallet signs one transaction. The coin is live.
        </p>
        <div className="flex gap-3">
          <Link
            href="/launch"
            className={buttonVariants({ size: "lg" })}
          >
            Launch a coin
          </Link>
          <Link
            href="/#how"
            className={buttonVariants({ size: "lg", variant: "outline" })}
          >
            See how it works
          </Link>
        </div>
        <p className="text-sm text-muted-foreground">
          Starts at 0.25 SOL. No key sharing. Your wallet keeps the tokens.
        </p>
      </section>

      <Separator />

      {/* How it works */}
      <section id="how" className="scroll-mt-20 py-16">
        <h2 className="mb-8 text-2xl font-semibold tracking-tight">
          How it works
        </h2>
        <ol className="grid gap-4 sm:grid-cols-3">
          {steps.map((s, i) => (
            <li key={s.title}>
              <Card>
                <CardHeader>
                  <span className="text-primary font-mono text-sm">
                    0{i + 1}
                  </span>
                  <CardTitle>{s.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{s.body}</p>
                </CardContent>
              </Card>
            </li>
          ))}
        </ol>
      </section>

      {/* Pricing */}
      <section id="pricing" className="scroll-mt-20 py-16">
        <h2 className="mb-8 text-2xl font-semibold tracking-tight">Pricing</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {Object.values(TIERS).map((t) => (
            <Card
              key={t.id}
              className={t.id === "boost" ? "border-primary" : undefined}
            >
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="capitalize">{t.id}</CardTitle>
                  {t.id === "boost" && <Badge>Most used</Badge>}
                </div>
                <p className="text-3xl font-bold">
                  {t.feeSol} <span className="text-base font-normal">SOL</span>
                </p>
              </CardHeader>
              <CardContent>
                <CardDescription className="space-y-1">
                  <p>AI makes the coin identity.</p>
                  <p>One launch transaction.</p>
                  <p>First buy of {t.firstBuySol} SOL.</p>
                  {t.wallets > 0 && (
                    <p>
                      {t.wallets} wallets buy your coin in small steps.
                    </p>
                  )}
                  {t.wallets > 0 && <p>All tokens move to your wallet.</p>}
                  {t.featured && <p>Your coin shows first in the feed below.</p>}
                </CardDescription>
              </CardContent>
              <CardFooter>
                {t.id === "boost" ? (
                  <Link
                    href={`/launch?tier=${t.id}`}
                    className={buttonVariants({ className: "w-full" })}
                  >
                    Choose {t.id}
                  </Link>
                ) : (
                  <Link
                    href={`/launch?tier=${t.id}`}
                    className={buttonVariants({ variant: "outline", className: "w-full" })}
                  >
                    Choose {t.id}
                  </Link>
                )}
              </CardFooter>
            </Card>
          ))}
        </div>
        <p className="mt-4 text-sm text-muted-foreground">
          These are start prices. They can change.
        </p>
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
              <li key={l.mint}>
                <Card>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={l.imageUri}
                    alt={`Image of the coin ${l.name}`}
                    className="aspect-square w-full rounded-md object-cover"
                    loading="lazy"
                  />
                  <CardHeader className="p-3">
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
