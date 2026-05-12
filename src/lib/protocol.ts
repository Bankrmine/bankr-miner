/**
 * Protocol helpers shared between the server (challenge issuance,
 * solution verification) and the browser miner (challenge consumption).
 *
 * The protocol:
 *   1. Server returns a per-(wallet, epoch) challenge of 32 bytes.
 *   2. Miner brute-forces a nonce such that
 *      keccak256(challenge ‖ uint64BE(nonce)) has at least
 *      DIFFICULTY_LEADING_ZERO_BITS leading zero bits.
 *   3. Miner submits {wallet, nonce, epoch} to /api/mine.
 *   4. Server recomputes the challenge from inputs and verifies the
 *      same inequality on its own. No trust required.
 */
import {
  concatBytes,
  hashMeetsLeadingZeroBits,
  hexToBytes,
  keccak256,
  nonceToBytes,
} from "./hash";

export type ChallengeSpec = {
  /** Lowercased 0x-prefixed Ethereum address that owns this challenge. */
  wallet: string;
  /** Epoch ordinal: floor(now / EPOCH_DURATION_MS). */
  epoch: number;
  /** 32-byte challenge as a 0x-prefixed hex string. */
  challenge: string;
  /** Minimum leading zero bits the solution must satisfy. */
  difficultyBits: number;
  /** Project-wide constants embedded in the challenge, returned for clients. */
  projectId: string;
  chainId: number;
};

/**
 * Build the deterministic per-wallet challenge.
 *
 *   challenge = keccak256(
 *     ascii(projectId) ‖ uint32BE(chainId) ‖ addressBytes ‖ uint32BE(epoch)
 *   )
 */
export function deriveChallenge(args: {
  projectId: string;
  chainId: number;
  wallet: string; // lowercase 0x-prefixed
  epoch: number;
}): Uint8Array {
  const projectBytes = new TextEncoder().encode(args.projectId);
  const chainBytes = u32BE(args.chainId);
  const addressBytes = hexToBytes(args.wallet);
  const epochBytes = u32BE(args.epoch);
  return keccak256(
    concatBytes(projectBytes, chainBytes, addressBytes, epochBytes),
  );
}

/**
 * Verify a (challenge, nonce) pair against the protocol difficulty.
 */
export function verifySolution(args: {
  challenge: Uint8Array;
  nonce: bigint;
  difficultyBits: number;
}): { valid: boolean; hash: Uint8Array } {
  const buf = concatBytes(args.challenge, nonceToBytes(args.nonce));
  const hash = keccak256(buf);
  return {
    valid: hashMeetsLeadingZeroBits(hash, args.difficultyBits),
    hash,
  };
}

export function currentEpoch(epochDurationMs: number, nowMs = Date.now()): number {
  return Math.floor(nowMs / epochDurationMs);
}

function u32BE(n: number): Uint8Array {
  if (n < 0 || n > 0xffffffff) {
    throw new Error(`u32BE out of range: ${n}`);
  }
  const out = new Uint8Array(4);
  out[0] = (n >>> 24) & 0xff;
  out[1] = (n >>> 16) & 0xff;
  out[2] = (n >>> 8) & 0xff;
  out[3] = n & 0xff;
  return out;
}
