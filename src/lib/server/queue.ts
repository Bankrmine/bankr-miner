import { decodeStored, getRedis } from "./redis";

export type QueuedReward = {
  /** Lowercase address that earned the IOU. */
  wallet: string;
  /** Server-side mint index this IOU corresponds to. */
  mintIndex: number;
  /** $MINE amount queued. */
  amount: number;
  /** Era at the time the IOU was created. */
  era: number;
  /** keccak256 PoW hash that earned this reward. */
  pow: string;
  /** Timestamp (ms) the IOU was queued. */
  queuedAt: number;
  /** Stable ID, returned to the client so they can reference their IOU. */
  id: string;
  /** On-chain settlement tx hash if this IOU was settled inline. */
  settlementTxHash?: string;
  /** Timestamp (ms) the IOU was settled, if any. */
  settlementAt?: number;
};

type Bucket = {
  totalQueued: number;
  totalSettled: number;
  count: number;
  countSettled: number;
  firstQueuedAt: number;
  lastQueuedAt: number;
  rewards: QueuedReward[];
};

type Store = {
  /** Wallet → queued rewards bucket. */
  byWallet: Map<string, Bucket>;
  /** All queued rewards in insertion order. */
  all: QueuedReward[];
  /** Whether the queue has already been settled (post-launch). */
  settled: boolean;
  /** When the queue was settled, if any. */
  settledAt: number | null;
};

const KEY = "__bankr_miner_queue__";
const REDIS_PREFIX = "bankr-miner:v1:queue";

const keys = {
  allIds: `${REDIS_PREFIX}:all-ids`,
  wallets: `${REDIS_PREFIX}:wallets`,
  summary: `${REDIS_PREFIX}:summary`,
  byId: (id: string) => `${REDIS_PREFIX}:iou:${id}`,
  walletRewards: (wallet: string) => `${REDIS_PREFIX}:wallet:${wallet}:rewards`,
  walletSummary: (wallet: string) => `${REDIS_PREFIX}:wallet:${wallet}:summary`,
};

function load(): Store {
  const g = globalThis as unknown as Record<string, unknown>;
  let store = g[KEY] as Store | undefined;
  if (!store) {
    store = {
      byWallet: new Map(),
      all: [],
      settled: false,
      settledAt: null,
    };
    g[KEY] = store;
  }
  return store;
}

function makeId(wallet: string, mintIndex: number): string {
  return `q_${mintIndex}_${wallet.slice(2, 8)}`;
}

export async function enqueueReward(args: {
  wallet: string;
  mintIndex: number;
  amount: number;
  era: number;
  pow: string;
  /** Optional inline settlement (when the mint also dispatched a real transfer). */
  settlementTxHash?: string;
}): Promise<QueuedReward> {
  const redis = getRedis();
  if (redis) {
    const id = makeId(args.wallet, args.mintIndex);
    const existing = await redis.get<unknown>(keys.byId(id));
    const parsed = decodeStored<QueuedReward>(existing);
    if (parsed) return parsed;

    const now = Date.now();
    const reward: QueuedReward = {
      wallet: args.wallet,
      mintIndex: args.mintIndex,
      amount: args.amount,
      era: args.era,
      pow: args.pow,
      queuedAt: now,
      id,
      settlementTxHash: args.settlementTxHash,
      settlementAt: args.settlementTxHash ? now : undefined,
    };
    const summary = keys.walletSummary(args.wallet);
    const pendingAmount = args.settlementTxHash ? 0 : args.amount;
    const pendingCount = args.settlementTxHash ? 0 : 1;

    await redis
      .pipeline()
      .set(keys.byId(id), reward, { nx: true })
      .rpush(keys.allIds, id)
      .rpush(keys.walletRewards(args.wallet), id)
      .sadd(keys.wallets, args.wallet)
      .hincrbyfloat(keys.summary, "totalQueued", args.amount)
      .hincrbyfloat(
        keys.summary,
        "totalSettled",
        args.settlementTxHash ? args.amount : 0,
      )
      .hincrbyfloat(keys.summary, "totalPending", pendingAmount)
      .hincrby(keys.summary, "totalIOUs", 1)
      .hincrby(keys.summary, "iousSettled", args.settlementTxHash ? 1 : 0)
      .hincrby(keys.summary, "iousPending", pendingCount)
      .hset(keys.summary, { newestQueuedAt: now })
      .hsetnx(keys.summary, "oldestQueuedAt", now.toString())
      .hincrbyfloat(summary, "totalQueued", args.amount)
      .hincrbyfloat(
        summary,
        "totalSettled",
        args.settlementTxHash ? args.amount : 0,
      )
      .hincrbyfloat(summary, "totalPending", pendingAmount)
      .hincrby(summary, "count", 1)
      .hincrby(summary, "countSettled", args.settlementTxHash ? 1 : 0)
      .hincrby(summary, "countPending", pendingCount)
      .hset(summary, { lastQueuedAt: now })
      .hsetnx(summary, "firstQueuedAt", now.toString())
      .exec();

    return reward;
  }

  const store = load();
  const now = Date.now();
  const reward: QueuedReward = {
    wallet: args.wallet,
    mintIndex: args.mintIndex,
    amount: args.amount,
    era: args.era,
    pow: args.pow,
    queuedAt: now,
    id: makeId(args.wallet, args.mintIndex),
    settlementTxHash: args.settlementTxHash,
    settlementAt: args.settlementTxHash ? now : undefined,
  };
  store.all.push(reward);
  const bucket = store.byWallet.get(args.wallet) ?? {
    totalQueued: 0,
    totalSettled: 0,
    count: 0,
    countSettled: 0,
    firstQueuedAt: reward.queuedAt,
    lastQueuedAt: reward.queuedAt,
    rewards: [],
  };
  bucket.totalQueued += reward.amount;
  bucket.count += 1;
  if (reward.settlementTxHash) {
    bucket.totalSettled += reward.amount;
    bucket.countSettled += 1;
  }
  bucket.lastQueuedAt = reward.queuedAt;
  bucket.rewards.push(reward);
  store.byWallet.set(args.wallet, bucket);
  return reward;
}

