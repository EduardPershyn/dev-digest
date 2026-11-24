import type { SkillImportDraft, SkillImportIgnoreReason, SkillType } from '@devdigest/shared';
import { SKILL_DESCRIPTION_MAX, SkillType as SkillTypeSchema } from '@devdigest/shared';
import {
  CORE_FILE_PREFERENCE,
  EXECUTABLE_DIRS,
  EXECUTABLE_EXTENSIONS,
  IMPORT_MAX_CORE_FILE_BYTES,
  KEPT_FRONTMATTER_KEYS,
  MARKDOWN_EXTENSIONS,
} from './constants.js';
import { slugifySkillName } from './helpers.js';

/**
 * M2 — pure (domain) part of skill import. Everything here works on strings and
 * archive METADATA; it never decompresses, writes, evaluates or runs anything.
 * The only bytes ever inflated are the chosen core Markdown file, by the
 * ArchiveReader adapter, after `selectCoreFile` picked it.
 */

/** One archive entry as listed from its header (nothing decompressed). */
export interface ArchiveEntryMeta {
  path: string;
  /** Declared uncompressed size in bytes. */
  size: number;
}

export interface IgnoredEntry {
  path: string;
  reason: SkillImportIgnoreReason;
}

const BOM = String.fromCharCode(0xfeff);

function extOf(path: string): string {
  const base = path.split('/').pop() ?? '';
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(dot).toLowerCase() : '';
}

function basenameOf(path: string): string {
  return (path.split('/').pop() ?? '').toLowerCase();
}

export function isMarkdownPath(path: string): boolean {
  return (MARKDOWN_EXTENSIONS as readonly string[]).includes(extOf(path));
}

/** A path we refuse to even consider: absolute, traversal, backslashes, NUL, drive letters. */
export function isUnsafePath(path: string): boolean {
  if (path.length === 0 || path.includes('\0') || path.includes('\\')) return true;
  if (path.startsWith('/') || /^[a-z]:/i.test(path)) return true;
  return path.split('/').some((seg) => seg === '..');
}

/** macOS / editor junk that is silently skipped (not shown to the user). */
export function isJunkPath(path: string): boolean {
  return (
    path.endsWith('/') ||
    path.startsWith('__MACOSX/') ||
    basenameOf(path) === '.ds_store' ||
    basenameOf(path).startsWith('._')
  );
}

export function isExecutablePath(path: string): boolean {
  if ((EXECUTABLE_EXTENSIONS as readonly string[]).includes(extOf(path))) return true;
  const dirs = path.split('/').slice(0, -1).map((d) => d.toLowerCase());
  return dirs.some((d) => (EXECUTABLE_DIRS as readonly string[]).includes(d));
}

/**
 * Pick the one Markdown file the skill is extracted from, and classify every
 * other entry. Preference: `SKILL.md` at the root or one folder deep → the only
 * Markdown file → `README.md` (same depth rule). Returns `core: undefined` when
 * no candidate exists.
 */
export function selectCoreFile(entries: ArchiveEntryMeta[]): {
  core: ArchiveEntryMeta | undefined;
  ignored: IgnoredEntry[];
} {
  const ignored: IgnoredEntry[] = [];
  const markdown: ArchiveEntryMeta[] = [];
  for (const e of entries) {
    if (isJunkPath(e.path)) continue;
    if (isUnsafePath(e.path)) ignored.push({ path: e.path, reason: 'unsafe-path' });
    else if (isExecutablePath(e.path)) ignored.push({ path: e.path, reason: 'executable' });
    else if (!isMarkdownPath(e.path)) ignored.push({ path: e.path, reason: 'not-markdown' });
    else markdown.push(e);
  }

  const shallow = markdown.filter((e) => e.path.split('/').length <= 2);
  let core: ArchiveEntryMeta | undefined;
  for (const preferred of CORE_FILE_PREFERENCE) {
    core = shallow.find((e) => basenameOf(e.path) === preferred);
    if (core) break;
    if (preferred === CORE_FILE_PREFERENCE[0] && markdown.length === 1) {
      core = markdown[0];
      break;
    }
  }

  for (const e of markdown) {
    if (e === core) continue;
    ignored.push({ path: e.path, reason: 'extra-markdown' });
  }
  if (core && core.size > IMPORT_MAX_CORE_FILE_BYTES) {
    ignored.push({ path: core.path, reason: 'too-large' });
    core = undefined;
  }
  return { core, ignored };
}

// ---- Markdown + frontmatter -------------------------------------------------

export interface Frontmatter {
  data: Record<string, string>;
  /** Every key found, in order (kept + dropped). */
  keys: string[];
  body: string;
}

