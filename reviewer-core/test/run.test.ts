import { describe, it, expect } from 'vitest';
import type { LLMProvider, StructuredResult } from '@devdigest/shared';
import { MockLLMProvider, MockGitClient } from '../../server/src/adapters/mocks.js';
import { reviewPullRequest } from '../src/index.js';

/**
 * Engine-level test for reviewPullRequest (the core lifted out of the server's
 * runOneAgent). Uses the server's mock LLM + git so we exercise the real
 * assemble → completeStructured → reduce → grounding pipeline with no DB/SSE.
 */
describe('reviewPullRequest (engine)', () => {
  // One grounded finding (line 11 is in the MockGitClient diff) + one
  // hallucinated finding (line 999) the grounding gate must drop.
  const fixture = {
    verdict: 'request_changes',
    summary: 'secret key committed',
    score: 38,
    findings: [
      {
        id: 'f1',
        severity: 'CRITICAL',
        category: 'security',
        title: 'Hardcoded Stripe secret key',
        file: 'src/config.ts',
        start_line: 11,
        end_line: 11,
        rationale: 'sk_live in diff',
        confidence: 0.98,
        kind: 'finding',
      },
      {
        id: 'f-hallucinated',
        severity: 'WARNING',
        category: 'bug',
        title: 'phantom finding on a line not in the diff',
        file: 'src/config.ts',
        start_line: 999,
        end_line: 999,
        rationale: 'not real',
        confidence: 0.3,
        kind: 'finding',
      },
    ],
  };

  it('single-pass: assembles, grounds, drops the hallucinated finding', async () => {
    const llm = new MockLLMProvider('openai', { structured: fixture });
    const diff = await new MockGitClient().diff();

    const events: string[] = [];
    const outcome = await reviewPullRequest({
      systemPrompt: 'security reviewer',
      model: 'gpt-4.1',
      diff,
      llm,
      task: 'Review PR #482',
      onEvent: (e) => events.push(e.msg),
    });

    expect(outcome.mode).toBe('single-pass');
    expect(outcome.grounding).toBe('1/2 passed');
    expect(outcome.review.findings).toHaveLength(1);
    expect(outcome.review.findings[0]!.start_line).toBe(11);
    expect(outcome.dropped).toHaveLength(1);
    // Score is derived from the SURVIVING findings, not the model's self-reported
    // 38: one CRITICAL remains after grounding ⇒ 100 − 35 = 65.
    expect(outcome.review.score).toBe(65);
    // progress is surfaced (server bridges this onto SSE; runner logs it)
    expect(events.some((m) => m.includes('Citation grounding'))).toBe(true);
  });

  it('score is deterministic from findings: a clean approve scores 100', async () => {
    // Model "approves" but reports a nonsense low score (the cheap-model bug).
    // The engine must ignore that and score the zero findings as a perfect 100.
    const clean = { verdict: 'approve', summary: 'looks good', score: 10, findings: [] };
    const llm = new MockLLMProvider('openai', { structured: clean });
    const diff = await new MockGitClient().diff();

    const outcome = await reviewPullRequest({
      systemPrompt: 'security reviewer',
      model: 'deepseek/deepseek-v4-flash',
      diff,
      llm,
      task: 'Review PR #5',
    });

    expect(outcome.review.findings).toHaveLength(0);
    expect(outcome.review.score).toBe(100);
  });

  it('checkCancelled throwing aborts before the LLM call', async () => {
    const llm = new MockLLMProvider('openai', { structured: fixture });
    const diff = await new MockGitClient().diff();
    await expect(
      reviewPullRequest({
        systemPrompt: 's',
        model: 'gpt-4.1',
        diff,
        llm,
        checkCancelled: () => {
          throw new Error('cancelled');
        },
      }),
    ).rejects.toThrow('cancelled');
  });

  it('forwards sessionId to every LLM call (OpenRouter session grouping)', async () => {
    const seen: (string | undefined)[] = [];
    const recorder: LLMProvider = {
      id: 'openrouter',
      async completeStructured<T>(req): Promise<StructuredResult<T>> {
        seen.push(req.sessionId);
        return {
          data: fixture as unknown as T,
          model: req.model,
          tokensIn: 0,
          tokensOut: 0,
          costUsd: 0,
          raw: '',
          attempts: 1,
        };
      },
      async listModels() {
        return [];
      },
      async complete() {
        throw new Error('not used');
      },
      async embed() {
        return [];
      },
    };
    const diff = await new MockGitClient().diff();
    await reviewPullRequest({ systemPrompt: 's', model: 'm', diff, llm: recorder, sessionId: 'sess-abc' });
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((s) => s === 'sess-abc')).toBe(true);
  });

  describe('M3 intent scope', () => {
    const f = (id: string, severity: string, in_scope: boolean, confidence = 0.8) => ({
      id,
      severity,
      category: 'bug',
      title: `finding ${id}`,
      file: 'src/config.ts',
      start_line: 11,
      end_line: 11,
      rationale: `rationale ${id}`,
      confidence,
      kind: 'finding',
      in_scope,
    });
    const scoped = {
      verdict: 'request_changes',
      summary: 's',
      score: 10,
      findings: [
        f('in-warn', 'WARNING', true),
        f('oos-sugg', 'SUGGESTION', false),
        f('oos-crit-1', 'CRITICAL', false, 0.6),
        f('oos-crit-2', 'CRITICAL', false, 0.9),
      ],
    };
    const intent = {
      summary: 'Adds rate limiting.',
      in_scope: ['Rate limiter'],
      out_of_scope: ['Billing'],
      confidence: 'medium',
      missing_context: [],
    };

    it('with intent: 1 in-scope WARNING + 1 notice kept, the OOS SUGGESTION hidden', async () => {
      const llm = new MockLLMProvider('openai', { structured: scoped });
      const diff = await new MockGitClient().diff();
      const outcome = await reviewPullRequest({ systemPrompt: 's', model: 'm', diff, llm, intent });

      expect(outcome.review.findings).toHaveLength(2);
      expect(outcome.review.findings.map((x) => x.id)).toEqual(['in-warn', 'scope-notice']);
      const notice = outcome.review.findings[1]!;
      expect(notice.kind).toBe('scope_notice');
      expect(notice.severity).toBe('CRITICAL');
      expect(notice.confidence).toBe(0.9);
      expect(outcome.scope?.hidden.map((x) => x.id)).toEqual(['oos-sugg']);
      expect(outcome.scope?.collapsedCount).toBe(2);
      // score recomputed from the final set: 1 WARNING + 1 CRITICAL notice
      expect(outcome.review.score).toBeLessThan(100);
      expect(outcome.assembly.intent_block).toBeTruthy();
    });

    it('without intent: every grounded finding is kept and scope is null', async () => {
      const llm = new MockLLMProvider('openai', { structured: scoped });
      const diff = await new MockGitClient().diff();
      const outcome = await reviewPullRequest({ systemPrompt: 's', model: 'm', diff, llm });

      expect(outcome.review.findings).toHaveLength(4);
      expect(outcome.scope).toBeNull();
      expect(outcome.assembly.intent_block).toBeUndefined();
    });

    it('scores the final set (hidden findings do not count)', async () => {
      const llm = new MockLLMProvider('openai', { structured: scoped });
      const diff = await new MockGitClient().diff();
      const withIntent = await reviewPullRequest({ systemPrompt: 's', model: 'm', diff, llm, intent });
      const llm2 = new MockLLMProvider('openai', {
        structured: { ...scoped, findings: [f('in-warn', 'WARNING', true), f('c', 'CRITICAL', true)] },
      });
      const reference = await reviewPullRequest({ systemPrompt: 's', model: 'm', diff, llm: llm2 });
      expect(withIntent.review.score).toBe(reference.review.score);
    });
  });
});
