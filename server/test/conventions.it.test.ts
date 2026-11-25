import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import type {
  ConventionCandidate,
  ConventionExtractResult,
  ConventionExtraction,
  ConventionList,
  ConventionSkillDraft,
  Review,
  RunTrace,
  StructuredRequest,
  StructuredResult,
} from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns } from './helpers/runs.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import type { RepoIntel } from '../src/modules/repo-intel/types.js';
import { MockEmbedder, MockGitClient, MockGitHubClient, MockLLMProvider } from '../src/adapters/mocks.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;
if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[conventions] Docker not available — skipping integration tests.');
}

/**
 * M2 Conventions Extractor (specs/M2-conventions.md): ONE model call per run,
 * evidence validated against the files actually sent, curation, re-scan that
 * keeps decisions, server-side skill draft from accepted rows only, the
 * `extracted` skill source, and the saved skill reaching a review trace.
 */

const INVOICES = [
  "import { z } from 'zod';",
  '',
  'const Params = z.object({ id: z.string().uuid() });',
  '',
  "router.get('/invoices/:id', async (req, res) => {",
  '  const { id } = Params.parse(req.params);',
  '  const invoice = await repo.find(id);',
  "  if (!invoice) return res.status(404).json({ error: 'not_found' });",
  '  return res.json({ amount: invoice.amount, currency: invoice.currency });',
  '});',
].join('\n');
const ORDERS = INVOICES.replaceAll('invoice', 'order');
const SECRET = 'TOP SECRET — never sampled';

const CONVENTIONS_MODEL = 'cheap-conventions-model';

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

/** The three conventions the sandbox files share (all valid evidence). */
const PARAMS = {
  rule: 'Parse path params with a Params Zod schema.',
  category: 'api layer',
  evidence_path: 'src/routes/invoices.ts',
  evidence_snippet: 'const Params = z.object({ id: z.string().uuid() });',
  confidence: 0.9,
};
const NOT_FOUND = {
  rule: "Answer a missing record with 404 { error: 'not_found' }.",
  category: 'error handling',
  evidence_path: 'src/routes/orders.ts',
  evidence_snippet: "  if (!order) return res.status(404).json({ error: 'not_found' });",
  confidence: 0.8,
};
const MONEY = {
  rule: 'Expose money as amount + currency.',
  category: 'naming',
  evidence_path: 'src/routes/invoices.ts',
  evidence_snippet: 'return res.json({ amount: invoice.amount, currency: invoice.currency });',
  confidence: 0.7,
};

class ThrowingLLM extends MockLLMProvider {
  override async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    this.calls.push({ method: 'completeStructured', req });
    throw new Error('upstream 500');
  }
}