export async function getQueueForWallet(wallet: string): Promise<{
  wallet: string;
  totalQueued: number;
  totalPending: number;
  totalSettled: number;
  count: number;
  countSettled: number;
  countPending: number;
  rewards: QueuedReward[];
  firstQueuedAt: number | null;
  lastQueuedAt: number | null;
}> {
  const redis = getRedis();
  if (redis) {
    const summary = await redis.hgetall<Record<string, string | number>>(
      keys.walletSummary(wallet),
    );
    if (!summary) {
      return {
        wallet,
        totalQueued: 0,
        totalPending: 0,
        totalSettled: 0,
        count: 0,
        countSettled: 0,
        countPending: 0,
        rewards: [],
        firstQueuedAt: null,
        lastQueuedAt: null,
      };
    }
    const ids = await redis.lrange<string>(
      keys.walletRewards(wallet),
      0,
      -1,
    );
    const rewards = (
      await Promise.all(
        ids.map(async (id) =>
          decodeStored<QueuedReward>(await redis.get(keys.byId(id))),
        ),
      )
    ).filter((reward): reward is QueuedReward => reward !== null);

    return {
      wallet,
      totalQueued: Number(summary.totalQueued ?? 0),
      totalPending: Number(summary.totalPending ?? 0),
      totalSettled: Number(summary.totalSettled ?? 0),
      count: Number(summary.count ?? 0),
      countSettled: Number(summary.countSettled ?? 0),
      countPending: Number(summary.countPending ?? 0),
      rewards: rewards.reverse(),
      firstQueuedAt:
        summary.firstQueuedAt === undefined
          ? null
          : Number(summary.firstQueuedAt),
      lastQueuedAt:
        summary.lastQueuedAt === undefined
          ? null
          : Number(summary.lastQueuedAt),
    };
  }

  const bucket = load().byWallet.get(wallet);
  if (!bucket) {
    return {
      wallet,
      totalQueued: 0,
      totalPending: 0,
      totalSettled: 0,
      count: 0,
      countSettled: 0,
      countPending: 0,
      rewards: [],
      firstQueuedAt: null,
      lastQueuedAt: null,
    };
  }
  return {
    wallet,
    totalQueued: bucket.totalQueued,
    totalSettled: bucket.totalSettled,
    totalPending: bucket.totalQueued - bucket.totalSettled,
    count: bucket.count,
    countSettled: bucket.countSettled,
    countPending: bucket.count - bucket.countSettled,
    rewards: bucket.rewards.slice().reverse(),
    firstQueuedAt: bucket.firstQueuedAt,
    lastQueuedAt: bucket.lastQueuedAt,
  };
}

