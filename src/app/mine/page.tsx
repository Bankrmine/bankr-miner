import { Miner } from "@/components/Miner";
import { StatsPanel } from "@/components/StatsPanel";
import { LiveFeed } from "@/components/LiveFeed";
import { ClaimPanel } from "@/components/ClaimPanel";
import { MIN_CLAIM_AMOUNT, TOKEN_SYMBOL } from "@/lib/constants";

export const metadata = {
  title: `Mine $${TOKEN_SYMBOL} · BankrMine`,
};

export default function MinePage() {
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-14 space-y-8">
      <header className="space-y-3 max-w-2xl">
        <div className="label-kbd">/mine</div>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
          Mine{" "}
          <span className="text-[color:var(--accent)]">${TOKEN_SYMBOL}</span>{" "}
          from this tab.
        </h1>
        <p className="text-[color:var(--muted)] leading-7">
          Connect a Base wallet. Your browser brute-forces a per-wallet
          keccak256 challenge — no signing, no gas. Solutions accrue as
          off-chain IOUs. Once you cross {MIN_CLAIM_AMOUNT} ${TOKEN_SYMBOL} you
          can mint on-chain in one click.
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Miner />
          <ClaimPanel />
        </div>
        <div className="space-y-4">
          <StatsPanel />
          <LiveFeed limit={10} />
        </div>
      </div>
    </div>
  );
}
