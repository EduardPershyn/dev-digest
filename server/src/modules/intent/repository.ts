import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { PrIntentRow, PullRow, RepoRow } from '../../db/rows.js';
import type { IntentOkValues, IntentStore } from './ports.js';

/**
 * M3 — intent data access. Owns `pr_intent`; reads `pull_requests` + `repos`
 * for the workspace-scoped PR lookup. Rows are structurally the domain
 * `IntentRecord` (drift-guarded in db/rows.ts).
 */
export class IntentRepository implements IntentStore {
  constructor(private db: Db) {}

  async getPullWithRepo(
    workspaceId: string,
    prId: string,
  ): Promise<{ pull: PullRow; repo: RepoRow } | undefined> {
    const [row] = await this.db
      .select({ pull: t.pullRequests, repo: t.repos })
      .from(t.pullRequests)
      .innerJoin(t.repos, eq(t.repos.id, t.pullRequests.repoId))
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
    return row;
  }

  async get(prId: string): Promise<PrIntentRow | undefined> {
    const [row] = await this.db.select().from(t.prIntent).where(eq(t.prIntent.prId, prId));
    return row;
  }

  async upsertOk(prId: string, values: IntentOkValues): Promise<PrIntentRow> {
    const set = { ...values, status: 'ok' as const, error: null, updatedAt: new Date() };
    const [row] = await this.db
      .insert(t.prIntent)
      .values({ prId, ...set })
      .onConflictDoUpdate({ target: t.prIntent.prId, set })
      .returning();
    return row!;
  }

  async recordFailure(prId: string, error: string): Promise<PrIntentRow> {
    const now = new Date();
    const [row] = await this.db
      .insert(t.prIntent)
      .values({ prId, summary: '', status: 'failed', error, updatedAt: now })
      // Keep the previous summary / scope / sources: only the status changes.
      .onConflictDoUpdate({ target: t.prIntent.prId, set: { status: 'failed', error, updatedAt: now } })
      .returning();
    return row!;
  }
}
