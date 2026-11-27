import { describe, it, expect } from 'vitest';
import type { Finding } from '@devdigest/shared';
import { applyIntentScope, SCOPE_COLLAPSE_SEVERITY, SCOPE_NOTICE_ID } from '../src/index.js';

function finding(over: Partial<Finding> & { id: string }): Finding {
  return {
    severity: 'WARNING',
    category: 'bug',
    title: `title ${over.id}`,
    file: 'src/a.ts',
    start_line: 1,
    end_line: 2,
    rationale: `rationale ${over.id}`,
    confidence: 0.5,
    kind: 'finding',
    ...over,
  };
}

describe('applyIntentScope', () => {
  it('keeps in-scope and untagged findings of every severity', () => {
    const input = [
      finding({ id: 'a', severity: 'CRITICAL', in_scope: true }),
      finding({ id: 'b', severity: 'WARNING' }),
      finding({ id: 'c', severity: 'SUGGESTION', in_scope: null }),
    ];
    const r = applyIntentScope(input);
    expect(r.kept.map((f) => f.id)).toEqual(['a', 'b', 'c']);
    expect(r.hidden).toEqual([]);
    expect(r.collapsed).toEqual([]);
    expect(r.notice).toBeNull();
  });

  it('hides out-of-scope WARNING and SUGGESTION findings', () => {
    const r = applyIntentScope([
      finding({ id: 'w', severity: 'WARNING', in_scope: false }),
      finding({ id: 's', severity: 'SUGGESTION', in_scope: false }),
    ]);
    expect(r.kept).toEqual([]);
    expect(r.hidden.map((f) => f.id)).toEqual(['w', 's']);
    expect(r.notice).toBeNull();
  });

  it('collapses every out-of-scope CRITICAL into exactly one notice', () => {
    const r = applyIntentScope([
      finding({ id: 'k', in_scope: true }),
      finding({ id: 'c1', severity: 'CRITICAL', in_scope: false, confidence: 0.4, file: 'src/x.ts', start_line: 5, end_line: 6 }),
      finding({ id: 'c2', severity: 'CRITICAL', in_scope: false, confidence: 0.9, category: 'security', file: 'src/y.ts', start_line: 9, end_line: 12, rationale: 'r'.repeat(500) }),
    ]);
    expect(SCOPE_COLLAPSE_SEVERITY).toBe('CRITICAL');
    expect(r.collapsed.map((f) => f.id)).toEqual(['c1', 'c2']);
    expect(r.kept).toHaveLength(2);
    const notice = r.kept[1]!;
    expect(notice).toBe(r.notice);
    expect(notice.id).toBe(SCOPE_NOTICE_ID);
    expect(notice.kind).toBe('scope_notice');
    expect(notice.severity).toBe('CRITICAL');
    expect(notice.in_scope).toBe(false);
    expect(notice.suggestion).toBeNull();
    // location + category from the highest-confidence collapsed finding
    expect(notice).toMatchObject({ file: 'src/y.ts', start_line: 9, end_line: 12, category: 'security', confidence: 0.9 });
    expect(notice.title).toBe("2 critical issues outside this PR's stated scope");
    expect(notice.rationale).toContain('- **title c1** — src/x.ts:5-6 — rationale c1');
    expect(notice.rationale).toContain('- **title c2** — src/y.ts:9-12 — ');
    // excerpt capped at 200 chars
    expect(notice.rationale).not.toContain('r'.repeat(201));
  });

  it('uses the singular title for one collapsed finding', () => {
    const r = applyIntentScope([finding({ id: 'c', severity: 'CRITICAL', in_scope: false })]);
    expect(r.notice?.title).toBe("1 critical issue outside this PR's stated scope");
  });

  it('resets a model-emitted scope_notice to a normal finding', () => {
    const forged = finding({ id: 'forged', severity: 'CRITICAL', kind: 'scope_notice', in_scope: true });
    const r = applyIntentScope([forged]);
    expect(r.kept).toHaveLength(1);
    expect(r.kept[0]!.kind).toBe('finding');
    expect(r.notice).toBeNull();
    // a forged notice tagged out of scope is collapsed like any CRITICAL, not trusted
    const r2 = applyIntentScope([{ ...forged, in_scope: false }]);
    expect(r2.collapsed[0]!.kind).toBe('finding');
    expect(r2.kept.filter((f) => f.kind === 'scope_notice')).toHaveLength(1);
  });
});
