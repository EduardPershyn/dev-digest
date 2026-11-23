/* architecture.test.ts — mechanical checks for the client's layering rules
   (frontend-ui-architecture skill, rule IDs in brackets). The client has no
   ESLint, so these run with `pnpm test`. Each failure names the file and rule.
   Scope: src/ minus vendored code and tests. */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = resolve(__dirname, "..");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (p === join(SRC, "vendor")) continue;
      walk(p, out);
    } else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) {
      out.push(p);
    }
  }
  return out;
}

const FILES = walk(SRC).map((abs) => ({
  abs,
  rel: relative(SRC, abs).split(sep).join("/"),
  text: readFileSync(abs, "utf8"),
}));

const IMPORT_RE = /\b(?:from\s+|import\(\s*)["']([^"']+)["']/g;
const importsOf = (text: string) => [...text.matchAll(IMPORT_RE)].map((m) => m[1]!);
/** Resolve an import specifier to a src-relative path (null for packages). */
function target(fromAbs: string, spec: string): string | null {
  if (spec.startsWith("@/")) return spec.slice(2);
  if (spec.startsWith(".")) return relative(SRC, resolve(dirname(fromAbs), spec)).split(sep).join("/");
  return null;
}

describe("client architecture", () => {
  it("route files stay Server Components; 'use client' lives on the views they render [B1]", () => {
    const offenders = FILES.filter(
      (f) => /^app\/(.+\/)?(page|layout)\.tsx$/.test(f.rel) && /^\s*(\/\*[\s\S]*?\*\/\s*)?["']use client["']/.test(f.text),
    ).map((f) => f.rel);
    expect(offenders).toEqual([]);
  });

  it("shared code (lib/, components/) never imports route code from app/ [S4, L12]", () => {
    const offenders = FILES.filter((f) => /^(lib|components)\//.test(f.rel)).flatMap((f) =>
      importsOf(f.text)
        .filter((spec) => target(f.abs, spec)?.startsWith("app/"))
        .map((spec) => `${f.rel} → ${spec}`),
    );
    expect(offenders).toEqual([]);
  });

  it("a route section only imports its own private files, never a sibling section's [S5]", () => {
    const offenders = FILES.filter((f) => f.rel.startsWith("app/")).flatMap((f) => {
      // Root route files (app/page.tsx, app/not-found.tsx) own the root app/_components.
      const parts = f.rel.split("/");
      const section = parts.length === 2 ? "_components" : parts[1];
      return importsOf(f.text)
        .map((spec) => ({ spec, t: target(f.abs, spec) }))
        .filter(({ t }) => t?.startsWith("app/") && t.split("/").length > 2 && t.split("/")[1] !== section)
        .map(({ spec }) => `${f.rel} → ${spec}`);
    });
    expect(offenders).toEqual([]);
  });

  it("HTTP access goes through src/lib only — no fetch/EventSource in views [L2]", () => {
    const offenders = FILES.filter((f) => !f.rel.startsWith("lib/") && /\b(fetch|new EventSource)\(/.test(f.text)).map(
      (f) => f.rel,
    );
    expect(offenders).toEqual([]);
  });

  it("query keys come from the per-domain key factories, never inline arrays [L6]", () => {
    const offenders = FILES.filter((f) => /queryKey:\s*\[|QueryData\(\s*\[/.test(f.text)).map((f) => f.rel);
    expect(offenders).toEqual([]);
  });

  it("no aggregate `export *` barrels in src/lib [S12]", () => {
    const offenders = FILES.filter((f) => f.rel.startsWith("lib/") && /^export \* from/m.test(f.text)).map((f) => f.rel);
    expect(offenders).toEqual([]);
  });

  it("no deep relative imports (3+ `../`) into src — use the @/ alias [S14]", () => {
    const offenders = FILES.flatMap((f) =>
      importsOf(f.text)
        .filter((spec) => /^(\.\.\/){3,}/.test(spec) && !target(f.abs, spec)?.startsWith(".."))
        .map((spec) => `${f.rel} → ${spec}`),
    );
    expect(offenders).toEqual([]);
  });
});
