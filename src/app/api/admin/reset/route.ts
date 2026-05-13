/**
 * DESTRUCTIVE admin endpoint: wipes every Redis key written by the
 * bankr-miner backend. Used to relaunch mining from a clean slate
 * (empty leaderboard, no pending IOUs, no orphaned claim signatures).
 *
 * Gated by the `ADMIN_RESET_TOKEN` env var:
 *   - If unset, the endpoint always returns 403 (effectively disabled).
 *   - If set, callers must provide the same value via the
 *     `Authorization: Bearer <token>` header.
 *
 * Does not touch on-chain state (the ERC-20 contract or balances).
 */
import { NextRequest } from "next/server";
import { getRedis } from "@/lib/server/redis";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PATTERNS = [
  "bankr-miner:v1:*",
  "bankr-miner:v1:queue:*",
  "bankr-miner:v1:claim:*",
];

function isAuthorized(req: NextRequest): boolean {
  const expected = process.env.ADMIN_RESET_TOKEN;
  if (!expected || expected.length < 16) return false;
  const auth = req.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/.exec(auth);
  if (!match) return false;
  // Constant-time-ish compare (string lengths differ in JS-land; OK for our threat model).
  return match[1] === expected;
}

async function collectKeys(): Promise<string[]> {
  const redis = getRedis();
  if (!redis) return [];
  const found = new Set<string>();
  for (const pat of PATTERNS) {
    let cursor = "0";
    let safety = 200;
    do {
      const result = (await redis.scan(cursor, { match: pat, count: 500 })) as
        | [string, string[]]
        | [number, string[]];
      cursor = String(result[0]);
      for (const k of result[1]) found.add(k);
      safety -= 1;
      if (safety <= 0) break;
    } while (cursor !== "0");
  }
  return [...found];
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  const keys = await collectKeys();
  return Response.json({
    ok: true,
    mode: "dry-run",
    redisConfigured: Boolean(getRedis()),
    candidateKeyCount: keys.length,
    sample: keys.slice(0, 25),
  });
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  const redis = getRedis();
  if (!redis) {
    return Response.json(
      { ok: false, error: "redis not configured on this deployment" },
      { status: 503 },
    );
  }
  const keys = await collectKeys();
  let deleted = 0;
  const batchSize = 100;
  for (let i = 0; i < keys.length; i += batchSize) {
    const batch = keys.slice(i, i + batchSize) as [string, ...string[]];
    if (batch.length === 0) continue;
    const n = (await redis.del(...batch)) as number | bigint;
    deleted += Number(n);
  }
  return Response.json({
    ok: true,
    mode: "wiped",
    requestedCount: keys.length,
    deleted,
  });
}
