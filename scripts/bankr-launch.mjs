// Launch $MINE through the Bankr Agent API by sending a natural-language
// deploy prompt and polling the resulting job until completion.
//
// Once the job is `completed`, the script prints the new token contract
// address — copy that into your `.env.local` as MINE_TOKEN_ADDRESS.
//
// Usage:
//   BANKR_API_KEY=bk_... node scripts/bankr-launch.mjs \
//     --name "BankrMine" --symbol "MINE" --image https://...

const KEY = process.env.BANKR_API_KEY;
if (!KEY) {
  console.error("BANKR_API_KEY is not set.");
  process.exit(2);
}

const args = parseArgs(process.argv.slice(2));
const name = args.name ?? "BankrMine";
const symbol = args.symbol ?? "MINE";
const image = args.image;

const prompt =
  `Deploy a token called ${name} with symbol ${symbol} on Base.` +
  (image ? ` Use this image: ${image}` : "");

const BASE = "https://api.bankr.bot";

console.log("→ POST /agent/prompt");
console.log(`  ${prompt}`);

const submit = await fetch(`${BASE}/agent/prompt`, {
  method: "POST",
  headers: { "X-API-Key": KEY, "Content-Type": "application/json" },
  body: JSON.stringify({ prompt }),
});
if (!submit.ok) {
  const t = await submit.text();
  console.error(`✗ submit failed ${submit.status}: ${t}`);
  process.exit(1);
}
const submitJson = await submit.json();
const jobId = submitJson.jobId;
if (!jobId) {
  console.error("✗ submit returned no jobId", submitJson);
  process.exit(1);
}
console.log(`  jobId=${jobId}`);

let last = null;
for (let i = 0; i < 60; i++) {
  await sleep(2000);
  const poll = await fetch(`${BASE}/agent/job/${jobId}`, {
    headers: { "X-API-Key": KEY },
  });
  const j = await poll.json();
  if (j.status !== last) {
    console.log(`  status=${j.status}`);
    last = j.status;
  }
  if (j.status === "completed") {
    console.log("\n✓ done");
    console.log(JSON.stringify(j, null, 2));
    const addr = extractTokenAddress(j);
    if (addr) {
      console.log(`\nMINE_TOKEN_ADDRESS=${addr}`);
      console.log("(copy that into .env.local)");
    } else {
      console.log("\n(could not auto-extract token address; inspect the response above)");
    }
    process.exit(0);
  }
  if (j.status === "failed" || j.status === "cancelled") {
    console.error("✗ job ended in", j.status, JSON.stringify(j, null, 2));
    process.exit(1);
  }
}
console.error("✗ timed out waiting for job to complete");
process.exit(1);

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

function extractTokenAddress(job) {
  // The exact shape of `transactions` depends on which path Bankr takes.
  // Try a few likely locations.
  const txs = job?.transactions ?? [];
  for (const tx of txs) {
    const meta = tx?.metadata ?? {};
    const candidates = [
      meta?.tokenAddress,
      meta?.contractAddress,
      meta?.deployedAddress,
      meta?.__ORIGINAL_TX_DATA__?.tokenAddress,
      meta?.__ORIGINAL_TX_DATA__?.address,
    ];
    for (const c of candidates) {
      if (typeof c === "string" && /^0x[a-fA-F0-9]{40}$/.test(c)) {
        return c;
      }
    }
  }
  return null;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
