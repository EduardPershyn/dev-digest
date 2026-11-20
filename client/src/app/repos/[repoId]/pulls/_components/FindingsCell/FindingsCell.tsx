/* FindingsCell — PR-list FINDINGS column: SEV icon + count per non-zero severity
   (open findings of each agent's latest review), with a hover/focus popover that
   previews them. Data comes with the list response — no extra request.
   The trigger + popover live in `@/components/findings-preview`; this owns the
   empty states and the PR-list wording. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { PrFindingsSummary } from "@devdigest/shared";
import { FindingsPreview } from "@/components/findings-preview";

const muted: React.CSSProperties = { color: "var(--text-muted)", fontSize: 13 };

export function FindingsCell({ findings }: { findings: PrFindingsSummary | null | undefined }) {
  const t = useTranslations("prReview.list.findings");

  if (!findings) {
    return (
      <span style={muted} title={t("notReviewed")}>
        —
      </span>
    );
  }
  if (findings.total === 0) {
    return (
      <span style={muted} title={t("none")}>
        0
      </span>
    );
  }

  return (
    <FindingsPreview
      summary={findings}
      title={t("header", { count: findings.total })}
      moreLabel={(count) => t("more", { count })}
      ariaLabel={(summary) => t("cellLabel", { summary })}
      levelLabel={(count, label) => t("levelCount", { count, label })}
      clickThrough
    />
  );
}
