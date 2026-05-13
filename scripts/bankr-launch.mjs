// Launch $MINE through the Bankr Token Launch REST API.
//
// Uses the direct deploy endpoint (POST /token-launches/deploy), which is
// authenticated by the standard X-API-Key header. Your key must:
//   1. Have Agent API access enabled
//   2. Not be in read-only mode
//   3. Be associated with an active Bankr Club membership (paid in $BNKR)
//
// See: https://docs.bankr.bot/token-launching/deploy-api
//
// Usage:
//   BANKR_API_KEY=bk_... node scripts/bankr-launch.mjs \
//     --name "BankrMine" --symbol "MINE" \
//     --image https://example.com/logo.png \
//     --description "First CPU-mineable token on Bankr." \
//     --website https://github.com/Bankrmine/bankr-miner \
//     [--tweet https://x.com/.../status/...] \
//     [--fee-wallet 0x...] \
//     [--simulate]   # dry-run, no broadcast

const KEY = process.env.BANKR_API_KEY;
if (!KEY) {
  console.error("BANKR_API_KEY is not set.");
  process.exit(2);
}

const args = parseArgs(process.argv.slice(2));
const tokenName = args.name ?? "BankrMine";
const tokenSymbol = args.symbol ?? "MINE";
const image = args.image;
const description = args.description;
const websiteUrl = args.website;
const tweetUrl = args.tweet;
const feeWallet = args["fee-wallet"];
const simulateOnly = Boolean(args.simulate);

const body = {
  tokenName,
  tokenSymbol,
  ...(description ? { description } : {}),
  ...(image ? { image } : {}),
  ...(websiteUrl ? { websiteUrl } : {}),
  ...(tweetUrl ? { tweetUrl } : {}),
  ...(feeWallet
    ? { feeRecipient: { type: "wallet", value: feeWallet } }
    : {}),
  simulateOnly,
};

const BASE = "https://api.bankr.bot";

console.log("→ POST /token-launches/deploy");
console.log(`  ${JSON.stringify(body, null, 2)}`);

const res = await fetch(`${BASE}/token-launches/deploy`, {
  method: "POST",
  headers: {
    "X-API-Key": KEY,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(body),
});

const text = await res.text();
let json;
try {
  json = JSON.parse(text);
} catch {
  json = { raw: text };
}

console.log(`\n  status=${res.status}`);
console.log(JSON.stringify(json, null, 2));

if (!res.ok) {
  console.error("\n✗ deploy failed");
  if (json?.error === "Token launches are available to Bankr Club members only.") {
    console.error(
      "\n  → Subscribe at https://bankr.bot/club " +
        "(membership paid in $BNKR; see docs for the current rate).",
    );
  }
  process.exit(1);
}

const addr = extractTokenAddress(json);
if (addr) {
  console.log(`\n✓ token address: ${addr}`);
  if (!simulateOnly) {
    console.log(`\n  Put this in your .env.local:`);
    console.log(`  MINE_TOKEN_ADDRESS=${addr}`);
  } else {
    console.log("  (simulate-only: nothing broadcast on chain)");
  }
} else {
  console.log("\n(could not auto-extract token address; inspect the response above)");
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) {
        out[key] = true;
      } else {
        out[key] = next;
        i++;
      }
    }
  }
  return out;
}

function extractTokenAddress(payload) {
  if (!payload || typeof payload !== "object") return null;
  const candidates = [
    payload.tokenAddress,
    payload.contractAddress,
    payload.deployedAddress,
    payload.address,
    payload.data?.tokenAddress,
    payload.data?.contractAddress,
    payload.predictedAddress,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && /^0x[a-fA-F0-9]{40}$/.test(c)) {
      return c;
    }
  }
  return null;
}
