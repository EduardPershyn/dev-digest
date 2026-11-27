import { describe, it, expect } from 'vitest';
import type { LLMProvider, UnifiedDiff } from '@devdigest/shared';
import { MockGitHubClient, MockLLMProvider } from '../src/adapters/mocks.js';
import { parseUnifiedDiff } from '../src/platform/diff-parser.js';
import { ConfigError } from '../src/platform/errors.js';
import type { IntentRecord, PullRecord, RepoRecord } from '../src/modules/_shared/records.js';
import type { IntentOkValues, IntentStore } from '../src/modules/intent/ports.js';
import { IntentService } from '../src/modules/intent/service.js';
import { intentInputHash } from '../src/modules/intent/helpers.js';

const repo: RepoRecord = {
  id: 'r1',
  workspaceId: 'ws',
  owner: 'acme',
  name: 'payments-api',
  fullName: 'acme/payments-api',
  defaultBranch: 'main',
  clonePath: null,
  lastPolledAt: null,
  createdBy: null,
  createdAt: new Date(),
};

const BODY_SECRET = 'BODY-MARKER: adds per-IP rate limiting to every public API endpoint.';
const DOC_SECRET = 'DOC-MARKER: the spec text that must never be logged';

function makePull(over: Partial<PullRecord> = {}): PullRecord {
  return {
    id: 'pr-1',
    workspaceId: 'ws',
    repoId: 'r1',
    number: 482,
    title: 'Add rate limiting',
    author: 'a',
    branch: 'feat/rate-limit',
    base: 'main',
    headSha: 'head1',
    lastReviewedSha: null,
    additions: 1,
    deletions: 0,
    filesCount: 1,
    status: 'open',
    body: BODY_SECRET,
    openedAt: null,
    updatedAt: null,
    ...over,
  };
}

const RAW_DIFF = [
  'diff --git a/src/config.ts b/src/config.ts',
  '--- a/src/config.ts',
  '+++ b/src/config.ts',
  '@@ -10,3 +10,4 @@ export const config = {',
  '   port: 3000,',
  '+  stripeKey: "sk_live_DIFF_SECRET",',
].join('\n');

class FakeStore implements IntentStore {
  rows = new Map<string, IntentRecord>();
  failures: string[] = [];
  constructor(public pull: PullRecord) {}
  async getPullWithRepo(ws: string, prId: string) {
    return ws === 'ws' && prId === this.pull.id ? { pull: this.pull, repo } : undefined;
  }
  async get(prId: string) {
    return this.rows.get(prId);
  }
  async upsertOk(prId: string, v: IntentOkValues) {
    const now = new Date();
    const row: IntentRecord = {
      ...v,
      prId,
      status: 'ok',
      error: null,
      createdAt: this.rows.get(prId)?.createdAt ?? now,
      updatedAt: now,
    };
    this.rows.set(prId, row);
    return row;
  }
  async recordFailure(prId: string, error: string) {
    this.failures.push(error);
    const prev = this.rows.get(prId);
    const now = new Date();
    const row: IntentRecord = prev
      ? { ...prev, status: 'failed', error, updatedAt: now }
      : {
          prId,
          summary: '',
          inScope: [],
          outOfScope: [],
          confidence: 'low',
          sources: [],
          missingContext: [],
          provider: null,
          model: null,
          headSha: null,
          inputHash: null,
          tokensIn: null,
          tokensOut: null,
          costUsd: null,
          status: 'failed',
          error,
          classifiedAt: null,
          createdAt: now,
          updatedAt: now,
        };
    this.rows.set(prId, row);
    return row;
  }
}

const GOOD = { summary: 'Adds rate limiting.', in_scope: ['Rate limiter'], out_of_scope: ['Billing'], confidence: 'high' };

interface Setup {
  pull?: PullRecord;
  llm?: LLMProvider;
  github?: MockGitHubClient | 'missing';
}

function setup(opts: Setup = {}) {
  const pull = opts.pull ?? makePull();
  const store = new FakeStore(pull);
  const llm = opts.llm ?? new MockLLMProvider('openrouter', { structuredBySchema: { IntentClassification: GOOD } });
  const gh = opts.github === 'missing' ? null : (opts.github ?? new MockGitHubClient());
  const logs: { level: 'info' | 'warn'; obj: unknown; msg?: string }[] = [];
  let diffCalls = 0;
  const service = new IntentService({
    store,
    changedFiles: {
      diff: async (): Promise<UnifiedDiff> => {
        diffCalls++;
        return parseUnifiedDiff(RAW_DIFF);
      },
    },
    docs: {
      github: async () => {
        if (!gh) throw new ConfigError('GITHUB_TOKEN is not configured');
        return gh;
      },
    },
    model: { resolve: async () => ({ llm, provider: 'openrouter', model: 'deepseek/deepseek-v4-flash' }) },
    tokens: { count: (t) => Math.ceil(t.length / 4) },
    systemPrompt: async () => 'SYSTEM PROMPT',
    log: {
      info: (obj, msg) => logs.push({ level: 'info', obj, msg }),
      warn: (obj, msg) => logs.push({ level: 'warn', obj, msg }),
    },
  });
  return { service, store, llm, gh, logs, pull, diffCalls: () => diffCalls };
}

