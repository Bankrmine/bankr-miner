/**
 * Inline "not audited" disclaimer. Rendered near the high-stakes
 * entry points (landing CTA area, mine page above Connect/Claim) so
 * users see it before they connect a wallet or sign a claim.
 */
export function RiskBanner({
  compact = false,
}: {
  compact?: boolean;
}) {
  return (
    <div
      role="note"
      className={
        "rounded-md border flex flex-wrap gap-x-2 gap-y-1 items-baseline " +
        (compact ? "px-3 py-2 text-[11px]" : "px-4 py-3 text-xs sm:text-sm")
      }
      style={{
        background:
          "color-mix(in oklab, var(--accent) 10%, var(--surface-muted))",
        borderColor:
          "color-mix(in oklab, var(--accent) 40%, var(--border))",
      }}
    >
      <span className="label-kbd" style={{ color: "var(--accent-strong)" }}>
        ⚠ not audited
      </span>
      <span className="text-[color:var(--foreground)]">
        BankrMine is an open-source demo. Smart contracts have not been
        professionally audited. Read{" "}
        <a
          href="https://github.com/Bankrmine/bankr-miner/blob/main/contracts/MineToken.sol"
          target="_blank"
          rel="noreferrer"
          className="underline"
        >
          MineToken.sol
        </a>{" "}
        before connecting real value.
      </span>
    </div>
  );
}