function unquote(v: string): string {
  const t = v.trim();
  if (t.length >= 2 && ((t[0] === '"' && t.endsWith('"')) || (t[0] === "'" && t.endsWith("'")))) {
    return t.slice(1, -1);
  }
  return t;
}

/**
 * Minimal flat YAML frontmatter reader: top-level `key: value`, with `|` / `>`
 * block scalars. Nested values / lists are captured as keys only. No YAML
 * library: no anchors, tags, or type coercion — strings in, strings out.
 */
export function parseFrontmatter(text: string): Frontmatter {
  const src = text.startsWith(BOM) ? text.slice(1) : text;
  const lines = src.split(/\r?\n/);
  if (lines[0]?.trim() !== '---') return { data: {}, keys: [], body: src };
  const end = lines.findIndex((l, i) => i > 0 && (l.trim() === '---' || l.trim() === '...'));
  if (end === -1) return { data: {}, keys: [], body: src };

  const data: Record<string, string> = {};
  const keys: string[] = [];
  for (let i = 1; i < end; i++) {
    const line = lines[i]!;
    const m = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line);
    if (!m) continue; // indented continuation / list item of a previous key
    const key = m[1]!;
    let value = m[2]!.trim();
    keys.push(key);
    if (/^[|>][-+]?$/.test(value)) {
      const folded = value.startsWith('>');
      const block: string[] = [];
      while (i + 1 < end && (/^\s+/.test(lines[i + 1]!) || lines[i + 1]!.trim() === '')) {
        block.push(lines[++i]!.trim());
      }
      value = folded ? block.join(' ').replace(/\s+/g, ' ').trim() : block.join('\n').trim();
    } else {
      value = unquote(value);
    }
    data[key.toLowerCase()] = value;
  }
  return { data, keys, body: lines.slice(end + 1).join('\n') };
}

function firstHeading(body: string): string | undefined {
  const m = /^#\s+(.+?)\s*#*\s*$/m.exec(body);
  return m?.[1];
}

function firstParagraph(body: string): string | undefined {
  for (const block of body.split(/\n\s*\n/)) {
    const t = block.trim();
    if (!t || t.startsWith('#') || t.startsWith('```') || t.startsWith('---')) continue;
    return t.replace(/\s+/g, ' ');
  }
  return undefined;
}

function stripExtension(filename: string): string {
  const base = filename.split('/').pop() ?? filename;
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(0, dot) : base;
}

export interface ExtractedSkill {
  draft: SkillImportDraft;
  droppedFrontmatter: string[];
}

/**
 * Turn the core Markdown text into an editable draft. Frontmatter keys other
 * than name/description/type (e.g. `allowed-tools`, `hooks`, `model`) are
 * dropped and reported. The body is kept verbatim (trimmed) — fenced code stays
 * inert Markdown text.
 */
export function extractSkill(markdown: string, filename: string): ExtractedSkill {
  const fm = parseFrontmatter(markdown);
  const kept = KEPT_FRONTMATTER_KEYS as readonly string[];
  const dropped = fm.keys.filter((k) => !kept.includes(k.toLowerCase()));
  const body = fm.body.trim();

  const name =
    slugifySkillName(fm.data.name) ??
    slugifySkillName(firstHeading(body)) ??
    slugifySkillName(stripExtension(filename)) ??
    'imported-skill';

  const description = (fm.data.description || firstParagraph(body) || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, SKILL_DESCRIPTION_MAX);

  const parsedType = SkillTypeSchema.safeParse(fm.data.type?.toLowerCase());
  const type: SkillType = parsedType.success ? parsedType.data : 'custom';

  return { draft: { name, description, type, body }, droppedFrontmatter: dropped };
}

/**
 * Warnings about a body that points at things the import did not bring along:
 * any ignored archive path mentioned in the text, and `scripts/…`-style paths or
 * relative links in general.
 */
export function bodyWarnings(body: string, ignored: IgnoredEntry[]): string[] {
  const warnings = new Set<string>();
  for (const e of ignored) {
    const base = e.path.split('/').slice(-2).join('/');
    if (body.includes(base)) {
      warnings.add(`The body references "${base}", which was not imported (${e.reason}).`);
    }
  }
  const pathRefs = body.match(/(?:^|[\s(`'"])((?:\.\/)?(?:scripts|bin|hooks|tools)\/[\w./-]+)/gm) ?? [];
  for (const raw of pathRefs) {
    const ref = raw.trim().replace(/^[(`'"]/, '');
    if (![...warnings].some((w) => w.includes(ref.replace(/^\.\//, '')))) {
      warnings.add(`The body references "${ref}", which is not part of the skill (skills are text only).`);
    }
  }
  return [...warnings];
}
