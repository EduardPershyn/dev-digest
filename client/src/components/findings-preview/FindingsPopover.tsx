/* FindingsPopover — the hover/focus card behind a findings preview (PR-list
   FINDINGS cell, Timeline run rows): a title, a severity-sorted preview of the
   findings, and "+N more". Wording comes from the caller. */
"use client";

import React from "react";
import { Icon, SeverityBadge, CategoryTag, ConfidenceNum } from "@devdigest/ui";
import type { PrFindingsSummary } from "@devdigest/shared";
import type { PopoverPosition } from "./helpers";
import { s } from "./styles";

type Category = React.ComponentProps<typeof CategoryTag>["category"];

export function FindingsPopover({
  id,
  findings,
  position,
  title,
  moreLabel,
  clickThrough = false,
  onMouseEnter,
  onMouseLeave,
}: {
  id: string;
  findings: PrFindingsSummary;
  position: PopoverPosition;
  /** Header text, e.g. "6 findings" / "2 findings in this run". */
  title: string;
  /** Footer for the findings not previewed; only called when `hidden > 0`. */
  moreLabel: (hidden: number) => string;
  /** Clicks bubble to a clickable parent (the PR-list row) → pointer cursor. */
  clickThrough?: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  const hidden = findings.total - findings.top.length;
  return (
    <div
      id={id}
      role="tooltip"
      style={{ ...s.popover, cursor: clickThrough ? "pointer" : "default", ...position }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div style={s.header}>
        <Icon.Info size={13} />
        {title}
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
      {hidden > 0 && <div style={s.more}>{moreLabel(hidden)}</div>}
    </div>
  );
}
