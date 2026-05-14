/**
 * BankrMine protocol parameters.
 *
 * Distribution uses an on-chain mint-on-claim ERC-20 on Base — supply
 * is 0 at deploy and grows only when miners cash in their off-chain
 * PoW IOUs via claim().
 */

export const TOKEN_NAME = "BankrMine";
export const TOKEN_SYMBOL = "MINE";

/**
 * Live mainnet contract address. Mirrors the MINE_TOKEN_ADDRESS env var
 * used by the backend; baked in here so UI copy can reference it without
 * a runtime fetch.
 */
export const MINE_TOKEN_ADDRESS =
  "0x953fd216902e6e43AF3d518a2767d7817FCe0490";

export const TOTAL_SUPPLY = 100_000_000; // hard cap enforced on-chain
export const DEPLOYER_RESERVE_PCT = 0.05; // 5% owner-minted, 30-day off-chain lock
export const LP_SEED_PCT = 0.05; // 5% owner-minted to seed Uniswap/Aerodrome LP
export const MINING_PCT = 0.9; // 90% PoW mining, minted lazily via claim()

export const MINING_SUPPLY = Math.floor(TOTAL_SUPPLY * MINING_PCT);

/**
 * Minimum pending IOU balance (in whole MINE) before a miner can
 * trigger an on-chain claim(). Keeps gas-per-MINE reasonable and
 * concentrates txs for cleaner on-chain history.
 */
export const MIN_CLAIM_AMOUNT = 100;

/**
 * How long a backend-issued claim signature remains valid before the
 * server lets the wallet re-issue (i.e. release the optimistic lock).
 */
export const CLAIM_SIGNATURE_TTL_MS = 30 * 60 * 1000;

/**
 * Era schedule. Reward halves at each era boundary.
 * Era 1 -> Era 2 -> ... until total mining supply is exhausted.
 */
export const ERA_1_REWARD = 500;
export const HALVING_CADENCE_MINTS = 100_000;

export function rewardForMintIndex(mintIndex: number): number {
  // mintIndex is 0-based count of mints already finalised.
  const era = Math.floor(mintIndex / HALVING_CADENCE_MINTS);
  // Reward halves each era. Clamp to a minimum of 1 wei-MINE to avoid 0.
  const reward = ERA_1_REWARD / Math.pow(2, era);
  return reward < 0.0000001 ? 0 : reward;
}

export function eraForMintIndex(mintIndex: number): number {
  return Math.floor(mintIndex / HALVING_CADENCE_MINTS) + 1;
}

/**
 * Difficulty.
 *
 * We pick a target such that `keccak256(challenge ‖ nonce) < TARGET`.
 * Smaller TARGET = harder.
 *
 * Retargeting aims for one successful mint per minute globally.
 */
export const DIFFICULTY_LEADING_ZERO_BITS = 24; // ~2^24 hashes per solve
export const MIN_DIFFICULTY_LEADING_ZERO_BITS = 20;
export const MAX_DIFFICULTY_LEADING_ZERO_BITS = 32;
export const RETARGET_INTERVAL_MINTS = 2016; // a la Bitcoin
export const TARGET_MINT_INTERVAL_MS = 60 * 1000;

export const EPOCH_DURATION_MS = 10 * 60 * 1000; // 10 min per epoch
export const MAX_MINTS_PER_EPOCH_PER_WALLET = 5; // anti-spam guard
export const MAX_MINTS_PER_EPOCH_PER_IP = 20;

/**
 * Protocol fee (in ETH) attached as msg.value on every on-chain claim().
 * The full amount is forwarded by the contract to the configured
 * `tipReceiver` wallet. Mining itself remains free; the fee is paid only
 * when a miner finalises an on-chain claim. The live amount is read from
 * the contract's `minerTipWei()` at claim time, so this constant is
 * documentation/reference only.
 */
export const MINER_TIP_ETH = 0.00022;

/**
 * Bankr wiring (optional). Used for the live token-launches feed shown on
 * the landing page. Distribution itself no longer depends on Bankr — see
 * contracts/MineToken.sol for the on-chain claim flow.
 */
export const BANKR_API_BASE = "https://api.bankr.bot";

/**
 * Project identity baked into per-wallet challenges so a solution for one
 * project can't be replayed against another.
 */
export const PROJECT_ID = "bankr-miner-v1";
export const CHAIN_ID_BASE = 8453;

/**
 * Token decimals. ERC-20 fixed at 18 in MineToken.sol.
 */
export const TOKEN_DECIMALS = 18;
