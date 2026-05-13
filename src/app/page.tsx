import Link from "next/link";
import Image from "next/image";
import { StatsPanel } from "@/components/StatsPanel";
import { Leaderboard } from "@/components/Leaderboard";
import { LaunchStatus } from "@/components/LaunchStatus";
import {
  TOKEN_NAME,
  TOKEN_SYMBOL,
  TOTAL_SUPPLY,
  MINING_SUPPLY,
  HALVING_CADENCE_MINTS,
  ERA_1_REWARD,
} from "@/lib/constants";

const FMT = new Intl.NumberFormat("en-US");

export default function Home() {
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12 sm:py-20">
      <section className="grid grid-cols-1 lg:grid-cols-5 gap-10 items-center">
        <div className="lg:col-span-3 space-y-6">
          <div className="label-kbd flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-[color:var(--accent)] animate-pulse" />
            pre-launch preview · CPU-mined · Bankr-native · Base
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold leading-[1.05] tracking-tight">
            Mine{" "}
            <span className="text-[color:var(--accent)]">${TOKEN_SYMBOL}</span>{" "}
            from your browser.
            <br />
            <span className="text-[color:var(--muted)]">No GPU. No ASIC.</span>
          </h1>
          <p className="text-lg text-[color:var(--muted)] max-w-xl leading-7">
            {TOKEN_NAME} is a fair-launch token whose entire mining supply is
            distributed through the{" "}
            <a href="https://docs.bankr.bot" target="_blank" rel="noreferrer">
              Bankr Wallet API
            </a>{" "}
            on Base. Your browser brute-forces a keccak256 challenge; the
            server verifies and dispatches the reward.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/mine" className="btn btn-accent">
              ▶ Start mining
            </Link>
            <Link href="/feed" className="btn btn-ghost">
              View live feed
            </Link>
            <a
              href="https://bankr.bot/launches"
              target="_blank"
              rel="noreferrer"
              className="btn btn-ghost"
            >
              Bankr token feed ↗
            </a>
          </div>
        </div>
        <aside className="lg:col-span-2 flex justify-center">
          <div
            className="relative rounded-3xl overflow-hidden"
            style={{
              background:
                "radial-gradient(circle at 50% 50%, rgba(124,58,237,0.18), rgba(124,58,237,0.02) 70%)",
            }}
          >
            <Image
              src="/logo.png"
              alt="BankrMine logo — pixel-art mining rig on a retro CRT"
              width={420}
              height={420}
              priority
              className="drop-shadow-[0_24px_48px_rgba(124,58,237,0.25)]"
              style={{ imageRendering: "pixelated" }}
            />
          </div>
        </aside>
      </section>

      <section className="mt-16 grid grid-cols-1 md:grid-cols-2 gap-4">
        <StatsPanel />
        <LaunchStatus />
      </section>

      <section className="mt-4">
        <Leaderboard />
      </section>

      <Section
        eyebrow="protocol"
        title="How it works"
        description="The same keccak256 verifier runs in your browser and on the server, so the two can never disagree."
      >
        <Steps
          items={[
            "Open /mine on any device. Phone, laptop, anything with a JavaScript runtime.",
            "Paste your Base wallet address. Nothing is signed — the address is just where rewards land.",
            "The browser spins up one Web Worker per CPU core. Each worker brute-forces keccak256(challenge ‖ nonce) until it has enough leading zero bits.",
            "Challenges are per-wallet, per-epoch (10 min). Nobody can steal your nonce from a public mempool — there is no public mempool.",
            "On a hit, the page POSTs the nonce. The server verifies the proof of work, then dispatches the reward through the Bankr Wallet API.",
          ]}
        />
      </Section>

      <Section
        eyebrow="economics"
        title="Tokenomics"
        description="Fair launch. 90% of supply distributed exclusively through CPU mining."
      >
        <TokenomicsTable />
      </Section>

      <Section
        eyebrow="why bankr"
        title="What makes this Bankr-native"
        description="Each piece below is a direct hook into Bankr — token launch, wallet transfers, fee routing, social discovery."
      >
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            {
              h: "Launched via Bankr",
              p: "$" + TOKEN_SYMBOL + " is deployed on Base through the Bankr Agent API, so it auto-lists on bankr.bot/launches with Uniswap V4 LP seeded automatically.",
            },
            {
              h: "Every mint = Bankr tx",
              p: "Each rewarded miner triggers POST /wallet/transfer, putting Bankr-attributed volume on chain.",
            },
            {
              h: "Fees forever",
              p: "Trading fees on every $" + TOKEN_SYMBOL + " swap accrue to the deployer wallet — 57% of every 1.2% swap fee, automatically.",
            },
            {
              h: "Tweet-to-mine",
              p: "After a solve, the UI offers a pre-filled X post tagging @bankrbot, so Bankr's social integration picks it up.",
            },
            {
              h: "Open-source verifier",
              p: "lib/protocol.ts runs on both client and server — independent re-verification is one keccak256 away.",
            },
            {
              h: "No GPU / ASIC moat",
              p: "Phase 1 difficulty stays in CPU territory. The reference miner is plain WASM keccak256 with Web Workers.",
            },
          ].map((c) => (
            <li
              key={c.h}
              className="terminal p-4 text-sm space-y-1"
            >
              <div className="font-semibold">{c.h}</div>
              <div className="text-[color:var(--muted)] leading-6">{c.p}</div>
            </li>
          ))}
        </ul>
      </Section>

      <Section eyebrow="faq" title="Questions">
        <FAQ />
      </Section>

      <section className="mt-16 terminal p-8 text-center">
        <div className="label-kbd mb-3">ready when you are</div>
        <h2 className="text-3xl font-bold tracking-tight">
          Open the terminal. Burn some cycles. Mint ${TOKEN_SYMBOL}.
        </h2>
        <p className="text-[color:var(--muted)] mt-3 max-w-lg mx-auto">
          {FMT.format(MINING_SUPPLY)} ${TOKEN_SYMBOL} are up for grabs. First
          era is {ERA_1_REWARD} per mint, halving every{" "}
          {FMT.format(HALVING_CADENCE_MINTS)}. {FMT.format(TOTAL_SUPPLY)} total
          supply.
        </p>
        <div className="flex flex-wrap gap-3 justify-center mt-5">
          <Link href="/mine" className="btn btn-primary">
            ▶ Start mining
          </Link>
          <a
            href="https://github.com/Bankrmine/bankr-miner"
            target="_blank"
            rel="noreferrer"
            className="btn btn-ghost"
          >
            View source ↗
          </a>
        </div>
      </section>
    </div>
  );
}

