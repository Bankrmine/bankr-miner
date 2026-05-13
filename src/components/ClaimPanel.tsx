"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  useConnection,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import type { Hex } from "viem";
import mineTokenArtifact from "@/lib/contracts/MineToken.json";
import { TARGET_CHAIN } from "@/lib/wagmi";
import {
  MIN_CLAIM_AMOUNT,
  TOKEN_SYMBOL,
} from "@/lib/constants";
import { ConnectButton } from "./ConnectButton";

type ClaimState = {
  configured: boolean;
  tokenAddress: string | null;
  claimSignerAddress: string | null;
  chainId: number;
  minClaim: number;
  tokenDecimals: number;
  wallet?: string;
  totalQueuedTokens?: number;
  totalClaimedWei?: string;
  availableTokens?: number;
  availableWei?: string;
  lockedWei?: string;
  pending?: {
    nonce: string;
    amountWei: string;
    issuedAt: number;
  } | null;
};

type ClaimSignature = {
  ok: true;
  wallet: string;
  amountTokens: number;
  amountWei: string;
  nonce: Hex;
  signature: Hex;
  chainId: number;
  tokenAddress: Hex;
  expiresAt: number;
};

const FMT = new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 });

export function ClaimPanel() {
  const conn = useConnection();
  const wallet =
    conn.isConnected && conn.address ? conn.address.toLowerCase() : null;
  const [state, setState] = useState<ClaimState | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [signing, setSigning] = useState(false);
  const [signError, setSignError] = useState<string | null>(null);
  const [activeSig, setActiveSig] = useState<ClaimSignature | null>(null);

  const tokenAddress = state?.tokenAddress as `0x${string}` | undefined;

  // Fetch claim state from backend
  useEffect(() => {
    let aborted = false;
    const url = wallet ? `/api/claim?wallet=${wallet}` : `/api/claim`;
    fetch(url)
      .then((r) => r.json())
      .then((data: ClaimState) => {
        if (!aborted) setState(data);
      })
      .catch(() => {});
    return () => {
      aborted = true;
    };
  }, [wallet, refreshTick]);

  // Read on-chain balance for the connected wallet (if token deployed)
  const balanceRead = useReadContract({
    address: tokenAddress,
    abi: mineTokenArtifact.abi,
    functionName: "balanceOf",
    args: wallet ? [wallet as `0x${string}`] : undefined,
    query: { enabled: Boolean(tokenAddress && wallet) },
  });

  const onChainBalanceTokens = useMemo(() => {
    if (!balanceRead.data) return 0;
    const wei = balanceRead.data as bigint;
    const denom = 10n ** BigInt(state?.tokenDecimals ?? 18);
    const whole = wei / denom;
    const frac = wei % denom;
    return Number(whole) + Number(frac) / Number(denom);
  }, [balanceRead.data, state?.tokenDecimals]);

  const requestSig = useCallback(async () => {
    if (!wallet) return;
    setSigning(true);
    setSignError(null);
    try {
      const res = await fetch("/api/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setSignError(json.message ?? json.error ?? `claim failed (${res.status})`);
        setSigning(false);
        return;
      }
      setActiveSig(json as ClaimSignature);
    } catch (err) {
      setSignError(err instanceof Error ? err.message : String(err));
    } finally {
      setSigning(false);
    }
  }, [wallet]);

  const writeContract = useWriteContract();
  const txReceipt = useWaitForTransactionReceipt({
    hash: writeContract.data,
    query: { enabled: Boolean(writeContract.data) },
  });

  const sendClaim = useCallback(() => {
    if (!activeSig || !tokenAddress) return;
    writeContract.writeContract({
      address: tokenAddress,
      abi: mineTokenArtifact.abi,
      functionName: "claim",
      args: [BigInt(activeSig.amountWei), activeSig.nonce, activeSig.signature],
      chainId: TARGET_CHAIN.id,
    });
  }, [activeSig, tokenAddress, writeContract]);

  // After confirmation, ping /api/claim/confirm so the server bumps totalClaimed
  useEffect(() => {
    if (
      !activeSig ||
      !wallet ||
      !writeContract.data ||
      txReceipt.status !== "success"
    ) {
      return;
    }
    let aborted = false;
    fetch("/api/claim/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        wallet,
        nonce: activeSig.nonce,
        txHash: writeContract.data,
      }),
    }).finally(() => {
      if (!aborted) {
        setActiveSig(null);
        setRefreshTick((t) => t + 1);
        balanceRead.refetch();
      }
    });
    return () => {
      aborted = true;
    };
  }, [activeSig, balanceRead, txReceipt.status, wallet, writeContract.data]);

  const notConnected = !wallet;
  const notConfigured = !state?.configured;

  return (
    <section className="terminal p-5 space-y-3">
      <div className="flex items-center justify-between">
        <div className="label-kbd">claim ${TOKEN_SYMBOL} on-chain</div>
        <div className="text-[11px] text-[color:var(--muted)] font-mono">
          {TARGET_CHAIN.name}
        </div>
      </div>

      {notConnected ? (
        <div className="space-y-2">
          <p className="text-sm text-[color:var(--muted)] leading-6">
            Connect your Base wallet to see how much ${TOKEN_SYMBOL} you have
            accumulated and claim on-chain once you cross the{" "}
            {MIN_CLAIM_AMOUNT} ${TOKEN_SYMBOL} threshold.
          </p>
          <ConnectButton />
        </div>
      ) : notConfigured ? (
        <div className="text-sm text-[color:var(--muted)] leading-6 space-y-1">
          <div>
            On-chain claims aren&apos;t live yet. The operator still needs to:
          </div>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              Deploy <code>MineToken.sol</code> on Base and set{" "}
              <code>MINE_TOKEN_ADDRESS</code>.
            </li>
            <li>
              Set <code>CLAIM_SIGNER_PRIVATE_KEY</code> on the backend.
            </li>
          </ul>
          <div className="text-[11px] mt-1">
            Your IOUs are safe and will become claimable as soon as those env
            vars land.
          </div>
        </div>
      ) : (
        <ClaimBody
          state={state}
          activeSig={activeSig}
          signing={signing}
          signError={signError}
          requestSig={requestSig}
          sendClaim={sendClaim}
          writeStatus={writeContract.status}
          writeError={writeContract.error}
          txHash={writeContract.data}
          txReceiptStatus={txReceipt.status}
          onChainBalanceTokens={onChainBalanceTokens}
        />
      )}
    </section>
  );
}

