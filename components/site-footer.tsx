import Link from "next/link";
import { MoonLogo } from "@/components/moon-logo";

export function SiteFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p className="inline-flex items-center gap-2">
          <MoonLogo className="size-4 text-primary" />
          MoonLauncher. Launch coins on pump.fun.
        </p>
        <nav aria-label="Footer" className="flex gap-4">
          <Link href="/#pricing" className="hover:text-foreground">
            Pricing
          </Link>
          <Link href="/#faq" className="hover:text-foreground">
            FAQ
          </Link>
          <Link href="/launch" className="hover:text-foreground">
            Launch
          </Link>
        </nav>
      </div>
    </footer>
  );
}
