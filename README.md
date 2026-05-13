# BankrMine — Mint-on-Claim, CPU-Mined ERC-20 on Base

> **Mine in the browser. Mint on-chain.** A fair-launch ERC-20 whose total supply starts at 0 and only grows when miners cash in their proof-of-work IOUs through a backend-signed `claim()` on Base.

[![live](https://img.shields.io/badge/live-bankr--miner.vercel.app-22c55e)](https://bankr-miner.vercel.app)
[![chain](https://img.shields.io/badge/chain-Base-0052ff)](https://base.org)
[![model](https://img.shields.io/badge/model-mint--on--claim-7c3aed)](#how-it-works)

**▶ Live preview:** https://bankr-miner.vercel.app — connect a Base wallet, your browser starts mining `$MINE` in seconds. Solutions accrue as IOUs; once you cross **100 $MINE**, click **Claim** to mint on-chain.

This repo is the reference frontend + backend + smart contract for **`$MINE`**, with mining math inspired by [hash256.org](https://hash256.org) but tuned for Base:

| hash256.org                                  | BankrMine                                                  |
| -------------------------------------------- | ---------------------------------------------------------- |
| Custom Solidity contract on Ethereum mainnet | `MineToken.sol` ERC-20 on Base                             |
| `mine(nonce)` on-chain verifier              | `/api/mine` off-chain verifier (open source, deterministic) |
| Reward minted by contract per solve          | Reward batched as IOU, minted on `claim(amount, nonce, signature)` |
| Gas paid by miner per solve                  | Gas paid by miner only on claim; mining itself is gasless  |

## How it works

1. Open `/mine`. Connect a Base wallet via the header button (MetaMask, Coinbase Wallet, WalletConnect).
2. Browser fetches a per-`(wallet, epoch)` challenge: `challenge = keccak256(projectId ‖ chainId ‖ wallet ‖ epoch)`.
3. `N` Web Workers (one per CPU core) brute-force a nonce until `keccak256(challenge ‖ uint64BE(nonce))` has the required leading zero bits.
4. The page POSTs `{wallet, nonce, epoch}` to `/api/mine`. The server recomputes the challenge and verifies independently. On success the reward is recorded as an off-chain IOU.
5. Once your IOU balance crosses **`MIN_CLAIM_AMOUNT` (100 $MINE by default)**, click **Claim**. The backend signs an EIP-191 permit; the page calls `MineToken.claim(amount, nonce, signature)` and the contract mints fresh `$MINE` directly to your wallet.

The signed digest is `keccak256(abi.encodePacked(claimer, amount, nonce, chainId, contract))` wrapped in `"\x19Ethereum Signed Message:\n32"`. Anti-replay is on-chain via `mapping(bytes32 => bool) usedNonces`.

Difficulty, era schedule, claim threshold, and per-epoch quotas live in [`src/lib/constants.ts`](./src/lib/constants.ts). The contract is at [`contracts/MineToken.sol`](./contracts/MineToken.sol).

## Tokenomics (defaults)

| Bucket               | Share | Detail                                            |
| -------------------- | ----- | ------------------------------------------------- |
| Mining (PoW)         | 90%   | 90,000,000 $MINE minted lazily via `claim()`      |
| LP seed              | 5%    | 5,000,000 $MINE — `ownerMint()` into LP pair      |
| Deployer reserve     | 5%    | 5,000,000 $MINE — 30-day off-chain lock           |
| Team / VC / airdrop  | 0%    |                                                   |

- Max supply (hard cap, on-chain): **100,000,000 $MINE**
- Era 1 reward: **500 $MINE / mint**
- Halving: every **100,000 mints**
- Minimum claim: **100 $MINE** (below this, IOUs keep accruing)
- Network: **Base mainnet (chainId 8453)**

## Architecture

```
Browser (Next.js, TypeScript, Tailwind, wagmi v3)
  ├── header /Connect wallet: injected + Coinbase Wallet + WalletConnect (Base only)
  └── /mine: Web Workers × N cores → @noble/hashes keccak256
                                    ↓ nonce
Backend (Next.js Route Handlers)
  ├── /api/challenge:          deterministic per-wallet challenge
  ├── /api/mine:               verify PoW, record IOU
  ├── /api/claim-queue:        per-wallet + global IOU view
  ├── /api/claim         GET:  available claim state for a wallet
  ├── /api/claim         POST: sign EIP-191 permit for MineToken.claim()
  ├── /api/claim/confirm POST: bump server-side `totalClaimed` after on-chain tx
  ├── /api/stats, /api/leaderboard
  └── /api/feed (SSE)
            ↓
Base mainnet
  └── MineToken.sol
        ├── claim(amount, nonce, signature)  — anyone, gated by claimSigner sig
        ├── ownerMint(to, amount)            — owner, for LP / reserve
        ├── setClaimSigner(addr)             — owner, key rotation
        └── toggleClaimsPaused()             — owner, emergency stop
```

Same `lib/protocol.ts` runs on both client and server, so the verifier and miner cannot drift.

## Local dev

Requirements: Node.js ≥ 22.

```bash
npm install
npm run dev
# → http://localhost:3000
```

No env vars are required to run the preview — mining works and IOUs accumulate in memory. To enable on-chain claims locally you need to set `MINE_TOKEN_ADDRESS` + `CLAIM_SIGNER_PRIVATE_KEY` (see `.env.example`).

For production, configure durable Redis/KV storage so serverless cold starts and instance rotation do not clear mined blocks, leaderboard rows, or IOUs:

```bash
KV_REST_API_URL=https://...
KV_REST_API_TOKEN=...
# or the equivalent Upstash names:
UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_TOKEN=...
```

## Path to a real launch

1. **Generate two wallets:**
   - **Deployer / owner wallet** — pays gas for deploy. Holds admin powers (pause, signer rotation, ownerMint).
   - **Claim signer wallet** — a separate hot wallet whose private key lives only on the backend, used to sign EIP-191 claim permits. Its public address is set on-chain via the `MineToken` constructor; rotate via `setClaimSigner()` if it ever leaks.

2. **Compile + deploy:**
   ```bash
   npm run compile:contracts     # runs solc, writes src/lib/contracts/MineToken.json
   PRIVATE_KEY=0x... \
   CLAIM_SIGNER_ADDRESS=0x... \
   npm run deploy:mine-token
   ```
   On success the script prints the address. Add `SIMULATE=1` for a dry-run.

3. **Wire the env vars (Vercel or `.env.local`):**
   ```bash
   MINE_TOKEN_ADDRESS=0x...
   NEXT_PUBLIC_MINE_TOKEN_ADDRESS=0x...     # same address, frontend mirror
   NEXT_PUBLIC_MINE_CHAIN_ID=8453            # Base mainnet
   CLAIM_SIGNER_PRIVATE_KEY=0x...            # NOT your owner key
   # optional
   NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=...
   ```

4. **Seed the LP + reserve** (owner-only, runs once):
   - Call `ownerMint(<lpPairAddress>, 5_000_000e18)` to seed a Uniswap/Aerodrome pair.
   - Call `ownerMint(<deployerWallet>, 5_000_000e18)` to mint the deployer reserve (keep this locked off-chain for 30 days).

5. **Done.** Miners can claim from the moment `MINE_TOKEN_ADDRESS` is set. The frontend hides the claim panel while it's unset.

### Scripts

| Command                              | What it does                                                          |
| ------------------------------------ | --------------------------------------------------------------------- |
| `npm run dev`                        | Next.js dev server                                                    |
| `npm run build`                      | Production build                                                      |
| `npm run start`                      | Production server                                                     |
| `npm run lint`                       | ESLint                                                                |
| `npm run compile:contracts`          | Compile `contracts/MineToken.sol` → `src/lib/contracts/MineToken.json` |
| `npm run deploy:mine-token`          | Deploy MineToken via viem. Requires `PRIVATE_KEY`, `CLAIM_SIGNER_ADDRESS` |
| `node scripts/test-mine.mjs`         | End-to-end mining smoke test against a running dev server             |

## Security notes

- `CLAIM_SIGNER_PRIVATE_KEY` is the most sensitive secret. Anyone holding it can mint up to `MAX_SUPPLY - totalSupply` `$MINE` to any address they control. Keep it on the backend only.
- The IOU queue is the off-chain source of truth for "how much have you mined". A reset (e.g. losing Redis) means new claims will only credit IOUs accrued after the reset. The contract's `usedNonces` mapping still prevents double-spend of any previously-signed permit.
- The contract has no upgradeability. Bugs are permanent. Audit before sending real liquidity.
- `toggleClaimsPaused()` is the emergency stop. Use it the moment the signer key is suspected leaked, then `setClaimSigner(newAddress)` to rotate.

## Acknowledgements

- [hash256.org](https://hash256.org) for the cleanest implementation of browser-mineable tokenomics.
- [OpenZeppelin](https://www.openzeppelin.com/contracts) for the audited ERC-20 + ECDSA primitives used in `MineToken.sol`.

## License

MIT
