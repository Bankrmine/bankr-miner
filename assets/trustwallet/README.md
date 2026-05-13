# TrustWallet Assets Submission

This folder mirrors the directory structure expected by the
[`trustwallet/assets`](https://github.com/trustwallet/assets) repository.

To submit the `$MINE` token logo + metadata to TrustWallet:

1. Fork https://github.com/trustwallet/assets on GitHub.
2. In your fork, copy this folder's contents to the matching path:
   ```
   blockchains/base/assets/0x953fd216902e6e43AF3d518a2767d7817FCe0490/
       ├── logo.png      (256×256, transparent PNG)
       └── info.json     (token metadata)
   ```
3. Optionally append a row for $MINE to
   `blockchains/base/tokenlist.json` (TrustWallet maintainers usually
   handle this themselves on merge).
4. Open a PR against `trustwallet/assets:master`. Reviewer guidelines
   are documented at
   https://developer.trustwallet.com/developer/listing-new-assets
5. Once merged, TrustWallet, Binance Wallet, SafePal, and dozens of
   other wallets / explorers that consume the TrustWallet token
   registry will pick up the logo + metadata automatically.

Note: TrustWallet requires the listed token to have at least 25 unique
on-chain holders before they will approve the listing. If your PR is
auto-rejected on those grounds, wait until the on-chain holder count
crosses that threshold and re-open.

The same `logo.png` is reused for:

- BaseScan token info update (Update Token Info form on
  https://basescan.org/token/0x953fd216902e6e43AF3d518a2767d7817FCe0490 —
  requires the deployer wallet to sign an ownership message).
- Coinbase Wallet token list submission
  (https://github.com/Uniswap/default-token-list — Base is supported).
