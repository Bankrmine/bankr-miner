"use client";

import { useEffect, useState } from "react";

type Deployer = {
  configured: boolean;
  evmAddress: string | null;
  xUsername: string | null;
  clubActive: boolean;
  leaderboardScore: number | null;
  refCode: string | null;
  upstream: { status: number; ok: boolean; error?: string };
};

type Launch = {
  status: string;
  tokenName: string;
  tokenSymbol: string;
  tokenAddress: string;
  chain: string;
  txHash: string | null;
  tweetUrl: string | null;
  timestamp: number;
  deployer: {
    walletAddress: string;
    xUsername: string | null;
    xProfileImageUrl: string | null;
  };
};

type LaunchStatusPayload = {
  phase: "no-key" | "pre-launch" | "live";
  canDeploy: boolean;
  deployer: Deployer;
  ecosystem: { count: number; launches: Launch[]; fetchedAt: number };
  queue: {
    totalQueued: number;
    totalSettled: number;
    totalPending: number;
    totalIOUs: number;
    iousSettled: number;
    iousPending: number;
    uniqueMiners: number;
    oldestQueuedAt: number | null;
    newestQueuedAt: number | null;
    settled: boolean;
  };
};

const NUM = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

function relTime(ts: number): string {
  const delta = (Date.now() - ts) / 1000;
  if (delta < 60) return `${Math.floor(delta)}s ago`;
  if (delta < 3600) return `${Math.floor(delta / 60)}m ago`;
  if (delta < 86_400) return `${Math.floor(delta / 3600)}h ago`;
  return `${Math.floor(delta / 86_400)}d ago`;
}

function shortAddr(a: string): string {
  if (!a || a.length < 12) return a || "?";
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export function LaunchStatus({ pollMs = 15_000 }: { pollMs?: number }) {
  const [data, setData] = useState<LaunchStatusPayload | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/launch-status", { cache: "no-store" });
        if (!res.ok) {
          setErr(`status ${res.status}`);
          return;
        }
        const json = (await res.json()) as LaunchStatusPayload;
        if (!cancelled) {
          setData(json);
          setErr(null);
        }
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e));
      }
    }
    load();
    const id = setInterval(load, pollMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [pollMs]);

  if (!data) {
    return (
      <div className="terminal p-5 text-sm text-[color:var(--muted)]">
        {err ? `launch status unavailable (${err})` : "loading launch status…"}
      </div>
    );
  }

  const phaseLabel: Record<LaunchStatusPayload["phase"], string> = {
    "no-key": "no bankr key",
    "pre-launch": "pre-launch preview",
    live: "bankr live",
  };
  const phaseColor: Record<LaunchStatusPayload["phase"], string> = {
    "no-key": "text-[color:var(--muted)] bg-[color:var(--surface-muted)]",
    "pre-launch": "text-[color:var(--accent-strong)] bg-[color:var(--accent-soft)]",
    live: "text-emerald-700 bg-emerald-100",
  };

  return (
    <div className="terminal p-5 space-y-4">
      <div className="flex items-center justify-between">
        <span className="label-kbd">bankr status</span>
        <span
          className={
            "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono " +
            phaseColor[data.phase]
          }
        >
          <span
            className={
              "w-1.5 h-1.5 rounded-full " +
              (data.phase === "live"
                ? "bg-emerald-600"
                : data.phase === "pre-launch"
                  ? "bg-[color:var(--accent)] animate-pulse"
                  : "bg-[color:var(--muted)]")
            }
          />
          {phaseLabel[data.phase]}
        </span>
      </div>

      <div className="space-y-1 text-sm">
        <div className="flex items-baseline justify-between gap-3">
          <span className="label-kbd">deployer</span>
          <span className="font-mono text-xs text-right break-all">
            {data.deployer.xUsername ? (
              <a
                href={`https://x.com/${data.deployer.xUsername}`}
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                @{data.deployer.xUsername}
              </a>
            ) : (
              <span className="text-[color:var(--muted)]">unknown</span>
            )}{" "}
            <span className="text-[color:var(--muted)]">
              · {data.deployer.evmAddress ? shortAddr(data.deployer.evmAddress) : "—"}
            </span>
          </span>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <span className="label-kbd">bankr club</span>
          <span className="text-xs font-mono">
            {data.deployer.clubActive ? (
              <span className="text-emerald-700">active</span>
            ) : (
              <a
                href="https://bankr.bot/club"
                target="_blank"
                rel="noreferrer"
                className="underline text-[color:var(--accent-strong)]"
              >
                inactive — activate to deploy ↗
              </a>
            )}
          </span>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <span className="label-kbd">IOUs queued</span>
          <span className="text-right">
            <span className="font-mono text-sm">
              {NUM.format(data.queue.totalPending)} MINE
              <span className="text-[color:var(--muted)] text-xs">
                {" "}
                pending
              </span>
            </span>
            <span className="block text-[11px] text-[color:var(--muted)]">
              {data.queue.iousPending} mints from {data.queue.uniqueMiners}{" "}
              miners
              {data.queue.iousSettled > 0
                ? ` · ${NUM.format(data.queue.totalSettled)} MINE already settled (${data.queue.iousSettled} mints)`
                : ""}
            </span>
          </span>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-baseline justify-between gap-3">
          <span className="label-kbd">recent bankr launches</span>
          <span className="text-[10px] text-[color:var(--muted)] font-mono">
            live · {data.ecosystem.count} shown
          </span>
        </div>
        {data.ecosystem.launches.length === 0 ? (
          <div className="text-xs text-[color:var(--muted)]">
            (no recent launches from /token-launches)
          </div>
        ) : (
          <ul className="space-y-1.5">
            {data.ecosystem.launches.slice(0, 5).map((l) => (
              <li
                key={`${l.tokenAddress}-${l.timestamp}`}
                className="flex items-center justify-between gap-2 text-xs font-mono"
              >
                <span className="truncate flex-1">
                  <a
                    href={`https://basescan.org/token/${l.tokenAddress}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[color:var(--foreground)] hover:underline"
                  >
                    ${l.tokenSymbol}
                  </a>{" "}
                  {l.deployer.xUsername && (
                    <a
                      href={`https://x.com/${l.deployer.xUsername}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[color:var(--muted)] hover:underline"
                    >
                      @{l.deployer.xUsername}
                    </a>
                  )}
                </span>
                <span className="text-[color:var(--muted)] whitespace-nowrap">
                  {l.timestamp ? relTime(l.timestamp) : "?"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
