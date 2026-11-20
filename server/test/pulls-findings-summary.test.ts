import { describe, it, expect } from 'vitest';
import {
  latestReviewIdsPerAgent,
  summarizeFindings,
  type FindingRow,
} from '../src/modules/pulls/findings-summary.js';

function row(id: string, severity: string, confidence = 0.9, rationale = 'why'): FindingRow {
  return {
    id,
    severity,
    category: 'bug',
    title: id,
    file: 'src/a.ts',
    startLine: 1,
    endLine: 2,
    confidence,
    rationale,
  };
}

describe('latestReviewIdsPerAgent', () => {
  it('keeps the newest review per (PR, agent); legacy null-agent reviews form one group', () => {
    const kept = latestReviewIdsPerAgent([
      { id: 'r5', prId: 'p1', agentId: 'a' }, // newest A on p1
      { id: 'r4', prId: 'p1', agentId: 'b' }, // newest B on p1
      { id: 'r3', prId: 'p1', agentId: 'a' }, // older A → dropped
      { id: 'r2', prId: 'p1', agentId: null }, // newest legacy on p1
      { id: 'r1', prId: 'p1', agentId: null }, // older legacy → dropped
      { id: 'r0', prId: 'p2', agentId: 'a' }, // same agent, other PR → kept
    ]);
    expect([...kept.entries()]).toEqual([
      ['r5', 'p1'],
      ['r4', 'p1'],
      ['r2', 'p1'],
      ['r0', 'p2'],
    ]);
  });
});

describe('summarizeFindings', () => {
  it('counts every contract level, zeros included', () => {
    expect(summarizeFindings([]).counts).toEqual({ CRITICAL: 0, WARNING: 0, SUGGESTION: 0 });
    expect(summarizeFindings([]).total).toBe(0);
  });

  it('sorts the preview by severity then confidence, caps it, and keeps the full total', () => {
    const s = summarizeFindings(
      [
        row('s1', 'SUGGESTION', 0.99),
        row('w-lo', 'WARNING', 0.6),
        row('c1', 'CRITICAL', 0.7),
        row('w-hi', 'WARNING', 0.95),
      ],
      { topN: 3 },
    );
    expect(s.counts).toEqual({ CRITICAL: 1, WARNING: 2, SUGGESTION: 1 });
    expect(s.total).toBe(4);
    expect(s.top.map((f) => f.id)).toEqual(['c1', 'w-hi', 'w-lo']);
    expect(s.top[0]).toMatchObject({ start_line: 1, end_line: 2, category: 'bug' });
  });

  it('ignores severities outside the contract', () => {
    const s = summarizeFindings([row('i', 'INFO'), row('w', 'WARNING')]);
    expect(s.total).toBe(1);
    expect(s.top.map((f) => f.id)).toEqual(['w']);
  });

  it('flattens whitespace and truncates long rationales with an ellipsis', () => {
    const long = `line one\n\nline   two ${'x'.repeat(50)}`;
    const [f] = summarizeFindings([row('w', 'WARNING', 0.9, long)], { rationaleMax: 20 }).top;
    expect(f!.rationale).toHaveLength(20);
    expect(f!.rationale.startsWith('line one line two')).toBe(true);
    expect(f!.rationale.endsWith('…')).toBe(true);
  });
});
