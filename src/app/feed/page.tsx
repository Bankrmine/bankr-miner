import { LiveFeed } from "@/components/LiveFeed";
import { Leaderboard } from "@/components/Leaderboard";
import { StatsPanel } from "@/components/StatsPanel";

export const metadata = { title: "Feed · BankrMine" };

export default function FeedPage() {
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-14 space-y-8">
      <header className="space-y-3 max-w-2xl">
        <div className="label-kbd">/feed</div>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
          Live mints.
        </h1>
        <p className="text-[color:var(--muted)] leading-7">
          Every mint, era boundary, and halving as it lands. Pulled from the
          server-sent events stream — refresh-free.
        </p>
      </header>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <LiveFeed limit={50} />
        <div className="space-y-4">
          <StatsPanel />
          <Leaderboard />
        </div>
      </div>
    </div>
  );
}
