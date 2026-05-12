# BankrMine — CPU-Mined, Bankr-Native Token

> **Tweet, mine, mint.** The first CPU-mineable token whose entire distribution layer is built on [`@bankrbot`](https://bankr.bot). Browser does the work; Bankr does the transfer.

[![phase](https://img.shields.io/badge/status-pre--launch%20preview-7c3aed)](#status)
[![bankr](https://img.shields.io/badge/built%20on-bankr.bot-7c3aed)](https://bankr.bot)
[![chain](https://img.shields.io/badge/chain-Base-0052ff)](https://base.org)

This repo is the reference frontend + backend for **`$MINE`**, a token whose mathematics are inspired by [hash256.org](https://hash256.org) but whose distribution layer is fully Bankr-native:

| hash256.org                                  | BankrMine                                                  |
| -------------------------------------------- | ---------------------------------------------------------- |
| Custom Solidity contract on Ethereum mainnet | ERC-20 launched through Bankr on Base                      |
| `mine(nonce)` on-chain verifier              | `/api/mine` off-chain verifier (open source, deterministic) |
| Reward minted by contract                    | Reward dispatched via [Bankr Wallet API](https://docs.bankr.bot/wallet-api/transfer) |
| Gas paid by miner                            | Gas paid by treasury (optional `MINER_TIP_ETH` to self-fund) |

## Status

This project is currently in **pre-launch preview**. Everything except the on-chain transfer is real:

- Browser PoW miner running keccak256 across all CPU cores
- Per-wallet, per-epoch challenge generation
- Server-side verifier (same code as the client)
- Replay protection + per-epoch quotas
- Live SSE feed, leaderboard, stats
- Live `/api/launch-status` pulling deployer + Bankr Club status + ecosystem launch feed from the Bankr API

Until `$MINE` is deployed on Base, every successful mint accrues into an **IOU queue** instead of triggering a fake transfer. There are no `0xmock…` tx hashes anywhere in the UI. The queue is the auditable source of truth for what every miner is owed, exposed at `/api/claim-queue?wallet=0x...`. When the deployer wallet activates [Bankr Club](https://bankr.bot/club) and `$MINE` deploys, `scripts/bankr-settle.mjs` drains the queue by calling `/wallet/transfer` per IOU and marks each as settled on the server via `/api/claim-queue/settle`. New mints from that point on settle inline.

The protocol badge flips from `pre-launch preview` to `bankr live` the moment `MINE_TOKEN_ADDRESS` is wired into the server env.

## How it works

1. Open `/mine`, paste your Base / EVM wallet address. Nothing is signed.
2. Browser fetches a per-(wallet, epoch) challenge: `challenge = keccak256(projectId ‖ chainId ‖ wallet ‖ epoch)`.
3. `N` Web Workers (one per CPU core) brute-force a nonce until `keccak256(challenge ‖ uint64BE(nonce))` has the required leading zero bits.
4. The page POSTs `{wallet, nonce, epoch}` to `/api/mine`. The server recomputes the challenge and verifies the inequality independently.
5. On success the server calls the Bankr Wallet API to transfer the era's reward to the miner's address. The `txHash` comes back through Bankr.

Difficulty, era schedule, and per-epoch quotas live in [`src/lib/constants.ts`](./src/lib/constants.ts).

## Tokenomics (current defaults — easily tuneable)

| Bucket            | Share | Detail                                       |
| ----------------- | ----- | -------------------------------------------- |
| Mining (PoW)      | 90%   | 18,900,000 $MINE distributed via Bankr       |
| LP seed           | 5%    | Auto-seeded by Bankr on launch               |
| Deployer reserve  | 5%    | 30-day lock                                  |
| Team / VC / airdrop | 0%  |                                              |

- Total supply: **21,000,000 $MINE**
- Era 1 reward: **100 $MINE / mint**
- Halving: every **100,000 mints**

## Architecture

```
Browser (Next.js, TypeScript, Tailwind)
  └── /mine: Web Workers × N cores → @noble/hashes keccak256
                                    ↓ nonce
Backend (Next.js Route Handlers)
  ├── /api/challenge:          deterministic per-wallet challenge
  ├── /api/mine:               verify PoW, transfer or queue IOU
  ├── /api/claim-queue:        per-wallet + global IOU view
  ├── /api/claim-queue/settle: operator-only mark-settled
  ├── /api/launch-status:      cached Bankr-side status + ecosystem feed
  ├── /api/stats, /api/leaderboard
  └── /api/feed (SSE)
            ↓
Bankr API @ api.bankr.bot
  ├── /wallet/me              (X-API-Key)  — polled by /api/launch-status
  ├── /token-launches         (X-API-Key)  — polled by /api/launch-status
  ├── /wallet/transfer        (X-API-Key)  — every mint reward, once $MINE is live
  └── /token-launches/deploy  (X-API-Key)  — one-time $MINE deploy
```

Same `lib/protocol.ts` runs on both sides, so the verifier and the miner cannot drift.

## Local dev

Requirements: Node.js ≥ 22.

```bash
npm install
npm run dev
# → http://localhost:3000
```

No environment variables are required to run the preview — rewards queue as IOUs so the full UI flow is demoable end-to-end.

## Path to a real launch

1. **Generate a Bankr API key** at https://bankr.bot/api. Enable: Wallet API, Agent API, Token Launch API. Disable "Read Only Mode".
2. **Verify the key:**
   ```bash
   BANKR_API_KEY=bk_... node scripts/bankr-check.mjs
   ```
   You should see your EVM wallet address and Base balance.
3. **Subscribe to Bankr Club** at https://bankr.bot/club. Token deploys are gated on club membership (paid in $BNKR). The easiest no-cost route is to earn $BNKR through the Bankr Leaderboard airdrop campaign, then subscribe.
4. **Deploy `$MINE`** via the Token Launch REST endpoint:
   ```bash
   BANKR_API_KEY=bk_... node scripts/bankr-launch.mjs \
     --name "BankrMine" --symbol "MINE" \
     --image https://raw.githubusercontent.com/Bankrmine/bankr-miner/main/public/logo.png \
     --description "First CPU-mineable token on Bankr. No GPU. No ASIC." \
     --website https://github.com/Bankrmine/bankr-miner
   ```
   On success the script prints `MINE_TOKEN_ADDRESS=0x…`. Use `--simulate` for a dry-run that doesn't broadcast.
5. **Wire the address** into the server:
   ```bash
   # .env.local
   BANKR_API_KEY=bk_xxx
   MINE_TOKEN_ADDRESS=0x...
   BANKR_TREASURY_WALLET=0x...   # optional: source wallet for transfers
   ```
6. **Restart the server.** From this point every successful mint triggers a real `/wallet/transfer` and the badge flips to `bankr live`.
7. **Settle the IOU backlog** accumulated during pre-launch:
   ```bash
   BANKR_API_KEY=bk_... MINE_TOKEN_ADDRESS=0x... \
     node scripts/bankr-settle.mjs --server https://your-bankrmine.example --dry-run
   # then drop --dry-run to actually broadcast
   ```
   The script reads `/api/claim-queue`, transfers each pending IOU via `/wallet/transfer`, and calls back to `/api/claim-queue/settle` so the server's view stays in sync with on-chain reality.

### Scripts

| Command          | What it does                                                          |
| ---------------- | --------------------------------------------------------------------- |
| `npm run dev`    | Next.js dev server                                                    |
| `npm run build`  | Production build                                                      |
| `npm run start`  | Production server                                                     |
| `npm run lint`   | ESLint                                                                |
| `node scripts/bankr-check.mjs`  | Verify your `BANKR_API_KEY` + print wallet & portfolio |
| `node scripts/bankr-launch.mjs` | Deploy `$MINE` via Bankr Token Launch API              |
| `node scripts/bankr-settle.mjs` | Drain the IOU queue once `$MINE` is live               |
| `node scripts/test-mine.mjs`    | End-to-end mining smoke test against a running dev server |

## Phase roadmap

- **Phase 1 — pre-launch preview (live)** — scaffold, browser miner, backend verifier, IOU queue, landing page, live feed, real Bankr `/wallet/me` + `/token-launches` integration.
- **Phase 2 — live launch** — activate Bankr Club, deploy `$MINE` via Token Launch API, settle the pre-launch IOU backlog, switch new mints to inline `/wallet/transfer`.
- **Phase 3 — durable infra** — Postgres / Vercel KV state, daily Merkle root anchoring on Base, Telegram/Discord bots, "mining season" prediction markets via Bankr's Polymarket integration.

## Acknowledgements

- [Bankr](https://bankr.bot) for the agent, wallet, and token launch primitives this project is built on.
- [hash256.org](https://hash256.org) for the cleanest implementation of browser-mineable tokenomics.

## License

MIT
