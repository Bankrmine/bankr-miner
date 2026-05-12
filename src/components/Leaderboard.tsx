"use client";

import { useEffect, useState } from "react";
import { TOKEN_SYMBOL } from "@/lib/constants";

type Row = { wallet: string; balance: number; mintCount: number };

const FMT = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

function shortAddr(a: string): string {
  return a.length > 14 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}

export function Leaderboard({ pollMs = 5000 }: { pollMs?: number }) {
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/leaderboard", { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json()) as { leaderboard: Row[] };
        if (!cancelled) setRows(json.leaderboard);
      } catch {
        // ignore
      }
    }
    load();
    const id = setInterval(load, pollMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [pollMs]);

  return (
    <div className="terminal p-5">
      <div className="label-kbd mb-3">leaderboard</div>
      {rows.length === 0 ? (
        <div className="text-sm text-[color:var(--muted)]">
          no miners yet — be the first to ▶ start mining.
        </div>
      ) : (
        <ol className="space-y-2">
          {rows.map((r, i) => (
            <li
              key={r.wallet}
              className="flex items-center justify-between gap-2 text-sm"
            >
              <span className="font-mono text-[color:var(--muted)] w-6 text-right">
                {i + 1}.
              </span>
              <span className="font-mono flex-1 truncate">
                {shortAddr(r.wallet)}
              </span>
              <span className="text-xs text-[color:var(--muted)] w-20 text-right">
                {r.mintCount} mints
              </span>
              <span className="font-mono w-32 text-right">
                {FMT.format(r.balance)}{" "}
                <span className="text-[color:var(--muted)] text-xs">
                  {TOKEN_SYMBOL}
                </span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
