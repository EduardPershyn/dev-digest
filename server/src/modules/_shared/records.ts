/**
 * Domain records — the persisted entity shapes as the APPLICATION sees them.
 *
 * Onion rule: services, executors and helpers type against these plain
 * interfaces, never against Drizzle (`$inferSelect`, `db/rows.ts`, `db/schema`).
 * Repositories return Drizzle rows, which are structurally identical; the
 * compile-time assertions in `db/rows.ts` fail the build if the schema drifts
 * away from a record, so the two can't silently diverge.
 *
 * Field names stay camelCase (the row shape) on purpose — this is the internal
 * record, not the snake_case API contract in `@devdigest/shared`.
 */

import type { IntentMissingContext, IntentSource } from '@devdigest/shared';

export interface RepoRecord {
  id: string;
  workspaceId: string;
  owner: string;
  name: string;
  fullName: string;
  defaultBranch: string;
  clonePath: string | null;
  lastPolledAt: Date | null;
  createdBy: string | null;
  createdAt: Date;
}

export interface AgentRecord {
  id: string;
  workspaceId: string;
  name: string;
  description: string;
  provider: 'openai' | 'anthropic' | 'openrouter';
  model: string;
  systemPrompt: string;
  outputSchema: unknown;
  strategy: 'single-pass' | 'map-reduce' | 'auto';
  ciFailOn: 'never' | 'critical' | 'warning' | 'any';
  repoIntel: boolean;
  enabled: boolean;
  version: number;
  createdBy: string | null;
  createdAt: Date;
}

export interface AgentVersionRecord {
  agentId: string;
  version: number;
  configJson: unknown;
  createdAt: Date;
}

/** M2 — a workspace skill: text-only review guidance (no tools / code). */
export interface SkillRecord {
  id: string;
  workspaceId: string;
  name: string;
  description: string;
  type: 'rubric' | 'convention' | 'security' | 'custom';
  source: 'manual' | 'imported_file' | 'imported_url' | 'extracted' | 'community';
  body: string;
  enabled: boolean;
  version: number;
  evidenceFiles: string[] | null;
  createdAt: Date;
  updatedAt: Date;
}

/** M2 — immutable snapshot of a skill's text config. */
export interface SkillVersionRecord {
  skillId: string;
  version: number;
  name: string | null;
  description: string | null;
  type: 'rubric' | 'convention' | 'security' | 'custom' | null;
  body: string;
  createdAt: Date;
}

/** M2 — a convention candidate proposed by the extractor (specs/M2-conventions.md). */
export interface ConventionRecord {
  id: string;
  workspaceId: string;
  repoId: string | null;
  rule: string;
  evidencePath: string | null;
  evidenceSnippet: string | null;
  confidence: number | null;
  /** Legacy mirror of `status === 'accepted'`. */
  accepted: boolean;
  status: 'pending' | 'accepted' | 'rejected';
  category: string | null;
  evidenceStartLine: number | null;
  evidenceEndLine: number | null;
  evidenceSha: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** M3 — the derived intent of one PR (`pr_intent`, specs/M3-intent-layer.md). */
export interface IntentRecord {
  prId: string;
  summary: string;
  inScope: string[];
  outOfScope: string[];
  confidence: 'high' | 'medium' | 'low';
  sources: IntentSource[];
  missingContext: IntentMissingContext[];
  provider: string | null;
  model: string | null;
  headSha: string | null;
  inputHash: string | null;
  tokensIn: number | null;
  tokensOut: number | null;
  costUsd: number | null;
  status: 'ok' | 'failed';
  error: string | null;
  classifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PullRecord {
  id: string;
  workspaceId: string;
  repoId: string;
  number: number;
  title: string;
  author: string;
  branch: string;
  base: string;
  headSha: string;
  lastReviewedSha: string | null;
  additions: number;
  deletions: number;
  filesCount: number;
  status: string;
  body: string | null;
  openedAt: Date | null;
  updatedAt: Date | null;
}

export interface PrFileRecord {
  id: string;
  prId: string;
  path: string;
  additions: number;
  deletions: number;
  patch: string | null;
}

export interface ReviewRecord {
  id: string;
  workspaceId: string;
  prId: string;
  agentId: string | null;
  runId: string | null;
  kind: 'summary' | 'review';
  verdict: string | null;
  summary: string | null;
  score: number | null;
  model: string | null;
  createdAt: Date;
}

export interface FindingRecord {
  id: string;
  reviewId: string;
  file: string;
  startLine: number;
  endLine: number;
  severity: string;
  category: string;
  title: string;
  rationale: string;
  suggestion: string | null;
  confidence: number;
  kind: string;
  trifectaComponents: string[] | null;
  acceptedAt: Date | null;
  dismissedAt: Date | null;
}
