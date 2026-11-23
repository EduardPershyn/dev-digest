// Unified-diff parsing and rendering (no git calls here — see scope.mjs).
//
// File record:
//   { path, oldPath, status: 'A'|'M'|'D'|'R', binary, origin, added, removed,
//     hunks: [{ header, oldStart, oldLines, newStart, newLines,
//               lines: [{ t: ' '|'+'|'-', text, old?: number, new?: number }] }] }

const HUNK_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/;

function newFileRecord() {
  return { path: null, oldPath: null, status: 'M', binary: false, origin: 'committed', added: 0, removed: 0, hunks: [] };
}

export function parseUnifiedDiff(text) {
  const files = [];
  let cur = null;
  let hunk = null;
  let remOld = 0;
  let remNew = 0;
  let oldLn = 0;
  let newLn = 0;

  for (const line of text.split('\n')) {
    const inBody = hunk && (remOld > 0 || remNew > 0);
    if (inBody) {
      const t = line[0];
      const body = line.slice(1);
      if (t === ' ') {
        hunk.lines.push({ t, text: body, old: oldLn++, new: newLn++ });
        remOld--; remNew--;
      } else if (t === '+') {
        hunk.lines.push({ t, text: body, new: newLn++ });
        cur.added++; remNew--;
      } else if (t === '-') {
        hunk.lines.push({ t, text: body, old: oldLn++ });
        cur.removed++; remOld--;
      } else if (t === '\\') {
        // "\ No newline at end of file"
      } else if (line === '') {
        // tolerate a context line whose leading space was stripped
        hunk.lines.push({ t: ' ', text: '', old: oldLn++, new: newLn++ });
        remOld--; remNew--;
      }
      continue;
    }

    if (line.startsWith('diff --git ')) {
      cur = newFileRecord();
      files.push(cur);
      hunk = null;
      const m = /^diff --git a\/(.*) b\/(.*)$/.exec(line);
      if (m) { cur.oldPath = m[1]; cur.path = m[2]; }
      continue;
    }
    if (!cur) continue;

    const h = HUNK_RE.exec(line);
    if (h) {
      hunk = {
        header: line,
        oldStart: Number(h[1]),
        oldLines: h[2] === undefined ? 1 : Number(h[2]),
        newStart: Number(h[3]),
        newLines: h[4] === undefined ? 1 : Number(h[4]),
        lines: [],
      };
      cur.hunks.push(hunk);
      remOld = hunk.oldLines; remNew = hunk.newLines;
      oldLn = hunk.oldStart; newLn = hunk.newStart;
      continue;
    }
    if (line === '\\ No newline at end of file') continue;
    if (line.startsWith('new file mode')) cur.status = 'A';
    else if (line.startsWith('deleted file mode')) cur.status = 'D';
    else if (line.startsWith('rename from ')) { cur.oldPath = line.slice(12); cur.status = 'R'; }
    else if (line.startsWith('rename to ')) cur.path = line.slice(10);
    else if (line.startsWith('Binary files ') || line === 'GIT binary patch') cur.binary = true;
    else if (line.startsWith('--- ')) { if (line !== '--- /dev/null') cur.oldPath = stripPrefix(line.slice(4), 'a/'); }
    else if (line.startsWith('+++ ')) { if (line !== '+++ /dev/null') cur.path = stripPrefix(line.slice(4), 'b/'); }
  }
  for (const f of files) if (!f.path) f.path = f.oldPath;
  return files;
}

function stripPrefix(p, prefix) {
  return p.startsWith(prefix) ? p.slice(prefix.length) : p;
}

/** A synthetic all-added record for an untracked file. */
export function makeAddedFile(path, content) {
  const lines = content.split('\n');
  if (lines.length && lines[lines.length - 1] === '') lines.pop();
  const hunk = {
    header: `@@ -0,0 +1,${lines.length} @@`,
    oldStart: 0, oldLines: 0, newStart: 1, newLines: lines.length,
    lines: lines.map((text, i) => ({ t: '+', text, new: i + 1 })),
  };
  return {
    path, oldPath: null, status: 'A', binary: false, origin: 'uncommitted',
    added: lines.length, removed: 0, hunks: lines.length ? [hunk] : [],
  };
}

export function hunkChangedLines(hunk) {
  return hunk.lines.filter((l) => l.t !== ' ').length;
}

/** Renders hunks with new-file line numbers in the left column (what reviewers cite). */
export function renderFile(file, hunks = file.hunks) {
  const status = { A: 'added', M: 'modified', D: 'deleted', R: 'renamed' }[file.status] ?? file.status;
  const rename = file.status === 'R' && file.oldPath ? `, from ${file.oldPath}` : '';
  const out = [`### ${file.path} (${status}${rename}; ${file.origin})`];
  for (const h of hunks) {
    out.push(h.header);
    for (const l of h.lines) {
      const num = l.t === '-' ? '' : String(l.new);
      out.push(`${num.padStart(5)} ${l.t} ${l.text}`);
    }
  }
  return out.join('\n');
}

/** New-side lines (context + added) of a file as [{ n, text, t }]. */
export function newSideLines(file) {
  const out = [];
  for (const h of file.hunks) for (const l of h.lines) if (l.t !== '-') out.push({ n: l.new, text: l.text, t: l.t });
  return out;
}

/** Renders new-side lines within ±radius of `line` (for verifier prompts). */
export function renderWindow(file, line, radius = 10) {
  const rows = newSideLines(file).filter((l) => Math.abs(l.n - line) <= radius);
  return rows.map((l) => `${String(l.n).padStart(5)} ${l.t} ${l.text}`).join('\n');
}
