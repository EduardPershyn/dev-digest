import type { CSSProperties } from "react";

/** Co-located styles for IntentCard. */
export const s = {
  card: {
    border: "1px solid var(--border)",
    borderRadius: 10,
    background: "var(--bg-elevated)",
    padding: "16px 18px",
    display: "flex",
    flexDirection: "column",
    gap: 12,
  } satisfies CSSProperties,
  head: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" } satisfies CSSProperties,
  title: { fontSize: 14, fontWeight: 650, color: "var(--text-primary)" } satisfies CSSProperties,
  headRight: { marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 } satisfies CSSProperties,
  summary: { fontSize: 14, lineHeight: 1.55, color: "var(--text-secondary)", margin: 0 } satisfies CSSProperties,
  scopeGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 12,
  } satisfies CSSProperties,
  subhead: { fontSize: 12, fontWeight: 650, color: "var(--text-muted)", marginBottom: 6 } satisfies CSSProperties,
  list: {
    margin: 0,
    paddingLeft: 18,
    fontSize: 13,
    lineHeight: 1.6,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  muted: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  chips: { display: "flex", gap: 6, flexWrap: "wrap" } satisfies CSSProperties,
  missingRow: { display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap", fontSize: 13 } satisfies CSSProperties,
  missingUrl: { color: "var(--text-secondary)", wordBreak: "break-all" } satisfies CSSProperties,
  meta: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  error: { fontSize: 13, color: "var(--crit)" } satisfies CSSProperties,
} as const;
