/**
 * Wagmi config + Reown AppKit (Web3Modal v3) initialization.
 *
 * The wagmi config is constructed via `WagmiAdapter` so AppKit and wagmi
 * share the same connector/transport/storage layer. The actual modal
 * (wallet picker, dark theme, "What is a Wallet?" panel) is wired up by
 * `createAppKit()` — which we call from `initAppKit()` once, on the
 * client only, after hydration.
 *
 * Public API kept stable for the rest of the app:
 *   - TARGET_CHAIN
 *   - getWagmiConfig()
 *   - initAppKit()
 *   - HAS_WALLETCONNECT_PROJECT_ID
 */
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { createAppKit } from "@reown/appkit/react";
import { base, baseSepolia } from "wagmi/chains";
import type { Chain } from "wagmi/chains";

import { TOKEN_NAME } from "./constants";

const TARGET_CHAIN_ID = Number(
  process.env.NEXT_PUBLIC_MINE_CHAIN_ID ?? base.id,
);

export const TARGET_CHAIN: Chain =
  TARGET_CHAIN_ID === baseSepolia.id ? baseSepolia : base;

// AppKit refuses to render without a projectId. We still build the wagmi
// config without one so the page renders during SSR/build; the Connect
// button surfaces the missing-id case visually.
const projectId =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID?.trim() ?? "";

export const HAS_WALLETCONNECT_PROJECT_ID = projectId.length > 0;

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://bankr-miner.vercel.app";

const networks = [TARGET_CHAIN] as const;

let cachedAdapter: WagmiAdapter | null = null;
let appKitInitialized = false;

function getAdapter() {
  if (!cachedAdapter) {
    cachedAdapter = new WagmiAdapter({
      networks: [...networks],
      projectId: projectId || "00000000000000000000000000000000",
      ssr: true,
    });
  }
  return cachedAdapter;
}

export function getWagmiConfig() {
  return getAdapter().wagmiConfig;
}

export function initAppKit() {
  if (appKitInitialized) return;
  if (typeof window === "undefined") return;
  if (!HAS_WALLETCONNECT_PROJECT_ID) return;
  appKitInitialized = true;
  createAppKit({
    adapters: [getAdapter()],
    networks: [...networks],
    projectId,
    defaultNetwork: TARGET_CHAIN,
    metadata: {
      name: TOKEN_NAME,
      description: "CPU-mined ERC-20 on Base",
      url: siteUrl,
      icons: [`${siteUrl}/logo.png`],
    },
    themeMode: "dark",
    features: {
      analytics: false,
      email: false,
      socials: false,
      onramp: false,
      swaps: false,
    },
  });
}
