/**
 * Backend-side claim authoriser for MineToken.sol.
 *
 * Flow:
 *   1. Miner accumulates IOUs via /api/mine (off-chain PoW).
 *   2. When their pending IOU >= MIN_CLAIM_AMOUNT, they call /api/claim.
 *   3. This module:
 *        a. Computes pending = totalQueued - totalClaimed (per wallet).
 *        b. Allocates a new nonce, signs (claimer, amount, nonce, chainId, contract).
 *        c. Stores a "claim lock" so the same IOUs can't be re-signed for 30 min.
 *   4. Miner submits the signature to MineToken.claim(amount, nonce, signature).
 *   5. Miner calls /api/claim/confirm with the on-chain txHash → server
 *      promotes the lock into permanent `totalClaimed += amount`.
 *
 * If the miner never confirms, the lock expires after CLAIM_SIGNATURE_TTL_MS
 * and the IOUs become claimable again. The on-chain `usedNonces` mapping in
 * the contract still prevents replay of a stale signature.
 */
import { keccak256, encodePacked, getAddress, isAddress, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import {
  CHAIN_ID_BASE,
  CLAIM_SIGNATURE_TTL_MS,
  MIN_CLAIM_AMOUNT,
  TOKEN_DECIMALS,
} from "../constants";
import { decodeStored, getRedis } from "./redis";

const REDIS_PREFIX = "bankr-miner:v1:claim";

const keys = {
  totalClaimed: (wallet: string) => `${REDIS_PREFIX}:totalClaimed:${wallet}`,
  pendingLock: (wallet: string) => `${REDIS_PREFIX}:pending:${wallet}`,
  noncesIssued: `${REDIS_PREFIX}:noncesIssued`,
};

const MEMORY_KEY = "__bankr_miner_claim__";

type MemStore = {
  totalClaimed: Map<string, bigint>; // wallet (lowercase) → wei amount
  pending: Map<string, PendingClaim | null>; // wallet → active claim lock
};

export type PendingClaim = {
  wallet: string;
  amountWei: string; // bigint serialised as decimal string
  nonce: Hex;
  /**
   * EIP-191 signature blob over (claimer, amount, nonce, chainId, contract).
   * Stored so that a frontend reload can resume submission without
   * requesting a fresh signature (the old one would be locked out).
   *
   * Optional in the type to keep deserialization of legacy records
   * (pre-signature-persist) from blowing up; legacy records are treated
   * as expired in `getClaimableState`.
   */
  signature?: Hex;
  /** Debugging aid: the digest that was signed. */
  digest?: Hex;
  issuedAt: number;
  tokenAddress: string;
  chainId: number;
};

function mem(): MemStore {
  const g = globalThis as unknown as Record<string, unknown>;
  let store = g[MEMORY_KEY] as MemStore | undefined;
  if (!store) {
    store = {
      totalClaimed: new Map(),
      pending: new Map(),
    };
    g[MEMORY_KEY] = store;
  }
  return store;
}

export function tokensToWei(amount: number): bigint {
  // Convert a whole-or-fractional MINE amount to wei (18 decimals) safely.
  if (!Number.isFinite(amount) || amount <= 0) return 0n;
  // Avoid floating drift for the common whole-number case by string-parsing.
  const str = amount.toString();
  if (/^[0-9]+$/.test(str)) {
    return BigInt(str) * 10n ** BigInt(TOKEN_DECIMALS);
  }
  const [intPart, fracPartRaw = ""] = str.split(".");
  const fracPart = (fracPartRaw + "0".repeat(TOKEN_DECIMALS)).slice(
    0,
    TOKEN_DECIMALS,
  );
  return BigInt(intPart) * 10n ** BigInt(TOKEN_DECIMALS) + BigInt(fracPart);
}

export function weiToTokens(wei: bigint): number {
  // Display-only; loses precision past ~15 digits. Acceptable for UI.
  const denom = 10n ** BigInt(TOKEN_DECIMALS);
  const whole = wei / denom;
  const frac = wei % denom;
  return Number(whole) + Number(frac) / Number(denom);
}

export async function getTotalClaimedWei(wallet: string): Promise<bigint> {
  const normalized = wallet.toLowerCase();
  const redis = getRedis();
  if (redis) {
    const raw = await redis.get<string | number>(keys.totalClaimed(normalized));
    if (raw === null || raw === undefined) return 0n;
    return BigInt(String(raw));
  }
  return mem().totalClaimed.get(normalized) ?? 0n;
}

async function bumpTotalClaimed(wallet: string, deltaWei: bigint): Promise<bigint> {
  const normalized = wallet.toLowerCase();
  const redis = getRedis();
  if (redis) {
    const current = await getTotalClaimedWei(normalized);
    const next = current + deltaWei;
    await redis.set(keys.totalClaimed(normalized), next.toString());
    return next;
  }
  const store = mem();
  const next = (store.totalClaimed.get(normalized) ?? 0n) + deltaWei;
  store.totalClaimed.set(normalized, next);
  return next;
}

export async function getPendingClaim(wallet: string): Promise<PendingClaim | null> {
  const normalized = wallet.toLowerCase();
  const redis = getRedis();
  if (redis) {
    const raw = await redis.get<unknown>(keys.pendingLock(normalized));
    return decodeStored<PendingClaim>(raw);
  }
  return mem().pending.get(normalized) ?? null;
}

async function setPendingClaim(claim: PendingClaim): Promise<void> {
  const normalized = claim.wallet.toLowerCase();
  const redis = getRedis();
  if (redis) {
    await redis.set(keys.pendingLock(normalized), claim, {
      px: CLAIM_SIGNATURE_TTL_MS,
    });
    await redis.sadd(keys.noncesIssued, claim.nonce);
    return;
  }
  mem().pending.set(normalized, claim);
}

async function clearPendingClaim(wallet: string): Promise<void> {
  const normalized = wallet.toLowerCase();
  const redis = getRedis();
  if (redis) {
    await redis.del(keys.pendingLock(normalized));
    return;
  }
  mem().pending.set(normalized, null);
}

function isClaimLockExpired(claim: PendingClaim, now: number): boolean {
  return now - claim.issuedAt >= CLAIM_SIGNATURE_TTL_MS;
}

/**
 * A pending lock is only honoured if it carries the signature that lets
 * the frontend resume submission. Legacy locks predating signature-persist
 * are treated as expired so users aren't stuck holding IOUs they can't mint.
 */
function isClaimLockUsable(claim: PendingClaim | null, now: number): claim is PendingClaim & { signature: Hex } {
  if (!claim) return false;
  if (!claim.signature) return false;
  return !isClaimLockExpired(claim, now);
}

export type ClaimableState = {
  wallet: string;
  totalQueuedWei: bigint;
  totalClaimedWei: bigint;
  /** Currently locked by an outstanding (unexpired) signature. */
  lockedWei: bigint;
  /** Available right now to request a new signature. */
  availableWei: bigint;
  /** Whole-MINE truncation of availableWei, useful for the on-chain claim. */
  availableWhole: bigint;
  minClaim: number;
  pending: PendingClaim | null;
};

export async function getClaimableState(
  wallet: string,
  totalQueuedTokens: number,
): Promise<ClaimableState> {
  const normalized = wallet.toLowerCase();
  const totalQueuedWei = tokensToWei(totalQueuedTokens);
  const totalClaimedWei = await getTotalClaimedWei(normalized);
  const pending = await getPendingClaim(normalized);
  const now = Date.now();
  const usable = isClaimLockUsable(pending, now);
  const lockedWei = usable ? BigInt(pending!.amountWei) : 0n;

  const reachable = totalQueuedWei > totalClaimedWei
    ? totalQueuedWei - totalClaimedWei
    : 0n;
  const availableWei = reachable > lockedWei ? reachable - lockedWei : 0n;
  // Truncate to whole MINE so the on-chain mint amount is a clean integer.
  const denom = 10n ** BigInt(TOKEN_DECIMALS);
  const availableWhole = availableWei / denom;

  return {
    wallet: normalized,
    totalQueuedWei,
    totalClaimedWei,
    lockedWei,
    availableWei: availableWhole * denom,
    availableWhole,
    minClaim: MIN_CLAIM_AMOUNT,
    pending: usable ? pending : null,
  };
}

/** Build the EIP-191 message digest signed by the backend claim key. */
export function buildClaimDigest(args: {
  claimer: string;
  amountWei: bigint;
  nonce: Hex;
  chainId: number;
  tokenAddress: string;
}): Hex {
  // Solidity side recomputes:
  //   keccak256(abi.encodePacked(claimer, amountWei, nonce, chainId, address(this)))
  // then wraps with "\x19Ethereum Signed Message:\n32" via MessageHashUtils.
  return keccak256(
    encodePacked(
      ["address", "uint256", "bytes32", "uint256", "address"],
      [
        getAddress(args.claimer),
        args.amountWei,
        args.nonce,
        BigInt(args.chainId),
        getAddress(args.tokenAddress),
      ],
    ),
  );
}

export function getClaimSignerAddress(): string | null {
  const pk = process.env.CLAIM_SIGNER_PRIVATE_KEY;
  if (!pk || !/^0x[0-9a-fA-F]{64}$/.test(pk)) return null;
  try {
    return privateKeyToAccount(pk as Hex).address;
  } catch {
    return null;
  }
}

export type ClaimSignParams = {
  wallet: string;
  amountTokens: number;
  totalQueuedTokens: number;
};

export type ClaimSignResult =
  | {
      ok: true;
      amountWei: string;
      amountTokens: number;
      nonce: Hex;
      signature: Hex;
      digest: Hex;
      chainId: number;
      tokenAddress: string;
      expiresAt: number;
    }
  | {
      ok: false;
      reason:
        | "no-signer"
        | "no-token"
        | "invalid-wallet"
        | "below-threshold"
        | "no-balance"
        | "already-pending";
      message: string;
    };

/**
 * Issue a fresh claim signature for `wallet`. The amount is the largest
 * whole-MINE value the wallet can claim right now; we do not let the
 * caller pick a different amount because the signature is bound to it.
 */
export async function signClaimForWallet(
  args: ClaimSignParams,
): Promise<ClaimSignResult> {
  if (!isAddress(args.wallet)) {
    return { ok: false, reason: "invalid-wallet", message: "wallet is not a valid 0x address" };
  }

  const tokenAddress = process.env.MINE_TOKEN_ADDRESS;
  if (!tokenAddress || !isAddress(tokenAddress)) {
    return {
      ok: false,
      reason: "no-token",
      message: "MINE_TOKEN_ADDRESS env var is not set or invalid",
    };
  }

  const pk = process.env.CLAIM_SIGNER_PRIVATE_KEY;
  if (!pk || !/^0x[0-9a-fA-F]{64}$/.test(pk)) {
    return {
      ok: false,
      reason: "no-signer",
      message:
        "CLAIM_SIGNER_PRIVATE_KEY env var is not set on the backend; claims are disabled",
    };
  }

  const state = await getClaimableState(args.wallet, args.totalQueuedTokens);
  if (state.totalQueuedWei === 0n) {
    return { ok: false, reason: "no-balance", message: "no IOU balance to claim" };
  }
  if (state.pending) {
    // state.pending is only returned by getClaimableState when the lock is
    // valid (has a signature + not expired). Refuse to mint a second one.
    return {
      ok: false,
      reason: "already-pending",
      message:
        "there is already an unconfirmed claim signature for this wallet; broadcast or wait for it to expire",
    };
  }

  const wholeMin = BigInt(MIN_CLAIM_AMOUNT);
  if (state.availableWhole < wholeMin) {
    return {
      ok: false,
      reason: "below-threshold",
      message: `claim threshold is ${MIN_CLAIM_AMOUNT} MINE; current available = ${state.availableWhole.toString()}`,
    };
  }

  const amountWei = state.availableWhole * 10n ** BigInt(TOKEN_DECIMALS);
  const nonce = generateNonce();
  const account = privateKeyToAccount(pk as Hex);

  const digest = buildClaimDigest({
    claimer: args.wallet,
    amountWei,
    nonce,
    chainId: CHAIN_ID_BASE,
    tokenAddress,
  });
  // signMessage with raw bytes does the EIP-191 \x19 wrapping for us.
  const signature = await account.signMessage({
    message: { raw: digest },
  });

  const now = Date.now();
  const claim: PendingClaim = {
    wallet: args.wallet.toLowerCase(),
    amountWei: amountWei.toString(),
    nonce,
    // Persist signature + digest so a frontend reload can resume the same
    // submission without requesting a fresh (and disallowed) one.
    signature,
    digest,
    issuedAt: now,
    tokenAddress,
    chainId: CHAIN_ID_BASE,
  };
  await setPendingClaim(claim);

  return {
    ok: true,
    amountWei: amountWei.toString(),
    amountTokens: Number(state.availableWhole),
    nonce,
    signature,
    digest,
    chainId: CHAIN_ID_BASE,
    tokenAddress,
    expiresAt: now + CLAIM_SIGNATURE_TTL_MS,
  };
}

export type ConfirmClaimResult =
  | { ok: true; totalClaimedWei: string; txHash: string }
  | { ok: false; reason: "no-pending" | "nonce-mismatch" | "invalid-input"; message: string };

export async function confirmClaim(args: {
  wallet: string;
  nonce: string;
  txHash: string;
}): Promise<ConfirmClaimResult> {
  if (!isAddress(args.wallet)) {
    return { ok: false, reason: "invalid-input", message: "invalid wallet" };
  }
  if (!/^0x[0-9a-fA-F]{64}$/.test(args.nonce)) {
    return { ok: false, reason: "invalid-input", message: "invalid nonce" };
  }
  if (!/^0x[0-9a-fA-F]{64}$/.test(args.txHash)) {
    return { ok: false, reason: "invalid-input", message: "invalid txHash" };
  }

  const pending = await getPendingClaim(args.wallet);
  if (!pending) {
    return {
      ok: false,
      reason: "no-pending",
      message: "no pending claim for this wallet",
    };
  }
  if (pending.nonce.toLowerCase() !== args.nonce.toLowerCase()) {
    return {
      ok: false,
      reason: "nonce-mismatch",
      message: "pending claim has a different nonce",
    };
  }

  const total = await bumpTotalClaimed(args.wallet, BigInt(pending.amountWei));
  await clearPendingClaim(args.wallet);
  return { ok: true, totalClaimedWei: total.toString(), txHash: args.txHash };
}

function generateNonce(): Hex {
  // 32-byte random nonce. crypto.getRandomValues is available in Node 19+ globals.
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let hex = "0x";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return hex as Hex;
}
