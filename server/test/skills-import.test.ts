import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { strToU8, zipSync } from 'fflate';

// Prove the import path never spawns a process or writes a file: any call to
// these fails the test (they are module-level mocks, hoisted before imports).
const forbidden = vi.hoisted(() => ({
  spawn: vi.fn(),
  exec: vi.fn(),
  execSync: vi.fn(),
  execFile: vi.fn(),
  execFileSync: vi.fn(),
  fork: vi.fn(),
  writeFile: vi.fn(),
  writeFileSync: vi.fn(),
  mkdir: vi.fn(),
  mkdirSync: vi.fn(),
}));
vi.mock('node:child_process', () => ({
  spawn: forbidden.spawn,
  exec: forbidden.exec,
  execSync: forbidden.execSync,
  execFile: forbidden.execFile,
  execFileSync: forbidden.execFileSync,
  fork: forbidden.fork,
}));
vi.mock('node:fs/promises', async (orig) => ({
  ...(await orig<typeof import('node:fs/promises')>()),
  writeFile: forbidden.writeFile,
  mkdir: forbidden.mkdir,
}));

import { FflateZipReader } from '../src/adapters/archive/zip.js';
import { SkillsService } from '../src/modules/skills/service.js';
import type { SkillStore } from '../src/modules/skills/ports.js';
import {
  bodyWarnings,
  extractSkill,
  isUnsafePath,
  parseFrontmatter,
  selectCoreFile,
} from '../src/modules/skills/import-parser.js';
import { isSkillConfigChange, slugifySkillName } from '../src/modules/skills/helpers.js';
import { ValidationError } from '../src/platform/errors.js';

/** M2 skill import (specs/M2-skills.md → Import pipeline + Security summary). */

const SAMPLE_ZIP = path.resolve(__dirname, '../../docs/skills-samples/test-smells-skill.zip');

function fakeStore(existingNames: string[] = []): SkillStore {
  return {
    getByName: async (_ws, name) =>
      existingNames.includes(name) ? ({ id: 'x', name } as never) : undefined,
  } as Partial<SkillStore> as SkillStore;
}

function service(store = fakeStore()) {
  return new SkillsService({
    store,
    archive: new FflateZipReader(),
    tokens: { count: (t) => Math.ceil(t.length / 4) },
  });
}

const b64 = (data: Uint8Array | string) =>
  Buffer.from(typeof data === 'string' ? strToU8(data) : data).toString('base64');

beforeEach(() => {
  for (const fn of Object.values(forbidden)) fn.mockClear();
});

describe('parseFrontmatter / extractSkill', () => {
  it('keeps name/description/type, drops every other key (tools, hooks, …)', () => {
    const md = [
      '---',
      'name: "Test Smells"',
      'description: >',
      '  Use when tests mock',
      '  too much.',
      'type: Convention',
      'allowed-tools: Bash, Read',
      'hooks:',
      '  post-review: scripts/x.sh',
      '---',
      '# Heading',
      'Body text.',
    ].join('\n');
    const { draft, droppedFrontmatter } = extractSkill(md, 'SKILL.md');
    expect(draft).toEqual({
      name: 'test-smells',
      description: 'Use when tests mock too much.',
      type: 'convention',
      body: '# Heading\nBody text.',
    });
    expect(droppedFrontmatter).toEqual(['allowed-tools', 'hooks']);
  });

  it('falls back to H1 → filename for the name and first paragraph for the description', () => {
    expect(extractSkill('# Ünïcode Rules!\n\nFirst para\nline two.\n\nMore.', 'x.md').draft).toMatchObject({
      name: 'unicode-rules',
      description: 'First para line two.',
      type: 'custom',
    });
    expect(extractSkill('no heading here', 'My_Skill File.md').draft.name).toBe('my-skill-file');
    expect(extractSkill('', '!!!.md').draft.name).toBe('imported-skill');
  });

  it('handles a BOM + CRLF, and leaves text without frontmatter untouched', () => {
    const fm = parseFrontmatter(String.fromCharCode(0xfeff) + '---\r\nname: a\r\n---\r\nbody');
    expect(fm.data.name).toBe('a');
    expect(fm.body).toBe('body');
    expect(parseFrontmatter('---\nno closing fence').body).toBe('---\nno closing fence');
  });
});

describe('selectCoreFile (metadata only)', () => {
  it('prefers SKILL.md, lists scripts as executable and other .md as extra', () => {
    const { core, ignored } = selectCoreFile([
      { path: 'pkg/README.md', size: 10 },
      { path: 'pkg/SKILL.md', size: 10 },
      { path: 'pkg/scripts/run.sh', size: 10 },
      { path: 'pkg/tools/helper.txt', size: 10 },
      { path: 'pkg/lib/index.js', size: 10 },
      { path: 'pkg/logo.png', size: 10 },
      { path: '__MACOSX/pkg/._SKILL.md', size: 10 },
      { path: '../evil.md', size: 10 },
    ]);
    expect(core?.path).toBe('pkg/SKILL.md');
    expect(Object.fromEntries(ignored.map((i) => [i.path, i.reason]))).toEqual({
      'pkg/README.md': 'extra-markdown',
      'pkg/scripts/run.sh': 'executable',
      'pkg/tools/helper.txt': 'executable',
      'pkg/lib/index.js': 'executable',
      'pkg/logo.png': 'not-markdown',
      '../evil.md': 'unsafe-path',
    });
  });

  it('falls back to the only .md, then README.md; refuses an oversized core file', () => {
    expect(selectCoreFile([{ path: 'deep/a/b/rules.md', size: 1 }]).core?.path).toBe('deep/a/b/rules.md');
    expect(
      selectCoreFile([
        { path: 'x/README.md', size: 1 },
        { path: 'x/other.md', size: 1 },
      ]).core?.path,
    ).toBe('x/README.md');
    const big = selectCoreFile([{ path: 'SKILL.md', size: 10_000_000 }]);
    expect(big.core).toBeUndefined();
    expect(big.ignored).toEqual([{ path: 'SKILL.md', reason: 'too-large' }]);
  });

  it('flags unsafe paths', () => {
    for (const p of ['/etc/passwd', 'a/../b.md', 'C:/x.md', 'a\\b.md', 'a\0.md']) {
      expect(isUnsafePath(p), p).toBe(true);
    }
    expect(isUnsafePath('a/b.md')).toBe(false);
  });
});

