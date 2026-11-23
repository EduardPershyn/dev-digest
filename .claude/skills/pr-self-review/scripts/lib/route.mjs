// Skill routing (routing.json) + slicing into reviewer-sized batches.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { hunkChangedLines } from './diff.mjs';
import { makeMatcher } from './glob.mjs';

export function loadRouting(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

/** Skill names found in a skills directory (frontmatter `name:`, else the folder name). */
export function listSkills(skillsDir) {
  return readdirSync(skillsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(skillsDir, d.name, 'SKILL.md')))
    .map((d) => {
      const head = readFileSync(join(skillsDir, d.name, 'SKILL.md'), 'utf8').slice(0, 2000);
      const m = /^---\n[\s\S]*?^name:\s*["']?([\w.-]+)["']?\s*$/m.exec(head);
      return { name: m ? m[1] : d.name, dir: d.name, skillPath: join(skillsDir, d.name, 'SKILL.md') };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function findUnrouted(skillNames, routing) {
  return skillNames.filter((n) => !(n in routing.skills));
}

function compileSkill(cfg, codeFilesMatcher) {
  const content = (cfg.content ?? []).map((s) => new RegExp(s));
  const pathMatch = makeMatcher(cfg.paths ?? []);
  const excluded = makeMatcher(cfg.exclude ?? []);
  const contentScope = cfg.contentPaths ? makeMatcher(cfg.contentPaths) : () => true;
  return {
    byPath: (p) => pathMatch(p) && !excluded(p),
    contentHunks(file) {
      if (!content.length || excluded(file.path) || !codeFilesMatcher(file.path) || !contentScope(file.path)) return [];
      return file.hunks.filter((h) => h.lines.some((l) => l.t === '+' && content.some((r) => r.test(l.text))));
    },
  };
}

/** True when a file can be sent to a skill reviewer at all. */
export function isReviewable(file, globalExcluded) {
  return !file.binary && file.status !== 'D' && file.hunks.length > 0 && !globalExcluded(file.path);
}

/**
 * Routes files to skills.
 * @returns {{ bySkill: Map<string, {file, hunks, lines, reason}[]>, unmatched: string[], routedLines: number }}
 */
export function routeFiles(files, routing, { only } = {}) {
  const globalExcluded = makeMatcher(routing.exclude ?? []);
  const codeFiles = makeMatcher(routing.codeFiles ?? ['**/*']);
  const skills = Object.entries(routing.skills)
    .filter(([name, cfg]) => cfg.review && (!only || only.includes(name)))
    .map(([name, cfg]) => [name, compileSkill(cfg, codeFiles)]);

  const bySkill = new Map();
  const unmatched = [];
  let routedLines = 0;
  for (const file of files) {
    if (!isReviewable(file, globalExcluded)) continue;
    let matched = false;
    for (const [name, s] of skills) {
      let hunks = null;
      let reason = 'path';
      if (s.byPath(file.path)) hunks = file.hunks;
      else {
        const hit = s.contentHunks(file);
        if (hit.length) { hunks = hit; reason = 'content'; }
      }
      if (!hunks) continue;
      matched = true;
      const lines = hunks.reduce((n, h) => n + hunkChangedLines(h), 0);
      if (!bySkill.has(name)) bySkill.set(name, []);
      bySkill.get(name).push({ file, hunks, lines, reason });
    }
    if (matched) routedLines += file.added + file.removed;
    else unmatched.push(file.path);
  }
  return { bySkill, unmatched, routedLines };
}

/** Packs a skill's entries into slices of at most `sliceLines` changed lines (a bigger file goes alone). */
export function sliceEntries(entries, sliceLines) {
  const slices = [];
  let cur = [];
  let curLines = 0;
  for (const e of entries) {
    if (e.lines > sliceLines) {
      slices.push([e]);
      continue;
    }
    if (cur.length && curLines + e.lines > sliceLines) {
      slices.push(cur);
      cur = [];
      curLines = 0;
    }
    cur.push(e);
    curLines += e.lines;
  }
  if (cur.length) slices.push(cur);
  return slices;
}

export function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
