import type { CSSProperties } from "react";
import { LIST_WIDTH } from "./constants";

/** Co-located styles for SkillEditorView (mirrors AgentEditorView). */
export const s = {
  frame: { display: "flex", height: "calc(100vh - 52px)" } satisfies CSSProperties,
  list: {
    width: LIST_WIDTH,
    flexShrink: 0,
    borderRight: "1px solid var(--border)",
    display: "flex",
    flexDirection: "column",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  listHead: { display: "flex", alignItems: "center", gap: 10, padding: "16px 16px 12px" } satisfies CSSProperties,
  listTitle: { fontSize: 18, fontWeight: 700, flex: 1 } satisfies CSSProperties,
  listBody: { flex: 1, overflow: "auto", padding: "0 12px 12px", display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  activeRing: (active: boolean): CSSProperties => ({
    borderRadius: 9,
    outline: active ? "1px solid var(--border-strong)" : "none",
  }),
  main: { flex: 1, display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0 } satisfies CSSProperties,
  head: { display: "flex", alignItems: "center", gap: 12, padding: "16px 28px 0", flexShrink: 0 } satisfies CSSProperties,
  h1: { fontSize: 18, fontWeight: 700 } satisfies CSSProperties,
  headActions: { marginLeft: "auto", display: "flex", gap: 8 } satisfies CSSProperties,
  tabsBar: { borderBottom: "1px solid var(--border)", marginTop: 12, flexShrink: 0 } satisfies CSSProperties,
  body: { flex: 1, minHeight: 0, overflow: "auto", padding: "24px 28px 48px" } satisfies CSSProperties,
  loading: { flex: 1, padding: 28, display: "flex", flexDirection: "column", gap: 16 } satisfies CSSProperties,
} as const;
