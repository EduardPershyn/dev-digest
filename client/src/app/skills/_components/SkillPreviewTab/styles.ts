import type { CSSProperties } from "react";

/** Co-located styles for SkillPreviewTab. */
export const s = {
  wrap: { maxWidth: 860, display: "flex", flexDirection: "column", gap: 26 } satisfies CSSProperties,
  h2: { fontSize: 18, fontWeight: 700 } satisfies CSSProperties,
  h3: { fontSize: 15, fontWeight: 650, display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  sub: { fontSize: 13, color: "var(--text-muted)", margin: "4px 0 12px" } satisfies CSSProperties,
  tokens: { fontSize: 12, color: "var(--text-muted)", fontWeight: 400 } satisfies CSSProperties,
  rendered: {
    border: "1px solid var(--border)",
    borderRadius: 10,
    padding: "18px 20px",
    background: "var(--bg-elevated)",
    fontSize: 14,
  } satisfies CSSProperties,
  block: {
    margin: 0,
    whiteSpace: "pre-wrap",
    fontSize: 12,
    lineHeight: 1.5,
    border: "1px solid var(--border)",
    borderRadius: 10,
    padding: "14px 16px",
    background: "var(--code-bg)",
    maxHeight: 480,
    overflow: "auto",
  } satisfies CSSProperties,
} as const;
