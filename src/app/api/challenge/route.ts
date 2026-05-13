import { NextRequest } from "next/server";
import { normalizeAddress } from "@/lib/address";
import {
  CHAIN_ID_BASE,
  EPOCH_DURATION_MS,
  PROJECT_ID,
} from "@/lib/constants";
import { bytesToHex } from "@/lib/hash";
import { currentEpoch, deriveChallenge } from "@/lib/protocol";
import { getDifficulty } from "@/lib/server/state";

export const dynamic = "force-dynamic";

/**
 * GET /api/challenge?wallet=0x...
 *
 * Returns the per-wallet challenge for the current epoch. No state is
 * mutated here, so this endpoint is safe to hit repeatedly.
 */
export async function GET(req: NextRequest) {
  const walletParam = req.nextUrl.searchParams.get("wallet");
  if (!walletParam) {
    return Response.json(
      { error: "missing required query parameter: wallet" },
      { status: 400 },
    );
  }
  let wallet: string;
  try {
    wallet = normalizeAddress(walletParam);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "invalid address" },
      { status: 400 },
    );
  }

  const epoch = currentEpoch(EPOCH_DURATION_MS);
  const challengeBytes = deriveChallenge({
    projectId: PROJECT_ID,
    chainId: CHAIN_ID_BASE,
    wallet,
    epoch,
  });
  const challenge = "0x" + bytesToHex(challengeBytes);

  const nowMs = Date.now();
  const epochEndsAt = (epoch + 1) * EPOCH_DURATION_MS;
  const epochMsLeft = Math.max(0, epochEndsAt - nowMs);

  const difficulty = await getDifficulty();

  return Response.json({
    wallet,
    epoch,
    epochDurationMs: EPOCH_DURATION_MS,
    epochMsLeft,
    challenge,
    difficultyBits: difficulty.bits,
    projectId: PROJECT_ID,
    chainId: CHAIN_ID_BASE,
  });
}
