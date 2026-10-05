import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { SpaceBg } from "@/components/space-bg";
import { AppWalletProvider } from "@/components/wallet-provider";
import { Gtag } from "@/components/gtag";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://moonlauncher.app";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "MoonLauncher — Launch a coin on pump.fun",
    template: "%s — MoonLauncher",
  },
  description:
    "MoonLauncher makes your coin on pump.fun. Type a theme. The service makes the name, the symbol, the text, and the image. Your wallet signs the launch.",
  keywords: [
    "pump.fun launch service",
    "launch a solana coin",
    "make a meme coin",
    "coin launcher",
    "solana token launch",
    "pump fun bot",
  ],
  applicationName: "MoonLauncher",
  openGraph: {
    type: "website",
    url: siteUrl,
    siteName: "MoonLauncher",
    title: "MoonLauncher — Launch a coin on pump.fun",
    description:
      "Type a theme. Get a name, a symbol, a text, and an image. Sign one transaction. Your coin is live.",
  },
  twitter: {
    card: "summary",
    title: "MoonLauncher — Launch a coin on pump.fun",
    description:
      "Type a theme. Get a name, a symbol, a text, and an image. Sign one transaction. Your coin is live.",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#0b0b0c",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Google+Sans+Code:ital,wght@0,300..800;1,300..800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased min-h-screen flex flex-col`}
      >
        <SpaceBg />
        <Gtag />
        <AppWalletProvider>
          <div className="relative z-10 flex min-h-screen flex-1 flex-col">
            <SiteHeader />
            <main className="flex-1">{children}</main>
            <SiteFooter />
          </div>
        </AppWalletProvider>
      </body>
    </html>
  );
}
