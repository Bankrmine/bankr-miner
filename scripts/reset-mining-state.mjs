/**
 * Destructive: wipes every Redis key written by the bankr-miner backend.
 *
 * Use this when relaunching mining from scratch (clean leaderboard, clean
 * IOUs, clean pending claims). Does NOT touch on-chain state.
 *
 * Required env (matches the runtime fallback chain in src/lib/server/redis.ts):
 *   KV_REST_API_URL or UPSTASH_REDIS_REST_URL
 *   KV_REST_API_TOKEN or UPSTASH_REDIS_REST_TOKEN
 *
 * Usage:
 *   CONFIRM=YES node scripts/reset-mining-state.mjs
 *
 * Without CONFIRM=YES the script does a dry run and only prints what it
 * would delete.
 */
import { Redis } from "@upstash/redis";

const url =
  process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL ?? null;
const token =
  process.env.KV_REST_API_TOKEN ??
  process.env.UPSTASH_REDIS_REST_TOKEN ??
  null;

if (!url || !token) {
  console.error(
    "Missing Upstash credentials. Set KV_REST_API_URL + KV_REST_API_TOKEN (or UPSTASH_REDIS_REST_URL/_TOKEN).",
  );
  process.exit(1);
}

const redis = new Redis({ url, token, enableTelemetry: false });
const dryRun = process.env.CONFIRM !== "YES";

const PATTERNS = [
  "bankr-miner:v1:*", // mining stats, queues, leaderboard, wallet totals, epoch counters
  "bankr-miner:v1:queue:*", // queued rewards
  "bankr-miner:v1:claim:*", // claim sigs, totalClaimed, nonces
];

async function scanAll(pattern) {
  // Upstash REST exposes SCAN via { cursor, match, count } -> [nextCursor, keys].
  const found = new Set();
  let cursor = "0";
  let safety = 200; // upper bound on pages so we don't spin forever
  do {
    const result = await redis.scan(cursor, { match: pattern, count: 500 });
    // @upstash/redis returns [string, string[]]
    cursor = result[0];
    for (const k of result[1]) found.add(k);
    safety -= 1;
    if (safety <= 0) {
      console.warn("SCAN safety limit hit — partial result");
      break;
    }
  } while (cursor !== "0");
  return [...found];
}

const allKeys = new Set();
for (const pat of PATTERNS) {
  const keys = await scanAll(pat);
  for (const k of keys) allKeys.add(k);
  console.log(`pattern ${pat} -> ${keys.length} keys`);
}

const keys = [...allKeys].sort();
console.log(`\nTotal unique keys: ${keys.length}`);
if (keys.length > 0) {
  const sample = keys.slice(0, 25);
  console.log("Sample:");
  for (const k of sample) console.log("  " + k);
  if (keys.length > sample.length) {
    console.log(`  ... and ${keys.length - sample.length} more`);
  }
}

if (dryRun) {
  console.log("\nDRY RUN. Re-run with CONFIRM=YES to actually delete.");
  process.exit(0);
}

console.log("\nDeleting...");
let deleted = 0;
const batchSize = 100;
for (let i = 0; i < keys.length; i += batchSize) {
  const batch = keys.slice(i, i + batchSize);
  const n = await redis.del(...batch);
  deleted += Number(n);
  console.log(`  deleted ${deleted}/${keys.length}`);
}
console.log(`\nDone. Deleted ${deleted} keys.`);
