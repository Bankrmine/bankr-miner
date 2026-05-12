/**
 * Process-local mining state.
 *
 * Phase 1 keeps everything in memory so we can demo without provisioning
 * a database. The `globalThis` cache survives Next.js dev-mode HMR
 * reloads so refreshing the page during development doesn't reset the
 * mine. Phase 2 will swap this out for Postgres / Vercel KV.
 */
import {
  HALVING_CADENCE_MINTS,
  MAX_MINTS_PER_EPOCH_PER_WALLET,
  MINING_SUPPLY,
  eraForMintIndex,
  rewardForMintIndex,
} from "../constants";

export type MintRecord = {
  /** Ordinal of this mint across the whole chain (0-based). */
  index: number;
  /** Lowercase address that received the reward. */
  wallet: string;
  /** Hex-encoded nonce that solved the challenge. */
  nonce: string;
  /** Hex-encoded keccak256 hash that proved the work. */
  hash: string;
  /** Era at the time of mint (1-indexed). */
  era: number;
  /** $MINE reward credited for this mint. */
  reward: number;
  /** Timestamp (ms). */
  timestamp: number;
  /** Optional Bankr Wallet API tx hash, when wired in Phase 2. */
  txHash?: string;
};

type Store = {
  mints: MintRecord[];
  /** Aggregate reward per wallet for leaderboard. */
  totalsByWallet: Map<string, { balance: number; mintCount: number }>;
  /** epoch -> wallet -> count of mints this epoch (anti-spam). */
  epochMintCounts: Map<number, Map<string, number>>;
  /** Set of nonces we've already accepted (anti-replay), keyed by
   *  `${wallet}:${epoch}:${nonce}`. */
  usedNonces: Set<string>;
};

const STATE_KEY = "__bankr_miner_state__";

function loadStore(): Store {
  const g = globalThis as unknown as Record<string, unknown>;
  const existing = g[STATE_KEY] as Store | undefined;
  if (existing) return existing;
  const fresh: Store = {
    mints: [],
    totalsByWallet: new Map(),
    epochMintCounts: new Map(),
    usedNonces: new Set(),
  };
  g[STATE_KEY] = fresh;
  return fresh;
}

export function getMintCount(): number {
  return loadStore().mints.length;
}

export function getTotalMinted(): number {
  const store = loadStore();
  let total = 0;
  for (const m of store.mints) total += m.reward;
  return total;
}

export function getStats() {
  const store = loadStore();
  const mintCount = store.mints.length;
  const totalMinted = getTotalMinted();
  const era = eraForMintIndex(mintCount);
  const nextReward = rewardForMintIndex(mintCount);
  const remainingSupply = Math.max(0, MINING_SUPPLY - totalMinted);
  const mintsThisEra = mintCount % HALVING_CADENCE_MINTS;
  const mintsUntilHalving = HALVING_CADENCE_MINTS - mintsThisEra;
  return {
    mintCount,
    totalMinted,
    remainingSupply,
    miningSupply: MINING_SUPPLY,
    era,
    nextReward,
    mintsThisEra,
    mintsUntilHalving,
    halvingCadence: HALVING_CADENCE_MINTS,
  };
}

export function epochMintCount(epoch: number, wallet: string): number {
  const store = loadStore();
  const epochMap = store.epochMintCounts.get(epoch);
  if (!epochMap) return 0;
  return epochMap.get(wallet) ?? 0;
}

export function canMint(
  epoch: number,
  wallet: string,
): { ok: true } | { ok: false; reason: string } {
  if (getTotalMinted() >= MINING_SUPPLY) {
    return { ok: false, reason: "mining supply exhausted" };
  }
  const count = epochMintCount(epoch, wallet);
  if (count >= MAX_MINTS_PER_EPOCH_PER_WALLET) {
    return {
      ok: false,
      reason: `per-epoch mint cap reached (${MAX_MINTS_PER_EPOCH_PER_WALLET})`,
    };
  }
  return { ok: true };
}

export function noncePreviouslyUsed(
  wallet: string,
  epoch: number,
  nonce: string,
): boolean {
  return loadStore().usedNonces.has(`${wallet}:${epoch}:${nonce}`);
}

/**
 * Commit a verified solution to the state. Caller must have already
 * validated the proof of work and quota.
 */
export function recordMint(args: {
  wallet: string;
  epoch: number;
  nonce: string;
  hash: string;
  txHash?: string;
}): MintRecord {
  const store = loadStore();
  const index = store.mints.length;
  const reward = rewardForMintIndex(index);
  const era = eraForMintIndex(index);
  const mint: MintRecord = {
    index,
    wallet: args.wallet,
    nonce: args.nonce,
    hash: args.hash,
    era,
    reward,
    timestamp: Date.now(),
    txHash: args.txHash,
  };
  store.mints.push(mint);
  store.usedNonces.add(`${args.wallet}:${args.epoch}:${args.nonce}`);

  const totals = store.totalsByWallet.get(args.wallet) ?? {
    balance: 0,
    mintCount: 0,
  };
  totals.balance += reward;
  totals.mintCount += 1;
  store.totalsByWallet.set(args.wallet, totals);

  let epochMap = store.epochMintCounts.get(args.epoch);
  if (!epochMap) {
    epochMap = new Map();
    store.epochMintCounts.set(args.epoch, epochMap);
  }
  epochMap.set(args.wallet, (epochMap.get(args.wallet) ?? 0) + 1);

  return mint;
}

export function getLeaderboard(limit = 20) {
  const store = loadStore();
  return Array.from(store.totalsByWallet.entries())
    .map(([wallet, totals]) => ({
      wallet,
      balance: totals.balance,
      mintCount: totals.mintCount,
    }))
    .sort((a, b) => b.balance - a.balance)
    .slice(0, limit);
}

export function getRecentMints(limit = 50): MintRecord[] {
  const store = loadStore();
  return store.mints.slice(-limit).reverse();
}

export function getWalletBalance(wallet: string): {
  balance: number;
  mintCount: number;
} {
  return (
    loadStore().totalsByWallet.get(wallet) ?? { balance: 0, mintCount: 0 }
  );
}
