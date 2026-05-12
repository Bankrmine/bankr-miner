import { keccak256, bytesToHex, hexToBytes } from "./hash";

/**
 * Quick checksum-tolerant Ethereum address validator. Accepts the canonical
 * 0x-prefixed 40-hex format, any case. Returns the lowercase address on
 * success, throws on failure.
 */
export function normalizeAddress(address: string): string {
  if (typeof address !== "string") {
    throw new Error("address must be a string");
  }
  const trimmed = address.trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(trimmed)) {
    throw new Error("invalid Ethereum address");
  }
  return trimmed.toLowerCase();
}

export function isValidAddress(address: unknown): address is string {
  if (typeof address !== "string") return false;
  return /^0x[0-9a-fA-F]{40}$/.test(address.trim());
}

/**
 * EIP-55 checksum-encode a lowercase address for display.
 */
export function toChecksumAddress(address: string): string {
  const lower = normalizeAddress(address).slice(2);
  const hash = bytesToHex(keccak256(new TextEncoder().encode(lower)));
  let out = "0x";
  for (let i = 0; i < lower.length; i++) {
    const c = lower[i];
    const isLetter = c >= "a" && c <= "f";
    if (isLetter) {
      const nibble = parseInt(hash[i], 16);
      out += nibble >= 8 ? c.toUpperCase() : c;
    } else {
      out += c;
    }
  }
  return out;
}

export function addressToBytes(address: string): Uint8Array {
  return hexToBytes(normalizeAddress(address));
}
