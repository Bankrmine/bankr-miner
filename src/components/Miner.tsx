"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isValidAddress, toChecksumAddress } from "@/lib/address";
import {
  startMiner,
  type MinerProgress,
  type MinerHandle,
} from "@/lib/client/miner";
import { TOKEN_SYMBOL } from "@/lib/constants";

type ChallengeResponse = {
  wallet: string;
  epoch: number;
  epochDurationMs: number;
  epochMsLeft: number;
  challenge: string;
  difficultyBits: number;
  projectId: string;
  chainId: number;
};

type MineResponse = {
  ok: true;
  mint: {
    index: number;
    reward: number;
    era: number;
    txHash?: string;
    hash: string;
  };
  transfer: {
    ok: boolean;
    queued?: boolean;
    reason?: "no-key" | "pre-launch";
    txHash?: string;
    error?: string;
  };
  queuedId?: string;
  iouSettled?: boolean;
  stats: { mintCount: number; era: number; nextReward: number };
  bankrConfigured: boolean;
  tokenLaunched: boolean;
};

type MiningStatus =
  | { phase: "idle" }
  | { phase: "fetching-challenge" }
  | { phase: "mining"; progress: MinerProgress | null }
  | { phase: "submitting" }
  | { phase: "success"; res: MineResponse }
  | { phase: "error"; message: string };

const HASHRATE_FMT = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});

function shortHash(hex: string, head = 10, tail = 8): string {
  if (hex.length <= head + tail + 3) return hex;
  return `${hex.slice(0, head)}…${hex.slice(-tail)}`;
}

function formatHashrate(hps: number): string {
  if (hps < 1_000) return `${HASHRATE_FMT.format(hps)} H/s`;
  if (hps < 1_000_000) return `${(hps / 1_000).toFixed(2)} kH/s`;
  return `${(hps / 1_000_000).toFixed(2)} MH/s`;
}

