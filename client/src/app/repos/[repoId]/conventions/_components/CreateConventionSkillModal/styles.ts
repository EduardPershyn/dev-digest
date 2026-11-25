import type { CSSProperties } from "react";

/** Co-located styles for CreateConventionSkillModal. */
export const s = {
  body: { display: "flex", flexDirection: "column", gap: 14 } satisfies CSSProperties,
  listBox: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: "10px 12px",
    background: "var(--bg-elevated)",
    fontSize: 13,
  } satisfies CSSProperties,
  listTitle: { fontWeight: 600, fontSize: 12, color: "var(--text-secondary)" } satisfies CSSProperties,
  checklist: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    marginTop: 8,
    maxHeight: 180,
    overflow: "auto",
  } satisfies CSSProperties,
  twoCol: { display: "grid", gridTemplateColumns: "1fr 180px", gap: 12 } satisfies CSSProperties,
  typeChip: { display: "flex", alignItems: "center", height: 36 } satisfies CSSProperties,
  enabledRow: { display: "flex", alignItems: "flex-start", gap: 12 } satisfies CSSProperties,
  enabledLabel: { fontSize: 13, fontWeight: 600, color: "var(--text-secondary)" } satisfies CSSProperties,
  bodyHead: { display: "flex", alignItems: "center", gap: 10, marginBottom: 8 } satisfies CSSProperties,
  required: { color: "var(--crit)" } satisfies CSSProperties,
  unsaved: { fontSize: 11, color: "var(--warn)", fontWeight: 600 } satisfies CSSProperties,
  muted: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  error: { color: "var(--crit)", fontSize: 13 } satisfies CSSProperties,
  footer: { display: "flex", alignItems: "center", gap: 8, width: "100%" } satisfies CSSProperties,
  spacer: { flex: 1 } satisfies CSSProperties,
} as const;
