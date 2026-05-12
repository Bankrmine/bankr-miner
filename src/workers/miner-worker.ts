/**
 * Browser CPU miner worker.
 *
 * One instance runs in each Web Worker. The main thread spawns
 * `navigator.hardwareConcurrency` workers and assigns each a disjoint
 * starting nonce + stride so they search disjoint segments of the nonce
 * space.
 *
 * Each iteration computes:
 *
 *   hash = keccak256(challenge ‖ uint64BE(nonce))
 *
 * and checks for `DIFFICULTY_LEADING_ZERO_BITS` leading zero bits.
 */

/// <reference lib="webworker" />
import {
  bytesToHex,
  concatBytes,
  hexToBytes,
  hashMeetsLeadingZeroBits,
  keccak256,
  nonceToBytes,
} from "@/lib/hash";

export type MinerWorkerInit = {
  type: "init";
  challenge: string; // 0x-hex
  difficultyBits: number;
  startNonce: string; // bigint as decimal string
  stride: string; // bigint as decimal string
  reportEveryHashes: number;
};

export type MinerWorkerStop = { type: "stop" };

export type MinerWorkerMessage = MinerWorkerInit | MinerWorkerStop;

export type MinerWorkerProgress = {
  type: "progress";
  hashes: number;
  nonce: string;
};

export type MinerWorkerSolution = {
  type: "solution";
  nonce: string;
  hash: string;
};

export type MinerWorkerOut = MinerWorkerProgress | MinerWorkerSolution;

let stopped = false;

self.onmessage = (e: MessageEvent<MinerWorkerMessage>) => {
  const msg = e.data;
  if (msg.type === "stop") {
    stopped = true;
    return;
  }
  if (msg.type === "init") {
    stopped = false;
    run(msg).catch((err) => {
      // surfacing via console; worker exit will be signalled by main
      // thread terminating it.
      console.error("miner worker error", err);
    });
  }
};

async function run(init: MinerWorkerInit) {
  const challenge = hexToBytes(init.challenge);
  const difficulty = init.difficultyBits;
  let nonce = BigInt(init.startNonce);
  const stride = BigInt(init.stride);
  const reportEvery = init.reportEveryHashes;

  let hashes = 0;

  while (!stopped) {
    const nonceBytes = nonceToBytes(nonce);
    const buf = concatBytes(challenge, nonceBytes);
    const hash = keccak256(buf);

    if (hashMeetsLeadingZeroBits(hash, difficulty)) {
      const solution: MinerWorkerSolution = {
        type: "solution",
        nonce: nonce.toString(),
        hash: "0x" + bytesToHex(hash),
      };
      self.postMessage(solution);
      // Continue searching after a hit in case the main thread wants
      // multiple solutions; main thread is responsible for stopping.
    }

    hashes++;
    if (hashes % reportEvery === 0) {
      const progress: MinerWorkerProgress = {
        type: "progress",
        hashes,
        nonce: nonce.toString(),
      };
      self.postMessage(progress);
      // Yield so postMessage / GC have a moment.
      await microsleep();
    }

    nonce += stride;
  }
}

function microsleep(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
