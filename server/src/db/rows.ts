import * as t from './schema.js';
import type {
  AgentRecord,
  AgentVersionRecord,
  ConventionRecord,
  FindingRecord,
  IntentRecord,
  PrFileRecord,
  PullRecord,
  RepoRecord,
  ReviewRecord,
  SkillRecord,
  SkillVersionRecord,
} from '../modules/_shared/records.js';

/**
 * Shared row types inferred from the Drizzle schema — INFRASTRUCTURE ONLY.
 *
 * Repositories use these. Everything inward (services, executors, helpers)
 * types against the domain records in `modules/_shared/records.ts` instead
 * (onion rule `db-only-in-repositories`). The assertions below pin each row to
 * its record: if a migration changes a column, the build fails here rather
 * than letting the domain shape drift.
 */
export type AgentRow = typeof t.agents.$inferSelect;
export type AgentVersionRow = typeof t.agentVersions.$inferSelect;
export type FindingRow = typeof t.findings.$inferSelect;
export type PullRow = typeof t.pullRequests.$inferSelect;
export type AgentRunRow = typeof t.agentRuns.$inferSelect;
export type RepoRow = typeof t.repos.$inferSelect;
export type ReviewRow = typeof t.reviews.$inferSelect;
export type PrFileRow = typeof t.prFiles.$inferSelect;
export type SkillRow = typeof t.skills.$inferSelect;
export type SkillVersionRow = typeof t.skillVersions.$inferSelect;
export type ConventionRow = typeof t.conventions.$inferSelect;
export type PrIntentRow = typeof t.prIntent.$inferSelect;

// ---- row ⇔ record drift guard (compile-time only) ---------------------------
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Assert<T extends true> = T;

export type _RowRecordDriftGuard = [
  Assert<Same<RepoRow, RepoRecord>>,
  Assert<Same<AgentRow, AgentRecord>>,
  Assert<Same<AgentVersionRow, AgentVersionRecord>>,
  Assert<Same<PullRow, PullRecord>>,
  Assert<Same<PrFileRow, PrFileRecord>>,
  Assert<Same<ReviewRow, ReviewRecord>>,
  Assert<Same<FindingRow, FindingRecord>>,
  Assert<Same<SkillRow, SkillRecord>>,
  Assert<Same<SkillVersionRow, SkillVersionRecord>>,
  Assert<Same<ConventionRow, ConventionRecord>>,
  Assert<Same<PrIntentRow, IntentRecord>>,
];