function structuredCalls(llm: LLMProvider) {
  return (llm as MockLLMProvider).calls.filter((c) => c.method === 'completeStructured');
}
function userMessage(llm: LLMProvider): string {
  const req = structuredCalls(llm)[0]!.req as { messages: { content: string }[] };
  return req.messages[1]!.content;
}

describe('IntentService.classify', () => {
  it('happy path: ONE structured call, no diff body, requireParameters, persisted', async () => {
    const { service, llm, store } = setup();
    const dto = await service.classify('ws', 'pr-1', { trigger: 'manual' });

    const calls = structuredCalls(llm);
    expect(calls).toHaveLength(1);
    const req = calls[0]!.req as Record<string, unknown>;
    expect(req).toMatchObject({
      model: 'deepseek/deepseek-v4-flash',
      schemaName: 'IntentClassification',
      maxRetries: 0,
      temperature: 0,
      requireParameters: true,
      sessionId: 'intent:acme/payments-api#482',
    });
    const user = userMessage(llm);
    expect(user).toContain('src/config.ts');
    expect(user).toContain('@@ -10,3 +10,4 @@');
    expect(user).not.toContain('sk_live_DIFF_SECRET');
    expect(user).not.toContain('port: 3000');

    expect(dto).toMatchObject({ pr_id: 'pr-1', summary: 'Adds rate limiting.', status: 'ok', stale: false });
    // no linked doc → cap is medium, so the model's "high" is lowered
    expect(dto.confidence).toBe('medium');
    expect(store.rows.get('pr-1')?.inputHash).toBe(intentInputHash(makePull()));
    expect(dto.usage).toEqual({ tokens_in: 100, tokens_out: 50, cost_usd: 0.001 });
  });

  it('empty body still classifies, with confidence low and pr_body empty', async () => {
    const { service, llm } = setup({ pull: makePull({ body: '   ' }) });
    const dto = await service.classify('ws', 'pr-1', { trigger: 'manual' });
    expect(structuredCalls(llm)).toHaveLength(1);
    expect(dto.confidence).toBe('low');
    expect(dto.sources.find((s) => s.kind === 'pr_body')).toMatchObject({ status: 'empty' });
  });

  it('Linear, cross-repo and a 404 issue → 3 missing entries and no text in the prompt', async () => {
    const body =
      'Implements https://linear.app/acme/issue/PAY-12 and other/repo#3. Closes #7. ' +
      'Spec https://github.com/acme/payments-api/blob/main/docs/spec.md';
    const { service, llm } = setup({
      pull: makePull({ body }),
      github: new MockGitHubClient({ issues: { 7: 'not_found' }, files: { 'main:docs/spec.md': DOC_SECRET } }),
    });
    const dto = await service.classify('ws', 'pr-1', { trigger: 'manual' });
    expect(dto.missing_context).toEqual([
      { url: 'https://linear.app/acme/issue/PAY-12', kind: 'external', reason: 'unsupported_host' },
      { url: 'https://github.com/other/repo/issues/3', kind: 'cross_repo', reason: 'cross_repo' },
      { url: 'https://github.com/acme/payments-api/issues/7', kind: 'issue', reason: 'not_found' },
    ]);
    const user = userMessage(llm);
    expect(user).toContain('<untrusted source="file-docs/spec.md">');
    expect(user).toContain(DOC_SECRET);
    expect(user).not.toContain('mock issue');
    expect(user).toContain('https://linear.app/acme/issue/PAY-12 (unsupported_host)');
    expect(dto.sources.map((s) => s.kind)).toContain('file');
    // a referenced doc was not found → medium at most
    expect(dto.confidence).toBe('medium');
  });

  it('no GitHub token → refs become github_unavailable, classification still runs', async () => {
    const { service, llm } = setup({ pull: makePull({ body: `${BODY_SECRET} Closes #12.` }), github: 'missing' });
    const dto = await service.classify('ws', 'pr-1', { trigger: 'manual' });
    expect(structuredCalls(llm)).toHaveLength(1);
    expect(dto.missing_context).toEqual([
      { url: 'https://github.com/acme/payments-api/issues/12', kind: 'issue', reason: 'github_unavailable' },
    ]);
  });

  it('invalid model shape → 502, recordFailure called, previous content kept', async () => {
    const { service, store, pull } = setup();
    await service.classify('ws', 'pr-1', { trigger: 'manual' });
    const before = store.rows.get(pull.id)!;

    const bad = setup({ llm: new MockLLMProvider('openrouter', { structuredBySchema: { IntentClassification: { nope: 1 } } }) });
    bad.store.rows.set(pull.id, before);
    await expect(bad.service.classify('ws', 'pr-1', { trigger: 'manual' })).rejects.toMatchObject({
      statusCode: 502,
      code: 'external_service_error',
    });
    expect(bad.store.failures).toHaveLength(1);
    const after = bad.store.rows.get(pull.id)!;
    expect(after.status).toBe('failed');
    expect(after.summary).toBe(before.summary);
    expect(after.inScope).toEqual(before.inScope);
    expect(bad.logs.some((l) => l.level === 'warn')).toBe(true);
  });

  it('unknown PR → NotFoundError', async () => {
    const { service } = setup();
    await expect(service.classify('ws', 'nope', { trigger: 'manual' })).rejects.toMatchObject({ statusCode: 404 });
    await expect(service.get('other-ws', 'pr-1')).rejects.toMatchObject({ statusCode: 404 });
  });

  it('concurrent calls for one PR share a single model call', async () => {
    const { service, llm } = setup();
    const [a, b] = await Promise.all([
      service.classify('ws', 'pr-1', { trigger: 'manual' }),
      service.classify('ws', 'pr-1', { trigger: 'manual' }),
    ]);
    expect(structuredCalls(llm)).toHaveLength(1);
    expect(a.summary).toBe(b.summary);
  });

  it('the log line has sizes, usage and redacted URLs but no body, doc or diff text', async () => {
    const body = `${BODY_SECRET} Spec https://github.com/acme/payments-api/blob/main/docs/spec.md?token=SECRET_QS see https://linear.app/x?k=QS2`;
    const { service, logs } = setup({
      pull: makePull({ body }),
      github: new MockGitHubClient({ files: { 'main:docs/spec.md': DOC_SECRET } }),
    });
    const dto = await service.classify('ws', 'pr-1', { trigger: 'manual' });
    const info = logs.filter((l) => l.level === 'info');
    expect(info).toHaveLength(1);
    const obj = info[0]!.obj as Record<string, unknown>;

    // AC-10 — per-source sizes: exactly {kind, ref, status, chars, truncated}, no doc title or text.
    const sources = obj.sources as Record<string, unknown>[];
    expect(Array.isArray(sources)).toBe(true);
    expect(sources.length).toBeGreaterThan(0);
    for (const s of sources) {
      expect(Object.keys(s).sort()).toEqual(['chars', 'kind', 'ref', 'status', 'truncated']);
      expect(typeof s.kind).toBe('string');
      expect(typeof s.ref).toBe('string');
      expect(typeof s.status).toBe('string');
      expect(typeof s.chars).toBe('number');
      expect(typeof s.truncated).toBe('boolean');
    }
    expect(sources).toContainEqual({
      kind: 'file',
      ref: 'docs/spec.md',
      status: 'used',
      chars: DOC_SECRET.length,
      truncated: false,
    });
    expect(sources).toContainEqual(expect.objectContaining({ kind: 'pr_body', ref: 'pr_body', status: 'used' }));
    // the logged confidence is the capped one that was persisted
    expect(obj.confidence).toBe(dto.confidence);
    expect(['low', 'medium', 'high']).toContain(obj.confidence);
    expect(typeof obj.duration_ms).toBe('number');
    expect(obj.duration_ms as number).toBeGreaterThanOrEqual(0);
    for (const c of obj.components as Record<string, unknown>[]) {
      expect(typeof c.chars).toBe('number');
      expect(typeof c.estimated_tokens).toBe('number');
      expect(typeof c.truncated).toBe('boolean');
    }
    expect(obj).toMatchObject({ prId: 'pr-1', trigger: 'manual', provider: 'openrouter', model: 'deepseek/deepseek-v4-flash' });
    expect(obj.usage).toEqual({ tokens_in: 100, tokens_out: 50, cost_usd: 0.001 });
    expect(obj.estimated_tokens_total).toBeGreaterThan(0);
    expect(Array.isArray(obj.components)).toBe(true);
    expect((obj.components as { name: string }[]).map((c) => c.name)).toContain('file-docs/spec.md');
    expect(obj.missing).toEqual([{ kind: 'external', url: 'https://linear.app/x', reason: 'unsupported_host' }]);
    const text = JSON.stringify(logs);
    for (const leak of ['BODY-MARKER', 'DOC-MARKER', 'sk_live_DIFF_SECRET', '@@ -10', 'SECRET_QS', 'QS2', 'SYSTEM PROMPT']) {
      expect(text).not.toContain(leak);
    }
  });
});

