import type { CSSProperties } from "react";

/** Co-located styles for SkillConfigTab (mirrors the agent ConfigTab). */
export const s = {
  /* FormField brings its own 20px bottom margin (same rhythm as the agent ConfigTab). */
  wrap: { maxWidth: 820, display: "flex", flexDirection: "column" } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 12, marginBottom: 20 } satisfies CSSProperties,
  h2: { fontSize: 18, fontWeight: 700, flex: 1 } satisfies CSSProperties,
  enabledLabel: { display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13 } satisfies CSSProperties,
  error: { color: "var(--crit)" } satisfies CSSProperties,
  editorHead: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 12px",
    border: "1px solid var(--border)",
    borderBottom: "none",
    borderRadius: "8px 8px 0 0",
    background: "var(--bg-elevated)",
    fontSize: 12,
  } satisfies CSSProperties,
  fileName: { fontWeight: 600 } satisfies CSSProperties,
  tokens: { marginLeft: "auto", color: "var(--text-muted)" } satisfies CSSProperties,
  actions: { display: "flex", alignItems: "center", gap: 12 } satisfies CSSProperties,
  notice: {
    marginBottom: 20,
    display: "flex",
    gap: 10,
    padding: "10px 12px",
    borderRadius: 8,
    background: "var(--warn-bg)",
    color: "var(--warn)",
    fontSize: 13,
    lineHeight: 1.45,
  } satisfies CSSProperties,
} as const;
