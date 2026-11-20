/* FindingsPreview — inline SEV icon + count per non-zero severity (`⊘2 ⚠1`),
   focusable, with a hover/focus popover that previews the findings. Shared by the
   PR-list FINDINGS cell and the Timeline run rows (specs/pr-list-findings.md).
   The caller supplies the summary and the wording; this owns the interaction. */
"use client";

import React from "react";
import { createPortal } from "react-dom";
import { Icon, SEV } from "@devdigest/ui";
import type { PrFindingsSummary, Severity } from "@devdigest/shared";
import { SEVERITY_LEVELS } from "@/lib/severity";
import { FindingsPopover } from "./FindingsPopover";
import { popoverPosition, type PopoverPosition } from "./helpers";
import { s } from "./styles";

/** Grace period so the cursor can travel from the trigger into the popover. */
const CLOSE_DELAY_MS = 120;

export interface FindingsPreviewProps {
  /** Must have `total > 0`; the empty states are the caller's to render. */
  summary: PrFindingsSummary;
  /** Popover header. */
  title: string;
  /** Popover footer for the findings not previewed. */
  moreLabel: (hidden: number) => string;
  /** Accessible name of the trigger, built from `levelSummary`. */
  ariaLabel: (levelSummary: string) => string;
  /** One level's spoken form, e.g. "2 critical". */
  levelLabel: (count: number, label: string) => string;
  /** Clicks inside the popover bubble to a clickable parent (PR-list row). */
  clickThrough?: boolean;
}

export function FindingsPreview({
  summary,
  title,
  moreLabel,
  ariaLabel,
  levelLabel,
  clickThrough,
}: FindingsPreviewProps) {
  const popId = React.useId();
  const triggerRef = React.useRef<HTMLSpanElement | null>(null);
  const closeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const [position, setPosition] = React.useState<PopoverPosition | null>(null);

  const cancelClose = React.useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  }, []);
  const open = React.useCallback(() => {
    cancelClose();
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) setPosition(popoverPosition(rect, { width: window.innerWidth, height: window.innerHeight }));
  }, [cancelClose]);
  const close = React.useCallback(() => {
    cancelClose();
    setPosition(null);
  }, [cancelClose]);
  const closeSoon = React.useCallback(() => {
    cancelClose();
    closeTimer.current = setTimeout(() => setPosition(null), CLOSE_DELAY_MS);
  }, [cancelClose]);

  // The popover is position:fixed from a measured rect — close it on scroll/resize
  // instead of letting it drift away from its trigger.
  React.useEffect(() => {
    if (!position) return;
    const onScroll = (e: Event) => {
      // Scrolling inside the (scrollable) popover itself must not close it.
      const pop = document.getElementById(popId);
      if (pop && e.target instanceof Node && pop.contains(e.target)) return;
      close();
    };
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", close);
    };
  }, [position, close, popId]);
  React.useEffect(() => cancelClose, [cancelClose]);

  const levels: Severity[] = SEVERITY_LEVELS.filter((sev) => summary.counts[sev] > 0);
  const levelSummary = levels
    .map((sev) => levelLabel(summary.counts[sev], SEV[sev].label.toLowerCase()))
    .join(", ");

  return (
    <>
      <span
        ref={triggerRef}
        tabIndex={0}
        aria-label={ariaLabel(levelSummary)}
        aria-describedby={position ? popId : undefined}
        onMouseEnter={open}
        onMouseLeave={closeSoon}
        onFocus={open}
        onBlur={close}
        onKeyDown={(e) => {
          if (e.key === "Escape") close();
        }}
        style={s.trigger}
      >
        {levels.map((sev) => {
          const I = Icon[SEV[sev].icon];
          return (
            <span key={sev} style={s.level(SEV[sev].c)}>
              <I size={13} />
              <span className="tnum">{summary.counts[sev]}</span>
            </span>
          );
        })}
      </span>
      {position &&
        createPortal(
          <FindingsPopover
            id={popId}
            findings={summary}
            position={position}
            title={title}
            moreLabel={moreLabel}
            clickThrough={clickThrough}
            onMouseEnter={cancelClose}
            onMouseLeave={closeSoon}
          />,
          document.body,
        )}
    </>
  );
}