d('M2 conventions (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let cloneRoot: string;
  let seq = 0;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;

    cloneRoot = mkdtempSync(path.join(tmpdir(), 'dd-conventions-'));
    mkdirSync(path.join(cloneRoot, 'src/routes'), { recursive: true });
    writeFileSync(path.join(cloneRoot, 'src/routes/invoices.ts'), INVOICES);
    writeFileSync(path.join(cloneRoot, 'src/routes/orders.ts'), ORDERS);
    writeFileSync(path.join(cloneRoot, 'src/secret.ts'), SECRET);
    writeFileSync(path.join(cloneRoot, 'tsconfig.json'), '{ "compilerOptions": { "strict": true } }\n');
  });
  afterAll(async () => {
    await pg?.stop();
    if (cloneRoot) rmSync(cloneRoot, { recursive: true, force: true });
  });

  function makeApp(
    llm: MockLLMProvider,
    samples: string[] = ['src/routes/invoices.ts', 'src/routes/orders.ts'],
  ) {
    const repoIntel = { getConventionSamples: async () => samples } as unknown as RepoIntel;
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ head: 'feedc0de' }),
        github: new MockGitHubClient(),
        llm: { openai: llm },
        repoIntel,
      },
    });
  }

  const extraction = (conventions: unknown[]): ConventionExtraction =>
    ({ conventions }) as ConventionExtraction;
  const mockLlm = (conventions: unknown[]) =>
    new MockLLMProvider('openai', { structuredBySchema: { ConventionExtraction: extraction(conventions) } });

  async function newRepo(clonePath: string | null = cloneRoot) {
    const n = ++seq;
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: `conv-${n}`, fullName: `acme/conv-${n}`, clonePath })
      .returning();
    return repo!;
  }

  async function rows(repoId: string) {
    return pg.handle.db.select().from(t.conventions).where(eq(t.conventions.repoId, repoId));
  }

  async function extract(llm: MockLLMProvider, repoId: string, samples?: string[]) {
    const app = await makeApp(llm, samples);
    const res = await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` });
    await app.close();
    return res;
  }

  it('uses the Conventions feature model in exactly ONE call and keeps only valid evidence', async () => {
    const setup = await makeApp(mockLlm([]));
    await setup.inject({
      method: 'PUT',
      url: '/settings',
      payload: { feature_models: { conventions: { provider: 'openai', model: CONVENTIONS_MODEL } } },
    });
    await setup.close();

    const repo = await newRepo();
    const llm = mockLlm([
      PARAMS,
      { ...MONEY, evidence_path: 'src/secret.ts' }, // exists in the clone, but was never sent
      { ...NOT_FOUND, evidence_snippet: "if (!order) return res.status(404).json({ error: 'missing' });" },
      { ...MONEY, evidence_snippet: "router.get('/invoices/:id', async (req, res) => {\n  ...\n});" },
    ]);
    const res = await extract(llm, repo.id);
    expect(res.statusCode).toBe(200);
    const body = res.json() as ConventionExtractResult;

    const calls = llm.calls.filter((c) => c.method === 'completeStructured');
    expect(calls).toHaveLength(1);
    const req = calls[0]!.req as StructuredRequest<unknown>;
    expect(req.maxRetries).toBe(0);
    expect(req.model).toBe(CONVENTIONS_MODEL);
    expect(req.schemaName).toBe('ConventionExtraction');
    const user = req.messages[1]!.content;
    expect(user).toContain('### tsconfig.json'); // config first
    expect(user.indexOf('### tsconfig.json')).toBeLessThan(user.indexOf('### src/routes/invoices.ts'));
    expect(user).toContain('<untrusted source="file:src/routes/orders.ts">');
    expect(user).not.toContain(SECRET);

    expect(body.stats).toEqual({
      sample_files: 3,
      proposed: 4,
      rejected_invalid_evidence: 3,
      skipped_duplicates: 0,
      kept: 1,
    });
    expect(body.usage.model).toBe(CONVENTIONS_MODEL);
    expect(body.candidates).toHaveLength(1);
    const c = body.candidates[0]!;
    expect(c).toMatchObject({
      rule: PARAMS.rule,
      status: 'pending',
      accepted: false,
      category: 'api layer',
      evidence_path: 'src/routes/invoices.ts',
      evidence_snippet: PARAMS.evidence_snippet,
      evidence_start_line: 3,
      evidence_end_line: 3,
      evidence_url: `https://github.com/${repo.fullName}/blob/feedc0de/src/routes/invoices.ts#L3`,
    });
    expect(body.last_scan_at).not.toBeNull();
    expect(await rows(repo.id)).toHaveLength(1);
  });

  it('curates (accept / reject / edit / back to pending) and 404s across repos', async () => {
    const repo = await newRepo();
    const other = await newRepo();
    const res = await extract(mockLlm([PARAMS, NOT_FOUND]), repo.id);
    const [a, b] = (res.json() as ConventionExtractResult).candidates;
    const app = await makeApp(mockLlm([]));

    const put = (repoId: string, id: string, payload: unknown) =>
      app.inject({ method: 'PUT', url: `/repos/${repoId}/conventions/${id}`, payload });

    const accepted = (await put(repo.id, a!.id, { status: 'accepted' })).json() as ConventionCandidate;
    expect(accepted).toMatchObject({ status: 'accepted', accepted: true });
    const edited = (await put(repo.id, a!.id, { rule: '  Validate :id with Params.  ' })).json();
    expect(edited).toMatchObject({ rule: 'Validate :id with Params.', status: 'accepted' });
    expect((await put(repo.id, b!.id, { status: 'rejected' })).json()).toMatchObject({
      status: 'rejected',
      accepted: false,
    });
    expect((await put(repo.id, b!.id, { status: 'pending' })).json()).toMatchObject({ status: 'pending' });

    expect((await put(other.id, a!.id, { status: 'rejected' })).statusCode).toBe(404);
    expect((await put(repo.id, a!.id, {})).statusCode).toBe(422);
    expect((await put(repo.id, a!.id, { evidence_path: 'x' })).statusCode).toBe(422);

    const [row] = await pg.handle.db.select().from(t.conventions).where(eq(t.conventions.id, a!.id));
    expect(row).toMatchObject({ status: 'accepted', accepted: true });
    expect(row!.updatedAt.getTime()).toBeGreaterThanOrEqual(row!.createdAt.getTime());
    await app.close();
  });

  it('re-scan keeps decided rows, does not duplicate them and replaces old pending rows', async () => {
    const repo = await newRepo();
    const first = (await extract(mockLlm([PARAMS, NOT_FOUND, MONEY]), repo.id)).json() as ConventionExtractResult;
    const byRule = new Map(first.candidates.map((c) => [c.rule, c]));
    const app = await makeApp(mockLlm([]));
    await app.inject({
      method: 'PUT',
      url: `/repos/${repo.id}/conventions/${byRule.get(PARAMS.rule)!.id}`,
      payload: { status: 'accepted' },
    });
    await app.inject({
      method: 'PUT',
      url: `/repos/${repo.id}/conventions/${byRule.get(NOT_FOUND.rule)!.id}`,
      payload: { status: 'rejected' },
    });
    await app.close();

    const NEW = {
      rule: 'Import zod as { z }.',
      category: 'imports',
      evidence_path: 'src/routes/orders.ts',
      evidence_snippet: "import { z } from 'zod';",
      confidence: 0.6,
    };
    const llm = mockLlm([{ ...PARAMS, rule: 'parse path params with a params zod schema' }, NOT_FOUND, NEW]);
    const second = (await extract(llm, repo.id)).json() as ConventionExtractResult;

    // decided rules were given to the model as "do not repeat"
    const user = (llm.calls[0]!.req as StructuredRequest<unknown>).messages[1]!.content;
    expect(user).toContain(`- ${PARAMS.rule}`);
    expect(user).toContain(`- ${NOT_FOUND.rule}`);

    expect(second.stats).toMatchObject({ proposed: 3, skipped_duplicates: 2, kept: 1 });
    const state = (await rows(repo.id)).map((r) => [r.rule, r.status]).sort();
    expect(state).toEqual(
      [
        [PARAMS.rule, 'accepted'],
        [NOT_FOUND.rule, 'rejected'],
        [NEW.rule, 'pending'],
      ].sort(),
    );
    expect(second.candidates.map((c) => c.status)).toEqual(['pending', 'accepted', 'rejected']);
  });

  it('fails with 502 and writes nothing when the model call fails; 409 without samples or clone', async () => {
    const repo = await newRepo();
    await extract(mockLlm([PARAMS]), repo.id);
    const before = await rows(repo.id);

    const throwing = new ThrowingLLM('openai');
    const res = await extract(throwing, repo.id);
    expect(res.statusCode).toBe(502);
    expect(res.json().error.message).toContain('upstream 500');
    expect(throwing.calls).toHaveLength(1);
    expect(await rows(repo.id)).toEqual(before);

    const notIndexed = await extract(mockLlm([PARAMS]), repo.id, []);
    expect(notIndexed.statusCode).toBe(409);
    expect(notIndexed.json().error.message).toMatch(/not indexed/);

    const notCloned = await extract(mockLlm([PARAMS]), (await newRepo(null)).id);
    expect(notCloned.statusCode).toBe(409);

    const app = await makeApp(mockLlm([]));
    const unknown = await app.inject({ method: 'GET', url: `/repos/${crypto.randomUUID()}/conventions` });
    expect(unknown.statusCode).toBe(404);
    const empty = (await app.inject({ method: 'GET', url: `/repos/${(await newRepo()).id}/conventions` })).json() as ConventionList;
    expect(empty).toEqual({ candidates: [], last_scan_at: null });
    await app.close();
  });

  it('drafts a skill from ACCEPTED rows only, saves it as extracted, and a review carries it', async () => {
    const repo = await newRepo();
    const scanned = (await extract(mockLlm([PARAMS, NOT_FOUND, MONEY]), repo.id)).json() as ConventionExtractResult;
    const id = (rule: string) => scanned.candidates.find((c) => c.rule === rule)!.id;
    const review: Review = { verdict: 'approve', summary: 'ok', score: 100, findings: [] };
    const llm = new MockLLMProvider('openai', { structured: review });
    const app = await makeApp(llm);
    const put = (cid: string, status: string) =>
      app.inject({ method: 'PUT', url: `/repos/${repo.id}/conventions/${cid}`, payload: { status } });
    await put(id(PARAMS.rule), 'accepted');
    await put(id(MONEY.rule), 'accepted');
    await put(id(NOT_FOUND.rule), 'rejected');

    // a rejected id in the request is ignored
    const draftRes = await app.inject({
      method: 'POST',
      url: `/repos/${repo.id}/conventions/skill-draft`,
      payload: { convention_ids: [id(PARAMS.rule), id(NOT_FOUND.rule)] },
    });
    expect(draftRes.statusCode).toBe(200);
    const draft = draftRes.json() as ConventionSkillDraft;
    expect(draft.convention_ids).toEqual([id(PARAMS.rule)]);
    expect(draft.body).toContain(PARAMS.rule);
    expect(draft.body).not.toContain(NOT_FOUND.rule);
    expect(draft.body).not.toContain(MONEY.rule);
    expect(draft.body).toContain('`src/routes/invoices.ts:3`');

    const onlyRejected = await app.inject({
      method: 'POST',
      url: `/repos/${repo.id}/conventions/skill-draft`,
      payload: { convention_ids: [id(NOT_FOUND.rule)] },
    });
    expect(onlyRejected.statusCode).toBe(422);

    const all = (
      await app.inject({ method: 'POST', url: `/repos/${repo.id}/conventions/skill-draft`, payload: {} })
    ).json() as ConventionSkillDraft;
    expect(all.convention_ids.sort()).toEqual([id(PARAMS.rule), id(MONEY.rule)].sort());

    const wrongType = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: { name: `x-${seq}`, description: all.description, type: 'rubric', source: 'extracted', body: all.body },
    });
    expect(wrongType.statusCode).toBe(422);

    const saved = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: { name: all.name, description: all.description, type: 'convention', source: 'extracted', body: all.body },
    });
    expect(saved.statusCode).toBe(201);
    const skill = saved.json();
    expect(skill).toMatchObject({ type: 'convention', source: 'extracted', enabled: false });
    await app.inject({ method: 'PUT', url: `/skills/${skill.id}`, payload: { enabled: true } });

    // the next draft picks a free name
    const next = (
      await app.inject({ method: 'POST', url: `/repos/${repo.id}/conventions/skill-draft`, payload: {} })
    ).json() as ConventionSkillDraft;
    expect(next.name).not.toBe(all.name);
    expect(next.name).toMatch(/^repo-conventions-\d+$/);

    // link it to an agent and run a review: the trace has its own block
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: `Conventions ${seq}`, provider: 'openai', model: 'gpt-4.1', system_prompt: 'x' },
      })
    ).json();
    await app.inject({
      method: 'PUT',
      url: `/agents/${agent.id}/skills`,
      payload: { links: [{ skill_id: skill.id, enabled: true }] },
    });
    await app.close();

    // review with the real (degraded) repo-intel: build an app without the sample stub
    const reviewApp = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({
          diff: 'diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1,1 +1,2 @@\n x\n+y',
        }),
        github: new MockGitHubClient(),
        llm: { openai: llm },
      },
    });
    const db = pg.handle.db;
    const [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo.id,
        number: 1,
        title: 'Rename amount',
        author: 'dev',
        branch: 'feat/rename',
        base: 'main',
        headSha: 'abc123',
        additions: 1,
        deletions: 0,
        filesCount: 1,
        status: 'needs_review',
      })
      .returning();
    await db.insert(t.prFiles).values({ prId: pr!.id, path: 'src/a.ts', additions: 1, deletions: 0, patch: '@@ -1,1 +1,2 @@\n x\n+y' });
    const run = await reviewApp.inject({ method: 'POST', url: `/pulls/${pr!.id}/review`, payload: { agentId: agent.id } });
    expect(run.statusCode).toBe(200);
    const runs = await waitForPrRuns(db, pr!.id, { expected: 1 });
    expect(runs[0]!.status).toBe('done');
    let traceRow: { trace: unknown } | undefined;
    for (let i = 0; i < 200 && !traceRow; i++) {
      [traceRow] = await db.select().from(t.runTraces).where(eq(t.runTraces.runId, runs[0]!.id));
      if (!traceRow) await new Promise((r) => setTimeout(r, 25));
    }
    const blocks = (traceRow!.trace as RunTrace).prompt_assembly.skill_blocks!;
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ name: all.name, source: 'extracted', type: 'convention', version: 1 });
    expect(blocks[0]!.text).toContain('source="extracted"');
    await reviewApp.close();
  });
});
