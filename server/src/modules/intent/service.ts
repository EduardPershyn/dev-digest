import type {
  IntentMissingContext,
  PrIntentRecord,
  StructuredResult,
  UnifiedDiff,
} from '@devdigest/shared';
import { IntentClassification } from '@devdigest/shared';
import { AppError, ConfigError, ExternalServiceError, NotFoundError } from '../../platform/errors.js';
import type { IntentRecord, PullRecord, RepoRecord } from '../_shared/records.js';
import {
  INTENT_MAX_RETRIES,
  INTENT_SCHEMA_NAME,
  INTENT_TEMPERATURE,
  INTENT_TIMEOUT_MS,
} from './constants.js';
import {
  buildClassifierMessages,
  capConfidence,
  confidenceCap,
  errorMessage,
  hunkHeadersFromRaw,
  intentInputHash,
  isReusable,
  sourcesUsed,
  toIntentBlockInput,
  toPrIntentDto,
} from './helpers.js';
import type {
  ChangedFilesSource,
  IntentDocs,
  IntentLogger,
  IntentModel,
  IntentStore,
  TokenCounter,
} from './ports.js';
import { extractReferences, splitBlobRef } from './references.js';
import type { ClassifyTrigger, FetchedDoc, IntentForReview, IntentRef } from './types.js';

/**
 * M3 — Intent layer use cases (specs/M3-intent-layer.md):
 *  - `get`       read the stored intent (+ computed `stale`), no GitHub / LLM.
 *  - `classify`  ONE cheap structured call over title, body, same-repo linked
 *                docs and changed paths + hunk headers; persisted per PR.
 *  - `forReview` the review pre-work: reuse a fresh intent, else reclassify;
 *                NEVER throws (a review proceeds without intent on failure).
 * Concurrent classifications of one PR share a single in-flight promise.
 */

export interface IntentServiceDeps {
  store: IntentStore;
  changedFiles: ChangedFilesSource;
  docs: IntentDocs;
  model: IntentModel;
  tokens: TokenCounter;
  /** The classifier system prompt (src/prompts/intent.system.md). */
  systemPrompt: () => Promise<string>;
  /** Fallback logger when a call passes none (the container has no request logger). */
  log?: IntentLogger;
}

export interface ClassifyOptions {
  trigger: ClassifyTrigger;
  /** Pre-loaded diff (the review pre-work already has it). */
  diff?: UnifiedDiff;
  /** Request / run logger for the classification log line. */
  log?: IntentLogger;
}

const NOOP_LOGGER: IntentLogger = { info: () => undefined, warn: () => undefined };

type GitHubDocs = Awaited<ReturnType<IntentDocs['github']>>;

function httpStatus(err: unknown): number | undefined {
  const status = (err as { status?: unknown })?.status;
  return typeof status === 'number' ? status : undefined;
}

export class IntentService {
  /** Per-PR in-flight classification (single local process). */
  private readonly inflight = new Map<string, Promise<IntentRecord>>();

  constructor(private readonly deps: IntentServiceDeps) {}

  async get(workspaceId: string, prId: string): Promise<PrIntentRecord | null> {
    const { pull } = await this.requirePull(workspaceId, prId);
    const record = await this.deps.store.get(prId);
    return record ? toPrIntentDto(record, pull) : null;
  }

  async classify(workspaceId: string, prId: string, opts: ClassifyOptions): Promise<PrIntentRecord> {
    const { pull, repo } = await this.requirePull(workspaceId, prId);
    const record = await this.classifyOnce(workspaceId, pull, repo, opts);
    return toPrIntentDto(record, pull);
  }

  /** Review pre-work. Never throws: failures come back as `status: 'failed'`. */
  async forReview(
    workspaceId: string,
    pull: PullRecord,
    repo: RepoRecord,
    diff: UnifiedDiff,
    log?: IntentLogger,
  ): Promise<IntentForReview> {
    try {
      const existing = await this.deps.store.get(pull.id);
      if (isReusable(existing, pull)) return this.reviewResult('reused', existing);
      const record = await this.classifyOnce(workspaceId, pull, repo, {
        trigger: 'review',
        diff,
        ...(log ? { log } : {}),
      });
      return this.reviewResult('classified', record);
    } catch (err) {
      return { status: 'failed', reason: errorMessage(err), intent: null };
    }
  }