export async function getQueueSummary(): Promise<{
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
  settledAt: number | null;
}> {
  const redis = getRedis();
  if (redis) {
    const [summary, uniqueMiners] = await Promise.all([
      redis.hgetall<Record<string, string | number>>(keys.summary),
      redis.exec<number>(["SCARD", keys.wallets]),
    ]);
    return {
      totalQueued: Number(summary?.totalQueued ?? 0),
      totalSettled: Number(summary?.totalSettled ?? 0),
      totalPending: Number(summary?.totalPending ?? 0),
      totalIOUs: Number(summary?.totalIOUs ?? 0),
      iousSettled: Number(summary?.iousSettled ?? 0),
      iousPending: Number(summary?.iousPending ?? 0),
      uniqueMiners,
      oldestQueuedAt:
        summary?.oldestQueuedAt === undefined
          ? null
          : Number(summary.oldestQueuedAt),
      newestQueuedAt:
        summary?.newestQueuedAt === undefined
          ? null
          : Number(summary.newestQueuedAt),
      settled: summary?.settled === "true",
      settledAt:
        summary?.settledAt === undefined ? null : Number(summary.settledAt),
    };
  }

  const store = load();
  let oldest: number | null = null;
  let newest: number | null = null;
  let total = 0;
  let totalSettled = 0;
  let iousSettled = 0;
  for (const r of store.all) {
    total += r.amount;
    if (r.settlementTxHash) {
      totalSettled += r.amount;
      iousSettled += 1;
    }
    if (oldest === null || r.queuedAt < oldest) oldest = r.queuedAt;
    if (newest === null || r.queuedAt > newest) newest = r.queuedAt;
  }
  return {
    totalQueued: total,
    totalSettled,
    totalPending: total - totalSettled,
    totalIOUs: store.all.length,
    iousSettled,
    iousPending: store.all.length - iousSettled,
    uniqueMiners: store.byWallet.size,
    oldestQueuedAt: oldest,
    newestQueuedAt: newest,
    settled: store.settled,
    settledAt: store.settledAt,
  };
}

/**
 * Mark an existing IOU as settled (used by the out-of-band settlement
 * script when it batch-transfers post-launch). Returns true if the IOU
 * was found and updated.
 */
export async function markIouSettled(
  wallet: string,
  mintIndex: number,
  txHash: string,
): Promise<boolean> {
  const redis = getRedis();
  if (redis) {
    const id = makeId(wallet, mintIndex);
    const current = decodeStored<QueuedReward>(await redis.get(keys.byId(id)));
    if (!current || current.settlementTxHash) return false;

    const settled: QueuedReward = {
      ...current,
      settlementTxHash: txHash,
      settlementAt: Date.now(),
    };
    await redis
      .pipeline()
      .set(keys.byId(id), settled)
      .hincrbyfloat(keys.summary, "totalSettled", current.amount)
      .hincrbyfloat(keys.summary, "totalPending", -current.amount)
      .hincrby(keys.summary, "iousSettled", 1)
      .hincrby(keys.summary, "iousPending", -1)
      .hincrbyfloat(keys.walletSummary(wallet), "totalSettled", current.amount)
      .hincrbyfloat(keys.walletSummary(wallet), "totalPending", -current.amount)
      .hincrby(keys.walletSummary(wallet), "countSettled", 1)
      .hincrby(keys.walletSummary(wallet), "countPending", -1)
      .exec();
    return true;
  }

  const store = load();
  const bucket = store.byWallet.get(wallet);
  if (!bucket) return false;
  for (const r of bucket.rewards) {
    if (r.mintIndex === mintIndex && !r.settlementTxHash) {
      r.settlementTxHash = txHash;
      r.settlementAt = Date.now();
      bucket.totalSettled += r.amount;
      bucket.countSettled += 1;
      return true;
    }
  }
  return false;
}

/**
 * Mark every queued IOU as settled. Called once after the deployer
 * batch-transfers $MINE to all queued wallets via `/wallet/transfer`.
 * Phase 3 will record per-IOU tx hashes here.
 */
export async function markQueueSettled(): Promise<void> {
  const redis = getRedis();
  if (redis) {
    await redis.hset(keys.summary, {
      settled: "true",
      settledAt: Date.now(),
    });
    return;
  }

  const store = load();
  store.settled = true;
  store.settledAt = Date.now();
}
