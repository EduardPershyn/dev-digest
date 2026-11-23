import type { Finding, Intent, RunSummary, RunTrace } from '@devdigest/shared';
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

/** Persistence of reviews, findings, intent and the agent_runs/run_traces observability rows. */
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
  // intent
  upsertIntent(prId: string, intent: Intent): Promise<void>;
  getIntent(prId: string): Promise<Intent | undefined>;
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