  private reviewResult(status: 'reused' | 'classified', record: IntentRecord): IntentForReview {
    return {
      status,
      reason: null,
      intent: {
        block: toIntentBlockInput(record),
        confidence: record.confidence,
        provider: record.provider,
        model: record.model,
        sourcesUsed: sourcesUsed(record),
        missing: record.missingContext.length,
        costUsd: status === 'classified' ? record.costUsd : null,
        tokensIn: status === 'classified' ? record.tokensIn : null,
      },
    };
  }

  private classifyOnce(
    workspaceId: string,
    pull: PullRecord,
    repo: RepoRecord,
    opts: ClassifyOptions,
  ): Promise<IntentRecord> {
    const running = this.inflight.get(pull.id);
    if (running) return running;
    const p = this.runClassification(workspaceId, pull, repo, opts).finally(() => {
      this.inflight.delete(pull.id);
    });
    this.inflight.set(pull.id, p);
    return p;
  }

  private async runClassification(
    workspaceId: string,
    pull: PullRecord,
    repo: RepoRecord,
    opts: ClassifyOptions,
  ): Promise<IntentRecord> {
    const started = Date.now();
    const log = opts.log ?? this.deps.log ?? NOOP_LOGGER;
    let modelName: string | null = null;
    try {
      const { llm, provider, model } = await this.deps.model.resolve(workspaceId);
      modelName = model;

      const diff = opts.diff ?? (await this.deps.changedFiles.diff(pull, repo));
      const changedFiles = hunkHeadersFromRaw(diff.raw);
      const extracted = extractReferences(pull.body ?? '', repo, pull.number);
      const { docs, missing } = await this.fetchRefs(pull, repo, extracted.refs);

      const system = await this.deps.systemPrompt();
      const built = buildClassifierMessages({
        system,
        repoFullName: repo.fullName,
        prNumber: pull.number,
        title: pull.title,
        body: pull.body,
        docs,
        changedFiles,
        missing: [...extracted.missing, ...missing],
      });

      let result: StructuredResult<IntentClassification>;
      try {
        result = await llm.completeStructured({
          model,
          schema: IntentClassification,
          schemaName: INTENT_SCHEMA_NAME,
          messages: built.messages,
          maxRetries: INTENT_MAX_RETRIES,
          temperature: INTENT_TEMPERATURE,
          timeoutMs: INTENT_TIMEOUT_MS,
          requireParameters: true,
          sessionId: `intent:${repo.fullName}#${pull.number}`,
        });
      } catch (err) {
        if (err instanceof AppError) throw err;
        throw new ExternalServiceError(`Intent model call failed: ${errorMessage(err)}`);
      }
      const parsed = IntentClassification.safeParse(result.data);
      if (!parsed.success) {
        throw new ExternalServiceError('The intent model returned an invalid response', {
          issues: parsed.error.issues.slice(0, 5),
        });
      }

      const confidence = capConfidence(
        parsed.data.confidence,
        confidenceCap({ body: pull.body, sources: built.sources, missing: built.missing }),
      );
      const inputHash = intentInputHash(pull);
      const record = await this.deps.store.upsertOk(pull.id, {
        summary: parsed.data.summary,
        inScope: parsed.data.in_scope,
        outOfScope: parsed.data.out_of_scope,
        confidence,
        sources: built.sources,
        missingContext: built.missing,
        provider,
        model: result.model,
        headSha: pull.headSha,
        inputHash,
        tokensIn: result.tokensIn,
        tokensOut: result.tokensOut,
        costUsd: result.costUsd,
        classifiedAt: new Date(),
      });

      // ONE structured line; sizes and counts only, never body / doc / diff text.
      const components = built.components.map((c) => ({
        name: c.name,
        chars: c.chars,
        estimated_tokens: this.deps.tokens.count(c.text),
        truncated: c.truncated,
      }));
      log.info(
        {
          prId: pull.id,
          trigger: opts.trigger,
          provider,
          model: result.model,
          components,
          estimated_tokens_total: components.reduce((n, c) => n + c.estimated_tokens, 0),
          token_estimate: 'tiktoken cl100k_base (estimated)',
          usage: { tokens_in: result.tokensIn, tokens_out: result.tokensOut, cost_usd: result.costUsd },
          sources: built.sources.map((s) => ({
            kind: s.kind,
            ref: s.ref,
            status: s.status,
            chars: s.chars,
            truncated: s.truncated,
          })),
          missing: built.missing.map((m) => ({ kind: m.kind, url: m.url, reason: m.reason })),
          changed_files: changedFiles.length,
          hunk_headers: changedFiles.reduce((n, f) => n + f.headers.length, 0),
          confidence,
          duration_ms: Date.now() - started,
          input_hash: inputHash,
        },
        `intent: classified PR #${pull.number} with ${result.model} (${confidence})`,
      );
      return record;
    } catch (err) {
      const message = errorMessage(err);
      try {
        await this.deps.store.recordFailure(pull.id, message);
      } catch {
        /* the original error matters more than the bookkeeping */
      }
      log.warn(
        {
          prId: pull.id,
          trigger: opts.trigger,
          model: modelName,
          code: err instanceof AppError ? err.code : 'internal_error',
          status: err instanceof AppError ? err.statusCode : 500,
          message,
          duration_ms: Date.now() - started,
        },
        `intent: classification failed for PR #${pull.number}`,
      );
      if (err instanceof AppError) throw err;
      throw new ExternalServiceError(`Intent classification failed: ${message}`);
    }
  }

