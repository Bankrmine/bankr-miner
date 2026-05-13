"use client";

import { useState } from "react";
import {
  useConnect,
  useConnection,
  useDisconnect,
  useChainId,
  useSwitchChain,
} from "wagmi";
import { TARGET_CHAIN } from "@/lib/wagmi";
import { toChecksumAddress } from "@/lib/address";

function shortAddr(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function ConnectButton() {
  const conn = useConnection();
  const chainId = useChainId();
  const { connectors, connect, status: connectStatus, error } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, status: switchStatus } = useSwitchChain();
  const [pickerOpen, setPickerOpen] = useState(false);

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

  if (!pickerOpen) {
    return (
      <button
        type="button"
        onClick={() => setPickerOpen(true)}
        className="btn btn-accent"
      >
        Connect wallet
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2 items-start">
      <div className="text-xs text-[color:var(--muted)] font-mono">
        connect a wallet on {TARGET_CHAIN.name}
      </div>
      <div className="flex flex-wrap gap-2">
        {connectors.map((c) => (
          <button
            key={c.uid}
            type="button"
            onClick={() => connect({ connector: c })}
            className="btn btn-ghost"
            disabled={connectStatus === "pending"}
          >
            {c.name}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setPickerOpen(false)}
          className="btn btn-ghost text-[color:var(--muted)]"
        >
          Cancel
        </button>
      </div>
      {error ? (
        <div className="text-xs text-[color:var(--accent)] font-mono">
          {error.message}
        </div>
      ) : null}
    </div>
  );
}
