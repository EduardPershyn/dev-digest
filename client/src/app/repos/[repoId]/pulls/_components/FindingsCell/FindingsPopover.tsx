/* FindingsPopover — the hover/focus card for the PR-list FINDINGS cell: total,
   a severity-sorted preview of the open findings, and "+N more". */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, SeverityBadge, CategoryTag, ConfidenceNum } from "@devdigest/ui";
import type { PrFindingsSummary } from "@devdigest/shared";
import type { PopoverPosition } from "./helpers";
import { s } from "./styles";

type Category = React.ComponentProps<typeof CategoryTag>["category"];

export function FindingsPopover({
  id,
  findings,
  position,
  onMouseEnter,
  onMouseLeave,
}: {
  id: string;
  findings: PrFindingsSummary;
  position: PopoverPosition;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  const t = useTranslations("prReview.list.findings");
  const hidden = findings.total - findings.top.length;
  return (
    <div
      id={id}
      role="tooltip"
      style={{ ...s.popover, ...position }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div style={s.header}>
        <Icon.Info size={13} />
        {t("header", { count: findings.total })}
      </div>
      {findings.top.map((f) => (
        <div key={f.id} style={s.item}>
          <div style={s.itemHead}>
            <span style={s.itemBadge}>
              <SeverityBadge severity={f.severity} compact />
            </span>
            <div style={s.itemTitleWrap}>
              <span style={s.itemTitle}>{f.title}</span>
              <span style={s.itemCategory}>
                <CategoryTag category={f.category as Category} />
              </span>
            </div>
          </div>
          <div style={s.itemMeta}>
            <span className="mono" style={s.location}>
              {f.file}:{f.start_line === f.end_line ? f.start_line : `${f.start_line}-${f.end_line}`}
            </span>
            <ConfidenceNum value={f.confidence} />
          </div>
          {f.rationale && <div style={s.rationale}>{f.rationale}</div>}
        </div>
      ))}
      {hidden > 0 && <div style={s.more}>{t("more", { count: hidden })}</div>}
    </div>
  );
}
