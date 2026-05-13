import { NextRequest } from "next/server";
import { normalizeAddress } from "@/lib/address";
import { confirmClaim } from "@/lib/server/claim";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ConfirmBody = {
  wallet?: unknown;
  nonce?: unknown;
  txHash?: unknown;
};

/**
 * POST /api/claim/confirm
 * Body: { wallet, nonce, txHash }
 *
 * Called by the frontend after MineToken.claim() has been broadcast.
 * Promotes the pending claim into the wallet's permanent
 * `totalClaimed` total so subsequent /api/claim calls only see the
 * remainder of unclaimed IOUs.
 */
export async function POST(req: NextRequest) {
  let body: ConfirmBody;
  try {
    body = (await req.json()) as ConfirmBody;
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const walletParam = typeof body.wallet === "string" ? body.wallet : "";
  const nonce = typeof body.nonce === "string" ? body.nonce : "";
  const txHash = typeof body.txHash === "string" ? body.txHash : "";

  let wallet: string;
  try {
    wallet = normalizeAddress(walletParam);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "invalid address" },
      { status: 400 },
    );
  }

  const result = await confirmClaim({ wallet, nonce, txHash });
  if (!result.ok) {
    return Response.json(result, { status: 400 });
  }
  return Response.json(result);
}
