/**
 * Wagmi v3 configuration. Single Base chain (mainnet by default;
 * Base Sepolia if NEXT_PUBLIC_MINE_CHAIN_ID is 84532). Connectors:
 *   - injected (MetaMask + any EIP-1193 wallet)
 *   - Coinbase Wallet smart wallet
 *   - WalletConnect (only if NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is set)
 *
 * The config is built lazily on the client. We don't use SSR cookies for
 * the wallet state — the page renders an "unconnected" shell on the
 * server, then wagmi hydrates from localStorage on the client.
 */
import { http, createConfig, createStorage } from "wagmi";
import { base, baseSepolia } from "wagmi/chains";
import {
  coinbaseWallet,
  injected,
  walletConnect,
} from "wagmi/connectors";

import { TOKEN_NAME } from "./constants";

let cachedConfig: ReturnType<typeof buildConfig> | null = null;

const TARGET_CHAIN_ID = Number(
  process.env.NEXT_PUBLIC_MINE_CHAIN_ID ?? base.id,
);

export const TARGET_CHAIN =
  TARGET_CHAIN_ID === baseSepolia.id ? baseSepolia : base;

function buildConfig() {
  const wcProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;

  const connectors = [
    injected({ shimDisconnect: true }),
    coinbaseWallet({
      appName: TOKEN_NAME,
      preference: "all",
    }),
    ...(wcProjectId
      ? [
          walletConnect({
            projectId: wcProjectId,
            metadata: {
              name: TOKEN_NAME,
              description: "CPU-mined ERC-20 on Base",
              url:
                process.env.NEXT_PUBLIC_SITE_URL ??
                "https://bankr-miner.app",
              icons: ["/logo.png"],
            },
            showQrModal: true,
          }),
        ]
      : []),
  ];

  // Narrow at the call site so wagmi infers a single-chain tuple,
  // sidestepping the union-of-chains transport key problem.
  if (TARGET_CHAIN.id === baseSepolia.id) {
    return createConfig({
      chains: [baseSepolia] as const,
      connectors,
      transports: { [baseSepolia.id]: http() },
      storage: persistentStorage(),
      ssr: true,
    });
  }
  return createConfig({
    chains: [base] as const,
    connectors,
    transports: { [base.id]: http() },
    storage: persistentStorage(),
    ssr: true,
  });
}

function persistentStorage() {
  return typeof window === "undefined"
    ? createStorage({
        storage: {
          getItem: () => null,
          setItem: () => {},
          removeItem: () => {},
        },
      })
    : createStorage({ storage: window.localStorage });
}

export function getWagmiConfig() {
  if (!cachedConfig) cachedConfig = buildConfig();
  return cachedConfig;
}
