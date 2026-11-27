// node --test .claude/scripts/agents.test.mjs
// Lints the frontmatter of every .claude/agents/*.md. Claude Code silently ignores unknown or
// misspelled keys (https://code.claude.com/docs/en/sub-agents), so a typo like `maxturns` or
// `disallowedtools` would quietly drop a limit — this test catches it.
import assert from 'node:assert/strict';
import { accessSync, constants, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { after, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const AGENTS_DIR = join(ROOT, '.claude/agents');

export const KNOWN_KEYS = new Set([
  'name', 'description', 'tools', 'disallowedTools', 'model', 'effort', 'maxTurns', 'permissionMode',
  'skills', 'hooks', 'memory', 'color', 'background', 'isolation', 'mcpServers',
]);
export const EXPECTED_AGENTS = [
  'architecture-reviewer', 'doc-writer', 'implementer', 'plan-verifier', 'planner', 'researcher', 'test-writer',
];
// Agents whose Bash is read-only by prompt only (known gap, see .claude/agents/README.md → Permissions).
const BASH_HOOK_EXEMPT = new Set(['researcher']);
const MAX_DESCRIPTION = 1000;

/** Minimal parser for the frontmatter subset the suite uses. Throws on anything it can't read. */
export function parseFrontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (!m) throw new Error('no frontmatter block');
  const fm = { keys: [], values: {}, hooks: [] };
  let current = null;
  let matcher = null;
  for (const raw of m[1].split('\n')) {
    if (raw.trim() === '') continue;
    const top = raw.match(/^([A-Za-z][\w-]*):\s*(.*)$/);
    if (top) {
      current = top[1];
      fm.keys.push(current);
      fm.values[current] = top[2] === '' ? [] : top[2];
      continue;
    }
    if (current === null) throw new Error(`unparseable line: ${raw}`);
    const item = raw.match(/^\s+-\s+([^:]+)$/);
    if (item && Array.isArray(fm.values[current])) { fm.values[current].push(item[1].trim()); continue; }
    if (current === 'hooks') {
      const mm = raw.match(/^\s+-?\s*matcher:\s*"([^"]*)"\s*$/);
      if (mm) { matcher = mm[1]; continue; }
      const cm = raw.match(/^\s+command:\s*"((?:[^"\\]|\\.)*)"\s*$/);
      if (cm) { fm.hooks.push({ matcher, command: cm[1].replace(/\\"/g, '"') }); continue; }
      if (/^\s+(PreToolUse|PostToolUse|Stop):\s*$/.test(raw) || /^\s+(-\s+)?(hooks|type):/.test(raw)) continue;
    }
    throw new Error(`unparseable line under '${current}': ${raw}`);
  }
  return fm;
}

const list = (v) => (Array.isArray(v) ? v : String(v ?? '').split(',')).map((s) => s.trim()).filter(Boolean);

/** Returns a list of problems for one agent file (empty = OK). */
export function lintAgent(file, { root = ROOT } = {}) {
  const problems = [];
  let fm;
  try { fm = parseFrontmatter(readFileSync(file, 'utf8')); } catch (e) { return [e.message]; }
  const stem = basename(file, '.md');
  for (const k of fm.keys) if (!KNOWN_KEYS.has(k)) problems.push(`unknown frontmatter key '${k}' (silently ignored by Claude Code)`);
  // A plain (unquoted) YAML scalar can't contain ': ' or ' #' — the whole frontmatter then fails to parse.
  for (const [k, v] of Object.entries(fm.values)) {
    if (typeof v === 'string' && !/^["']/.test(v) && /: | #/.test(v)) problems.push(`'${k}' contains ': ' or ' #' unquoted — invalid YAML; rephrase or quote it`);
  }
  const dupes = fm.keys.filter((k, i) => fm.keys.indexOf(k) !== i);
  if (dupes.length) problems.push(`duplicate keys: ${dupes.join(', ')}`);
  if (fm.values.name !== stem) problems.push(`name '${fm.values.name}' ≠ file name '${stem}'`);
  const desc = String(fm.values.description ?? '');
  if (!desc) problems.push('missing description');
  if (desc.length > MAX_DESCRIPTION) problems.push(`description is ${desc.length} chars (max ${MAX_DESCRIPTION})`);
  if ('memory' in fm.values) problems.push("'memory' silently enables Read/Write/Edit; not allowed in this suite");

  const tools = list(fm.values.tools);
  const denied = list(fm.values.disallowedTools);
  const both = tools.filter((t) => denied.includes(t));
  if (both.length) problems.push(`in both tools and disallowedTools: ${both.join(', ')}`);

  const pre = fm.hooks;
  const covers = (tool) => pre.some((h) => h.matcher && h.matcher.split('|').includes(tool));
  if ((tools.includes('Edit') || tools.includes('Write')) && !(covers('Edit') && covers('Write'))) {
    problems.push('Edit/Write allowed but no PreToolUse hook matches both Edit and Write');
  }
  if (tools.includes('Bash') && !covers('Bash') && !BASH_HOOK_EXEMPT.has(stem)) {
    problems.push('Bash allowed but no PreToolUse hook matches Bash');
  }

  for (const { command } of pre) {
    const words = command.replaceAll('"$CLAUDE_PROJECT_DIR"', root).replaceAll('$CLAUDE_PROJECT_DIR', root).split(/\s+/);
    const script = words[0].replace(/^"|"$/g, '');
    try { accessSync(script, constants.X_OK); } catch { problems.push(`hook script missing or not executable: ${script}`); continue; }
    const pi = words.indexOf('--profile');
    if (pi !== -1) {
      const profiles = readFileSync(script, 'utf8').match(/case "\$profile" in ([a-z|-]+)\)/)?.[1].split('|') ?? [];
      if (!profiles.includes(words[pi + 1])) problems.push(`profile '${words[pi + 1]}' not accepted by ${basename(script)} (${profiles.join(', ')})`);
    }
  }
  for (const s of list(fm.values.skills)) {
    if (!existsSync(join(root, '.claude/skills', s, 'SKILL.md'))) problems.push(`preloaded skill '${s}' not found in .claude/skills/`);
  }
  return problems;
}

const agentFiles = (dir) => readdirSync(dir).filter((f) => f.endsWith('.md') && f !== 'README.md').map((f) => join(dir, f));

describe('.claude/agents frontmatter', () => {
  const files = agentFiles(AGENTS_DIR);
  test('the expected agents are present', () => {
    assert.deepEqual(files.map((f) => basename(f, '.md')).sort(), EXPECTED_AGENTS);
  });
  for (const file of files) {
    test(basename(file), () => assert.deepEqual(lintAgent(file), []));
  }
});

describe('the lint itself catches mistakes (temp copies, never the real files)', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'devdigest-agents-lint-'));
  after(() => rmSync(tmp, { recursive: true, force: true }));
  const lintText = (name, text) => { const f = join(tmp, `${name}.md`); writeFileSync(f, text); return lintAgent(f); };
  const fm = (lines) => `---\n${lines.join('\n')}\n---\n\nbody\n`;
  const hookLines = (matcher, command) => [
    'hooks:', '  PreToolUse:', `    - matcher: "${matcher}"`, '      hooks:', '        - type: command',
    `          command: "${command.replaceAll('"', '\\"')}"`,
  ];

  test('a misspelled key (maxturns)', () => {
    assert.match(lintText('a', fm(['name: a', 'description: x', 'maxturns: 5'])).join('\n'), /unknown frontmatter key 'maxturns'/);
  });
  test("an unquoted ': ' in the description (invalid YAML)", () => {
    assert.match(lintText('i', fm(['name: i', 'description: Backend: onion rings'])).join('\n'), /invalid YAML/);
  });
  test('memory on an agent', () => {
    assert.match(lintText('b', fm(['name: b', 'description: x', 'memory: project'])).join('\n'), /memory/);
  });
  test('Bash without a hook', () => {
    assert.match(lintText('c', fm(['name: c', 'description: x', 'tools: Read, Bash'])).join('\n'), /no PreToolUse hook matches Bash/);
  });
  test('Write without a hook', () => {
    assert.match(lintText('d', fm(['name: d', 'description: x', 'tools: Read, Write'])).join('\n'), /Edit\/Write allowed/);
  });
  test('name ≠ file name, and a too-long description', () => {
    const p = lintText('e', fm(['name: other', `description: ${'x'.repeat(1001)}`])).join('\n');
    assert.match(p, /≠ file name/);
    assert.match(p, /1001 chars/);
  });
  test('a hook profile the script does not accept', () => {
    const p = lintText('f', fm(['name: f', 'description: x', 'tools: Bash',
      ...hookLines('Bash', '"$CLAUDE_PROJECT_DIR"/.claude/hooks/readonly-bash.sh --profile admin')])).join('\n');
    assert.match(p, /profile 'admin' not accepted/);
  });
  test('a missing hook script and a missing skill', () => {
    const p = lintText('g', fm(['name: g', 'description: x', 'tools: Bash', 'skills:', '  - no-such-skill',
      ...hookLines('Bash', '"$CLAUDE_PROJECT_DIR"/.claude/hooks/nope.sh')])).join('\n');
    assert.match(p, /not executable/);
    assert.match(p, /no-such-skill/);
  });
  test('a well-formed agent passes', () => {
    assert.deepEqual(lintText('h', fm(['name: h', 'description: x', 'tools: Read, Bash',
      ...hookLines('Bash', '"$CLAUDE_PROJECT_DIR"/.claude/hooks/readonly-bash.sh --profile arch')])), []);
  });
});
