import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import type { Review, RunTrace, StructuredRequest, StructuredResult } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns } from './helpers/runs.js';
import { buildTestApp as buildApp } from './helpers/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockEmbedder, MockGitClient, MockGitHubClient, MockLLMProvider } from '../src/adapters/mocks.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;
if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[reviews-intent] Docker not available — skipping integration tests.');
}

/**
 * M3 — the review pre-work resolves the PR intent once, the reviewer prompt
 * gains `## PR intent (derived)`, and the scope filter hides / collapses
 * out-of-scope findings. An intent failure never fails the review.
 */

const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@ export const config = {
   port: 3000,
+  retries: 3,
   redisUrl: x,`;

const INTENT = {
  summary: 'Adds retry configuration.',
  in_scope: ['Config'],
  out_of_scope: ['Billing'],
  confidence: 'medium',
};

const finding = (id: string, severity: string, in_scope: boolean, confidence = 0.8) => ({
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

const SCOPED_REVIEW: Review = {
  verdict: 'request_changes',
  summary: 's',
  score: 40,
  findings: [
    finding('in', 'WARNING', true),
    finding('oos-s', 'SUGGESTION', false),
    finding('oos-c1', 'CRITICAL', false, 0.6),
    finding('oos-c2', 'CRITICAL', false, 0.9),
  ],
} as Review;

class ThrowingLLM extends MockLLMProvider {
  override async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    this.calls.push({ method: 'completeStructured', req });
    throw new Error('intent upstream 500');
  }
}

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

d('M3 reviews + intent (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let seq = 0;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function makeApp(reviewLlm: MockLLMProvider, intentLlm: MockLLMProvider) {
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: DIFF }),
        github: new MockGitHubClient(),
        // agents run on openai; the intent classifier defaults to openrouter
        llm: { openai: reviewLlm, openrouter: intentLlm },
      },
    });
  }

  async function setup(reviewLlm: MockLLMProvider, intentLlm: MockLLMProvider) {
    const app = await makeApp(reviewLlm, intentLlm);
    const db = pg.handle.db;
    const n = ++seq;
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: `Intent agent ${n}`, provider: 'openai', model: 'gpt-4.1', system_prompt: 'x' },
      })
    ).json();
    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: `intent-rev-${n}`, fullName: `acme/intent-rev-${n}` })
      .returning();
    const [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo!.id,
        number: 50 + n,
        title: 'Add retries',
        author: 'dev',
        branch: 'feat/retries',
        base: 'main',
        headSha: `sha-${n}`,
        status: 'needs_review',
        body: 'Adds a retries setting to the service config for flaky upstreams.',
      })
      .returning();
    return { app, agent, pr: pr!, db };
  }

  async function runAndTrace(app: Awaited<ReturnType<typeof makeApp>>, prId: string, agentId: string) {
    const db = pg.handle.db;
    const res = await app.inject({ method: 'POST', url: `/pulls/${prId}/review`, payload: { agentId } });
    expect(res.statusCode).toBe(200);
    const runs = await waitForPrRuns(db, prId, { expected: 1 });
    let traceRow: { trace: unknown } | undefined;
    for (let i = 0; i < 200 && !traceRow; i++) {
      [traceRow] = await db.select().from(t.runTraces).where(eq(t.runTraces.runId, runs[0]!.id));
      if (!traceRow) await new Promise((r) => setTimeout(r, 25));
    }
    const [review] = await db.select().from(t.reviews).where(eq(t.reviews.runId, runs[0]!.id));
    const findings = review
      ? await db.select().from(t.findings).where(eq(t.findings.reviewId, review.id))
      : [];
    return { run: runs[0]!, trace: traceRow!.trace as RunTrace, findings };
  }

  function reviewUser(llm: MockLLMProvider): string {
    const call = llm.calls.find((c) => c.method === 'completeStructured');
    return (call!.req as { messages: { content: string }[] }).messages[1]!.content;
  }

  it('classifies before the run, puts the intent in the prompt and counts its tokens', async () => {
    const reviewLlm = new MockLLMProvider('openai', {
      structured: { verdict: 'approve', summary: 'ok', score: 100, findings: [] },
    });
    const intentLlm = new MockLLMProvider('openrouter', { structuredBySchema: { IntentClassification: INTENT } });
    const { app, agent, pr, db } = await setup(reviewLlm, intentLlm);
    const { run, trace } = await runAndTrace(app, pr.id, agent.id);
    await app.close();

    expect(run.status).toBe('done');
    expect(intentLlm.calls.filter((c) => c.method === 'completeStructured')).toHaveLength(1);
    const user = reviewUser(reviewLlm);
    expect(user).toContain('## PR intent (derived)');
    expect(user).toContain('<untrusted source="pr-intent">');
    expect(user).toContain('Adds retry configuration.');

    expect(trace.intent).toEqual({ status: 'classified', reason: null });
    expect(trace.prompt_assembly.intent_block?.tokens).toBeGreaterThan(0);
    expect(trace.prompt_assembly.intent_block?.model).toBe('deepseek/deepseek-v4-flash');
    expect(trace.log.some((l) => l.msg.startsWith('Resolving PR intent'))).toBe(true);
    expect(trace.log.some((l) => l.msg.startsWith('intent: classified with deepseek/deepseek-v4-flash'))).toBe(true);

    const [row] = await db.select().from(t.prIntent).where(eq(t.prIntent.prId, pr.id));
    expect(row?.status).toBe('ok');
  });

  it('hides the OOS suggestion and collapses both OOS criticals into one notice', async () => {
    const reviewLlm = new MockLLMProvider('openai', { structured: SCOPED_REVIEW });
    const intentLlm = new MockLLMProvider('openrouter', { structuredBySchema: { IntentClassification: INTENT } });
    const { app, agent, pr } = await setup(reviewLlm, intentLlm);
    const { run, trace, findings } = await runAndTrace(app, pr.id, agent.id);
    await app.close();

    expect(run.status).toBe('done');
    expect(findings).toHaveLength(2);
    const notice = findings.find((f) => f.kind === 'scope_notice');
    expect(notice).toMatchObject({ severity: 'CRITICAL', confidence: 0.9 });
    expect(notice!.rationale).toContain('finding oos-c1');
    expect(notice!.rationale).toContain('finding oos-c2');
    expect(findings.some((f) => f.title === 'finding in')).toBe(true);
    expect(run.findingsCount).toBe(2);

    expect(trace.scope_filter).toEqual({
      hidden: [{ title: 'finding oos-s', file: 'src/config.ts', start_line: 11, severity: 'SUGGESTION' }],
      hidden_count: 1,
      collapsed_count: 2,
    });
  });

  it('an intent failure still finishes the run without intent and keeps every finding', async () => {
    const reviewLlm = new MockLLMProvider('openai', { structured: SCOPED_REVIEW });
    const intentLlm = new ThrowingLLM('openrouter');
    const { app, agent, pr, db } = await setup(reviewLlm, intentLlm);
    const { run, trace, findings } = await runAndTrace(app, pr.id, agent.id);
    await app.close();

    expect(run.status).toBe('done');
    expect(findings).toHaveLength(4);
    expect(reviewUser(reviewLlm)).not.toContain('PR intent');
    expect(trace.intent?.status).toBe('failed');
    expect(trace.intent?.reason).toContain('intent upstream 500');
    expect(trace.prompt_assembly.intent_block ?? null).toBeNull();
    expect(trace.scope_filter ?? null).toBeNull();
    expect(trace.log.some((l) => l.msg.startsWith('intent: unavailable — reviewing without intent'))).toBe(true);

    const [row] = await db.select().from(t.prIntent).where(eq(t.prIntent.prId, pr.id));
    expect(row).toMatchObject({ status: 'failed' });
  });

  it('reuses a fresh intent on the next review without a model call', async () => {
    const reviewLlm = new MockLLMProvider('openai', {
      structured: { verdict: 'approve', summary: 'ok', score: 100, findings: [] },
    });
    const intentLlm = new MockLLMProvider('openrouter', { structuredBySchema: { IntentClassification: INTENT } });
    const { app, agent, pr, db } = await setup(reviewLlm, intentLlm);
    await runAndTrace(app, pr.id, agent.id);
    await db.delete(t.agentRuns).where(eq(t.agentRuns.prId, pr.id));
    const { trace } = await runAndTrace(app, pr.id, agent.id);
    await app.close();
    expect(intentLlm.calls.filter((c) => c.method === 'completeStructured')).toHaveLength(1);
    expect(trace.intent?.status).toBe('reused');
    expect(trace.log.some((l) => l.msg.startsWith('intent: reused (medium'))).toBe(true);
  });

  /**
   * AC-5 — two agents in ONE batch (`all: true`). Every other agent in the
   * workspace is disabled first so the batch is exactly the two openai agents
   * created here (seed agents run on openrouter, which is the intent mock).
   */
  async function setupTwoAgents(reviewLlm: MockLLMProvider, intentLlm: MockLLMProvider) {
    const { app, pr, db } = await setup(reviewLlm, intentLlm);
    await db.update(t.agents).set({ enabled: false }).where(eq(t.agents.workspaceId, workspaceId));
    const created = [];
    for (const name of [`Batch agent A ${seq}`, `Batch agent B ${seq}`]) {
      created.push(
        (
          await app.inject({
            method: 'POST',
            url: '/agents',
            payload: { name, provider: 'openai', model: 'gpt-4.1', system_prompt: 'x' },
          })
        ).json() as { id: string },
      );
    }
    return { app, pr, db, agentIds: created.map((a) => a.id) };
  }

  async function runBatchAndTraces(app: Awaited<ReturnType<typeof makeApp>>, prId: string) {
    const db = pg.handle.db;
    const res = await app.inject({ method: 'POST', url: `/pulls/${prId}/review`, payload: { all: true } });
    expect(res.statusCode).toBe(200);
    const runs = await waitForPrRuns(db, prId, { expected: 2 });
    expect(runs).toHaveLength(2);
    // saveRunTrace runs after the run row is marked done → poll for both traces.
    const traces = new Map<string, RunTrace>();
    for (let i = 0; i < 200 && traces.size < runs.length; i++) {
      for (const r of runs) {
        if (traces.has(r.id)) continue;
        const [row] = await db.select().from(t.runTraces).where(eq(t.runTraces.runId, r.id));
        if (row) traces.set(r.id, row.trace as RunTrace);
      }
      if (traces.size < runs.length) await new Promise((r) => setTimeout(r, 25));
    }
    expect(traces.size).toBe(2);
    return { runs, traces: runs.map((r) => traces.get(r.id)!) };
  }

  it('a two-agent batch classifies the intent once and both runs carry it', async () => {
    const reviewLlm = new MockLLMProvider('openai', {
      structured: { verdict: 'approve', summary: 'ok', score: 100, findings: [] },
    });
    const intentLlm = new MockLLMProvider('openrouter', { structuredBySchema: { IntentClassification: INTENT } });
    const { app, pr, agentIds } = await setupTwoAgents(reviewLlm, intentLlm);
    const { runs, traces } = await runBatchAndTraces(app, pr.id);
    await app.close();

    expect(new Set(runs.map((r) => r.agentId))).toEqual(new Set(agentIds));
    expect(runs.map((r) => r.status)).toEqual(['done', 'done']);
    // ONE classifier call for the whole batch, resolved before the per-agent loop.
    expect(
      intentLlm.calls.filter(
        (c) => c.method === 'completeStructured' && (c.req as { schemaName?: string }).schemaName === 'IntentClassification',
      ),
    ).toHaveLength(1);
    // The same resolution is handed to every run, so both report 'classified'.
    expect(traces.map((tr) => tr.intent)).toEqual([
      { status: 'classified', reason: null },
      { status: 'classified', reason: null },
    ]);
    const reviewUsers = reviewLlm.calls
      .filter((c) => c.method === 'completeStructured')
      .map((c) => (c.req as { messages: { content: string }[] }).messages[1]!.content);
    expect(reviewUsers.length).toBeGreaterThanOrEqual(2);
    for (const user of reviewUsers) expect(user).toContain('<untrusted source="pr-intent">');
    for (const tr of traces) expect(tr.prompt_assembly.user).toContain('<untrusted source="pr-intent">');
  });

  it('a failed intent in a two-agent batch still finishes both runs, each traced as failed', async () => {
    const reviewLlm = new MockLLMProvider('openai', {
      structured: { verdict: 'approve', summary: 'ok', score: 100, findings: [] },
    });
    const intentLlm = new ThrowingLLM('openrouter');
    const { app, pr } = await setupTwoAgents(reviewLlm, intentLlm);
    const { runs, traces } = await runBatchAndTraces(app, pr.id);
    await app.close();

    expect(runs.map((r) => r.status)).toEqual(['done', 'done']);
    expect(intentLlm.calls.filter((c) => c.method === 'completeStructured')).toHaveLength(1);
    for (const tr of traces) {
      expect(tr.intent?.status).toBe('failed');
      expect(tr.intent?.reason).toContain('intent upstream 500');
      expect(tr.prompt_assembly.user).not.toContain('PR intent');
    }
  });
});
