import type { CSSProperties } from "react";

/** Co-located styles for ConventionsView (mirrors SkillsListView). */
const banner: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "10px 14px",
  borderRadius: 8,
  fontSize: 13,
  marginBottom: 14,
};

export const s = {
  page: { padding: "24px 32px 44px", maxWidth: 1000, margin: "0 auto" } satisfies CSSProperties,
  header: { display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 20 } satisfies CSSProperties,
  headerText: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  h1: { fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em" } satisfies CSSProperties,
  subtitle: { fontSize: 14, color: "var(--text-secondary)", marginTop: 4 } satisfies CSSProperties,
  headerActions: { display: "flex", alignItems: "center", gap: 10, paddingTop: 4 } satisfies CSSProperties,
  count: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 12 } satisfies CSSProperties,
  errorBanner: { ...banner, background: "var(--crit-bg)", color: "var(--crit)" } satisfies CSSProperties,
  savedBanner: { ...banner, background: "var(--ok-bg)", color: "var(--ok)" } satisfies CSSProperties,
  errorText: { flex: 1 } satisfies CSSProperties,
  link: { color: "var(--accent-text)", fontWeight: 600 } satisfies CSSProperties,
} as const;
