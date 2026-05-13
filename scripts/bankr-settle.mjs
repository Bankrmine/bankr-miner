// Drain the IOU queue once $MINE is live on Base.
//
// While the deployer wallet's Bankr Club is inactive (or $MINE hasn't
// deployed yet), every mint adds an entry to the IOU queue exposed via
// /api/claim-queue. This script reads that queue from a running
// BankrMine server and settles each IOU on-chain by calling
// `POST /wallet/transfer` against the Bankr API, then notifies the
// server via `POST /api/claim-queue/settle` so its view stays in sync.
//
// Requires:
//   - $MINE deployed on Base via `scripts/bankr-launch.mjs`
//   - BANKR_API_KEY exported and the deployer wallet's Bankr Club active
//   - MINE_TOKEN_ADDRESS exported (the Base ERC-20 contract for $MINE)
//   - The server must also have MINE_TOKEN_ADDRESS in its env so
//     /api/claim-queue reports tokenLaunched=true
//
// Usage:
//   BANKR_API_KEY=bk_... MINE_TOKEN_ADDRESS=0x... node scripts/bankr-settle.mjs \
//     --server https://your-bankrmine.example \
//     [--dry-run]   # show plan, don't transfer
//     [--batch 50]  # max IOUs to settle this run (default: 100)

const args = parseArgs(process.argv.slice(2));
const apiKey = process.env.BANKR_API_KEY;
const tokenAddress = process.env.MINE_TOKEN_ADDRESS;
const server = args.server ?? "http://localhost:3000";
const dryRun = args["dry-run"] === true;
const batchLimit = Number(args.batch ?? 100);

if (!apiKey) {
  console.error("error: BANKR_API_KEY is required");
  process.exit(1);
}
if (!tokenAddress) {
  console.error("error: MINE_TOKEN_ADDRESS is required");
  process.exit(1);
}

const summaryRes = await fetch(`${server}/api/claim-queue`);
if (!summaryRes.ok) {
  console.error(`error: GET ${server}/api/claim-queue → ${summaryRes.status}`);
  process.exit(1);
}
const summary = await summaryRes.json();
if (!summary.tokenLaunched) {
  console.error(
    "error: server reports tokenLaunched=false. " +
      "Set MINE_TOKEN_ADDRESS on the server side too before settling.",
  );
  process.exit(1);
}
console.log("queue summary:", summary.summary);

// We need the per-wallet drilldown to get individual IOU rows. The
// summary endpoint doesn't expose them in bulk, so we read each miner
// from the leaderboard.
const lbRes = await fetch(`${server}/api/leaderboard`);
const lb = await lbRes.json();
const wallets = (lb.leaderboard ?? []).map((r) => r.wallet);
console.log(`leaderboard has ${wallets.length} miners to consider.`);

let settled = 0;
let skipped = 0;
let errors = 0;

outer: for (const wallet of wallets) {
  const qRes = await fetch(
    `${server}/api/claim-queue?wallet=${wallet}`,
  );
  if (!qRes.ok) {
    console.warn(`skip ${wallet}: claim-queue ${qRes.status}`);
    skipped += 1;
    continue;
  }
  const q = await qRes.json();
  const rewards = q.queue?.rewards ?? [];
  const pending = rewards.filter((r) => !r.settlementTxHash);
  if (pending.length === 0) {
    skipped += 1;
    continue;
  }
  console.log(
    `\n${wallet} → ${pending.length} pending IOUs · ${pending
      .reduce((s, r) => s + r.amount, 0)
      .toFixed(2)} MINE`,
  );

  for (const iou of pending) {
    if (settled >= batchLimit) {
      console.log(
        `  batch limit ${batchLimit} reached, stopping. Re-run to continue.`,
      );
      break outer;
    }

    if (dryRun) {
      console.log(
        `  (dry-run) IOU ${iou.id} mintIndex=${iou.mintIndex} → ${iou.amount} MINE`,
      );
      continue;
    }

    const body = {
      tokenAddress,
      recipientAddress: wallet,
      amount: iou.amount.toString(),
      isNativeToken: false,
    };
    try {
      const res = await fetch("https://api.bankr.bot/wallet/transfer", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": apiKey,
        },
        body: JSON.stringify(body),
      });
      const text = await res.text();
      if (!res.ok) {
        console.error(
          `  IOU ${iou.id} transfer failed (${res.status}): ${text.slice(0, 200)}`,
        );
        errors += 1;
        continue;
      }
      let json;
      try {
        json = JSON.parse(text);
      } catch {
        console.error(
          `  IOU ${iou.id} transfer returned non-JSON: ${text.slice(0, 200)}`,
        );
        errors += 1;
        continue;
      }
      if (!json.success || !json.txHash) {
        console.error(
          `  IOU ${iou.id} transfer no-txHash: ${text.slice(0, 200)}`,
        );
        errors += 1;
        continue;
      }

      // Notify the server so /api/claim-queue reflects reality.
      const ack = await fetch(`${server}/api/claim-queue/settle`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": apiKey,
        },
        body: JSON.stringify({
          wallet,
          mintIndex: iou.mintIndex,
          txHash: json.txHash,
        }),
      });
      if (!ack.ok) {
        console.warn(
          `  IOU ${iou.id} transferred (${json.txHash}) but server ack failed (${ack.status})`,
        );
      } else {
        console.log(`  IOU ${iou.id} settled: ${json.txHash}`);
      }
      settled += 1;
    } catch (err) {
      console.error(`  IOU ${iou.id} network error: ${err?.message ?? err}`);
      errors += 1;
    }
  }
}

console.log(
  `\ndone: settled=${settled} skipped=${skipped} errors=${errors}${dryRun ? " (dry-run)" : ""}`,
);

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) {
      out[key] = true;
    } else {
      out[key] = next;
      i += 1;
    }
  }
  return out;
}
