/**
 * Main-thread miner orchestrator. Spawns N web workers (one per CPU
 * core), feeds each a disjoint nonce-prefix slice, aggregates hashrate,
 * and resolves with the first valid solution.
 */
import type {
  MinerWorkerInit,
  MinerWorkerOut,
  MinerWorkerSolution,
} from "@/workers/miner-worker";

export type MinerProgress = {
  hashesPerSec: number;
  totalHashes: number;
  workers: number;
  elapsedMs: number;
};

export type StartMinerArgs = {
  challenge: string;
  difficultyBits: number;
  workerCount?: number;
  reportEveryHashes?: number;
  onProgress?: (p: MinerProgress) => void;
};

export type MinerHandle = {
  promise: Promise<MinerWorkerSolution>;
  stop: () => void;
};

export function startMiner(args: StartMinerArgs): MinerHandle {
  const workerCount =
    args.workerCount ??
    Math.max(
      1,
      Math.min(16, navigator.hardwareConcurrency || 4),
    );
  const reportEvery = args.reportEveryHashes ?? 4_000;

  const workers: Worker[] = [];
  const startedAt = performance.now();
  let totalHashes = 0;
  let lastTick = startedAt;
  let lastTickHashes = 0;
  let stopped = false;

  const resolveRef: { current: ((s: MinerWorkerSolution) => void) | null } =
    { current: null };
  const rejectRef: { current: ((e: Error) => void) | null } = {
    current: null,
  };

  const promise = new Promise<MinerWorkerSolution>((resolve, reject) => {
    resolveRef.current = resolve;
    rejectRef.current = reject;
  });

  function stop() {
    if (stopped) return;
    stopped = true;
    for (const w of workers) w.terminate();
  }

  // Each worker starts at index `i` and increments by `workerCount` so
  // their nonce sequences interleave without overlap.
  for (let i = 0; i < workerCount; i++) {
    const worker = new Worker(
      new URL("../../workers/miner-worker.ts", import.meta.url),
      { type: "module" },
    );
    workers.push(worker);

    worker.onmessage = (e: MessageEvent<MinerWorkerOut>) => {
      const msg = e.data;
      if (msg.type === "progress") {
        totalHashes += reportEvery;
        const now = performance.now();
        if (now - lastTick > 250 && args.onProgress) {
          const dt = (now - lastTick) / 1000;
          const dh = totalHashes - lastTickHashes;
          args.onProgress({
            hashesPerSec: dt > 0 ? dh / dt : 0,
            totalHashes,
            workers: workerCount,
            elapsedMs: now - startedAt,
          });
          lastTick = now;
          lastTickHashes = totalHashes;
        }
        return;
      }
      if (msg.type === "solution") {
        if (!stopped) {
          stop();
          resolveRef.current?.(msg);
        }
        return;
      }
    };

    worker.onerror = (err) => {
      if (!stopped) {
        stop();
        rejectRef.current?.(
          new Error(`miner worker error: ${err.message}`),
        );
      }
    };

    const init: MinerWorkerInit = {
      type: "init",
      challenge: args.challenge,
      difficultyBits: args.difficultyBits,
      startNonce: i.toString(),
      stride: workerCount.toString(),
      reportEveryHashes: reportEvery,
    };
    worker.postMessage(init);
  }

  return { promise, stop };
}
