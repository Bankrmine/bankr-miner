import { NextRequest } from "next/server";
import { normalizeAddress } from "@/lib/address";
import { markIouSettled } from "@/lib/server/queue";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/claim-queue/settle
 * Headers: X-API-Key: bk_...   (must match the server's BANKR_API_KEY)
 * Body:    { wallet, mintIndex, txHash }
 *
 * Records that the named IOU has been settled on chain. Used by the
 * out-of-band `scripts/bankr-settle.mjs` script so the server's IOU
 * view stays in sync with what's been paid out — there's no separate
 * source of truth that could drift from reality.
 *
 * Authorisation is intentionally simple: only the same operator who
 * holds the server's BANKR_API_KEY can mark settlements. There is no
 * use case for any other caller.
 */
export async function POST(req: NextRequest) {
  const operatorKey = process.env.BANKR_API_KEY;
  if (!operatorKey) {
    return Response.json(
      { error: "server has no BANKR_API_KEY configured" },
      { status: 503 },
    );
  }
  const provided = req.headers.get("x-api-key");
  if (!provided || provided !== operatorKey) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }
  if (
    !body ||
    typeof body !== "object" ||
    typeof (body as { wallet?: unknown }).wallet !== "string" ||
    typeof (body as { mintIndex?: unknown }).mintIndex !== "number" ||
    typeof (body as { txHash?: unknown }).txHash !== "string"
  ) {
    return Response.json(
      { error: "body must be { wallet, mintIndex, txHash }" },
      { status: 400 },
    );
  }
  const { wallet: rawWallet, mintIndex, txHash } = body as {
    wallet: string;
    mintIndex: number;
    txHash: string;
  };
  let wallet: string;
  try {
    wallet = normalizeAddress(rawWallet);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "invalid wallet" },
      { status: 400 },
    );
  }

  const updated = markIouSettled(wallet, mintIndex, txHash);
  if (!updated) {
    return Response.json(
      { error: "IOU not found or already settled" },
      { status: 404 },
    );
  }
  return Response.json({ ok: true });
}
