# BankrMine — CPU-Mined, Bankr-Native Token

> **Tweet, mine, mint.** First CPU-mineable token distributed entirely through [`@bankrbot`](https://bankr.bot). Browser does the work; Bankr does the transfer.

[![phase](https://img.shields.io/badge/phase-1%20(scaffold)-emerald)](#)
[![bankr](https://img.shields.io/badge/built%20on-bankr.bot-emerald)](https://bankr.bot)
[![chain](https://img.shields.io/badge/chain-Base-blue)](https://base.org)

This repo is the reference frontend + backend for **`$MINE`**, a meme/utility token whose mathematics are inspired by [hash256.org](https://hash256.org) but whose distribution layer is fully Bankr-native:

| hash256.org                                  | BankrMine                                                  |
| -------------------------------------------- | ---------------------------------------------------------- |
| Custom Solidity contract on Ethereum mainnet | ERC-20 launched through Bankr on Base                      |
| `mine(nonce)` on-chain verifier              | `/api/mine` off-chain verifier (open source, deterministic) |
| Reward minted by contract                    | Reward dispatched via [Bankr Wallet API](https://docs.bankr.bot/agent-api/authentication) |
| Gas paid by miner                            | Gas paid by treasury (optional `MINER_TIP_ETH` to self-fund) |

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
  ├── /api/challenge: deterministic per-wallet challenge
  ├── /api/mine: verify PoW, dispatch reward, record mint
  ├── /api/stats, /api/leaderboard
  └── /api/feed (SSE)
            ↓
Bankr Wallet API @ api.bankr.bot
  └── /wallet/transfer (X-API-Key: bk_…)
```

Same `lib/protocol.ts` runs on both sides, so the verifier and the miner cannot drift.

## Local dev

Requirements: Node.js ≥ 22.

```bash
npm install
npm run dev
# → http://localhost:3000
```

No environment variables are required for Phase 1 — rewards mock out so the full UI flow is demoable. Wire real Bankr in Phase 2 by setting:

```bash
BANKR_API_KEY=bk_xxx                    # https://bankr.bot/api
MINE_TOKEN_ADDRESS=0x...                # set after `bankr launch`
BANKR_TREASURY_WALLET=0x...             # optional: source wallet for transfers
```

### Scripts

| Command          | What it does           |
| ---------------- | ---------------------- |
| `npm run dev`    | Next.js dev server     |
| `npm run build`  | Production build       |
| `npm run start`  | Production server      |
| `npm run lint`   | ESLint                 |

## Phase roadmap

- **Phase 1 (this PR)** — scaffold, browser miner, backend verifier, mocked Bankr transfers, landing page, live feed.
- **Phase 2** — wire `BANKR_API_KEY`, launch `$MINE` via Bankr, real on-chain rewards, tweet-to-mine flow.
- **Phase 3 (optional)** — on-chain anchoring (publish daily Merkle root of mints to Base), Telegram/Discord bots, "mining season" prediction markets via Bankr's Polymarket integration.

## Acknowledgements

- [Bankr](https://bankr.bot) for the agent + wallet primitives this project is built on.
- [hash256.org](https://hash256.org) for the cleanest implementation of browser-mineable tokenomics.

## License

MIT
