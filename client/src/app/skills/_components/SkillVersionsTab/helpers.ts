import type { SkillPatch, SkillVersion } from "@devdigest/shared";

/** First meaningful line of a body (heading markers stripped), for the history row. */
export function firstLine(body: string): string {
  const line = body.split("\n").find((l) => l.trim().length > 0) ?? "";
  return line.replace(/^#+\s*/, "").trim().slice(0, 120);
}

/**
 * The patch that restores a snapshot. Older snapshots may carry only the body,
 * so fields they lack are left unchanged rather than blanked.
 */
export function restorePatch(v: SkillVersion): SkillPatch {
  return {
    body: v.body,
    ...(v.name ? { name: v.name } : {}),
    ...(v.description ? { description: v.description } : {}),
    ...(v.type ? { type: v.type } : {}),
  };
}

/* ---------- version diff ---------- */

export interface DiffLine {
  kind: "same" | "add" | "del";
  text: string;
  /** 1-based line number in the older text (null for an added line). */
  oldNo: number | null;
  /** 1-based line number in the newer text (null for a removed line). */
  newNo: number | null;
}

/** A run of unchanged lines folded away by `withContext`. */
export interface DiffSkip {
  kind: "skip";
  count: number;
}

/** Above this many LCS cells the middle is shown as "all removed, all added". */
const MAX_LCS_CELLS = 2_500_000;

function splitLines(text: string): string[] {
  if (text === "") return [];
  return text.replace(/\r\n/g, "\n").split("\n");
}

type Op = { kind: DiffLine["kind"]; ai: number | null; bi: number | null };

/**
 * Longest-common-subsequence diff of two token lists, in order. Common prefix
 * and suffix are trimmed first so typical edits stay cheap; a pathological
 * middle (skill bodies are at most 50k chars) falls back to remove-all/add-all.
 * On a tie it removes first, so a changed line reads "− old, + new".
 */
function lcsDiff(a: readonly string[], b: readonly string[]): Op[] {
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }

  const ops: Op[] = [];
  for (let i = 0; i < start; i++) ops.push({ kind: "same", ai: i, bi: i });
  const n = endA - start;
  const m = endB - start;
  if ((n + 1) * (m + 1) > MAX_LCS_CELLS) {
    for (let i = 0; i < n; i++) ops.push({ kind: "del", ai: start + i, bi: null });
    for (let j = 0; j < m; j++) ops.push({ kind: "add", ai: null, bi: start + j });
  } else {
    // lcs[i * w + j] = LCS length of a[start+i..endA) and b[start+j..endB)
    const w = m + 1;
    const lcs = new Uint32Array((n + 1) * w);
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        lcs[i * w + j] =
          a[start + i] === b[start + j]
            ? lcs[(i + 1) * w + j + 1]! + 1
            : Math.max(lcs[(i + 1) * w + j]!, lcs[i * w + j + 1]!);
      }
    }
    let i = 0;
    let j = 0;
    while (i < n || j < m) {
      if (i < n && j < m && a[start + i] === b[start + j]) {
        ops.push({ kind: "same", ai: start + i++, bi: start + j++ });
      } else if (i < n && (j === m || lcs[(i + 1) * w + j]! >= lcs[i * w + j + 1]!)) {
        ops.push({ kind: "del", ai: start + i++, bi: null });
      } else {
        ops.push({ kind: "add", ai: null, bi: start + j++ });
      }
    }
  }
  for (let k = 0; k < a.length - endA; k++) ops.push({ kind: "same", ai: endA + k, bi: endB + k });
  return ops;
}

/** Line diff of two texts (CRLF-insensitive), with 1-based line numbers on each side. */
export function diffLines(before: string, after: string): DiffLine[] {
  const a = splitLines(before);
  const b = splitLines(after);
  return lcsDiff(a, b).map((op) => ({
    kind: op.kind,
    text: op.ai !== null ? a[op.ai]! : b[op.bi!]!,
    oldNo: op.ai !== null ? op.ai + 1 : null,
    newNo: op.bi !== null ? op.bi + 1 : null,
  }));
}

export interface DiffWord {
  kind: DiffLine["kind"];
  text: string;
}

/**
 * Word-level diff for short fields (description, name): whitespace is kept as
 * its own token so the parts join back into the original strings.
 */
export function diffWords(before: string, after: string): DiffWord[] {
  const tokens = (t: string) => t.split(/(\s+)/).filter((x) => x !== "");
  const a = tokens(before);
  const b = tokens(after);
  return lcsDiff(a, b).map((op) => ({ kind: op.kind, text: op.ai !== null ? a[op.ai]! : b[op.bi!]! }));
}

/** Fold unchanged runs longer than 2×`context` lines, keeping `context` lines around each change. */
export function withContext(lines: DiffLine[], context = 3): (DiffLine | DiffSkip)[] {
  const keep = new Array<boolean>(lines.length).fill(false);
  lines.forEach((l, i) => {
    if (l.kind === "same") return;
    for (let k = Math.max(0, i - context); k <= Math.min(lines.length - 1, i + context); k++) keep[k] = true;
  });
  const out: (DiffLine | DiffSkip)[] = [];
  let skipped = 0;
  lines.forEach((l, i) => {
    if (keep[i]) {
      if (skipped > 0) out.push({ kind: "skip", count: skipped });
      skipped = 0;
      out.push(l);
    } else {
      skipped++;
    }
  });
  if (skipped > 0) out.push({ kind: "skip", count: skipped });
  return out;
}

export function diffStats(lines: DiffLine[]): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const l of lines) {
    if (l.kind === "add") added++;
    else if (l.kind === "del") removed++;
  }
  return { added, removed };
}

export type DiffField = "name" | "description" | "type";

export interface FieldChange {
  field: DiffField;
  before: string;
  after: string;
}

/**
 * Metadata fields that differ between two snapshots. Fields an older snapshot
 * did not record (null) are skipped — "unknown" is not a change.
 */
export function changedFields(from: SkillVersion | null, to: SkillVersion): FieldChange[] {
  if (!from) return [];
  const fields: DiffField[] = ["name", "description", "type"];
  const changes: FieldChange[] = [];
  for (const field of fields) {
    const before = from[field];
    const after = to[field];
    if (before == null || after == null || before === after) continue;
    changes.push({ field, before, after });
  }
  return changes;
}

/** The version just before `version` in a newest-first list, or null for the first one. */
export function previousVersion(versions: SkillVersion[], version: number): SkillVersion | null {
  return (
    versions
      .filter((v) => v.version < version)
      .sort((x, y) => y.version - x.version)[0] ?? null
  );
}
