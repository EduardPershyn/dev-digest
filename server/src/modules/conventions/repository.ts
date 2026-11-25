import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { ConventionRow, RepoRow } from '../../db/rows.js';
import type { ConventionPatchValues, ConventionStore, NewConvention } from './ports.js';

/**
 * M2 — conventions data access. Owns `conventions`; reads `repos` for the
 * workspace-scoped repo lookup. Every query filters by `workspace_id`.
 */
export class ConventionsRepository implements ConventionStore {
  constructor(private db: Db) {}

  async findRepo(workspaceId: string, repoId: string): Promise<RepoRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    return row;
  }

  async listByRepo(workspaceId: string, repoId: string): Promise<ConventionRow[]> {
    return this.db
      .select()
      .from(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.repoId, repoId)));
  }

  async update(
    workspaceId: string,
    repoId: string,
    id: string,
    patch: ConventionPatchValues,
  ): Promise<ConventionRow | undefined> {
    const values: Partial<typeof t.conventions.$inferInsert> = { updatedAt: new Date() };
    if (patch.status !== undefined) {
      values.status = patch.status;
      values.accepted = patch.status === 'accepted';
    }
    if (patch.rule !== undefined) values.rule = patch.rule;
    const [row] = await this.db
      .update(t.conventions)
      .set(values)
      .where(
        and(
          eq(t.conventions.workspaceId, workspaceId),
          eq(t.conventions.repoId, repoId),
          eq(t.conventions.id, id),
        ),
      )
      .returning();
    return row;
  }

  async replacePending(workspaceId: string, repoId: string, rows: NewConvention[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .delete(t.conventions)
        .where(
          and(
            eq(t.conventions.workspaceId, workspaceId),
            eq(t.conventions.repoId, repoId),
            eq(t.conventions.status, 'pending'),
          ),
        );
      if (rows.length === 0) return;
      await tx.insert(t.conventions).values(
        rows.map((r) => ({
          workspaceId,
          repoId,
          rule: r.rule,
          category: r.category,
          evidencePath: r.evidencePath,
          evidenceSnippet: r.evidenceSnippet,
          evidenceStartLine: r.evidenceStartLine,
          evidenceEndLine: r.evidenceEndLine,
          evidenceSha: r.evidenceSha,
          confidence: r.confidence,
          status: 'pending' as const,
          accepted: false,
        })),
      );
    });
  }
}
