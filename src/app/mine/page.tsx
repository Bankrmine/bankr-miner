import { Miner } from "@/components/Miner";
import { StatsPanel } from "@/components/StatsPanel";
import { LiveFeed } from "@/components/LiveFeed";
import { TOKEN_SYMBOL } from "@/lib/constants";

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
          Paste a Base / EVM wallet address. Your browser does the proof of
          work locally; rewards land via the Bankr Wallet API. Nothing is
          signed — the address is just a delivery destination.
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Miner />
        </div>
        <div className="space-y-4">
          <StatsPanel />
          <LiveFeed limit={10} />
        </div>
      </div>
    </div>
  );
}
