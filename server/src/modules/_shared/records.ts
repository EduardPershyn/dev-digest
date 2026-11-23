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
