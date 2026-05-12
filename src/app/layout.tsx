import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import Image from "next/image";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://bankr-miner.app",
  ),
  title: "BankrMine · CPU-mined, Bankr-native token",
  description:
    "Mine $MINE from your browser. CPU-only proof of work. Rewards distributed through the Bankr Wallet API on Base. No GPU, no ASIC, no downloads.",
  openGraph: {
    title: "BankrMine · CPU-mined, Bankr-native token",
    description:
      "Mine $MINE from your browser. CPU-only proof of work. Rewards distributed through the Bankr Wallet API on Base.",
    images: [
      {
        url: "/og-image.jpg",
        width: 1200,
        height: 630,
        alt: "BankrMine — CPU-mineable token on Bankr/Base",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "BankrMine",
    description:
      "Browser-mined token on Bankr.bot. No GPU. No ASIC. Tweet, mine, mint.",
    images: ["/og-image.jpg"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <header className="border-b border-[color:var(--border)] bg-[color:var(--background)]/80 backdrop-blur sticky top-0 z-10">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
            <Link
              href="/"
              className="no-underline flex items-center gap-2 text-sm font-mono"
            >
              <Image
                src="/logo.png"
                alt="BankrMine"
                width={32}
                height={32}
                priority
                className="rounded-md"
                style={{ imageRendering: "pixelated" }}
              />
              <span className="font-semibold tracking-tight">bankr-miner</span>
            </Link>
            <nav className="flex items-center gap-1 sm:gap-3 text-sm">
              <Link
                href="/mine"
                className="no-underline px-2 py-1 rounded hover:bg-[color:var(--surface-muted)] text-[color:var(--foreground)]"
              >
                mine
              </Link>
              <Link
                href="/feed"
                className="no-underline px-2 py-1 rounded hover:bg-[color:var(--surface-muted)] text-[color:var(--foreground)]"
              >
                feed
              </Link>
              <a
                href="https://docs.bankr.bot"
                target="_blank"
                rel="noreferrer"
                className="hidden sm:inline no-underline px-2 py-1 rounded text-[color:var(--muted)] hover:text-[color:var(--foreground)]"
              >
                bankr docs ↗
              </a>
              <Link
                href="/mine"
                className="btn btn-accent ml-1 sm:ml-2"
              >
                Launch miner
              </Link>
            </nav>
          </div>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="border-t border-[color:var(--border)] mt-12">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 text-[color:var(--muted)] font-mono text-xs flex flex-wrap items-center justify-between gap-2">
            <span>
              built on{" "}
              <a href="https://bankr.bot" target="_blank" rel="noreferrer">
                bankr.bot
              </a>{" "}
              · mining math inspired by{" "}
              <a href="https://hash256.org" target="_blank" rel="noreferrer">
                hash256.org
              </a>
            </span>
            <span>pre-launch preview — not financial advice</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
