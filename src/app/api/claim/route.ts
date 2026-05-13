import { NextRequest } from "next/server";
import { normalizeAddress } from "@/lib/address";
import {
  CHAIN_ID_BASE,
  MIN_CLAIM_AMOUNT,
  TOKEN_DECIMALS,
} from "@/lib/constants";
import {
  getClaimSignerAddress,
  getClaimableState,
  signClaimForWallet,
} from "@/lib/server/claim";
import { getQueueForWallet } from "@/lib/server/queue";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/claim?wallet=0x...
 *
 * Returns the on-chain claim state for a wallet:
 *  - how much pending IOU it has,
 *  - whether the backend is configured to sign claims,
 *  - whether the wallet currently has an outstanding (unconfirmed) signature.
 *
 * No state is mutated.
 */
export async function GET(req: NextRequest) {
  const walletParam = req.nextUrl.searchParams.get("wallet");
  const tokenAddress = process.env.MINE_TOKEN_ADDRESS ?? null;
  const claimSignerAddress = getClaimSignerAddress();
  const configured = Boolean(tokenAddress && claimSignerAddress);

  if (!walletParam) {
    return Response.json({
      configured,
      tokenAddress,
      claimSignerAddress,
      chainId: CHAIN_ID_BASE,
      minClaim: MIN_CLAIM_AMOUNT,
      tokenDecimals: TOKEN_DECIMALS,
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

  const queue = await getQueueForWallet(wallet);
  const state = await getClaimableState(wallet, queue.totalQueued);

  return Response.json({
    configured,
    tokenAddress,
    claimSignerAddress,
    chainId: CHAIN_ID_BASE,
    minClaim: MIN_CLAIM_AMOUNT,
    tokenDecimals: TOKEN_DECIMALS,
    wallet,
    totalQueuedTokens: queue.totalQueued,
    totalClaimedWei: state.totalClaimedWei.toString(),
    availableTokens: Number(state.availableWhole),
    availableWei: state.availableWei.toString(),
    lockedWei: state.lockedWei.toString(),
    pending: state.pending,
  });
}

type ClaimBody = { wallet?: unknown };

/**
 * POST /api/claim
 * Body: { wallet }
 *
 * Allocates a fresh nonce + EIP-191 signature authorising
 * MineToken.claim(amount, nonce, signature) for the caller's wallet.
 * Returns the signature plus the amount the contract expects.
 */
export async function POST(req: NextRequest) {
  let body: ClaimBody;
  try {
    body = (await req.json()) as ClaimBody;
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const walletParam = typeof body.wallet === "string" ? body.wallet : "";
  let wallet: string;
  try {
    wallet = normalizeAddress(walletParam);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "invalid address" },
      { status: 400 },
    );
  }

  const queue = await getQueueForWallet(wallet);
  const result = await signClaimForWallet({
    wallet,
    amountTokens: queue.totalQueued,
    totalQueuedTokens: queue.totalQueued,
  });

  if (!result.ok) {
    const status =
      result.reason === "no-signer" || result.reason === "no-token"
        ? 503
        : 400;
    return Response.json(result, { status });
  }

  return Response.json({
    ok: true,
    wallet,
    amountTokens: result.amountTokens,
    amountWei: result.amountWei,
    nonce: result.nonce,
    signature: result.signature,
    chainId: result.chainId,
    tokenAddress: result.tokenAddress,
    expiresAt: result.expiresAt,
  });
}
