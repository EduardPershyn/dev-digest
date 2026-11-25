import { wrapUntrusted } from '@devdigest/reviewer-core';
import {
  CONFIG_SCAN_SKIP_DIRS,
  MAX_CONFIG_FILES,
  MAX_DECIDED_RULES,
  MAX_FILE_CHARS,
  MAX_INPUT_CHARS,
} from './constants.js';

/**
 * M2 — what the extractor sends to the model (pure). File selection is code,
 * not a model step: config files first, then the repo-intel ranked samples.
 * `sent[].text` is EXACTLY the citable text the model saw — evidence is
 * validated against it, so lines past a truncation cut never validate.
 */

/** Config files that encode conventions (matched on the basename). */
export const CONFIG_FILE_PATTERNS: readonly RegExp[] = [
  /^\.eslintrc(\.(js|cjs|json|yml|yaml))?$/,
  /^eslint\.config\.(js|mjs|cjs|ts)$/,
  /^tsconfig(\.[\w-]+)?\.json$/,
  /^\.prettierrc(\.(json|js|cjs|yml|yaml))?$/,
  /^prettier\.config\.(js|cjs|mjs)$/,
  /^\.editorconfig$/,
];

export interface DirEntry {
  name: string;
  dir: boolean;
}

export interface SourceFile {
  path: string;
  text: string;
}

export interface SentFile {
  path: string;
  /** The citable text (after truncation, without the marker). */
  text: string;
  truncated: boolean;
}

export const TRUNCATION_NOTE = '[truncated: only the lines above can be cited]';

export function isConfigFile(name: string): boolean {
  return CONFIG_FILE_PATTERNS.some((re) => re.test(name));
}

/** Top-level directories worth one level of config lookup (monorepo packages). */
export function configScanDirs(root: readonly DirEntry[]): string[] {
  return root
    .filter((e) => e.dir && !e.name.startsWith('.') && !CONFIG_SCAN_SKIP_DIRS.has(e.name))
    .map((e) => e.name)
    .sort();
}

/**
 * Config paths from the root, then each scanned top-level dir (alphabetical),
 * capped at `max`. `children` maps a dir name to its entries.
 */
export function pickConfigPaths(
  root: readonly DirEntry[],
  children: ReadonlyMap<string, readonly DirEntry[]>,
  max = MAX_CONFIG_FILES,
): string[] {
  const files = (entries: readonly DirEntry[]) =>
    entries.filter((e) => !e.dir && isConfigFile(e.name)).map((e) => e.name).sort();
  const out = files(root);
  for (const dir of configScanDirs(root)) {
    for (const name of files(children.get(dir) ?? [])) out.push(`${dir}/${name}`);
  }
  return out.slice(0, max);
}

/** Cut at the last full line that fits in `maxChars`. */
export function truncateOnLine(text: string, maxChars: number): { text: string; truncated: boolean } {
  if (text.length <= maxChars) return { text, truncated: false };
  const cut = text.lastIndexOf('\n', maxChars);
  return { text: cut > 0 ? text.slice(0, cut) : '', truncated: true };
}

/**
 * Apply the per-file cut and the total budget. Files are taken in the given
 * order (configs first); adding stops at the first file that would overflow.
 */
export function selectFilesForPrompt(
  files: readonly SourceFile[],
  opts: { maxFileChars?: number; maxInputChars?: number } = {},
): SentFile[] {
  const maxFile = opts.maxFileChars ?? MAX_FILE_CHARS;
  const budget = opts.maxInputChars ?? MAX_INPUT_CHARS;
  const sent: SentFile[] = [];
  const seen = new Set<string>();
  let total = 0;
  for (const f of files) {
    if (seen.has(f.path)) continue;
    const { text, truncated } = truncateOnLine(f.text, maxFile);
    if (!text.trim()) continue;
    if (total + text.length > budget) break;
    seen.add(f.path);
    sent.push({ path: f.path, text, truncated });
    total += text.length;
  }
  return sent;
}

/** The user message: decided rules (do not repeat) + one untrusted block per file. */
export function buildUserMessage(sent: readonly SentFile[], decidedRules: readonly string[]): string {
  const decided = decidedRules.slice(0, MAX_DECIDED_RULES);
  const parts: string[] = ['## Already decided (do not repeat)'];
  parts.push(
    decided.length === 0
      ? 'None.'
      : wrapUntrusted('decided-conventions', decided.map((r) => `- ${r}`).join('\n')),
  );
  parts.push('', '## Files');
  for (const f of sent) {
    parts.push('', `### ${f.path}`, wrapUntrusted(`file:${f.path}`, f.text));
    if (f.truncated) parts.push(TRUNCATION_NOTE);
  }
  return parts.join('\n');
}
