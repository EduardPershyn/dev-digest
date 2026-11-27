import type { Finding, RunSummary, RunTrace, UnifiedDiff } from '@devdigest/shared';
import type { IntentBlockInput } from '@devdigest/reviewer-core';
import type {
  AgentRecord,
  FindingRecord,
  PrFileRecord,
  PullRecord,
  RepoRecord,
  ReviewRecord,
} from '../_shared/records.js';

/**
 * A2 — reviews application ports. `ReviewService` / `ReviewRunExecutor`
 * depend on these; the Drizzle implementation is `ReviewRepository`
 * (./repository.ts). Agents are read through `AgentDirectory`, a port this
 * module owns, so it never reaches into the agents module.
 */

export interface NewReview {
  workspaceId: string;
  prId: string;
  agentId: string | null;
  runId: string | null;
  kind: 'summary' | 'review';
  verdict: string | null;
  summary: string | null;
  score: number | null;
  model: string | null;
}

export interface NewAgentRun {
  workspaceId: string;
  agentId: string | null;
  prId: string;
  provider: string | null;
  model: string | null;
  batchId?: string | null;
}

export interface AgentRunCompletion {
  status: 'done' | 'failed' | 'cancelled';
  durationMs: number;
  tokensIn: number;
  tokensOut: number;
  findingsCount: number;
  grounding: string;
  score?: number | null;
  blockers?: number | null;
  error?: string | null;
  costUsd?: number | null;
}

export interface ActiveRun {
  run_id: string;
  agent_id: string | null;
  agent_name: string | null;
  ran_at: string | null;
}

/** Persistence of reviews, findings and the agent_runs/run_traces observability rows. */
export interface ReviewStore {
  // PR lookup (workspace-scoped)
  getPull(workspaceId: string, prId: string): Promise<PullRecord | undefined>;
  getRepo(repoId: string): Promise<RepoRecord | undefined>;
  getPrFiles(prId: string): Promise<PrFileRecord[]>;
  // reviews + findings
  insertReview(values: NewReview): Promise<ReviewRecord>;
  insertFindings(reviewId: string, findings: Finding[]): Promise<FindingRecord[]>;
  reviewsForPull(prId: string): Promise<{ review: ReviewRecord; findings: FindingRecord[] }[]>;
  getReview(reviewId: string): Promise<ReviewRecord | undefined>;
  deleteReview(workspaceId: string, reviewId: string): Promise<boolean>;
  getFinding(findingId: string): Promise<FindingRecord | undefined>;
  findingContext(
    findingId: string,
  ): Promise<{ finding: FindingRecord; review: ReviewRecord; pull: PullRecord } | undefined>;
  setFindingAccepted(findingId: string, at: Date | null): Promise<FindingRecord | undefined>;
  setFindingDismissed(findingId: string, at: Date | null): Promise<FindingRecord | undefined>;
  // runs + traces
  activeRunsForPull(workspaceId: string, prId: string): Promise<ActiveRun[]>;
  listRunsForPull(workspaceId: string, prId: string): Promise<RunSummary[]>;
  deleteAgentRun(workspaceId: string, runId: string): Promise<boolean>;
  cancelRunIfRunning(runId: string): Promise<boolean>;
  reapStaleRunningRuns(): Promise<number>;
  createAgentRun(values: NewAgentRun): Promise<string>;
  completeAgentRun(runId: string, values: AgentRunCompletion): Promise<void>;
  markReviewed(prId: string, sha: string): Promise<void>;
  saveRunTrace(runId: string, trace: RunTrace): Promise<void>;
  getRunTrace(runId: string): Promise<RunTrace | undefined>;
}

/** Read access to agents, owned by the reviews module (implemented by AgentsRepository). */
export interface AgentDirectory {
  listEnabled(workspaceId: string): Promise<AgentRecord[]>;
  getById(workspaceId: string, id: string): Promise<AgentRecord | undefined>;
}

/** M2 — a skill as it should reach the prompt (link AND skill enabled), in link order. */
export interface ResolvedSkill {
  id: string;
  name: string;
  version: number;
  type: string;
  source: string;
  description: string;
  body: string;
}

/** Read access to an agent's enabled skills, owned by the reviews module (implemented by SkillsRepository). */
export interface SkillResolver {
  enabledForAgent(workspaceId: string, agentId: string): Promise<ResolvedSkill[]>;
}

/** Token counter for per-skill attribution in the run trace (tiktoken in prod). */
export interface TokenCounter {
  count(text: string): number;
}

/**
 * M3 — the PR's derived intent for a review run, as the reviews module needs it.
 * Implemented structurally by the intent module's `IntentService.forReview`
 * (wired by the container; reviews never imports the intent module).
 */
export interface ReviewIntent {
  status: 'reused' | 'classified' | 'failed';
  /** Why no intent is available (status 'failed'). */
  reason: string | null;
  intent: {
    block: IntentBlockInput;
    confidence: string;
    provider: string | null;
    model: string | null;
    sourcesUsed: number;
    missing: number;
    /** Set only when this pre-work paid for a classification. */
    costUsd: number | null;
    tokensIn: number | null;
  } | null;
}

/** Review pre-work port: reuse a fresh intent or reclassify. Must never throw. */
export interface IntentProvider {
  forReview(
    workspaceId: string,
    pull: PullRecord,
    repo: RepoRecord,
    diff: UnifiedDiff,
    log?: { info(obj: unknown, msg?: string): void; warn(obj: unknown, msg?: string): void },
  ): Promise<ReviewIntent>;
}