describe('IntentService.classify — gap coverage', () => {
  it('the failure log line has no body, doc or diff text', async () => {
    const llm = new MockLLMProvider('openrouter');
    llm.completeStructured = async () => {
      throw new Error('upstream 503');
    };
    const body = `${BODY_SECRET} Spec https://github.com/acme/payments-api/blob/main/docs/spec.md?token=SECRET_QS`;
    const { service, logs } = setup({
      llm,
      pull: makePull({ body }),
      github: new MockGitHubClient({ files: { 'main:docs/spec.md': DOC_SECRET } }),
    });
    await expect(service.classify('ws', 'pr-1', { trigger: 'manual' })).rejects.toMatchObject({ statusCode: 502 });
    const warn = logs.filter((l) => l.level === 'warn');
    expect(warn).toHaveLength(1);
    expect(warn[0]!.obj).toMatchObject({ prId: 'pr-1', trigger: 'manual', model: 'deepseek/deepseek-v4-flash' });
    const text = JSON.stringify(logs);
    for (const leak of ['BODY-MARKER', 'DOC-MARKER', 'sk_live_DIFF_SECRET', 'SECRET_QS', 'SYSTEM PROMPT']) {
      expect(text).not.toContain(leak);
    }
  });

  it('a blob link on the PR branch is read at the head sha, not the moving branch', async () => {
    const gh = new MockGitHubClient({ files: { 'head1:docs/plan.md': DOC_SECRET } });
    const { service, llm } = setup({
      pull: makePull({ body: `${BODY_SECRET} https://github.com/acme/payments-api/blob/feat/rate-limit/docs/plan.md` }),
      github: gh,
    });
    const dto = await service.classify('ws', 'pr-1', { trigger: 'manual' });
    expect(gh.fileReads).toEqual([{ path: 'docs/plan.md', ref: 'head1' }]);
    expect(userMessage(llm)).toContain(DOC_SECRET);
    expect(dto.confidence).toBe('high');
  });

  it('a forbidden doc and a forbidden issue become missing entries with no text in the prompt', async () => {
    const gh = new MockGitHubClient({ files: { 'main:docs/private.md': 'forbidden' }, issues: { 9: 'forbidden' } });
    const { service, llm } = setup({
      pull: makePull({ body: `${BODY_SECRET} Closes #9. https://github.com/acme/payments-api/blob/main/docs/private.md` }),
      github: gh,
    });
    const dto = await service.classify('ws', 'pr-1', { trigger: 'manual' });
    expect(dto.missing_context).toEqual([
      { url: 'https://github.com/acme/payments-api/issues/9', kind: 'issue', reason: 'forbidden' },
      { url: 'https://github.com/acme/payments-api/blob/main/docs/private.md', kind: 'file', reason: 'forbidden' },
    ]);
    expect(userMessage(llm)).not.toContain('<untrusted source="file-docs/private.md">');
    expect(userMessage(llm)).not.toContain('<untrusted source="issue-9">');
    expect(dto.confidence).toBe('medium');
  });
});

