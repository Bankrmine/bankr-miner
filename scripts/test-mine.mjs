// End-to-end mining smoke test: fetches a challenge for an address,
// brute-forces a valid nonce on the main thread, POSTs to /api/mine,
// prints the result. Useful for verifying that the off-chain protocol
// is wired up correctly without spinning up the browser.

import { keccak_256 } from "@noble/hashes/sha3.js";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const WALLET =
  process.env.MINER_ADDRESS ?? "0xdEAD000000000000000000000000000000000000";

function hexToBytes(hex) {
  const h = hex.startsWith("0x") ? hex.slice(2) : hex;
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++)
    out[i] = parseInt(h.substr(i * 2, 2), 16);
  return out;
}

function bytesToHex(b) {
  let s = "";
  for (const x of b) s += x.toString(16).padStart(2, "0");
  return s;
}

function nonceToBytes(n) {
  const out = new Uint8Array(8);
  let v = n;
  for (let i = 7; i >= 0; i--) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return out;
}

function meets(hash, bits) {
  if (bits <= 0) return true;
  const full = Math.floor(bits / 8);
  const rem = bits % 8;
  for (let i = 0; i < full; i++) if (hash[i] !== 0) return false;
  if (rem === 0) return true;
  const mask = 0xff << (8 - rem);
  return (hash[full] & mask) === 0;
}

async function main() {
  console.log(`miner -> ${BASE} for ${WALLET}`);

  const chRes = await fetch(`${BASE}/api/challenge?wallet=${WALLET}`);
  if (!chRes.ok) throw new Error(`challenge ${chRes.status}`);
  const ch = await chRes.json();
  console.log(`challenge epoch=${ch.epoch} bits=${ch.difficultyBits}`);

  const challenge = hexToBytes(ch.challenge);
  const start = process.hrtime.bigint();
  let nonce = 0n;
  let hash;
  while (true) {
    const buf = new Uint8Array(challenge.length + 8);
    buf.set(challenge, 0);
    buf.set(nonceToBytes(nonce), challenge.length);
    hash = keccak_256(buf);
    if (meets(hash, ch.difficultyBits)) break;
    nonce++;
  }
  const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6;
  console.log(
    `found nonce=${nonce} hash=0x${bytesToHex(hash)} in ${elapsedMs.toFixed(0)}ms`,
  );

  const mineRes = await fetch(`${BASE}/api/mine`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      wallet: WALLET,
      nonce: nonce.toString(),
      epoch: ch.epoch,
    }),
  });
  const out = await mineRes.json();
  if (!mineRes.ok) {
    console.error("mine failed:", out);
    process.exit(1);
  }
  console.log("mine ok:");
  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
