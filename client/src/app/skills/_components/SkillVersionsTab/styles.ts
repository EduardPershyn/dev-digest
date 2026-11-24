import type { CSSProperties } from "react";

/** Co-located styles for SkillVersionsTab (layout from the Versions mockup). */
export const s = {
  wrap: { maxWidth: 860 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  h2: { fontSize: 18, fontWeight: 700 } satisfies CSSProperties,
  sub: { fontSize: 13, color: "var(--text-muted)", margin: "4px 0 16px" } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  item: (open: boolean): CSSProperties => ({
    border: `1px solid ${open ? "var(--border-strong)" : "var(--border)"}`,
    borderRadius: 8,
    background: "var(--bg-elevated)",
    overflow: "hidden",
  }),
  row: { display: "flex", alignItems: "center", gap: 14, padding: "12px 14px" } satisfies CSSProperties,
  vBadge: (current: boolean): CSSProperties => ({
    fontSize: 12,
    fontWeight: 650,
    padding: "3px 8px",
    borderRadius: 5,
    background: current ? "var(--accent-bg)" : "var(--bg-hover)",
    color: current ? "var(--accent-text)" : "var(--text-secondary)",
  }),
  rowText: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  rowTitle: {
    fontSize: 14,
    fontWeight: 600,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  } satisfies CSSProperties,
  rowMeta: { fontSize: 12, color: "var(--text-muted)", marginTop: 2 } satisfies CSSProperties,
} as const;