describe('IntentService.forReview', () => {
  it('reuses a fresh record without calling the model', async () => {
    const { service, llm, pull } = setup();
    await service.classify('ws', 'pr-1', { trigger: 'manual' });
    const res = await service.forReview('ws', pull, repo, parseUnifiedDiff(RAW_DIFF));
    expect(res.status).toBe('reused');
    expect(res.intent?.block.summary).toBe('Adds rate limiting.');
    expect(structuredCalls(llm)).toHaveLength(1);
  });

  it('reclassifies when the head moved, using the pre-loaded diff', async () => {
    const { service, llm, store, pull, diffCalls } = setup();
    await service.classify('ws', 'pr-1', { trigger: 'manual' });
    const moved = { ...pull, headSha: 'head2' };
    store.pull = moved;
    const res = await service.forReview('ws', moved, repo, parseUnifiedDiff(RAW_DIFF));
    expect(res.status).toBe('classified');
    expect(structuredCalls(llm)).toHaveLength(2);
    expect(diffCalls()).toBe(1); // only the manual classify loaded a diff
    expect(store.rows.get('pr-1')?.headSha).toBe('head2');
  });

  it('returns failed (never throws) when classification fails', async () => {
    const llm = new MockLLMProvider('openrouter');
    llm.completeStructured = async () => {
      throw new Error('upstream 500');
    };
    const { service, pull, store } = setup({ llm });
    const res = await service.forReview('ws', pull, repo, parseUnifiedDiff(RAW_DIFF));
    expect(res).toMatchObject({ status: 'failed', intent: null });
    expect(res.reason).toContain('upstream 500');
    expect(store.rows.get('pr-1')?.status).toBe('failed');
  });
});
