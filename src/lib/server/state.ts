import {
  HALVING_CADENCE_MINTS,
  MAX_MINTS_PER_EPOCH_PER_WALLET,
  MINING_SUPPLY,
  eraForMintIndex,
  rewardForMintIndex,
} from "../constants";
import { decodeStored, getRedis } from "./redis";

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
const REDIS_PREFIX = "bankr-miner:v1";

const keys = {
  mintCount: `${REDIS_PREFIX}:mint-count`,
  totalMinted: `${REDIS_PREFIX}:total-minted`,
  mints: `${REDIS_PREFIX}:mints`,
  leaderboard: `${REDIS_PREFIX}:leaderboard`,
  walletTotals: (wallet: string) => `${REDIS_PREFIX}:wallet:${wallet}:totals`,
  epochCounts: (epoch: number) => `${REDIS_PREFIX}:epoch:${epoch}:counts`,
  usedNonces: (wallet: string, epoch: number) =>
    `${REDIS_PREFIX}:used-nonces:${wallet}:${epoch}`,
};

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

export async function getMintCount(): Promise<number> {
  const redis = getRedis();
  if (redis) {
    const count = await redis.get<number>(keys.mintCount);
    return Number(count ?? 0);
  }
  return loadStore().mints.length;
}

export async function getTotalMinted(): Promise<number> {
  const redis = getRedis();
  if (redis) {
    const total = await redis.get<number>(keys.totalMinted);
    return Number(total ?? 0);
  }
  const store = loadStore();
  let total = 0;
  for (const m of store.mints) total += m.reward;
  return total;
}

export async function getStats() {
  const mintCount = await getMintCount();
  const totalMinted = await getTotalMinted();
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

export async function epochMintCount(
  epoch: number,
  wallet: string,
): Promise<number> {
  const redis = getRedis();
  if (redis) {
    const count = await redis.hget<number>(keys.epochCounts(epoch), wallet);
    return Number(count ?? 0);
  }
  const store = loadStore();
  const epochMap = store.epochMintCounts.get(epoch);
  if (!epochMap) return 0;
  return epochMap.get(wallet) ?? 0;
}

export async function canMint(
  epoch: number,
  wallet: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if ((await getTotalMinted()) >= MINING_SUPPLY) {
    return { ok: false, reason: "mining supply exhausted" };
  }
  const count = await epochMintCount(epoch, wallet);
  if (count >= MAX_MINTS_PER_EPOCH_PER_WALLET) {
    return {
      ok: false,
      reason: `per-epoch mint cap reached (${MAX_MINTS_PER_EPOCH_PER_WALLET})`,
    };
  }
  return { ok: true };
}

export async function noncePreviouslyUsed(
  wallet: string,
  epoch: number,
  nonce: string,
): Promise<boolean> {
  const redis = getRedis();
  if (redis) {
    return (await redis.sismember(keys.usedNonces(wallet, epoch), nonce)) === 1;
  }
  return loadStore().usedNonces.has(`${wallet}:${epoch}:${nonce}`);
}

/**
 * Commit a verified solution to the state. Caller must have already
 * validated the proof of work and quota.
 */
export async function recordMint(args: {
  wallet: string;
  epoch: number;
  nonce: string;
  hash: string;
  txHash?: string;
}): Promise<MintRecord> {
  const redis = getRedis();
  if (redis) {
    const nonceKey = keys.usedNonces(args.wallet, args.epoch);
    const lockKey = `${nonceKey}:${args.nonce}`;
    const lock = await redis.set(lockKey, "1", { nx: true, ex: 24 * 60 * 60 });
    if (lock !== "OK") {
      throw new Error("nonce already claimed");
    }

    const mintCount = await redis.incr(keys.mintCount);
    const index = mintCount - 1;
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

    const balance = await redis.hincrbyfloat(
      keys.walletTotals(args.wallet),
      "balance",
      reward,
    );

    await redis
      .pipeline()
      .incrbyfloat(keys.totalMinted, reward)
      .sadd(nonceKey, args.nonce)
      .hincrby(keys.walletTotals(args.wallet), "mintCount", 1)
      .hincrby(keys.epochCounts(args.epoch), args.wallet, 1)
      .zadd(keys.leaderboard, { score: balance, member: args.wallet })
      .lpush(keys.mints, mint)
      .exec();

    return mint;
  }

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

export async function getLeaderboard(limit = 20) {
  const redis = getRedis();
  if (redis) {
    const wallets = await redis.zrange<string[]>(
      keys.leaderboard,
      0,
      limit - 1,
      { rev: true },
    );
    const rows = await Promise.all(
      wallets.map(async (wallet) => {
        const totals = await redis.hgetall<{
          balance?: number | string;
          mintCount?: number | string;
        }>(keys.walletTotals(wallet));
        return {
          wallet,
          balance: Number(totals?.balance ?? 0),
          mintCount: Number(totals?.mintCount ?? 0),
        };
      }),
    );
    return rows;
  }

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

export async function getRecentMints(limit = 50): Promise<MintRecord[]> {
  const redis = getRedis();
  if (redis) {
    const values = await redis.lrange<unknown>(keys.mints, 0, limit - 1);
    return values
      .map((value) => decodeStored<MintRecord>(value))
      .filter((mint): mint is MintRecord => mint !== null);
  }

  const store = loadStore();
  return store.mints.slice(-limit).reverse();
}

export async function getWalletBalance(wallet: string): Promise<{
  balance: number;
  mintCount: number;
}> {
  const redis = getRedis();
  if (redis) {
    const totals = await redis.hgetall<{
      balance?: number | string;
      mintCount?: number | string;
    }>(keys.walletTotals(wallet));
    return {
      balance: Number(totals?.balance ?? 0),
      mintCount: Number(totals?.mintCount ?? 0),
    };
  }

  return (
    loadStore().totalsByWallet.get(wallet) ?? { balance: 0, mintCount: 0 }
  );
}
