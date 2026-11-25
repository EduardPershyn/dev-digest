import type {
  ConventionCandidate,
  ConventionExtractResult,
  ConventionList,
  ConventionPatch,
  ConventionSkillDraft,
  ConventionSkillDraftRequest,
} from '@devdigest/shared';
import { ConventionExtraction } from '@devdigest/shared';
import {
  ConflictError,
  ExternalServiceError,
  NotFoundError,
  ValidationError,
} from '../../platform/errors.js';
import type { RepoRecord } from '../_shared/records.js';
import {
  EXTRACTION_SCHEMA_NAME,
  EXTRACTION_TEMPERATURE,
  EXTRACTION_TIMEOUT_MS,
  SAMPLE_COUNT,
} from './constants.js';
import { dropDuplicates } from './dedupe.js';
import { validateCandidates } from './evidence.js';
import { toConventionDto, toConventionList } from './helpers.js';
import type {
  ConventionModel,
  ConventionsLogger,
  ConventionStore,
  RepoCheckout,
  SampleSource,
  SkillNameSource,
} from './ports.js';
import {
  buildUserMessage,
  configScanDirs,
  pickConfigPaths,
  selectFilesForPrompt,
  type DirEntry,
  type SourceFile,
} from './sampling.js';
import { buildConventionSkillDraft } from './skill-draft.js';

/**
 * M2 — Conventions Extractor use cases (specs/M2-conventions.md):
 * extract (ONE model call, evidence validated in code), list, curate
 * (accept / reject / edit rule) and build a skill draft from accepted rows.
 */

export interface ConventionsServiceDeps {
  store: ConventionStore;
  samples: SampleSource;
  checkout: RepoCheckout;
  model: ConventionModel;
  skillNames: SkillNameSource;
  /** The extraction system prompt (src/prompts/conventions.system.md). */
  systemPrompt: () => Promise<string>;
  log: ConventionsLogger;
}

export class ConventionsService {
  /** In-memory per-repo lock: one extraction at a time (single local process). */
  private readonly running = new Set<string>();

  constructor(private readonly deps: ConventionsServiceDeps) {}

  async list(workspaceId: string, repoId: string): Promise<ConventionList> {
    const repo = await this.requireRepo(workspaceId, repoId);
    return toConventionList(await this.deps.store.listByRepo(workspaceId, repoId), repo);
  }

  async update(
    workspaceId: string,
    repoId: string,
    id: string,
    patch: ConventionPatch,
  ): Promise<ConventionCandidate> {
    const repo = await this.requireRepo(workspaceId, repoId);
    const row = await this.deps.store.update(workspaceId, repoId, id, {
      status: patch.status,
      rule: patch.rule,
    });
    if (!row) throw new NotFoundError('Convention not found');
    return toConventionDto(row, repo);
  }

  /** Stateless: merges ACCEPTED rows only; other ids in the request are ignored. */
  async skillDraft(
    workspaceId: string,
    repoId: string,
    req: ConventionSkillDraftRequest,
  ): Promise<ConventionSkillDraft> {
    const repo = await this.requireRepo(workspaceId, repoId);
    const rows = await this.deps.store.listByRepo(workspaceId, repoId);
    let accepted = rows.filter((r) => r.status === 'accepted');
    if (req.convention_ids) {
      const wanted = new Set(req.convention_ids);
      accepted = accepted.filter((r) => wanted.has(r.id));
    }
    if (accepted.length === 0) {
      throw new ValidationError('Select at least one accepted convention');
    }
    const taken = new Set((await this.deps.skillNames.list(workspaceId)).map((s) => s.name));
    return buildConventionSkillDraft({
      repoFullName: repo.fullName,
      accepted,
      takenNames: taken,
    });
  }

  async extract(workspaceId: string, repoId: string): Promise<ConventionExtractResult> {
    const repo = await this.requireRepo(workspaceId, repoId);
    if (!repo.clonePath) throw new ConflictError('Repository is not cloned yet');
    if (this.running.has(repo.id)) {
      throw new ConflictError('Extraction is already running for this repository');
    }
    this.running.add(repo.id);
    try {
      return await this.runExtraction(workspaceId, repo, repo.clonePath);
    } finally {
      this.running.delete(repo.id);
    }
  }

