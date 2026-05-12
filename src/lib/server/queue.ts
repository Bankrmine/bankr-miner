/**
 * Queued-reward ledger.
 *
 * Until $MINE deploys on Base via Bankr, the verifier cannot dispatch a
 * real `/wallet/transfer`. Rather than fabricate a fake "0xmock…" tx
 * hash (which would lie to miners about a real on-chain credit), every
 * mint accrues into an in-memory IOU here. When the deployer wallet
 * activates Bankr Club and $MINE is launched, the same ledger is the
 * source of truth for batch-settling the queue via Bankr Wallet API.
 *
 * Phase 3 will swap the in-memory map for Postgres / Vercel KV; the
 * shape of the data does not change.
 */

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

export function enqueueReward(args: {
  wallet: string;
  mintIndex: number;
  amount: number;
  era: number;
  pow: string;
  /** Optional inline settlement (when the mint also dispatched a real transfer). */
  settlementTxHash?: string;
}): QueuedReward {
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

export function getQueueForWallet(wallet: string): {
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
} {
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

export function getQueueSummary(): {
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
} {
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
export function markIouSettled(
  wallet: string,
  mintIndex: number,
  txHash: string,
): boolean {
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
export function markQueueSettled(): void {
  const store = load();
  store.settled = true;
  store.settledAt = Date.now();
}
