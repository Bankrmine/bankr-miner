import { NextRequest } from "next/server";
import { normalizeAddress } from "@/lib/address";
import { getQueueForWallet, getQueueSummary } from "@/lib/server/queue";
import { tokenLaunched } from "@/lib/server/bankr";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/claim-queue?wallet=0x...   → that wallet's queued IOUs
 * GET /api/claim-queue                 → global queue summary only
 *
 * IOUs are accumulated on every mint while $MINE is not yet deployed.
 * Once the token deploys and the deployer wallet's Bankr Club is
 * active, an out-of-band settlement script drains the queue via
 * `/wallet/transfer`. The shape of each IOU matches what that script
 * will see.
 */
export async function GET(req: NextRequest) {
  const walletParam = req.nextUrl.searchParams.get("wallet");
  const summary = getQueueSummary();

  if (!walletParam) {
    return Response.json({
      summary,
      tokenLaunched: tokenLaunched(),
    });
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

  return Response.json({
    summary,
    tokenLaunched: tokenLaunched(),
    queue: getQueueForWallet(wallet),
  });
}
