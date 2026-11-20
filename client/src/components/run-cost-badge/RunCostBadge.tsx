/* RunCostBadge — what a review cost (M1). Two variants:
   compact → "$0.012"            (PR list Cost column — total of all the PR's runs)
   full    → "$0.014 · 15k→1.2k" (PR timeline run row)
   No cost data renders "—" only (never "$0.00", and no tokens). */
"use client";

import { useTranslations } from "next-intl";
import { formatCost, formatTokens } from "./helpers";

export interface RunCostBadgeProps {
  costUsd: number | null | undefined;
  tokensIn?: number | null;
  tokensOut?: number | null;
  variant?: "compact" | "full";
  /** Replaces the per-run tooltip when the cost is known (e.g. the PR-list total). */
  tooltip?: string;
}

export function RunCostBadge({ costUsd, tokensIn, tokensOut, variant = "compact", tooltip }: RunCostBadgeProps) {
  const t = useTranslations("common");
  const known = costUsd != null && Number.isFinite(costUsd);
  const showTokens = variant === "full" && known && tokensIn != null && tokensOut != null;
  return (
    <span
      className="mono tnum"
      title={known ? (tooltip ?? t("cost.tooltip")) : t("cost.noData")}
      style={{
        fontSize: 12,
        color: known ? "var(--text-secondary)" : "var(--text-muted)",
        whiteSpace: "nowrap",
      }}
    >
      {formatCost(costUsd)}
      {showTokens ? ` · ${formatTokens(tokensIn, tokensOut)}` : ""}
    </span>
  );
}

export default RunCostBadge;
