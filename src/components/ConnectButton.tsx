"use client";

import { useCallback, useEffect, useState } from "react";
import {
  useConnect,
  useConnection,
  useDisconnect,
  useChainId,
  useSwitchChain,
} from "wagmi";
import type { Connector } from "wagmi";
import { TARGET_CHAIN } from "@/lib/wagmi";
import { toChecksumAddress } from "@/lib/address";

function shortAddr(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function connectorIcon(c: Connector): string {
  if (c.icon) return c.icon;
  const id = c.id.toLowerCase();
  const name = c.name.toLowerCase();
  if (id.includes("metamask") || name.includes("metamask")) return "🦊";
  if (id.includes("coinbase") || name.includes("coinbase")) return "🔵";
  if (id.includes("walletconnect") || name.includes("walletconnect"))
    return "🔗";
  if (id.includes("injected") || name.includes("injected")) return "💼";
  return "👛";
}

export function ConnectButton() {
  const conn = useConnection();
  const chainId = useChainId();
  const { connectors, connect, status: connectStatus, error } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, status: switchStatus } = useSwitchChain();
  const [modalOpen, setModalOpen] = useState(false);

  const closeModal = useCallback(() => setModalOpen(false), []);

  useEffect(() => {
    if (!modalOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeModal();
    }
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [modalOpen, closeModal]);

  // No explicit close-on-connect effect needed: once `conn.isConnected`
  // flips, the early return below renders the connected state and the
  // modal naturally unmounts.

  if (conn.isConnected && conn.address) {
    const wrongChain = chainId !== TARGET_CHAIN.id;
    const display = toChecksumAddress(conn.address);

    return (
      <div className="flex items-center gap-2 flex-wrap">
        {wrongChain ? (
          <button
            type="button"
            onClick={() => switchChain({ chainId: TARGET_CHAIN.id })}
            className="btn btn-accent"
            disabled={switchStatus === "pending"}
          >
            {switchStatus === "pending"
              ? "Switching…"
              : `Switch to ${TARGET_CHAIN.name}`}
          </button>
        ) : (
          <span className="font-mono text-xs px-3 py-1.5 rounded-md border border-[color:var(--border)] bg-[color:var(--surface-muted)]">
            {shortAddr(display)}
          </span>
        )}
        <button
          type="button"
          onClick={() => disconnect()}
          className="btn btn-ghost"
        >
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setModalOpen(true)}
        className="btn btn-accent"
      >
        Connect wallet
      </button>
      {modalOpen ? (
        <ConnectModal
          connectors={connectors as readonly Connector[]}
          onClose={closeModal}
          onPick={(c) => connect({ connector: c })}
          pending={connectStatus === "pending"}
          error={error?.message ?? null}
        />
      ) : null}
    </>
  );
}

type ConnectModalProps = {
  connectors: readonly Connector[];
  onClose: () => void;
  onPick: (c: Connector) => void;
  pending: boolean;
  error: string | null;
};

function ConnectModal({
  connectors,
  onClose,
  onPick,
  pending,
  error,
}: ConnectModalProps) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="connect-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm cursor-default"
      />
      {/* Card */}
      <div
        className="relative w-full max-w-sm rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[color:var(--border)]">
          <div>
            <h2
              id="connect-modal-title"
              className="text-base font-semibold tracking-tight"
            >
              Connect a wallet
            </h2>
            <p className="text-xs text-[color:var(--muted)] font-mono mt-0.5">
              Network: {TARGET_CHAIN.name}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-[color:var(--muted)] hover:text-[color:var(--foreground)] text-xl leading-none w-8 h-8 flex items-center justify-center rounded hover:bg-[color:var(--surface-muted)]"
          >
            ×
          </button>
        </div>

        <div className="px-3 py-3 flex flex-col gap-1">
          {connectors.length === 0 ? (
            <div className="text-sm text-[color:var(--muted)] px-3 py-6 text-center">
              No wallet detected. Install MetaMask or Coinbase Wallet, then
              refresh.
            </div>
          ) : (
            connectors.map((c) => (
              <button
                key={c.uid}
                type="button"
                onClick={() => onPick(c)}
                disabled={pending}
                className="flex items-center gap-3 px-3 py-3 rounded-lg border border-transparent hover:border-[color:var(--border)] hover:bg-[color:var(--surface-muted)] transition disabled:opacity-60 disabled:cursor-not-allowed text-left"
              >
                <span className="text-2xl w-8 h-8 flex items-center justify-center rounded-md bg-[color:var(--surface-muted)] border border-[color:var(--border)]">
                  {connectorIcon(c)}
                </span>
                <span className="flex-1 font-medium text-sm">{c.name}</span>
                {pending ? (
                  <span className="text-xs font-mono text-[color:var(--muted)]">
                    …
                  </span>
                ) : null}
              </button>
            ))
          )}
        </div>

        {error ? (
          <div className="px-5 pb-3 -mt-1">
            <div className="text-xs font-mono text-[color:var(--accent)] bg-[color:var(--accent-soft)] border border-[color:var(--accent)] rounded-md px-3 py-2 break-words">
              {error}
            </div>
          </div>
        ) : null}

        <div className="px-5 py-3 border-t border-[color:var(--border)] text-[11px] text-[color:var(--muted)] font-mono leading-relaxed">
          By connecting, you agree that signatures are used only to claim
          previously mined $MINE. We never send transactions on your behalf.
        </div>
      </div>
    </div>
  );
}
