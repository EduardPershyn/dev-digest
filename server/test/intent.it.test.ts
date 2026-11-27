import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import type { PrIntentRecord, PrIntentResponse, StructuredRequest } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildTestApp as buildApp } from './helpers/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockEmbedder, MockGitClient, MockGitHubClient, MockLLMProvider } from '../src/adapters/mocks.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;
if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[intent] Docker not available — skipping integration tests.');
}

/**
 * M3 Intent layer (specs/M3-intent-layer.md): GET / POST classify against a
 * real Postgres (migration 0013 applied), with the openrouter LLM and GitHub
 * mocked. The default `review_intent` model is openrouter/deepseek-v4-flash.
 */

const RAW_DIFF = [
  'diff --git a/src/middleware/ratelimit.ts b/src/middleware/ratelimit.ts',
  '--- a/src/middleware/ratelimit.ts',
  '+++ b/src/middleware/ratelimit.ts',
  '@@ -1,1 +1,2 @@ export function limiter()',
  ' context',
  '+const SECRET_ADDED_LINE = 1;',
].join('\n');

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
const GOOD = {
  summary: 'Adds per-IP rate limiting to the public API.',
  in_scope: ['Rate limiter middleware'],
  out_of_scope: ['Billing'],
  confidence: 'high',
};

d('M3 intent (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let repoId: string;
  let seq = 0;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    await seed(pg.handle.db); // idempotent, including the seeded PR #482 intent
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'intent-api', fullName: 'acme/intent-api' })
      .returning();
    repoId = repo!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function makeApp(llm: MockLLMProvider, github = new MockGitHubClient()) {
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: RAW_DIFF }),
        github,
        llm: { openrouter: llm },
      },
    });
  }

  const goodLlm = () => new MockLLMProvider('openrouter', { structuredBySchema: { IntentClassification: GOOD } });

  async function newPull(body: string | null = 'Adds per-IP rate limiting to every public API endpoint. Closes #7.') {
    const n = 1000 + ++seq;
    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId,
        number: n,
        title: 'Add rate limiting',
        author: 'a',
        branch: 'feat/rl',
        base: 'main',
        headSha: `head-${n}`,
        body,
      })
      .returning();
    return pr!;
  }

  it('GET returns { intent: null } before the first classification', async () => {
    const pr = await newPull();
    const app = await makeApp(goodLlm());
    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/intent` });
    await app.close();
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ intent: null });
  });

  it('POST classify → 200, one call with the default model, row filled; GET reads it back', async () => {
    const pr = await newPull();
    const llm = goodLlm();
    const gh = new MockGitHubClient({ issues: { 7: { number: 7, title: 'Abuse', body: 'Bots hammer /api', state: 'open' } } });
    const app = await makeApp(llm, gh);
    const res = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/intent/classify` });
    expect(res.statusCode).toBe(200);
    const body = res.json() as PrIntentRecord;

    const calls = llm.calls.filter((c) => c.method === 'completeStructured');
    expect(calls).toHaveLength(1);
    const req = calls[0]!.req as StructuredRequest<unknown>;
    expect(req.model).toBe('deepseek/deepseek-v4-flash');
    expect(req.requireParameters).toBe(true);
    const user = req.messages[1]!.content;
    expect(user).toContain('src/middleware/ratelimit.ts');
    expect(user).toContain('Bots hammer /api');
    expect(user).not.toContain('SECRET_ADDED_LINE');
    expect(gh.issueReads).toEqual([7]);

    expect(body).toMatchObject({
      pr_id: pr.id,
      summary: GOOD.summary,
      confidence: 'high',
      provider: 'openrouter',
      model: 'deepseek/deepseek-v4-flash',
      head_sha: pr.headSha,
      status: 'ok',
      error: null,
      stale: false,
    });
    expect(body.sources.map((s) => s.kind)).toEqual(['pr_title', 'pr_body', 'issue', 'changed_files']);

    const [row] = await pg.handle.db.select().from(t.prIntent).where(eq(t.prIntent.prId, pr.id));
    expect(row).toMatchObject({ summary: GOOD.summary, status: 'ok', tokensIn: 100, costUsd: 0.001 });
    expect(row!.classifiedAt).toBeInstanceOf(Date);

    const get = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/intent` });
    await app.close();
    expect((get.json() as PrIntentResponse).intent).toMatchObject({ summary: GOOD.summary, stale: false });
  });

  it('stale toggles when the PR head moves', async () => {
    const pr = await newPull();
    const app = await makeApp(goodLlm());
    await app.inject({ method: 'POST', url: `/pulls/${pr.id}/intent/classify` });
    await pg.handle.db.update(t.pullRequests).set({ headSha: 'moved' }).where(eq(t.pullRequests.id, pr.id));
    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/intent` });
    await app.close();
    expect((res.json() as PrIntentResponse).intent?.stale).toBe(true);
  });

  it('invalid model output → 502, status failed, previous content kept', async () => {
    const pr = await newPull();
    const ok = await makeApp(goodLlm());
    await ok.inject({ method: 'POST', url: `/pulls/${pr.id}/intent/classify` });
    await ok.close();

    const bad = new MockLLMProvider('openrouter', { structuredBySchema: { IntentClassification: { nope: true } } });
    const app = await makeApp(bad);
    const res = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/intent/classify` });
    expect(res.statusCode).toBe(502);
    const get = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/intent` });
    await app.close();
    const intent = (get.json() as PrIntentResponse).intent!;
    expect(intent.status).toBe('failed');
    expect(intent.error).toBeTruthy();
    expect(intent.summary).toBe(GOOD.summary);
  });

  it('a first-ever failure inserts an empty failed row', async () => {
    const pr = await newPull();
    const bad = new MockLLMProvider('openrouter', { structuredBySchema: { IntentClassification: { nope: true } } });
    const app = await makeApp(bad);
    const res = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/intent/classify` });
    const get = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/intent` });
    await app.close();
    expect(res.statusCode).toBe(502);
    expect((get.json() as PrIntentResponse).intent).toMatchObject({ status: 'failed', summary: '', stale: true });
  });

  it('unknown PR → 404 on both routes', async () => {
    const app = await makeApp(goodLlm());
    const id = '00000000-0000-4000-8000-000000000000';
    const get = await app.inject({ method: 'GET', url: `/pulls/${id}/intent` });
    const post = await app.inject({ method: 'POST', url: `/pulls/${id}/intent/classify` });
    await app.close();
    expect(get.statusCode).toBe(404);
    expect(post.statusCode).toBe(404);
  });

  it('the seed holds an ok intent for PR #482 that is not stale', async () => {
    const [pr482] = await pg.handle.db.select().from(t.pullRequests).where(eq(t.pullRequests.number, 482));
    const app = await makeApp(goodLlm());
    const res = await app.inject({ method: 'GET', url: `/pulls/${pr482!.id}/intent` });
    await app.close();
    const intent = (res.json() as PrIntentResponse).intent!;
    expect(intent).toMatchObject({
      summary: 'Adds per-IP rate limiting to the public API endpoints.',
      confidence: 'medium',
      model: 'deepseek/deepseek-v4-flash',
      status: 'ok',
      stale: false,
    });
    expect(intent.missing_context).toEqual([
      { url: 'https://linear.app/acme/issue/PAY-12', kind: 'external', reason: 'unsupported_host' },
    ]);
  });
});
