import { describe, it, expect } from 'vitest';
import { SmartDiff } from '@devdigest/shared';
import {
  buildSmartDiff,
  classifyFile,
  isCountedFinding,
  latestReviewFindings,
  type ReviewWithFindings,
} from '../src/modules/smart-diff/helpers.js';
import { SMART_DIFF_ROLE_ORDER } from '../src/modules/smart-diff/constants.js';
import type { FindingRecord, PrFileRecord, ReviewRecord } from '../src/modules/_shared/records.js';

function review(
  id: string,
  agentId: string | null,
  createdAt: string,
  kind: 'review' | 'summary' = 'review',
): ReviewRecord {
  return {
    id,
    workspaceId: 'w',
    prId: 'p',
    agentId,
    runId: null,
    kind,
    verdict: null,
    summary: null,
    score: null,
    model: null,
    createdAt: new Date(createdAt),
  };
}

function finding(
  id: string,
  file: string,
  startLine: number,
  opts: { dismissed?: boolean; reviewId?: string } = {},
): FindingRecord {
  return {
    id,
    reviewId: opts.reviewId ?? 'r',
    file,
    startLine,
    endLine: startLine,
    severity: 'WARNING',
    category: 'bug',
    title: id,
    rationale: 'why',
    suggestion: null,
    confidence: 0.9,
    kind: 'bug',
    trifectaComponents: null,
    acceptedAt: null,
    dismissedAt: opts.dismissed ? new Date('2026-11-27T00:00:00Z') : null,
  };
}

function file(path: string, additions = 1, deletions = 0): PrFileRecord {
  return { id: path, prId: 'p', path, additions, deletions, patch: null };
}

describe('classifyFile — path → role (first match wins)', () => {
  it.each([
    // boilerplate
    ['pnpm-lock.yaml', 'boilerplate'],
    ['server/pnpm-lock.yaml', 'boilerplate'],
    ['package-lock.json', 'boilerplate'],
    ['yarn.lock', 'boilerplate'],
    ['Cargo.lock', 'boilerplate'],
    ['dist/a.js', 'boilerplate'],
    ['build/out/x.js', 'boilerplate'],
    ['src/ui/__snapshots__/Button.tsx.snap', 'boilerplate'],
    ['x.snap', 'boilerplate'],
    ['x.min.js', 'boilerplate'],
    ['api.generated.ts', 'boilerplate'],
    // tests
    ['a.test.tsx', 'tests'],
    ['src/a.test.ts', 'tests'],
    ['server/test/x.it.test.ts', 'tests'],
    ['src/a.spec.ts', 'tests'],
    ['test/helpers/pg.ts', 'tests'],
    ['pkg/tests/fixture.json', 'tests'],
    ['src/__tests__/util.ts', 'tests'],
    ['e2e/specs/05.flow.json', 'tests'],
    // wiring
    ['src/index.ts', 'wiring'],
    ['lib/index.js', 'wiring'],
    ['vitest.config.ts', 'wiring'],
    ['client/next.config.mjs', 'wiring'],
    ['tsconfig.json', 'wiring'],
    ['tsconfig.build.json', 'wiring'],
    ['.eslintrc.cjs', 'wiring'],
    ['.env.example', 'wiring'],
    ['docker-compose.yml', 'wiring'],
    ['docker-compose.e2e.yml', 'wiring'],
    ['.github/workflows/ci.yml', 'wiring'],
    // docs
    ['docs/architecture.md', 'docs'],
    ['docs/diagram.png', 'docs'],
    ['server/notes.md', 'docs'],
    ['README.md', 'docs'],
    ['README', 'docs'],
    ['CHANGELOG.txt', 'docs'],
    ['LICENSE', 'docs'],
    // core (default)
    ['src/modules/reviews/service.ts', 'core'],
    ['src/config.ts', 'core'],
    ['src/indexer.ts', 'core'],
    ['src/distance.ts', 'core'],
    // normalisation
    ['./src/index.ts', 'wiring'],
    ['src\\a.test.ts', 'tests'],
  ] as const)('%s → %s', (path, role) => {
    expect(classifyFile(path)).toBe(role);
  });

  describe('disputed cases (decisions recorded in specs/M3-smart-diff.md)', () => {
    it('snapshot inside __tests__ → boilerplate', () => {
      // Decision: the snapshot rule (boilerplate) is evaluated before the test rule,
      // so generated snapshots are skimmed even when they live under __tests__/.
      expect(classifyFile('src/__tests__/__snapshots__/x.snap')).toBe('boilerplate');
    });

    it('Markdown under .claude/ → wiring', () => {
      // Decision: `.claude/**` (wiring) precedes `*.md` (docs) — skill/agent Markdown
      // defines agent behaviour, so it is configuration, not documentation.
      expect(classifyFile('.claude/skills/security/SKILL.md')).toBe('wiring');
    });

    it('README inside e2e/ → tests', () => {
      // Decision (owner, 2026-11-27): keep the spec order — `e2e/**` (tests) precedes
      // docs, so documentation inside e2e/ travels with the flows it describes.
      expect(classifyFile('e2e/README.md')).toBe('tests');
    });
  });
});

