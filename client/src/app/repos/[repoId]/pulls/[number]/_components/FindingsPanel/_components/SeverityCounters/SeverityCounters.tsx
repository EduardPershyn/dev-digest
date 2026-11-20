/* SeverityCounters — per-severity finding counts for one review run that double as a
   single-select filter: click a level to show only it, click it again to clear. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SEV } from "@devdigest/ui";
import type { Severity } from "@devdigest/shared";
import { SEVERITY_LEVELS } from "../../constants";
import { pillStyle, s } from "./styles";

export function SeverityCounters({
  counts,
  active,
  onToggle,
}: {
  counts: Record<Severity, number>;
  active: Severity | null;
  onToggle: (sev: Severity) => void;
}) {
  const t = useTranslations("prReview.panel.severityFilter");

  return (
    <div role="group" aria-label={t("groupLabel")} style={s.group}>
      {SEVERITY_LEVELS.map((sev) => {
        const count = counts[sev];
        const label = SEV[sev].label;
        const isActive = active === sev;
        // A zero level can't be picked, but the active one stays clickable so the
        // filter can always be cleared (its count can drop to 0 via "hide low confidence").
        const disabled = count === 0 && !isActive;
        const muted = disabled || (active !== null && !isActive);
        return (
          <button
            key={sev}
            type="button"
            aria-pressed={isActive}
            disabled={disabled}
            title={isActive ? t("clear", { label }) : t("show", { label, count })}
            onClick={() => onToggle(sev)}
            style={pillStyle(sev, { active: isActive, muted, disabled })}
          >
            {t("counter", { count, label })}
          </button>
        );
      })}
    </div>
  );
}
