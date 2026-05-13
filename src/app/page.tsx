import Link from "next/link";
import Image from "next/image";
import { StatsPanel } from "@/components/StatsPanel";
import { Leaderboard } from "@/components/Leaderboard";
import { LaunchStatus } from "@/components/LaunchStatus";
import {
  MIN_CLAIM_AMOUNT,
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
            mint-on-claim · CPU-mined · Base mainnet
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold leading-[1.05] tracking-tight">
            Mine{" "}
            <span className="text-[color:var(--accent)]">${TOKEN_SYMBOL}</span>{" "}
            from your browser.
            <br />
            <span className="text-[color:var(--muted)]">No GPU. No ASIC.</span>
          </h1>
          <p className="text-lg text-[color:var(--muted)] max-w-xl leading-7">
            {TOKEN_NAME} is a fair-launch ERC-20 on{" "}
            <a href="https://base.org" target="_blank" rel="noreferrer">
              Base
            </a>
            . Total supply starts at 0 — ${TOKEN_SYMBOL} is{" "}
            <em>minted only when miners claim</em>, capped at{" "}
            {FMT.format(TOTAL_SUPPLY)}. Connect a Base wallet, let your browser
            grind keccak256, then mint on-chain in one click.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/mine" className="btn btn-accent">
              ▶ Start mining
            </Link>
            <Link href="/feed" className="btn btn-ghost">
              View live feed
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
            "Connect a Base wallet. Nothing is signed yet — the address is just bound to your per-wallet challenge.",
            "The browser spins up one Web Worker per CPU core. Each worker brute-forces keccak256(challenge ‖ nonce) until it has enough leading zero bits.",
            `Solutions accrue as off-chain IOUs at ${ERA_1_REWARD} $${TOKEN_SYMBOL} per solve. The server verifies every nonce; nobody can steal your solution from a mempool because there is no mempool.`,
            `Once your IOU balance crosses ${MIN_CLAIM_AMOUNT} $${TOKEN_SYMBOL}, click "Claim". The backend signs a permit; you broadcast claim(amount, nonce, signature) to MineToken.sol, which mints the tokens straight to your wallet.`,
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
        eyebrow="why this design"
        title="What makes this fair"
        description="Mint-on-claim with a hard supply cap. No premine, no presale, no insiders. Liquidity and fees route to the deployer wallet by construction."
      >
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            {
              h: "Supply = 0 at deploy",
              p: `${TOKEN_NAME} starts at 0. ${"$" + TOKEN_SYMBOL} only comes into existence when a miner claim()s their accumulated PoW IOUs, capped at ${FMT.format(TOTAL_SUPPLY)}.`,
            },
            {
              h: "Backend-signed claims",
              p: "Every claim() is authorised by an EIP-191 signature from a dedicated backend wallet. The contract verifies it, mints, and marks the nonce used. Anti-replay is on-chain.",
            },
            {
              h: "Fees to deployer wallet",
              p: "LP and trading fees route to the deployer wallet by default — wired into the LP pair, not opaque off-chain royalties.",
            },
            {
              h: "Open-source verifier",
              p: "lib/protocol.ts runs on both client and server — independent re-verification of any nonce is one keccak256 away.",
            },
            {
              h: "Rotatable signer + pause",
              p: "setClaimSigner() and toggleClaimsPaused() let the owner rotate a leaked signer or freeze claims in an emergency without redeploying.",
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
    ["max supply", `${FMT.format(TOTAL_SUPPLY)} ${TOKEN_SYMBOL}`, "hard cap enforced on-chain"],
    [
      "mining (PoW)",
      `${FMT.format(MINING_SUPPLY)} ${TOKEN_SYMBOL}`,
      "90% — minted lazily via claim()",
    ],
    [
      "LP seed",
      `${FMT.format(TOTAL_SUPPLY * 0.05)} ${TOKEN_SYMBOL}`,
      "5% — owner-minted into Uniswap/Aerodrome pair",
    ],
    [
      "deployer reserve",
      `${FMT.format(TOTAL_SUPPLY * 0.05)} ${TOKEN_SYMBOL}`,
      "5% — 30-day off-chain lock",
    ],
    [
      "era 1 reward",
      `${ERA_1_REWARD} ${TOKEN_SYMBOL} / mint`,
      "halves every era",
    ],
    [
      "halving cadence",
      `every ${FMT.format(HALVING_CADENCE_MINTS)} mints`,
      "reward halves on every cadence",
    ],
    [
      "claim threshold",
      `${FMT.format(MIN_CLAIM_AMOUNT)} ${TOKEN_SYMBOL}`,
      "minimum IOU balance to mint on-chain",
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
      a: `Live as soon as the operator deploys MineToken.sol on Base and sets MINE_TOKEN_ADDRESS + CLAIM_SIGNER_PRIVATE_KEY in the env. Until then, mining still works and accumulates IOUs server-side — they become claimable on-chain the moment the contract address is wired in. There are no fake "0xmock…" tx hashes anywhere in the UI.`,
    },
    {
      q: "What's mint-on-claim?",
      a: `Total supply starts at 0. ${"$" + TOKEN_SYMBOL} only exists once a miner calls claim() on MineToken.sol with a backend-signed permit. That means no premine, no foundation allocation, no team unlock — supply tracks real mining activity 1:1, capped at ${FMT.format(TOTAL_SUPPLY)} forever.`,
    },
    {
      q: `Why ${MIN_CLAIM_AMOUNT} $${TOKEN_SYMBOL} minimum claim?`,
      a: `Gas. A claim() tx costs the same gas whether you mint 1 ${"$" + TOKEN_SYMBOL} or 10,000. Setting a floor keeps gas-per-${"$" + TOKEN_SYMBOL} reasonable and produces clean on-chain history. Below the threshold, IOUs keep accruing — nothing is lost.`,
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
      q: "What happens if the claim signer key leaks?",
      a: "The contract owner calls setClaimSigner(newAddress) to rotate the authorising key. Old signatures still resolve to the old signer and stop verifying. Same exit if the backend goes offline: toggleClaimsPaused() freezes claim() until things are healthy.",
    },
    {
      q: "Is this audited?",
      a: "No. Phase 1 is a transparent, open-source demo. Read contracts/MineToken.sol and the verifier in /src/lib before connecting real value.",
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