describe('latestReviewFindings — latest kind:review per agent, union', () => {
  it('an agent re-run replaces only that agent; other agents stay; summary ignored; null agent grouped', () => {
    const rows: ReviewWithFindings[] = [
      // Input is deliberately NOT newest-first.
      { review: review('a-old', 'A', '2026-11-01T00:00:00Z'), findings: [finding('a-old-1', 'x.ts', 1)] },
      { review: review('b', 'B', '2026-11-02T00:00:00Z'), findings: [finding('b-1', 'y.ts', 2)] },
      { review: review('a-new', 'A', '2026-11-03T00:00:00Z'), findings: [finding('a-new-1', 'x.ts', 3)] },
      {
        review: review('sum', 'A', '2026-11-04T00:00:00Z', 'summary'),
        findings: [finding('sum-1', 'x.ts', 4)],
      },
      { review: review('legacy-new', null, '2026-10-02T00:00:00Z'), findings: [finding('l-new', 'z.ts', 5)] },
      { review: review('legacy-old', null, '2026-10-01T00:00:00Z'), findings: [finding('l-old', 'z.ts', 6)] },
    ];
    const ids = latestReviewFindings(rows).map((f) => f.id).sort();
    expect(ids).toEqual(['a-new-1', 'b-1', 'l-new']);
  });

  it('keeps dismissed findings (they are shown, just not counted)', () => {
    const rows: ReviewWithFindings[] = [
      { review: review('a', 'A', '2026-11-01T00:00:00Z'), findings: [finding('d', 'x.ts', 1, { dismissed: true })] },
    ];
    const out = latestReviewFindings(rows);
    expect(out.map((f) => f.id)).toEqual(['d']);
    expect(isCountedFinding(out[0]!)).toBe(false);
  });

  it('no reviews → no findings', () => {
    expect(latestReviewFindings([])).toEqual([]);
  });
});

describe('buildSmartDiff', () => {
  const files = [
    file('README.md', 2, 0),
    file('src/b.ts', 10, 2),
    file('pnpm-lock.yaml', 100, 50),
    file('src/a.test.ts', 5, 1),
    file('src/a.ts', 3, 3),
    file('src/index.ts', 1, 0),
  ];

  it('groups in role order, files in GitHub order, empty groups omitted, parses as SmartDiff', () => {
    const d = buildSmartDiff(files, []);
    expect(() => SmartDiff.parse(d)).not.toThrow();
    expect(d.groups.map((g) => g.role)).toEqual(['core', 'tests', 'wiring', 'docs', 'boilerplate']);
    expect(d.groups[0]!.files.map((f) => f.path)).toEqual(['src/b.ts', 'src/a.ts']);
    expect(d.groups.every((g) => g.files.every((f) => f.finding_lines.length === 0))).toBe(true);
    expect(d.groups[0]!.files[0]).not.toHaveProperty('pseudocode_summary');

    const onlyCore = buildSmartDiff([file('src/a.ts')], []);
    expect(onlyCore.groups.map((g) => g.role)).toEqual(['core']);
    expect(SMART_DIFF_ROLE_ORDER).toEqual(['core', 'tests', 'wiring', 'docs', 'boilerplate']);
  });

  it('finding_lines: counted findings on the file only, deduped and sorted', () => {
    const d = buildSmartDiff(files, [
      finding('1', 'src/a.ts', 30),
      finding('2', 'src/a.ts', 7),
      finding('3', 'src/a.ts', 30),
      finding('4', 'src/a.ts', 12, { dismissed: true }),
      finding('5', 'src/other.ts', 1),
    ]);
    const core = d.groups.find((g) => g.role === 'core')!;
    expect(core.files.find((f) => f.path === 'src/a.ts')!.finding_lines).toEqual([7, 30]);
    expect(core.files.find((f) => f.path === 'src/b.ts')!.finding_lines).toEqual([]);
  });

  it('split_suggestion is minimal with total_lines = Σ(additions + deletions)', () => {
    expect(buildSmartDiff(files, []).split_suggestion).toEqual({
      too_big: false,
      total_lines: 2 + 12 + 150 + 6 + 6 + 1,
      proposed_splits: [],
    });
  });

  it('no files → no groups', () => {
    expect(buildSmartDiff([], []).groups).toEqual([]);
  });
});
