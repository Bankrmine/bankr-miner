"use client";

import { useEffect, useState } from "react";
import { TOKEN_SYMBOL } from "@/lib/constants";

type FeedItem = {
  type: "mint";
  mint: {
    index: number;
    wallet: string;
    era: number;
    reward: number;
    timestamp: number;
    hash: string;
    txHash?: string;
  };
};

function shortAddr(a: string): string {
  return a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}

function relativeTime(ts: number): string {
  const diff = Math.max(0, Date.now() - ts);
  if (diff < 1000) return "just now";
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  return `${Math.floor(diff / 3_600_000)}h ago`;
}

export function LiveFeed({ limit = 12 }: { limit?: number }) {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const es = new EventSource("/api/feed");
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.onmessage = (e) => {
      try {
        const parsed = JSON.parse(e.data) as
          | FeedItem
          | { type: "live" }
          | { type: "halving"; era: number }
          | { type: "stats" };
        if (parsed.type === "mint") {
          setItems((prev) => [parsed, ...prev].slice(0, limit));
        }
      } catch {
        // bad payload, ignore
      }
    };
    return () => {
      es.close();
    };
  }, [limit]);

  return (
    <div className="terminal p-5">
      <div className="label-kbd flex items-center justify-between mb-3">
        <span>live feed</span>
        <span
          className={
            "inline-flex items-center gap-1 text-[10px] " +
            (connected
              ? "text-[color:var(--accent)]"
              : "text-[color:var(--muted)]")
          }
        >
          <span
            className={
              "w-1.5 h-1.5 rounded-full " +
              (connected
                ? "bg-[color:var(--accent)] animate-pulse"
                : "bg-[color:var(--muted)]")
            }
          />
          {connected ? "live" : "reconnecting"}
        </span>
      </div>
      {items.length === 0 ? (
        <div className="text-sm text-[color:var(--muted)] font-mono">
          $ tail -f mine.events
          <br />
          (no mints yet — be the first to ▶ start mining)
        </div>
      ) : (
        <ul className="space-y-2 text-sm">
          {items.map((it) => (
            <li
              key={`${it.mint.index}-${it.mint.hash}`}
              className="flex items-center justify-between gap-2"
            >
              <span className="font-mono text-[color:var(--muted)] w-10">
                #{it.mint.index}
              </span>
              <span className="font-mono flex-1 truncate">
                {shortAddr(it.mint.wallet)}
              </span>
              <span className="font-mono whitespace-nowrap">
                +{it.mint.reward}{" "}
                <span className="text-[color:var(--muted)] text-xs">
                  {TOKEN_SYMBOL}
                </span>
              </span>
              <span className="text-[11px] text-[color:var(--muted)] whitespace-nowrap w-16 text-right">
                {relativeTime(it.mint.timestamp)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
