# accounts (vendor stub)

Empty stub wired as a `file:` dependency so the dynamic `import('accounts')` in `@wagmi/core/tempo` resolves at build time. We never invoke `tempoWallet`, so this module is never executed. See `src/lib/wagmi.ts` for the wagmi setup.