  private async runExtraction(
    workspaceId: string,
    repo: RepoRecord,
    clonePath: string,
  ): Promise<ConventionExtractResult> {
    const samples = await this.deps.samples.getConventionSamples(repo.id, SAMPLE_COUNT);
    if (samples.length === 0) {
      throw new ConflictError('Repository is not indexed yet. Wait for indexing to finish.');
    }
    const { llm, model } = await this.deps.model.resolve(workspaceId);

    const configPaths = await this.findConfigPaths(clonePath);
    const paths = [...configPaths, ...samples.filter((p) => !configPaths.includes(p))];
    const files = await this.readFiles(clonePath, paths);
    const sent = selectFilesForPrompt(files);
    if (sent.length === 0) {
      throw new ConflictError('None of the sampled files could be read from the clone');
    }
    const filesByPath = new Map(sent.map((f) => [f.path, f.text]));

    const existing = await this.deps.store.listByRepo(workspaceId, repo.id);
    const decided = existing.filter((r) => r.status !== 'pending');
    const [system, sha] = await Promise.all([
      this.deps.systemPrompt(),
      this.deps.checkout.head(repo),
    ]);

    // ONE call: no repair re-prompts (adapters default to 2). Invalid output fails the run.
    let result;
    try {
      result = await llm.completeStructured({
        model,
        schema: ConventionExtraction,
        schemaName: EXTRACTION_SCHEMA_NAME,
        messages: [
          { role: 'system', content: system },
          {
            role: 'user',
            content: buildUserMessage(
              sent,
              decided.map((r) => r.rule),
            ),
          },
        ],
        maxRetries: 0,
        temperature: EXTRACTION_TEMPERATURE,
        timeoutMs: EXTRACTION_TIMEOUT_MS,
      });
    } catch (err) {
      throw new ExternalServiceError(`Conventions model call failed: ${(err as Error).message}`);
    }
    const parsed = ConventionExtraction.safeParse(result.data);
    if (!parsed.success) {
      throw new ExternalServiceError('The conventions model returned an invalid response', {
        issues: parsed.error.issues.slice(0, 5),
      });
    }

    const proposed = parsed.data.conventions;
    const { valid, rejected } = validateCandidates(proposed, filesByPath);
    for (const r of rejected) {
      this.deps.log.debug({ repoId: repo.id, path: r.path, reason: r.reason }, 'conventions: dropped candidate');
    }
    const { kept, skipped } = dropDuplicates(valid, decided);

    await this.deps.store.replacePending(
      workspaceId,
      repo.id,
      kept.map((c) => ({
        rule: c.rule,
        category: c.category,
        evidencePath: c.evidencePath,
        evidenceSnippet: c.evidenceSnippet,
        evidenceStartLine: c.startLine,
        evidenceEndLine: c.endLine,
        evidenceSha: sha,
        confidence: c.confidence,
      })),
    );

    const stats = {
      sample_files: sent.length,
      proposed: proposed.length,
      rejected_invalid_evidence: rejected.length,
      skipped_duplicates: skipped,
      kept: kept.length,
    };
    const cost = result.costUsd;
    this.deps.log.info(
      { repoId: repo.id, ...stats, model: result.model, cost_usd: cost },
      `conventions: sent ${stats.sample_files} files, proposed ${stats.proposed}, ` +
        `invalid ${stats.rejected_invalid_evidence}, dup ${stats.skipped_duplicates}, ` +
        `kept ${stats.kept} (${result.model}, $${cost ?? '?'})`,
    );

    const list = toConventionList(await this.deps.store.listByRepo(workspaceId, repo.id), repo);
    return {
      ...list,
      stats,
      usage: {
        model: result.model,
        tokens_in: result.tokensIn,
        tokens_out: result.tokensOut,
        cost_usd: cost,
      },
    };
  }

  /** Config files in the clone root and one level below it (monorepo packages). */
  private async findConfigPaths(clonePath: string): Promise<string[]> {
    const root = await this.deps.checkout.list(clonePath, '');
    const children = new Map<string, DirEntry[]>();
    await Promise.all(
      configScanDirs(root).map(async (dir) => {
        children.set(dir, await this.deps.checkout.list(clonePath, dir));
      }),
    );
    return pickConfigPaths(root, children);
  }

  private async readFiles(clonePath: string, paths: string[]): Promise<SourceFile[]> {
    const texts = await Promise.all(paths.map((p) => this.deps.checkout.read(clonePath, p)));
    return paths.flatMap((path, i) => {
      const text = texts[i];
      return text === null || text === undefined ? [] : [{ path, text }];
    });
  }

  private async requireRepo(workspaceId: string, repoId: string): Promise<RepoRecord> {
    const repo = await this.deps.store.findRepo(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repository not found');
    return repo;
  }
}
