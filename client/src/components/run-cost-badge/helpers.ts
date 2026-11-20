/** Formatting for run cost / tokens (M1 cost badge). Pure — unit-tested. */

/**
 * USD → display string. `—` is reserved for "no data" (null/undefined/NaN):
 * a KNOWN zero (free model) renders `$0.00`, never `—`.
 *   0 → $0.00 · <0.001 → <$0.001 · <1 → 3 decimals · ≥1 → 2 decimals
 */
export function formatCost(usd: number | null | undefined): string {
  if (usd == null || !Number.isFinite(usd)) return "—";
  if (usd === 0) return "$0.00";
  if (usd < 0.001) return "<$0.001";
  if (usd < 1) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}

/** Token in→out summary (e.g. "12k→1.5k"). */
export function formatTokens(tokensIn: number, tokensOut: number): string {
  return `${(tokensIn / 1000).toFixed(0)}k→${(tokensOut / 1000).toFixed(1)}k`;
}
