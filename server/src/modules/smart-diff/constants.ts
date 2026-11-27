import type { SmartDiffRole } from '@devdigest/shared';

/**
 * M3 — Smart Diff classifier tables (domain ring, pure). Spec: specs/M3-smart-diff.md.
 *
 * Paths are repo-relative with `/` separators (see `classifyFile`). Glob → RegExp rules:
 *   - basename globs (`*.lock`, `README*`, `.env*`) match the last segment at any depth;
 *   - root directory globs (`dist/**`, `e2e/**`, `docs/**`, `.github/**`) match from the repo root;
 *   - `** /x/**` globs match a directory named `x` at any depth (root included).
 * No glob library on purpose: the server has none and the set is small and table-tested.
 */

/** Display order of the groups (also the order of `SmartDiffRole`). */
export const SMART_DIFF_ROLE_ORDER: readonly SmartDiffRole[] = [
  'core',
  'tests',
  'wiring',
  'docs',
  'boilerplate',
];

/** Role of a path that matches no rule. */
export const DEFAULT_ROLE: SmartDiffRole = 'core';

export interface RoleRule {
  role: Exclude<SmartDiffRole, 'core'>;
  patterns: readonly RegExp[];
}

/** Any-depth directory segment: `** /<name>/**`. */
const anyDir = (name: string): RegExp => new RegExp(`(^|/)${name}/`);

/** Evaluation order — FIRST MATCH WINS: boilerplate → tests → wiring → docs, else core. */
export const ROLE_RULES: readonly RoleRule[] = [
  {
    role: 'boilerplate',
    patterns: [
      /(^|\/)[^/]*\.lock$/, // *.lock
      /(^|\/)pnpm-lock\.yaml$/, // pnpm-lock.yaml
      /(^|\/)package-lock\.json$/, // package-lock.json
      /(^|\/)yarn\.lock$/, // yarn.lock
      /^dist\//, // dist/**
      /^build\//, // build/**
      anyDir('__snapshots__'), // **/__snapshots__/**
      /\.snap$/, // *.snap
      /(^|\/)[^/]*\.generated\.[^/]*$/, // *.generated.*
      /\.min\.js$/, // *.min.js
    ],
  },
  {
    role: 'tests',
    patterns: [
      /\.test\.tsx?$/, // **/*.test.ts(x)
      /\.it\.test\.ts$/, // **/*.it.test.ts
      /\.spec\.ts$/, // **/*.spec.ts
      anyDir('test'), // **/test/**
      anyDir('tests'), // **/tests/**
      anyDir('__tests__'), // **/__tests__/**
      /^e2e\//, // e2e/**
    ],
  },
  {
    role: 'wiring',
    patterns: [
      /(^|\/)index\.(ts|js)$/, // index.ts | index.js
      /(^|\/)[^/]*\.config\.[^/]*$/, // *.config.*
      /(^|\/)tsconfig[^/]*\.json$/, // tsconfig*.json
      /(^|\/)\.eslintrc[^/]*$/, // .eslintrc*
      /(^|\/)\.env[^/]*$/, // .env*
      /(^|\/)docker-compose[^/]*\.yml$/, // docker-compose*.yml
      /^\.github\//, // .github/**
      /^\.claude\//, // .claude/**
    ],
  },
  {
    role: 'docs',
    patterns: [
      /\.md$/, // *.md
      /^docs\//, // docs/**
      /(^|\/)README[^/]*$/, // README*
      /(^|\/)CHANGELOG[^/]*$/, // CHANGELOG*
      /(^|\/)LICENSE$/, // LICENSE
    ],
  },
];