  /** Sequential same-repo reads; every failure becomes a missing entry, never text. */
  private async fetchRefs(
    pull: PullRecord,
    repo: RepoRecord,
    refs: IntentRef[],
  ): Promise<{ docs: FetchedDoc[]; missing: IntentMissingContext[] }> {
    const docs: FetchedDoc[] = [];
    const missing: IntentMissingContext[] = [];
    if (refs.length === 0) return { docs, missing };

    let gh: GitHubDocs;
    try {
      gh = await this.deps.docs.github();
    } catch (err) {
      if (!(err instanceof ConfigError)) throw err;
      for (const r of refs) missing.push({ url: r.url, kind: r.kind, reason: 'github_unavailable' });
      return { docs, missing };
    }

    const repoRef = { owner: repo.owner, name: repo.name };
    const knownRefs = [pull.branch, pull.base, pull.headSha, repo.defaultBranch];
    for (const ref of refs) {
      if (ref.kind === 'file') {
        const split = splitBlobRef(ref.segments, knownRefs, pull);
        if (!split) {
          missing.push({ url: ref.url, kind: 'file', reason: 'not_found' });
          continue;
        }
        try {
          const res = await gh.getFileContent(repoRef, split.path, split.ref);
          if (res.status === 'ok') {
            docs.push({ kind: 'file', ref: split.path, url: ref.url, text: res.text });
          } else {
            missing.push({ url: ref.url, kind: 'file', reason: res.status });
          }
        } catch {
          missing.push({ url: ref.url, kind: 'file', reason: 'github_unavailable' });
        }
        continue;
      }
      try {
        const issue = await gh.getIssue(repoRef, ref.number);
        docs.push({
          kind: ref.kind,
          ref: `#${ref.number}`,
          url: ref.url,
          title: issue.title,
          text: issue.body ?? '',
        });
      } catch (err) {
        const status = httpStatus(err);
        const reason = status === 404 || status === 410 ? 'not_found' : status === 403 ? 'forbidden' : 'github_unavailable';
        missing.push({ url: ref.url, kind: ref.kind, reason });
      }
    }
    return { docs, missing };
  }

  private async requirePull(
    workspaceId: string,
    prId: string,
  ): Promise<{ pull: PullRecord; repo: RepoRecord }> {
    const found = await this.deps.store.getPullWithRepo(workspaceId, prId);
    if (!found) throw new NotFoundError('Pull request not found');
    return found;
  }
}
