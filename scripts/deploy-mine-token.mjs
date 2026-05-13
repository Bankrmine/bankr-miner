// Deploy the MineToken ERC-20 to Base (or Base Sepolia) using viem.
//
// Requirements:
//   - PRIVATE_KEY env var (0x-prefixed). Wallet must hold a small amount of
//     ETH on the target chain for deploy gas (~0.0005 ETH on Base).
//   - CLAIM_SIGNER_ADDRESS env var. This is the public address whose
//     signature will authorise claim() calls. Use a dedicated wallet
//     (NOT your deployer wallet). The private key for this address must
//     live on the backend as CLAIM_SIGNER_PRIVATE_KEY.
//   - Compiled artifact at src/lib/contracts/MineToken.json (run
//     `npm run compile:contracts` first if you've edited the .sol).
//
// Optional env:
//   - RPC_URL              (default: https://mainnet.base.org)
//   - CHAIN                (default: base; one of: base, base-sepolia)
//   - TOKEN_NAME           (default: "BankrMine")
//   - TOKEN_SYMBOL         (default: "MINE")
//   - MAX_SUPPLY           (default: 100000000)  — in whole tokens
//   - OWNER_ADDRESS        (default: deployer)   — receives admin powers
//   - SIMULATE             ("1" to dry-run via eth_call instead of broadcast)
//
// Usage:
//   PRIVATE_KEY=0x... CLAIM_SIGNER_ADDRESS=0x... node scripts/deploy-mine-token.mjs
//
// After success, copy the printed `MINE_TOKEN_ADDRESS` into your Vercel env vars.

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseEther,
  getAddress,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base, baseSepolia } from "viem/chains";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const artifactPath = join(repoRoot, "src", "lib", "contracts", "MineToken.json");

const env = process.env;

const PK = env.PRIVATE_KEY;
if (!PK || !/^0x[0-9a-fA-F]{64}$/.test(PK)) {
  console.error(
    "PRIVATE_KEY env var missing or malformed. Expected 0x + 64 hex chars.",
  );
  process.exit(2);
}

const CLAIM_SIGNER = env.CLAIM_SIGNER_ADDRESS;
if (!CLAIM_SIGNER || !/^0x[0-9a-fA-F]{40}$/.test(CLAIM_SIGNER)) {
  console.error(
    "CLAIM_SIGNER_ADDRESS env var missing or malformed. Expected 0x + 40 hex chars.",
  );
  process.exit(2);
}

const TOKEN_NAME = env.TOKEN_NAME ?? "BankrMine";
const TOKEN_SYMBOL = env.TOKEN_SYMBOL ?? "MINE";
const MAX_SUPPLY_WHOLE = BigInt(env.MAX_SUPPLY ?? "100000000");
const CHAIN_NAME = (env.CHAIN ?? "base").toLowerCase();
const SIMULATE = env.SIMULATE === "1";

const chain = pickChain(CHAIN_NAME);
const rpcUrl = env.RPC_URL ?? chain.rpcUrls.default.http[0];

const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
if (!artifact.abi || !artifact.bytecode) {
  console.error(
    "Missing abi/bytecode in artifact. Run `node scripts/compile-contracts.mjs` first.",
  );
  process.exit(2);
}

const account = privateKeyToAccount(PK);
const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
const walletClient = createWalletClient({ account, chain, transport: http(rpcUrl) });

const owner = env.OWNER_ADDRESS
  ? getAddress(env.OWNER_ADDRESS)
  : account.address;
const claimSigner = getAddress(CLAIM_SIGNER);

console.log(`→ Deploying MineToken to ${chain.name}`);
console.log(`  RPC:           ${rpcUrl}`);
console.log(`  Deployer:      ${account.address}`);
console.log(`  Owner:         ${owner}`);
console.log(`  Claim signer:  ${claimSigner}`);
console.log(`  Name / symbol: ${TOKEN_NAME} / ${TOKEN_SYMBOL}`);
console.log(`  Max supply:    ${MAX_SUPPLY_WHOLE.toString()} ${TOKEN_SYMBOL}`);
console.log(`  Simulate only: ${SIMULATE}`);

const balance = await publicClient.getBalance({ address: account.address });
console.log(`  Balance:       ${formatEth(balance)} ETH`);
const MIN_GAS_BUFFER = parseEther("0.0002");
if (balance < MIN_GAS_BUFFER) {
  console.warn(
    `! Deployer balance is below recommended ${formatEth(MIN_GAS_BUFFER)} ETH. Top up before broadcasting.`,
  );
}

const constructorArgs = [
  TOKEN_NAME,
  TOKEN_SYMBOL,
  MAX_SUPPLY_WHOLE,
  owner,
  claimSigner,
];

if (SIMULATE) {
  console.log("\n(simulate-only: skipping broadcast)");
  process.exit(0);
}

const hash = await walletClient.deployContract({
  abi: artifact.abi,
  bytecode: artifact.bytecode,
  args: constructorArgs,
});
console.log(`\n  tx hash: ${hash}`);
console.log("  waiting for receipt...");

const receipt = await publicClient.waitForTransactionReceipt({ hash });
if (receipt.status !== "success") {
  console.error("✗ deploy failed");
  console.error(receipt);
  process.exit(1);
}

const address = receipt.contractAddress;
if (!address) {
  console.error("✗ deploy receipt missing contractAddress");
  process.exit(1);
}

console.log(`\n✓ deployed at: ${address}`);
console.log(`  block:       ${receipt.blockNumber}`);
console.log(`  gas used:    ${receipt.gasUsed}`);
console.log(`\n  Paste into your .env.local / Vercel env vars:`);
console.log(`  MINE_TOKEN_ADDRESS=${address}`);
console.log(`  NEXT_PUBLIC_MINE_TOKEN_ADDRESS=${address}`);
console.log(`  NEXT_PUBLIC_MINE_CHAIN_ID=${chain.id}`);

function pickChain(name) {
  if (name === "base") return base;
  if (name === "base-sepolia") return baseSepolia;
  console.error(`Unknown CHAIN: ${name}. Use "base" or "base-sepolia".`);
  process.exit(2);
}

function formatEth(wei) {
  // wei is bigint; render to 6 decimals without pulling in formatUnits
  const ether = Number(wei) / 1e18;
  return ether.toFixed(6);
}
