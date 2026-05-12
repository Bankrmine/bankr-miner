/**
 * Thin Bankr Wallet API client.
 *
 * Three modes, picked from env:
 *  1. neither BANKR_API_KEY nor MINE_TOKEN_ADDRESS set
 *     → returns `{ ok: true, queued: true, reason: 'no-key' }`. Caller
 *       writes the reward into the IOU queue. No fake tx hashes.
 *  2. BANKR_API_KEY set but MINE_TOKEN_ADDRESS not yet (pre-launch)
 *     → returns `{ ok: true, queued: true, reason: 'pre-launch' }`. Same.
 *  3. Both set
 *     → triggers a real `POST /wallet/transfer` and returns the real
 *       on-chain `txHash` from Bankr.
 *
 * Wallet API reference:
 *   https://docs.bankr.bot/wallet-api/transfer/
 *
 *   POST /wallet/transfer
 *   Headers: X-API-Key: bk_...
 *   Body: { tokenAddress, recipientAddress, amount, isNativeToken }
 *   Response: { success: true, txHash: "0x..." }
 *
 * Transfers are currently limited to the Base chain. The key must have
 * Wallet API access enabled and the miner address must not be excluded
 * by an `allowedRecipients` allowlist on the key.
 */
import { BANKR_API_BASE, TOKEN_SYMBOL } from "../constants";

export type TransferResult = {
  ok: boolean;
  /** True when the reward was added to the IOU queue instead of dispatched. */
  queued?: boolean;
  /** Why we queued, when `queued` is true. */
  reason?: "no-key" | "pre-launch";
  /** Final on-chain tx hash, set only on a real `/wallet/transfer`. */
  txHash?: string;
  error?: string;
};

const API_KEY_ENV = "BANKR_API_KEY";
const TOKEN_ADDRESS_ENV = "MINE_TOKEN_ADDRESS";
const TREASURY_ENV = "BANKR_TREASURY_WALLET";

export function bankrConfigured(): boolean {
  return Boolean(process.env[API_KEY_ENV]);
}

export function tokenLaunched(): boolean {
  return Boolean(process.env[TOKEN_ADDRESS_ENV]);
}

/**
 * Transfer `amount` of $MINE to the miner. Resolves once the Bankr job
 * has been submitted (not waited-for); callers can optionally call
 * `pollJob` to wait for chain confirmation.
 */
export async function transferReward(args: {
  to: string;
  amount: number;
}): Promise<TransferResult> {
  const apiKey = process.env[API_KEY_ENV];
  const tokenAddress = process.env[TOKEN_ADDRESS_ENV];
  const treasury = process.env[TREASURY_ENV];

  if (!apiKey) {
    return { ok: true, queued: true, reason: "no-key" };
  }
  if (!tokenAddress) {
    return { ok: true, queued: true, reason: "pre-launch" };
  }

  const body = {
    tokenAddress,
    recipientAddress: args.to,
    amount: args.amount.toString(),
    isNativeToken: false,
  };
  // `treasury` is not part of the public schema; the Wallet API always
  // pulls funds from the wallet bound to the API key. We just log it
  // here when set so deployers can confirm which key they configured.
  if (treasury && process.env.NODE_ENV !== "production") {
    console.info(`[bankr] treasury hint configured: ${treasury}`);
  }

  try {
    const res = await fetch(`${BANKR_API_BASE}/wallet/transfer`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await safeText(res);
      return {
        ok: false,
        error: `bankr ${res.status}: ${text.slice(0, 200)}`,
      };
    }
    const json = (await res.json()) as {
      success?: boolean;
      txHash?: string;
      error?: string;
      message?: string;
    };
    if (json.success === false || !json.txHash) {
      return {
        ok: false,
        error: json.error ?? json.message ?? "bankr returned no txHash",
      };
    }
    return { ok: true, txHash: json.txHash };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "<unreadable>";
  }
}

export const __config__ = {
  apiKeyEnv: API_KEY_ENV,
  tokenAddressEnv: TOKEN_ADDRESS_ENV,
  treasuryEnv: TREASURY_ENV,
  tokenSymbol: TOKEN_SYMBOL,
};