describe('bodyWarnings', () => {
  it('warns when the body references a file that was not imported', () => {
    const w = bodyWarnings('Run `scripts/detect-flaky.sh` first.', [
      { path: 'test-smells/scripts/detect-flaky.sh', reason: 'executable' },
    ]);
    expect(w).toHaveLength(1);
    expect(w[0]).toContain('scripts/detect-flaky.sh');
  });
});

describe('FflateZipReader', () => {
  const reader = new FflateZipReader();

  it('lists entries without inflating and reads only the requested one', () => {
    const zip = zipSync({ 'a/SKILL.md': strToU8('# hi'), 'a/scripts/x.sh': strToU8('echo pwned') });
    expect(reader.list(zip)).toEqual([
      { path: 'a/SKILL.md', size: 4 },
      { path: 'a/scripts/x.sh', size: 10 },
    ]);
    expect(reader.readText(zip, 'a/SKILL.md', 1000)).toBe('# hi');
  });

  it('aborts while streaming once the output passes maxBytes (does not trust headers)', () => {
    const zip = zipSync({ 'SKILL.md': new Uint8Array(500_000) });
    expect(() => reader.readText(zip, 'SKILL.md', 1024)).toThrow(/exceeds 1024 bytes/);
  });

  it('rejects something that is not a zip', () => {
    expect(() => reader.list(strToU8('definitely not a zip'))).toThrow();
  });
});

describe('SkillsService.previewImport', () => {
  it('imports the sample skill archive: SKILL.md text only, scripts never run', async () => {
    const preview = await service().previewImport('ws', {
      filename: 'test-smells-skill.zip',
      content_base64: readFileSync(SAMPLE_ZIP).toString('base64'),
    });
    expect(preview.core_file).toBe('test-smells/SKILL.md');
    expect(preview.draft.name).toBe('mocking-and-flakiness');
    expect(preview.draft.type).toBe('convention');
    expect(preview.draft.body.startsWith('# Mocking and flakiness')).toBe(true);
    expect(preview.dropped_frontmatter).toEqual(['allowed-tools', 'hooks']);
    expect(preview.ignored).toEqual(
      expect.arrayContaining([
        { path: 'test-smells/scripts/detect-flaky.sh', reason: 'executable' },
        { path: 'test-smells/scripts/count_mocks.py', reason: 'executable' },
        { path: 'test-smells/README.md', reason: 'extra-markdown' },
      ]),
    );
    expect(preview.warnings.some((w) => w.includes('Dropped frontmatter'))).toBe(true);
    expect(preview.warnings.some((w) => w.includes('scripts/detect-flaky.sh'))).toBe(true);
    expect(preview.body_tokens).toBeGreaterThan(0);
    expect(preview.name_conflict).toBe(false);
    for (const fn of Object.values(forbidden)) expect(fn).not.toHaveBeenCalled();
  });

  it('reports a name conflict without failing', async () => {
    const preview = await service(fakeStore(['plain'])).previewImport('ws', {
      filename: 'plain.md',
      content_base64: b64('# Plain\n\nUse when plain.'),
    });
    expect(preview.name_conflict).toBe(true);
  });

  it('rejects unsupported types, empty bodies, archives without Markdown, and zip bombs', async () => {
    const s = service();
    const cases: Array<[string, string]> = [
      ['run.sh', b64('echo hi')],
      ['empty.md', b64('---\nname: x\n---\n')],
      ['no-md.zip', b64(zipSync({ 'scripts/a.sh': strToU8('x'), 'img.png': strToU8('x') }))],
      // 6 MB of zeros compresses to a few KB but declares > 5 MB uncompressed.
      ['bomb.zip', b64(zipSync({ 'SKILL.md': new Uint8Array(6 * 1024 * 1024) }))],
      [
        'many.zip',
        b64(zipSync(Object.fromEntries(Array.from({ length: 250 }, (_, i) => [`f${i}.txt`, strToU8('x')])))),
      ],
    ];
    for (const [filename, content_base64] of cases) {
      await expect(s.previewImport('ws', { filename, content_base64 }), filename).rejects.toBeInstanceOf(
        ValidationError,
      );
    }
  });
});

describe('helpers', () => {
  it('only text-config changes bump the version', () => {
    const base = { name: 'a', description: 'd', type: 'rubric' as const, body: 'b' };
    expect(isSkillConfigChange(base, { name: 'a', body: 'b' })).toBe(false);
    expect(isSkillConfigChange(base, {})).toBe(false);
    expect(isSkillConfigChange(base, { body: 'c' })).toBe(true);
    expect(isSkillConfigChange(base, { type: 'custom' })).toBe(true);
  });

  it('slugifies to a valid skill name or undefined', () => {
    expect(slugifySkillName('  PR Quality — Rubric v2 ')).toBe('pr-quality-rubric-v2');
    expect(slugifySkillName('---')).toBeUndefined();
    expect(slugifySkillName('x'.repeat(100))).toHaveLength(64);
  });
});
