import type { CSSProperties } from "react";
import type { DiffLine } from "../../helpers";

const LINE_BG: Record<DiffLine["kind"], string> = {
  same: "transparent",
  add: "var(--ok-bg)",
  del: "var(--crit-bg)",
};
const MARK_COLOR: Record<DiffLine["kind"], string> = {
  same: "var(--text-muted)",
  add: "var(--ok)",
  del: "var(--crit)",
};

/** Co-located styles for VersionDiff (unified diff, like the PR diff viewer). */
export const s = {
  wrap: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    padding: "12px 14px 14px",
    borderTop: "1px solid var(--border)",
  } satisfies CSSProperties,
  head: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" } satisfies CSSProperties,
  headText: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  select: { width: 190 } satisfies CSSProperties,
  stats: { fontSize: 12.5, marginLeft: "auto", color: "var(--text-muted)" } satisfies CSSProperties,
  added: { color: "var(--ok)" } satisfies CSSProperties,
  removed: { color: "var(--crit)" } satisfies CSSProperties,
  empty: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  fields: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  fieldRow: { display: "flex", alignItems: "flex-start", gap: 10 } satisfies CSSProperties,
  fieldValues: { display: "flex", flexDirection: "column", gap: 4, minWidth: 0, flex: 1, fontSize: 13 } satisfies CSSProperties,
  fieldBefore: {
    background: "var(--crit-bg)",
    padding: "3px 8px",
    borderRadius: 4,
    lineHeight: 1.5,
    wordBreak: "break-word",
  } satisfies CSSProperties,
  fieldAfter: {
    background: "var(--ok-bg)",
    padding: "3px 8px",
    borderRadius: 4,
    lineHeight: 1.5,
    wordBreak: "break-word",
  } satisfies CSSProperties,
  fieldMark: { display: "inline-block", width: 14, color: "var(--text-muted)", userSelect: "none" } satisfies CSSProperties,
  wordDel: {
    background: "rgba(239, 68, 68, 0.35)",
    color: "var(--text-primary)",
    borderRadius: 3,
    textDecoration: "line-through",
  } satisfies CSSProperties,
  wordAdd: {
    background: "rgba(16, 185, 129, 0.35)",
    color: "var(--text-primary)",
    borderRadius: 3,
    textDecoration: "none",
  } satisfies CSSProperties,
  code: {
    border: "1px solid var(--border)",
    borderRadius: 7,
    overflow: "auto",
    maxHeight: 480,
    fontSize: 12.5,
    lineHeight: 1.6,
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  line: (kind: DiffLine["kind"]): CSSProperties => ({
    display: "flex",
    background: LINE_BG[kind],
    minWidth: "fit-content",
  }),
  no: {
    width: 40,
    flexShrink: 0,
    textAlign: "right",
    paddingRight: 8,
    color: "var(--text-muted)",
    userSelect: "none",
  } satisfies CSSProperties,
  mark: (kind: DiffLine["kind"]): CSSProperties => ({
    width: 18,
    flexShrink: 0,
    textAlign: "center",
    color: MARK_COLOR[kind],
    userSelect: "none",
  }),
  text: { whiteSpace: "pre-wrap", wordBreak: "break-word", paddingRight: 12, flex: 1 } satisfies CSSProperties,
  skip: {
    padding: "3px 12px",
    color: "var(--text-muted)",
    background: "var(--bg-hover)",
    fontSize: 12,
  } satisfies CSSProperties,
} as const;