function Section({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-16 space-y-6">
      <header className="space-y-2 max-w-2xl">
        {eyebrow && <div className="label-kbd">{eyebrow}</div>}
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
          {title}
        </h2>
        {description && (
          <p className="text-[color:var(--muted)] leading-7">{description}</p>
        )}
      </header>
      <div>{children}</div>
    </section>
  );
}

function Steps({ items }: { items: string[] }) {
  return (
    <ol className="space-y-3">
      {items.map((s, i) => (
        <li key={i} className="flex gap-4 items-start">
          <span className="font-mono text-[color:var(--muted)] shrink-0 text-sm pt-0.5">
            {String(i + 1).padStart(2, "0")}
          </span>
          <span className="leading-7">{s}</span>
        </li>
      ))}
    </ol>
  );
}

function TokenomicsTable() {
  const rows: [string, string, string][] = [
    ["total supply", `${FMT.format(TOTAL_SUPPLY)} ${TOKEN_SYMBOL}`, ""],
    [
      "mining (PoW)",
      `${FMT.format(MINING_SUPPLY)} ${TOKEN_SYMBOL}`,
      "90% — distributed via Bankr Wallet API",
    ],
    [
      "LP seed",
      `${FMT.format(TOTAL_SUPPLY * 0.05)} ${TOKEN_SYMBOL}`,
      "5% — auto-seeded by Bankr",
    ],
    [
      "deployer reserve",
      `${FMT.format(TOTAL_SUPPLY * 0.05)} ${TOKEN_SYMBOL}`,
      "5% — 30-day lock",
    ],
    [
      "era 1 reward",
      `${ERA_1_REWARD} ${TOKEN_SYMBOL} / mint`,
      "halves every era",
    ],
    [
      "halving cadence",
      `every ${FMT.format(HALVING_CADENCE_MINTS)} mints`,
      "à la hash256.org",
    ],
    ["team / vc / airdrop", "0", "—"],
  ];
  return (
    <div className="terminal overflow-hidden">
      <table className="w-full text-sm">
        <tbody>
          {rows.map(([k, v, note]) => (
            <tr key={k} className="border-b border-[color:var(--border)] last:border-0">
              <td className="px-4 py-3 label-kbd w-1/4 align-top">{k}</td>
              <td className="px-4 py-3 font-mono align-top">{v}</td>
              <td className="px-4 py-3 text-[color:var(--muted)] hidden sm:table-cell align-top">
                {note}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FAQ() {
  const items = [
    {
      q: "Is the token live yet?",
      a: `Not yet — this is a pre-launch preview. $${TOKEN_SYMBOL} will be deployed on Base via the Bankr Token Launch API the moment the deployer wallet activates Bankr Club. The verifier, miner, leaderboard and feed are all real today; every successful mint is recorded as an IOU in a queue you can inspect at /api/claim-queue, and the queue is batch-settled on Bankr the second the contract address is published. There are no fake "0xmock…" tx hashes anywhere in the UI.`,
    },
    {
      q: "What's an IOU and how does it settle?",
      a: `Every mint produces an IOU entry — a record of which wallet earned how much $${TOKEN_SYMBOL} at which era. Until the token is launched, IOUs accumulate server-side; once $${TOKEN_SYMBOL} deploys, the deployer runs a settlement pass that calls POST /wallet/transfer on Bankr for each entry. The data the script reads is the same data /api/claim-queue exposes, so you can verify your own IOU before settlement.`,
    },
    {
      q: "Why is the launch gated?",
      a: `Token deploys through Bankr require Bankr Club membership (paid in $BNKR). The deployer is earning $BNKR through the Bankr Leaderboard to fund the membership organically — once activated, $${TOKEN_SYMBOL} ships immediately. The 'bankr status' card on this page polls /wallet/me upstream; the moment club flips to active, the protocol badge flips to 'bankr live'.`,
    },
    {
      q: "How is this different from hash256.org?",
      a: "hash256.org has a custom Solidity mining contract on Ethereum mainnet. BankrMine is Bankr-native: proof of work is verified in our open-source backend and rewards are dispatched as Bankr Wallet API transfers. That trades some decentralisation for full Bankr ecosystem integration (token feed, fee routing, social hooks).",
    },
    {
      q: "Can I run a headless / GPU miner?",
      a: "The reference miner is browser WASM + Web Workers across all your CPU cores. The protocol (keccak256 PoW with per-wallet challenges) is identical regardless of where the hashing runs, so headless ports are welcome — open-source the miner client and share the link.",
    },
    {
      q: "What stops API spam?",
      a: "Per-wallet challenges, per-epoch nonce uniqueness, a per-epoch max mint cap, and a difficulty target that requires real CPU work. Phase 2 will add rate limiting and optional captchas.",
    },
    {
      q: "Do I need a Bankr account to mine?",
      a: "No. As a miner, you just need an EVM wallet address to receive the reward. The deployer (project operator) holds the Bankr account that funds and dispatches rewards.",
    },
    {
      q: "Is this audited?",
      a: "No. Phase 1 is a transparent, open-source demo. Read the code in /src/lib before connecting real value.",
    },
  ];
  return (
    <div className="space-y-2">
      {items.map((it, i) => (
        <details
          key={i}
          className="terminal p-4 text-sm group"
        >
          <summary className="cursor-pointer font-semibold list-none flex items-center justify-between">
            <span>{it.q}</span>
            <span className="text-[color:var(--muted)] group-open:rotate-45 transition-transform">
              +
            </span>
          </summary>
          <p className="mt-3 text-[color:var(--muted)] leading-7">{it.a}</p>
        </details>
      ))}
    </div>
  );
}
