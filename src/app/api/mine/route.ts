import { NextRequest } from "next/server";
import { normalizeAddress } from "@/lib/address";
import {
  CHAIN_ID_BASE,
  DIFFICULTY_LEADING_ZERO_BITS,
  EPOCH_DURATION_MS,
  PROJECT_ID,
} from "@/lib/constants";
import { bytesToHex } from "@/lib/hash";
import { currentEpoch, deriveChallenge, verifySolution } from "@/lib/protocol";
import { transferReward, bankrConfigured, tokenLaunched } from "@/lib/server/bankr";
import { publish } from "@/lib/server/events";
import { enqueueReward } from "@/lib/server/queue";
import {
  canMint,
  noncePreviouslyUsed,
  recordMint,
  getStats,
} from "@/lib/server/state";

export const dynamic = "force-dynamic";

type MineBody = {
  wallet?: unknown;
  nonce?: unknown;
  epoch?: unknown;
};

/**
 * POST /api/mine
 *
 * Body: { wallet, nonce, epoch }
 *
 * Server recomputes the challenge for (wallet, epoch), verifies the
 * proof of work, atomically reserves the mint slot, then asks Bankr to
 * dispatch the reward (or returns a mock tx hash in Phase 1).
 */
export async function POST(req: NextRequest) {
  let body: MineBody;
  try {
    body = (await req.json()) as MineBody;
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const walletParam = typeof body.wallet === "string" ? body.wallet : "";
  const nonceParam = typeof body.nonce === "string" ? body.nonce : "";
  const epochParam = typeof body.epoch === "number" ? body.epoch : NaN;

  let wallet: string;
  try {
    wallet = normalizeAddress(walletParam);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "invalid address" },
      { status: 400 },
    );
  }

  if (!/^[0-9]+$/.test(nonceParam)) {
    return Response.json(
      { error: "nonce must be a non-negative decimal integer string" },
      { status: 400 },
    );
  }
  let nonce: bigint;
  try {
    nonce = BigInt(nonceParam);
  } catch {
    return Response.json({ error: "invalid nonce" }, { status: 400 });
  }
  if (nonce < 0n || nonce > 0xffffffffffffffffn) {
    return Response.json({ error: "nonce out of range" }, { status: 400 });
  }

  if (!Number.isInteger(epochParam) || epochParam < 0) {
    return Response.json(
      { error: "epoch must be a non-negative integer" },
      { status: 400 },
    );
  }
  const epoch = epochParam;
  const liveEpoch = currentEpoch(EPOCH_DURATION_MS);
  if (Math.abs(liveEpoch - epoch) > 1) {
    return Response.json(
      {
        error: `epoch out of window (got ${epoch}, current ${liveEpoch}). re-fetch /api/challenge.`,
      },
      { status: 409 },
    );
  }

  if (await noncePreviouslyUsed(wallet, epoch, nonceParam)) {
    return Response.json(
      { error: "nonce already claimed" },
      { status: 409 },
    );
  }

  const quota = await canMint(epoch, wallet);
  if (!quota.ok) {
    return Response.json({ error: quota.reason }, { status: 429 });
  }

  const challengeBytes = deriveChallenge({
    projectId: PROJECT_ID,
    chainId: CHAIN_ID_BASE,
    wallet,
    epoch,
  });
  const { valid, hash } = verifySolution({
    challenge: challengeBytes,
    nonce,
    difficultyBits: DIFFICULTY_LEADING_ZERO_BITS,
  });
  if (!valid) {
    return Response.json(
      { error: "solution does not meet difficulty target" },
      { status: 422 },
    );
  }

  let mint;
  try {
    mint = await recordMint({
      wallet,
      epoch,
      nonce: nonceParam,
      hash: "0x" + bytesToHex(hash),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "mint rejected";
    return Response.json({ error: message }, { status: 409 });
  }

  // Dispatch the reward via Bankr when possible; never fabricate a fake
  // on-chain tx hash. Either way, persist the reward as an IOU so the
  // miner has a durable record that survives transient transfer
  // failures (e.g. Bankr 5xx, gas issues, mis-configured allowlist).
  const transfer = await transferReward({
    to: wallet,
    amount: mint.reward,
  });
  if (transfer.txHash) {
    mint.txHash = transfer.txHash;
  }
  const iou = await enqueueReward({
    wallet,
    mintIndex: mint.index,
    amount: mint.reward,
    era: mint.era,
    pow: mint.hash,
    settlementTxHash: transfer.txHash,
  });

  publish({ type: "mint", mint });

  const stats = await getStats();
  return Response.json({
    ok: true,
    mint,
    transfer,
    queuedId: iou.id,
    iouSettled: Boolean(iou.settlementTxHash),
    stats,
    bankrConfigured: bankrConfigured(),
    tokenLaunched: tokenLaunched(),
  });
}
