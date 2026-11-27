/* SmartDiffHeader — "Reviewer-ordered diff" title + totals, the Smart / Original
   order switch, and the comments & findings visibility toggle. */
import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import type { DiffOrder } from "../../constants";
import { s } from "../../styles";

export function SmartDiffHeader({
  totals,
  order,
  onOrderChange,
  toggleCount,
  showComments,
  onToggleComments,
  notReviewed,
}: {
  totals: { count: number; additions: number; deletions: number };
  order: DiffOrder;
  onOrderChange: (order: DiffOrder) => void;
  /** GitHub comments + review findings; the toggle shows only when > 0. */
  toggleCount: number;
  showComments: boolean;
  onToggleComments: () => void;
  /** Show the "review has not been run yet" note (smart order only). */
  notReviewed: boolean;
}) {
  const t = useTranslations("prReview.smartDiff");
  return (
    <div style={s.header}>
      <span style={s.title}>{t("title")}</span>
      <span className="mono tnum" style={s.totals}>
        {t("totals", totals)}
      </span>
      {notReviewed && <span style={s.notReviewed}>{t("notReviewed")}</span>}
      <div style={s.headerRight}>
        {toggleCount > 0 && (
          <Button
            kind="ghost"
            size="sm"
            icon={showComments ? "EyeOff" : "Eye"}
            onClick={onToggleComments}
          >
            {t(showComments ? "hideComments" : "showComments", { count: toggleCount })}
          </Button>
        )}
        <div role="group" aria-label={t("orderLabel")} style={s.segmented}>
          {(["smart", "original"] as const).map((o) => (
            <Button
              key={o}
              // Only `tertiary` renders `active` (filled bg + primary text); `ghost` ignores it.
              kind="tertiary"
              size="sm"
              active={order === o}
              aria-pressed={order === o}
              onClick={() => onOrderChange(o)}
            >
              {t(o === "smart" ? "smartOrder" : "originalOrder")}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
