import type { CSSProperties } from "react";
import { SEV } from "@devdigest/ui";
import type { Severity } from "@devdigest/shared";

/** Co-located styles for SeverityCounters. Colours come only from SEV tokens. */
export const s = {
  group: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" } satisfies CSSProperties,
} as const;

/**
 * One counter pill. Outlined in its severity colour by default; filled when it is the
 * active filter; muted while another level is active or when it has nothing to show.
 */
export function pillStyle(sev: Severity, { active, muted, disabled }: {
  active: boolean;
  muted: boolean;
  disabled: boolean;
}): CSSProperties {
  const { c } = SEV[sev];
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    padding: "3px 11px",
    borderRadius: 999,
    border: `1px solid ${c}`,
    background: active ? c : "transparent",
    color: active ? "var(--bg-surface)" : c,
    fontSize: 12,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    lineHeight: 1.4,
    whiteSpace: "nowrap",
    cursor: disabled ? "default" : "pointer",
    opacity: muted ? 0.45 : 1,
    transition: "background .12s, color .12s, opacity .12s",
  };
}
