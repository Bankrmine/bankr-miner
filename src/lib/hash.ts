/**
 * Pure helpers around keccak256. Shared between the browser miner worker
 * and the server-side verifier so the protocol is impossible to
 * accidentally fork.
 */
import { keccak_256 } from "@noble/hashes/sha3.js";

const HEX = "0123456789abcdef";

export function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += HEX[bytes[i] >>> 4] + HEX[bytes[i] & 0x0f];
  }
  return out;
}

export function hexToBytes(hex: string): Uint8Array {
  const h = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (h.length % 2 !== 0) {
    throw new Error("hex string must have even length");
  }
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) {
    const byte = parseInt(h.substr(i * 2, 2), 16);
    if (Number.isNaN(byte)) {
      throw new Error(`invalid hex byte at position ${i * 2}`);
    }
    out[i] = byte;
  }
  return out;
}

export function keccak256(data: Uint8Array): Uint8Array {
  return keccak_256(data);
}

export function keccak256Hex(data: Uint8Array): string {
  return "0x" + bytesToHex(keccak_256(data));
}

/**
 * Compare a 32-byte hash digest against a difficulty represented by a
 * minimum number of leading zero bits. Returns true when the hash is
 * strictly less than the implied target (i.e. solution is valid).
 */
export function hashMeetsLeadingZeroBits(
  hash: Uint8Array,
  leadingZeroBits: number,
): boolean {
  if (leadingZeroBits <= 0) return true;
  const fullZeroBytes = Math.floor(leadingZeroBits / 8);
  const remainingBits = leadingZeroBits % 8;
  for (let i = 0; i < fullZeroBytes; i++) {
    if (hash[i] !== 0) return false;
  }
  if (remainingBits === 0) return true;
  const mask = 0xff << (8 - remainingBits);
  return (hash[fullZeroBytes] & mask) === 0;
}

/**
 * Encode a non-negative integer (up to 2^64-1) as a fixed 8-byte big-endian
 * buffer. We use 8 bytes because that's a comfortable nonce search space
 * for browser CPUs at our chosen difficulty.
 */
export function nonceToBytes(nonce: bigint): Uint8Array {
  if (nonce < 0n) throw new Error("nonce must be non-negative");
  const out = new Uint8Array(8);
  let n = nonce;
  for (let i = 7; i >= 0; i--) {
    out[i] = Number(n & 0xffn);
    n >>= 8n;
  }
  return out;
}

export function concatBytes(...parts: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}
