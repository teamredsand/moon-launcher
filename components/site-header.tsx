import Link from "next/link";
import { MoonWordMark } from "@/components/moon-logo";
import { buttonVariants } from "@/components/ui/button";

const links = [
  { href: "/#how", label: "How it works" },
  { href: "/#pricing", label: "Pricing" },
  { href: "/#launches", label: "Launches" },
  { href: "/#faq", label: "FAQ" },
];

export function SiteHeader() {
  return (
    <header className="border-b border-border">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
        <Link href="/" className="text-foreground">
          <MoonWordMark />
        </Link>
        <nav aria-label="Main" className="hidden items-center gap-6 text-sm sm:flex">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="text-muted-foreground hover:text-foreground"
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <Link href="/launch" className={buttonVariants({})}>
          Launch a coin
        </Link>
      </div>
    </header>
  );
}
