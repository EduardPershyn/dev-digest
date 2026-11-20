/* FindingsCell — PR-list FINDINGS column: SEV icon + count per non-zero severity
   (open findings of each agent's latest review), with a hover/focus popover that
   previews them. Data comes with the list response — no extra request. */
"use client";

import React from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { Icon, SEV } from "@devdigest/ui";
import type { PrFindingsSummary } from "@devdigest/shared";
import { SEVERITY_LEVELS } from "@/lib/severity";
import { FindingsPopover } from "./FindingsPopover";
import { popoverPosition, type PopoverPosition } from "./helpers";
import { s } from "./styles";

/** Grace period so the cursor can travel from the cell into the popover. */
const CLOSE_DELAY_MS = 120;

export function FindingsCell({ findings }: { findings: PrFindingsSummary | null | undefined }) {
  const t = useTranslations("prReview.list.findings");
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
  // instead of letting it drift away from its cell.
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

  if (!findings) {
    return (
      <span style={s.muted} title={t("notReviewed")}>
        —
      </span>
    );
  }
  if (findings.total === 0) {
    return (
      <span style={s.muted} title={t("none")}>
        0
      </span>
    );
  }

  const levels = SEVERITY_LEVELS.filter((sev) => findings.counts[sev] > 0);
  const summary = levels
    .map((sev) => t("levelCount", { count: findings.counts[sev], label: SEV[sev].label.toLowerCase() }))
    .join(", ");

  return (
    <>
      <span
        ref={triggerRef}
        tabIndex={0}
        aria-label={t("cellLabel", { summary })}
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
              <span className="tnum">{findings.counts[sev]}</span>
            </span>
          );
        })}
      </span>
      {position &&
        createPortal(
          <FindingsPopover
            id={popId}
            findings={findings}
            position={position}
            onMouseEnter={cancelClose}
            onMouseLeave={closeSoon}
          />,
          document.body,
        )}
    </>
  );
}
