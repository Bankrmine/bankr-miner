"use client";

import { useEffect, useState } from "react";
import { TOKEN_SYMBOL } from "@/lib/constants";

type Stats = {
  mintCount: number;
  totalMinted: number;
  remainingSupply: number;
  miningSupply: number;
  era: number;
  nextReward: number;
  mintsThisEra: number;
  mintsUntilHalving: number;
  halvingCadence: number;
  bankrConfigured: boolean;
  tokenLaunched: boolean;
};

const FMT = new Intl.NumberFormat("en-US");

export function StatsPanel({ pollMs = 3000 }: { pollMs?: number }) {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/stats", { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json()) as Stats;
        if (!cancelled) setStats(json);
      } catch {
        // network hiccups are harmless here
      }
    }
    load();
    const id = setInterval(load, pollMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [pollMs]);

  if (!stats) {
    return (
      <div className="terminal p-5 text-sm text-[color:var(--muted)]">
        loading stats…
      </div>
    );
  }

  const mintedPct = (stats.totalMinted / stats.miningSupply) * 100;
  const eraPct = (stats.mintsThisEra / stats.halvingCadence) * 100;

  return (
    <div className="terminal p-5 space-y-3">
      <div className="label-kbd flex items-center justify-between">
        <span>network</span>
        <Badge
          on={stats.bankrConfigured}
          onLabel="bankr live"
          offLabel="pre-launch preview"
        />
      </div>

      <Row
        label="era"
        value={`#${stats.era}`}
        hint={`next reward: ${stats.nextReward} ${TOKEN_SYMBOL}/mint`}
      />
      <Row
        label="minted"
        value={`${FMT.format(stats.totalMinted)} ${TOKEN_SYMBOL}`}
        hint={`${mintedPct.toFixed(4)}% of ${FMT.format(stats.miningSupply)}`}
      />
      <Bar pct={mintedPct} />
      <Row
        label="this era"
        value={`${FMT.format(stats.mintsThisEra)} / ${FMT.format(stats.halvingCadence)} mints`}
        hint={`${FMT.format(stats.mintsUntilHalving)} until halving`}
      />
      <Bar pct={eraPct} />
      <Row
        label="token launched"
        value={stats.tokenLaunched ? "yes" : "waiting on bankr club"}
        hint={stats.tokenLaunched ? undefined : "real $MINE deploys once club is active"}
      />
    </div>
  );
}

function Row({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="flex justify-between items-baseline gap-3">
      <span className="label-kbd">{label}</span>
      <span className="text-right">
        <span className="font-mono text-sm">{value}</span>
        {hint && (
          <span className="block text-[11px] text-[color:var(--muted)]">
            {hint}
          </span>
        )}
      </span>
    </div>
  );
}

function Bar({ pct }: { pct: number }) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div className="h-1.5 bg-[color:var(--surface-muted)] rounded overflow-hidden">
      <div
        className="h-full bg-[color:var(--accent)]"
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

function Badge({
  on,
  onLabel,
  offLabel,
}: {
  on: boolean;
  onLabel: string;
  offLabel: string;
}) {
  return (
    <span
      className={
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono " +
        (on
          ? "bg-[color:var(--accent-soft)] text-[color:var(--accent-strong)]"
          : "bg-[color:var(--surface-muted)] text-[color:var(--muted)]")
      }
    >
      <span
        className={
          "w-1.5 h-1.5 rounded-full " +
          (on ? "bg-[color:var(--accent)]" : "bg-[color:var(--muted)]")
        }
      />
      {on ? onLabel : offLabel}
    </span>
  );
}