function ClaimBody(props: {
  state: ClaimState;
  activeSig: ClaimSignature | null;
  signing: boolean;
  signError: string | null;
  requestSig: () => void;
  sendClaim: () => void;
  writeStatus: ReturnType<typeof useWriteContract>["status"];
  writeError: ReturnType<typeof useWriteContract>["error"];
  txHash: Hex | undefined;
  txReceiptStatus: "pending" | "success" | "error";
  onChainBalanceTokens: number;
}) {
  const {
    state,
    activeSig,
    signing,
    signError,
    requestSig,
    sendClaim,
    writeStatus,
    writeError,
    txHash,
    txReceiptStatus,
    onChainBalanceTokens,
  } = props;
  const available = state.availableTokens ?? 0;
  const totalQueued = state.totalQueuedTokens ?? 0;
  const totalClaimedWei = state.totalClaimedWei ?? "0";
  const totalClaimedTokens = weiToWholeTokens(
    totalClaimedWei,
    state.tokenDecimals,
  );
  const canSign = available >= state.minClaim;
  const hasPending = Boolean(activeSig);

  return (
    <div className="space-y-3 text-sm font-mono">
      <Row label="mined (IOUs)" value={`${FMT.format(totalQueued)} ${TOKEN_SYMBOL}`} />
      <Row
        label="claimed on-chain"
        value={`${FMT.format(totalClaimedTokens)} ${TOKEN_SYMBOL}`}
      />
      <Row
        label="claimable now"
        value={`${FMT.format(available)} ${TOKEN_SYMBOL}`}
        accent
      />
      <Row
        label="wallet balance"
        value={`${FMT.format(onChainBalanceTokens)} ${TOKEN_SYMBOL}`}
      />

      {!hasPending ? (
        <div className="space-y-2">
          <button
            type="button"
            onClick={requestSig}
            disabled={!canSign || signing}
            className="btn btn-accent disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {signing
              ? "Requesting signature…"
              : canSign
                ? `▶ Claim ${FMT.format(available)} ${TOKEN_SYMBOL}`
                : `Need ${FMT.format(state.minClaim - available)} more ${TOKEN_SYMBOL} to claim`}
          </button>
          {signError ? (
            <div className="text-xs text-[color:var(--accent)] break-words">
              {signError}
            </div>
          ) : null}
          <div className="text-[11px] text-[color:var(--muted)] leading-5">
            Minimum {state.minClaim} {TOKEN_SYMBOL} per on-chain claim. Lower
            balances keep accruing as IOUs.
          </div>
        </div>
      ) : (
        <div className="space-y-2 border border-[color:var(--accent)]/40 rounded-md p-3 bg-[color:var(--accent)]/5">
          <div className="text-xs text-[color:var(--muted)]">
            backend signed a claim for{" "}
            <span className="text-[color:var(--foreground)]">
              {FMT.format(activeSig!.amountTokens)} {TOKEN_SYMBOL}
            </span>
            . submit it on-chain to mint:
          </div>
          <button
            type="button"
            onClick={sendClaim}
            disabled={writeStatus === "pending" || txReceiptStatus === "pending"}
            className="btn btn-accent disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {writeStatus === "pending"
              ? "Waiting for wallet…"
              : txReceiptStatus === "pending"
                ? "Confirming on Base…"
                : `Mint ${FMT.format(activeSig!.amountTokens)} ${TOKEN_SYMBOL} →`}
          </button>
          {txHash ? (
            <div className="text-[11px] break-all">
              tx:{" "}
              <a
                className="text-[color:var(--accent)]"
                href={`https://basescan.org/tx/${txHash}`}
                target="_blank"
                rel="noreferrer"
              >
                {txHash}
              </a>
            </div>
          ) : null}
          {writeError ? (
            <div className="text-xs text-[color:var(--accent)] break-words">
              {writeError.message}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[color:var(--border)] last:border-0 pb-2 last:pb-0">
      <span className="text-[color:var(--muted)]">{label}</span>
      <span
        className={
          accent ? "text-[color:var(--accent)] font-semibold" : "text-[color:var(--foreground)]"
        }
      >
        {value}
      </span>
    </div>
  );
}

function weiToWholeTokens(wei: string, decimals: number): number {
  try {
    const big = BigInt(wei);
    const denom = 10n ** BigInt(decimals);
    const whole = big / denom;
    const frac = big % denom;
    return Number(whole) + Number(frac) / Number(denom);
  } catch {
    return 0;
  }
}