export function Miner() {
  const [addressInput, setAddressInput] = useState("");
  const [status, setStatus] = useState<MiningStatus>({ phase: "idle" });
  const [challenge, setChallenge] = useState<ChallengeResponse | null>(null);
  const [continuousMode, setContinuousMode] = useState(false);
  const [recentMints, setRecentMints] = useState<MineResponse["mint"][]>([]);
  const handleRef = useRef<MinerHandle | null>(null);
  const stopFlagRef = useRef(false);

  const wallet = useMemo(() => {
    return isValidAddress(addressInput)
      ? addressInput.trim().toLowerCase()
      : null;
  }, [addressInput]);

  const checksum = wallet ? toChecksumAddress(wallet) : null;

  const cores = useMemo(() => {
    if (typeof navigator === "undefined") return 4;
    return Math.max(1, Math.min(16, navigator.hardwareConcurrency || 4));
  }, []);

  const stop = useCallback(() => {
    stopFlagRef.current = true;
    if (handleRef.current) {
      handleRef.current.stop();
      handleRef.current = null;
    }
    setStatus({ phase: "idle" });
  }, []);

  const fetchChallenge = useCallback(
    async (forWallet: string): Promise<ChallengeResponse> => {
      const res = await fetch(`/api/challenge?wallet=${forWallet}`);
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(json.error ?? `challenge fetch failed (${res.status})`);
      }
      return (await res.json()) as ChallengeResponse;
    },
    [],
  );

  const mineOnce = useCallback(
    async (forWallet: string): Promise<MineResponse> => {
      setStatus({ phase: "fetching-challenge" });
      const ch = await fetchChallenge(forWallet);
      setChallenge(ch);

      setStatus({ phase: "mining", progress: null });
      const handle = startMiner({
        challenge: ch.challenge,
        difficultyBits: ch.difficultyBits,
        workerCount: cores,
        onProgress: (p) => {
          setStatus((s) =>
            s.phase === "mining" ? { phase: "mining", progress: p } : s,
          );
        },
      });
      handleRef.current = handle;
      const solution = await handle.promise;
      handleRef.current = null;

      setStatus({ phase: "submitting" });
      const res = await fetch(`/api/mine`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wallet: forWallet,
          nonce: solution.nonce,
          epoch: ch.epoch,
        }),
      });
      const json = (await res.json()) as MineResponse | { error?: string };
      if (!res.ok || !("ok" in json) || !json.ok) {
        const error =
          "error" in json && json.error
            ? json.error
            : `mine failed (${res.status})`;
        throw new Error(error);
      }
      return json;
    },
    [cores, fetchChallenge],
  );

  const start = useCallback(async () => {
    if (!wallet) return;
    stopFlagRef.current = false;

    try {
      while (!stopFlagRef.current) {
        const result = await mineOnce(wallet);
        setRecentMints((prev) => [result.mint, ...prev].slice(0, 10));
        setStatus({ phase: "success", res: result });

        if (!continuousMode) break;

        await new Promise((r) => setTimeout(r, 500));
        if (stopFlagRef.current) break;
      }
    } catch (err) {
      setStatus({
        phase: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      handleRef.current = null;
    }
  }, [continuousMode, mineOnce, wallet]);

  useEffect(() => {
    return () => {
      handleRef.current?.stop();
    };
  }, []);

  const isWorking =
    status.phase === "mining" ||
    status.phase === "submitting" ||
    status.phase === "fetching-challenge";

  return (
    <section className="space-y-4">
      <div className="terminal p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="label-kbd">mine ${TOKEN_SYMBOL}</div>
          <div className="text-[11px] text-[color:var(--muted)] font-mono">
            {cores} cores detected
          </div>
        </div>

        <label
          htmlFor="wallet-input"
          className="block text-xs text-[color:var(--muted)]"
        >
          Your wallet address (Base / EVM)
        </label>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            id="wallet-input"
            value={addressInput}
            onChange={(e) => setAddressInput(e.target.value)}
            placeholder="0x…"
            className="flex-1 bg-[color:var(--surface)] border border-[color:var(--border)] rounded-md px-3 py-2 text-sm font-mono text-[color:var(--foreground)] placeholder:text-[color:var(--muted)] focus:outline-none focus:border-[color:var(--accent)]"
            disabled={isWorking}
            spellCheck={false}
          />
          <button
            type="button"
            onClick={isWorking ? stop : start}
            disabled={!wallet && !isWorking}
            className={
              "btn disabled:opacity-40 disabled:cursor-not-allowed " +
              (isWorking ? "btn-danger" : "btn-accent")
            }
          >
            {isWorking ? "■ Stop" : "▶ Start mining"}
          </button>
        </div>
        {checksum && (
          <div className="text-[11px] text-[color:var(--muted)] font-mono break-all">
            checksum:{" "}
            <span className="text-[color:var(--foreground)]">{checksum}</span>
          </div>
        )}
        <label className="flex items-center gap-2 text-xs text-[color:var(--muted)] cursor-pointer select-none">
          <input
            type="checkbox"
            checked={continuousMode}
            onChange={(e) => setContinuousMode(e.target.checked)}
            disabled={isWorking}
            style={{ accentColor: "var(--accent)" }}
          />
          continuous mode (keep mining until stopped)
        </label>
      </div>

      <div className="terminal p-5 space-y-2">
        <div className="label-kbd mb-1">status</div>
        <StatusLine status={status} cores={cores} challenge={challenge} />
      </div>

      {recentMints.length > 0 && (
        <div className="terminal p-5">
          <div className="label-kbd mb-3">
            your recent mints ({recentMints.length})
          </div>
          <ul className="space-y-1 text-xs font-mono">
            {recentMints.map((m) => (
              <li
                key={`${m.index}-${m.hash}`}
                className="flex justify-between gap-3 border-b border-[color:var(--border)] last:border-0 py-1"
              >
                <span className="text-[color:var(--muted)]">#{m.index}</span>
                <span className="text-[color:var(--foreground)]">
                  +{m.reward} {TOKEN_SYMBOL}
                </span>
                <span className="text-[color:var(--muted)]">era {m.era}</span>
                <span className="text-[color:var(--muted)] truncate">
                  {m.txHash ? shortHash(m.txHash) : shortHash(m.hash)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function StatusLine({
  status,
  cores,
  challenge,
}: {
  status: MiningStatus;
  cores: number;
  challenge: ChallengeResponse | null;
}) {
  if (status.phase === "idle") {
    return (
      <div className="text-sm text-[color:var(--muted)] font-mono">
        idle · {cores} cores detected · paste an address and click start.
      </div>
    );
  }
  if (status.phase === "fetching-challenge") {
    return (
      <div className="text-sm font-mono">fetching per-wallet challenge…</div>
    );
  }
  if (status.phase === "mining") {
    const p = status.progress;
    return (
      <div className="space-y-1 text-sm font-mono">
        <div>
          mining · {cores} workers · difficulty{" "}
          <span className="text-[color:var(--accent)]">
            {challenge?.difficultyBits ?? "?"}
          </span>{" "}
          leading zero bits
        </div>
        {p ? (
          <div className="text-[color:var(--muted)]">
            hashrate:{" "}
            <span className="text-[color:var(--accent-strong)]">
              {formatHashrate(p.hashesPerSec)}
            </span>{" "}
            · hashes: {HASHRATE_FMT.format(p.totalHashes)} · elapsed:{" "}
            {(p.elapsedMs / 1000).toFixed(1)}s
          </div>
        ) : (
          <div className="text-[color:var(--muted)]">warming up workers…</div>
        )}
        {challenge && (
          <div className="text-[color:var(--muted)] break-all text-[11px]">
            challenge: {shortHash(challenge.challenge, 14, 14)}
          </div>
        )}
      </div>
    );
  }
  if (status.phase === "submitting") {
    return (
      <div className="text-sm font-mono">
        solution found! submitting proof to the network…
      </div>
    );
  }
  if (status.phase === "success") {
    const m = status.res.mint;
    const isLive = status.res.tokenLaunched && Boolean(m.txHash);
    const reason = status.res.transfer.reason;
    const transferFailed =
      status.res.tokenLaunched &&
      status.res.transfer.ok === false &&
      !m.txHash;

    const tweetText = isLive
      ? `Just mined ${m.reward} $${TOKEN_SYMBOL} on @bankrbot using my CPU.\n\nNo GPU. No ASIC. Browser-mined on @base.\n\nMine yours ↓`
      : `Just mined ${m.reward} $${TOKEN_SYMBOL} IOU on @bankrbot — settles on chain when @BankrMine deploys.\n\nNo GPU. No ASIC. Browser-mined on @base.\n\nMine yours ↓`;
    const tweetUrl =
      typeof window !== "undefined"
        ? `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}&url=${encodeURIComponent(window.location.origin + "/mine")}`
        : null;
    return (
      <div className="space-y-2 text-sm">
        <div className="font-mono text-[color:var(--accent-strong)]">
          ✓ mint #{m.index} confirmed · +{m.reward} {TOKEN_SYMBOL} (era {m.era})
        </div>
        <div className="text-xs text-[color:var(--muted)]">
          {isLive
            ? "Real transfer dispatched via Bankr Wallet API."
            : transferFailed
              ? "Transfer failed upstream — IOU recorded, operator will retry."
              : reason === "no-key"
                ? "Recorded — server has no BANKR_API_KEY, IOU stored for settlement later."
                : "Queued — settles on chain via Bankr Wallet API the moment $MINE deploys."}
        </div>
        {isLive && status.res.mint.txHash && (
          <div className="text-xs text-[color:var(--muted)] break-all font-mono">
            tx:{" "}
            <a
              href={`https://basescan.org/tx/${status.res.mint.txHash}`}
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              {status.res.mint.txHash}
            </a>
          </div>
        )}
        {!isLive && status.res.queuedId && (
          <div className="text-xs text-[color:var(--muted)] break-all font-mono">
            IOU: {status.res.queuedId} · pow: {shortHash(m.hash)}
          </div>
        )}
        <div className="text-xs text-[color:var(--muted)] font-mono">
          next reward: {status.res.stats.nextReward} {TOKEN_SYMBOL} · total
          mints: {status.res.stats.mintCount}
        </div>
        {tweetUrl && (
          <a
            href={tweetUrl}
            target="_blank"
            rel="noreferrer"
            className="btn btn-ghost mt-1"
          >
            tweet your mint ↗
          </a>
        )}
      </div>
    );
  }
  return <div className="text-sm font-mono text-red-600">error: {status.message}</div>;
}
