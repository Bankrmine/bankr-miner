"use client";

import { useSyncExternalStore } from "react";
import {
  useConnection,
  useDisconnect,
  useChainId,
  useSwitchChain,
} from "wagmi";
import { useAppKit } from "@reown/appkit/react";
import { HAS_WALLETCONNECT_PROJECT_ID, TARGET_CHAIN } from "@/lib/wagmi";
import { toChecksumAddress } from "@/lib/address";

function shortAddr(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

const subscribeNoop = () => () => {};
function useHasMounted(): boolean {
  // Tracks client-mount without scheduling a setState inside an effect, which
  // upsets `react-hooks/set-state-in-effect`.
  return useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  );
}

export function ConnectButton() {
  // AppKit registers its hooks only after `createAppKit()` runs, which is
  // a client-only effect inside `Providers`. During SSR/SSG we render a
  // placeholder so `useAppKit()` is never called on the server.
  const ready = useHasMounted();
  if (!ready) {
    return (
      <button
        type="button"
        disabled
        className="btn btn-accent opacity-50 cursor-default"
        aria-hidden="true"
      >
        Connect wallet
      </button>
    );
  }
  return <ConnectButtonClient />;
}

function ConnectButtonClient() {
  const conn = useConnection();
  const chainId = useChainId();
  const { disconnect } = useDisconnect();
  const { switchChain, status: switchStatus } = useSwitchChain();
  const { open } = useAppKit();

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
          <button
            type="button"
            onClick={() => open({ view: "Account" })}
            className="font-mono text-xs px-3 py-1.5 rounded-md border border-[color:var(--border)] bg-[color:var(--surface-muted)] hover:bg-[color:var(--surface)] cursor-pointer"
          >
            {shortAddr(display)}
          </button>
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

  if (!HAS_WALLETCONNECT_PROJECT_ID) {
    return (
      <button
        type="button"
        disabled
        className="btn btn-accent opacity-60 cursor-not-allowed"
        title="Set NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID to enable the wallet picker"
      >
        Wallet picker unavailable
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => open()}
      className="btn btn-accent"
    >
      Connect wallet
    </button>
  );
}
