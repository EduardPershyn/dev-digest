import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import type { Review, RunTrace } from '@devdigest/shared';
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
  console.warn('[skills] Docker not available — skipping integration tests.');
}

/**
 * M2 skills (specs/M2-skills.md): library CRUD + versioning, strict text-only
 * bodies, the stateless import preview, per-agent links (order / enabled /
 * version bump / workspace check), and the review prompt carrying ONLY skills
 * that are enabled on the agent AND globally, as separate blocks, in order.
 */

const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  retries: 3,
   redisUrl: x,`;

const EMPTY_REVIEW: Review = { verdict: 'approve', summary: 'ok', score: 100, findings: [] };

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

d('M2 skills (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function makeApp(llm = new MockLLMProvider('openai', { structured: EMPTY_REVIEW })) {
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: DIFF }),
        github: new MockGitHubClient(),
        llm: { openai: llm },
      },
    });
  }

  let seq = 0;
  const skillBody = (over: Record<string, unknown> = {}) => ({
    name: `skill-${++seq}`,
    description: 'Use when testing. Flag things.',
    type: 'rubric',
    body: `# Skill ${seq}\n- rule ${seq}`,
    ...over,
  });

  it('seeds the two M2 agents with their skills', async () => {
    const app = await makeApp();
    const agents = (await app.inject({ method: 'GET', url: '/agents' })).json() as Array<{
      id: string;
      name: string;
      skill_count: number;
    }>;
    for (const [name, count] of [
      ['Test Quality Reviewer', 2],
      ['API Contract Reviewer', 3],
    ] as const) {
      const a = agents.find((x) => x.name === name);
      expect(a, name).toBeDefined();
      expect(a!.skill_count).toBe(count);
    }
    await app.close();
  });

  it('CRUD: create → get → update bumps version only on text change → delete', async () => {
    const app = await makeApp();
    const created = await app.inject({ method: 'POST', url: '/skills', payload: skillBody() });
    expect(created.statusCode).toBe(201);
    const skill = created.json();
    expect(skill).toMatchObject({ version: 1, source: 'manual', enabled: true, agent_count: 0 });

    const toggled = (
      await app.inject({ method: 'PUT', url: `/skills/${skill.id}`, payload: { enabled: false } })
    ).json();
    expect(toggled).toMatchObject({ enabled: false, version: 1 });

    const edited = (
      await app.inject({
        method: 'PUT',
        url: `/skills/${skill.id}`,
        payload: { body: '# Changed\n- new rule', description: 'Use when changed.' },
      })
    ).json();
    expect(edited.version).toBe(2);

    const versions = (
      await app.inject({ method: 'GET', url: `/skills/${skill.id}/versions` })
    ).json();
    expect(versions.map((v: { version: number }) => v.version)).toEqual([2, 1]);
    expect(versions[0]).toMatchObject({ body: '# Changed\n- new rule', description: 'Use when changed.' });
    expect(versions[1].body).toBe(skill.body);

    const listed = (await app.inject({ method: 'GET', url: '/skills' })).json();
    expect(listed.some((s: { id: string }) => s.id === skill.id)).toBe(true);

    expect((await app.inject({ method: 'DELETE', url: `/skills/${skill.id}` })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: `/skills/${skill.id}` })).statusCode).toBe(404);
    await app.close();
  });

  it('rejects duplicates (409), bad slugs and any non-text field such as tools (strict body)', async () => {
    const app = await makeApp();
    const body = skillBody();
    expect((await app.inject({ method: 'POST', url: '/skills', payload: body })).statusCode).toBe(201);
    const dup = await app.inject({ method: 'POST', url: '/skills', payload: body });
    expect(dup.statusCode).toBe(409);

    const badName = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: skillBody({ name: 'Not A Slug' }),
    });
    expect(badName.statusCode).toBeGreaterThanOrEqual(400);
    expect(badName.statusCode).toBeLessThan(500);

    for (const extra of [{ tools: ['Bash'] }, { 'allowed-tools': 'Bash' }, { script: 'rm -rf /' }]) {
      const res = await app.inject({ method: 'POST', url: '/skills', payload: skillBody(extra) });
      expect(res.statusCode, JSON.stringify(extra)).toBeGreaterThanOrEqual(400);
      expect(res.statusCode).toBeLessThan(500);
    }
    await app.close();
  });

  it('an imported skill is saved disabled unless enabled explicitly', async () => {
    const app = await makeApp();
    const imported = (
      await app.inject({
        method: 'POST',
        url: '/skills',
        payload: skillBody({ source: 'imported_file' }),
      })
    ).json();
    expect(imported).toMatchObject({ source: 'imported_file', enabled: false });
    await app.close();
  });

  it('import preview parses a .md upload and stores nothing', async () => {
    const app = await makeApp();
    const before = (await pg.handle.db.select().from(t.skills)).length;
    const md = '---\nname: Mocking Rules\ndescription: Use when tests mock.\nallowed-tools: Bash\n---\n# Mocking\n- no mocks';
    const res = await app.inject({
      method: 'POST',
      url: '/skills/import/preview',
      payload: { filename: 'mocking.md', content_base64: Buffer.from(md).toString('base64') },
    });
    expect(res.statusCode).toBe(200);
    const preview = res.json();
    expect(preview.draft).toMatchObject({ name: 'mocking-rules', description: 'Use when tests mock.' });
    expect(preview.dropped_frontmatter).toEqual(['allowed-tools']);
    expect((await pg.handle.db.select().from(t.skills)).length).toBe(before);

    const bad = await app.inject({
      method: 'POST',
      url: '/skills/import/preview',
      payload: { filename: 'evil.sh', content_base64: Buffer.from('rm -rf /').toString('base64') },
    });
    expect(bad.statusCode).toBe(422);
    await app.close();
  });

  it('PUT /agents/:id/skills sets order + per-agent enabled, bumps the agent version, checks ownership', async () => {
    const app = await makeApp();
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: `Linker ${++seq}`, provider: 'openai', model: 'gpt-4.1', system_prompt: 'x' },
      })
    ).json();
    const a = (await app.inject({ method: 'POST', url: '/skills', payload: skillBody() })).json();
    const b = (await app.inject({ method: 'POST', url: '/skills', payload: skillBody() })).json();

    const res = await app.inject({
      method: 'PUT',
      url: `/agents/${agent.id}/skills`,
      payload: { links: [{ skill_id: b.id, enabled: true }, { skill_id: a.id, enabled: false }] },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([
      { agent_id: agent.id, skill_id: b.id, order: 0, enabled: true },
      { agent_id: agent.id, skill_id: a.id, order: 1, enabled: false },
    ]);

    const after = (await app.inject({ method: 'GET', url: `/agents/${agent.id}` })).json();
    expect(after.version).toBe(2);
    expect(after.skill_count).toBe(1); // only the enabled link counts

    const v2 = (await app.inject({ method: 'GET', url: `/agents/${agent.id}/versions/2` })).json();
    expect(v2.config.skills).toEqual([b.id]);
    expect(v2.config.skill_links).toEqual([
      { id: b.id, enabled: true, version: 1 },
      { id: a.id, enabled: false, version: 1 },
    ]);

    const foreign = await app.inject({
      method: 'PUT',
      url: `/agents/${agent.id}/skills`,
      payload: { links: [{ skill_id: '00000000-0000-4000-8000-000000000000', enabled: true }] },
    });
    expect(foreign.statusCode).toBe(422);

    const dupe = await app.inject({
      method: 'PUT',
      url: `/agents/${agent.id}/skills`,
      payload: { links: [{ skill_id: a.id, enabled: true }, { skill_id: a.id, enabled: true }] },
    });
    expect(dupe.statusCode).toBe(422);

    const skillDetail = (await app.inject({ method: 'GET', url: `/skills/${a.id}` })).json();
    expect(skillDetail.agents).toEqual([{ id: agent.id, name: agent.name }]);
    await app.close();
  });

  it('a review prompt carries only link-enabled AND skill-enabled skills, as separate blocks, in order', async () => {
    const llm = new MockLLMProvider('openai', { structured: EMPTY_REVIEW });
    const app = await makeApp(llm);
    const db = pg.handle.db;

    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: `Prompted ${++seq}`, provider: 'openai', model: 'gpt-4.1', system_prompt: 'x' },
      })
    ).json();
    const mk = async (name: string) =>
      (await app.inject({ method: 'POST', url: '/skills', payload: skillBody({ name }) })).json();
    const first = await mk(`first-${seq}`);
    const linkOff = await mk(`link-off-${seq}`);
    const globalOff = await mk(`global-off-${seq}`);
    const second = await mk(`second-${seq}`);
    await app.inject({ method: 'PUT', url: `/skills/${globalOff.id}`, payload: { enabled: false } });
    await app.inject({
      method: 'PUT',
      url: `/agents/${agent.id}/skills`,
      payload: {
        links: [
          { skill_id: first.id, enabled: true },
          { skill_id: linkOff.id, enabled: false },
          { skill_id: globalOff.id, enabled: true },
          { skill_id: second.id, enabled: true },
        ],
      },
    });

    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: `skills-${seq}`, fullName: `acme/skills-${seq}` })
      .returning();
    const [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo!.id,
        number: 7,
        title: 'Add retries',
        author: 'dev',
        branch: 'feat/retries',
        base: 'main',
        headSha: 'abc123',
        additions: 1,
        deletions: 0,
        filesCount: 1,
        status: 'needs_review',
      })
      .returning();
    await db.insert(t.prFiles).values({
      prId: pr!.id,
      path: 'src/config.ts',
      additions: 1,
      deletions: 0,
      patch: '@@ -10,3 +10,4 @@\n   port: 3000,\n+  retries: 3,\n   redisUrl: x,',
    });

    const res = await app.inject({
      method: 'POST',
      url: `/pulls/${pr!.id}/review`,
      payload: { agentId: agent.id },
    });
    expect(res.statusCode).toBe(200);
    const runs = await waitForPrRuns(db, pr!.id, { expected: 1 });
    expect(runs[0]!.status).toBe('done');

    // What the model actually received
    const call = llm.calls.find((c) => c.method === 'completeStructured');
    const user = (call!.req as { messages: { role: string; content: string }[] }).messages[1]!
      .content;
    expect(user).toContain(`<skill name="${first.name}"`);
    expect(user).toContain(`<skill name="${second.name}"`);
    expect(user.indexOf(first.name)).toBeLessThan(user.indexOf(second.name));
    expect(user).not.toContain(linkOff.name);
    expect(user).not.toContain(globalOff.name);

    // What the trace records: one block per skill, with token counts
    // (the run is marked done just before its trace is written — poll briefly)
    let traceRow: { trace: unknown } | undefined;
    for (let i = 0; i < 200 && !traceRow; i++) {
      [traceRow] = await db.select().from(t.runTraces).where(eq(t.runTraces.runId, runs[0]!.id));
      if (!traceRow) await new Promise((r) => setTimeout(r, 25));
    }
    const trace = traceRow!.trace as RunTrace;
    const blocks = trace.prompt_assembly.skill_blocks!;
    expect(blocks.map((b) => b.name)).toEqual([first.name, second.name]);
    for (const b of blocks) {
      expect(b.tokens).toBeGreaterThan(0);
      expect(user).toContain(b.text);
    }
    expect(trace.log.some((l) => l.msg.includes('skills: 2 attached'))).toBe(true);
    await app.close();
  });
});
