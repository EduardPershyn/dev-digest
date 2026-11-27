import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { SmartDiffResponse } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildTestApp as buildApp } from './helpers/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockEmbedder, MockGitClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

/** M3 — GET /pulls/:id/smart-diff (specs/M3-smart-diff.md). Reviews/findings are seeded directly. */
d('M3 smart diff route (Testcontainers pg)', () => {
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

  it('groups by role, counts only latest kind:review per agent minus dismissed, 404/4xx, no model calls', async () => {
    const db = pg.handle.db;
    const llm = new MockLLMProvider('openai');
    const app = await buildApp({
      config: config(),
      db,
      overrides: { embedder: new MockEmbedder(), git: new MockGitClient(), llm: { openai: llm } },
    });

    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'smart-diff', fullName: 'acme/smart-diff' })
      .returning();
    const [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo!.id,
        number: 900,
        title: 'Smart diff fixture',
        author: 'dev',
        branch: 'feat/sd',
        base: 'main',
        headSha: 'abc123',
        additions: 0,
        deletions: 0,
        filesCount: 5,
        status: 'needs_review',
      })
      .returning();
    // GitHub order — deliberately not role order.
    for (const [path, additions, deletions, patch] of [
      ['pnpm-lock.yaml', 40, 10, null],
      ['src/a.ts', 3, 1, '@@ -1,2 +1,4 @@\n a\n+b\n+c\n-d\n e'],
      ['docs/x.md', 2, 0, null],
      ['src/a.test.ts', 5, 0, null],
      ['src/index.ts', 1, 0, null],
    ] as const) {
      await db.insert(t.prFiles).values({ prId: pr!.id, path, additions, deletions, patch });
    }

    const get = (id: string) => app.inject({ method: 'GET', url: `/pulls/${id}/smart-diff` });

    // Before any review.
    const before = await get(pr!.id);
    expect(before.statusCode).toBe(200);
    const b = SmartDiffResponse.parse(before.json());
    expect(b.groups.map((g) => g.role)).toEqual(['core', 'tests', 'wiring', 'docs', 'boilerplate']);
    expect(b.groups.flatMap((g) => g.files).every((f) => f.finding_lines.length === 0)).toBe(true);
    expect(b.split_suggestion).toEqual({ too_big: false, total_lines: 62, proposed_splits: [] });

    // Seed reviews: agent A old + new (one new finding dismissed), agent B, and a summary review.
    const agentA = randomUUID();
    const agentB = randomUUID();
    const at = (min: number) => new Date(Date.UTC(2026, 10, 27, 12, min));
    const review = async (agentId: string, min: number, kind: 'review' | 'summary' = 'review') =>
      (
        await db
          .insert(t.reviews)
          .values({ workspaceId, prId: pr!.id, agentId, kind, verdict: 'comment', createdAt: at(min) })
          .returning()
      )[0]!;
    const finding = (reviewId: string, file: string, line: number, extra: object = {}) => ({
      reviewId, severity: 'WARNING', title: `${file}:${line}`, category: 'bug', file,
      startLine: line, endLine: line, rationale: 'r', confidence: 0.9, ...extra,
    });

    const aOld = await review(agentA, 0);
    await db.insert(t.findings).values([finding(aOld.id, 'src/a.ts', 1), finding(aOld.id, 'src/index.ts', 1)]);
    const aNew = await review(agentA, 5);
    await db.insert(t.findings).values([
      finding(aNew.id, 'src/a.ts', 3),
      finding(aNew.id, 'src/a.ts', 2, { dismissedAt: new Date() }),
    ]);
    const bRev = await review(agentB, 3);
    await db.insert(t.findings).values([finding(bRev.id, 'src/a.test.ts', 4), finding(bRev.id, 'src/a.ts', 3)]);
    const summary = await review(agentB, 9, 'summary');
    await db.insert(t.findings).values(finding(summary.id, 'docs/x.md', 1));

    const after = SmartDiffResponse.parse((await get(pr!.id)).json());
    const lines = Object.fromEntries(
      after.groups.flatMap((g) => g.files).map((f) => [f.path, f.finding_lines]),
    );
    expect(lines).toEqual({
      'src/a.ts': [3],
      'src/a.test.ts': [4],
      'src/index.ts': [],
      'docs/x.md': [],
      'pnpm-lock.yaml': [],
    });

    // Unknown PR → 404; non-uuid id → validation error (4xx).
    expect((await get(randomUUID())).statusCode).toBe(404);
    const bad = await get('not-a-uuid');
    expect(bad.statusCode).toBeGreaterThanOrEqual(400);
    expect(bad.statusCode).toBeLessThan(500);

    // AC P2-3: the route never calls a model.
    expect(llm.calls).toHaveLength(0);
    await app.close();
  });
});
