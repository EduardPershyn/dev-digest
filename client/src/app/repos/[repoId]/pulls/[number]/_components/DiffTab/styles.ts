import type { CSSProperties } from "react";
import { GROUP_HEADER_STICKY_TOP } from "./constants";

/** Styles for the Files changed tab (M3 Smart Diff). */
export const s = {
  groups: { display: "flex", flexDirection: "column", gap: 18 } satisfies CSSProperties,
  header: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
    marginBottom: 14,
  } satisfies CSSProperties,
  title: {
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: "0.07em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  totals: { fontSize: 12.5, color: "var(--text-muted)" } satisfies CSSProperties,
  headerRight: { marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  segmented: {
    display: "inline-flex",
    gap: 2,
    padding: 2,
    borderRadius: 8,
    border: "1px solid var(--border)",
  } satisfies CSSProperties,
  notReviewed: { fontSize: 12.5, color: "var(--text-muted)", fontStyle: "italic" } satisfies CSSProperties,
  /** Group header row: sticky inside `<main overflow:auto>`; sits under the sticky PR header. */
  groupHeader: {
    position: "sticky",
    top: GROUP_HEADER_STICKY_TOP,
    zIndex: 2,
    background: "var(--bg-primary)",
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 2px",
    marginBottom: 8,
  } satisfies CSSProperties,
  chevronBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 10,
    background: "none",
    border: "none",
    padding: 0,
    cursor: "pointer",
    color: "inherit",
    font: "inherit",
    minWidth: 0,
  } satisfies CSSProperties,
  groupLabel: { fontSize: 13.5, fontWeight: 700, color: "var(--text-primary)" } satisfies CSSProperties,
  groupDesc: {
    fontSize: 12.5,
    color: "var(--text-muted)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  groupRight: {
    marginLeft: "auto",
    display: "inline-flex",
    alignItems: "center",
    gap: 12,
    fontSize: 12.5,
    color: "var(--text-muted)",
    flexShrink: 0,
  } satisfies CSSProperties,
  flagged: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    color: "var(--crit)",
    fontWeight: 600,
  } satisfies CSSProperties,
} as const;

/** Role colour square in a group header. */
export function roleSquare(color: string): CSSProperties {
  return { width: 10, height: 10, borderRadius: 2, background: color, flexShrink: 0 };
}

/** Group chevron rotates 90deg when the group is open. */
export function groupChevron(open: boolean): CSSProperties {
  return {
    color: "var(--text-muted)",
    transform: open ? "rotate(90deg)" : "none",
    transition: "transform .12s",
    flexShrink: 0,
  };
}
