// Sanity-check BANKR_API_KEY: hits the Bankr wallet API and prints the
// associated wallet + portfolio summary. Use this BEFORE wiring real
// transfers so you know the key is alive and has the right access.
//
// Usage:  BANKR_API_KEY=bk_... node scripts/bankr-check.mjs

const KEY = process.env.BANKR_API_KEY;
if (!KEY) {
  console.error("BANKR_API_KEY is not set. Get one at https://bankr.bot/api");
  process.exit(2);
}

const BASE = "https://api.bankr.bot";

async function get(path) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "X-API-Key": KEY, "Content-Type": "application/json" },
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { status: res.status, json };
}

console.log("→ GET /wallet/me");
const me = await get("/wallet/me");
console.log(`  ${me.status}`, JSON.stringify(me.json, null, 2));

console.log("\n→ GET /wallet/portfolio");
const port = await get("/wallet/portfolio");
console.log(`  ${port.status}`, JSON.stringify(port.json, null, 2));

if (me.status !== 200) {
  console.error("\n✗ key is not usable for wallet operations. Check at https://bankr.bot/api.");
  process.exit(1);
}
console.log("\n✓ key works. ready for phase 2.");
