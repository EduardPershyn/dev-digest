import { and, asc, count, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { SkillRow, SkillVersionRow } from '../../db/rows.js';
import { ConflictError } from '../../platform/errors.js';
import { INITIAL_SKILL_VERSION } from './constants.js';
import { isSkillConfigChange } from './helpers.js';
import type { InsertSkill, SkillStore, UpdateSkill } from './ports.js';

/**
 * M2 — skills data access. Owns `skills` + `skill_versions`, and reads
 * `agent_skills` for link counts. Workspace-scoped throughout. Also implements
 * the reviews module's `SkillResolver` (enabled skills for an agent).
 */

/** A skill as resolved for a review prompt (both switches on, in link order). */
export interface ResolvedSkillRow {
  id: string;
  name: string;
  version: number;
  type: SkillRow['type'];
  source: SkillRow['source'];
  description: string;
  body: string;
}

function rethrowDuplicate(err: unknown, name: string | undefined): never {
  const e = err as { code?: string; cause?: { code?: string } };
  if (e?.code === '23505' || e?.cause?.code === '23505') {
    throw new ConflictError(`A skill named "${name ?? ''}" already exists`);
  }
  throw err;
}

export class SkillsRepository implements SkillStore {
  constructor(private db: Db) {}

  async list(workspaceId: string): Promise<SkillRow[]> {
    return this.db
      .select()
      .from(t.skills)
      .where(eq(t.skills.workspaceId, workspaceId))
      .orderBy(asc(t.skills.name));
  }

  async getById(workspaceId: string, id: string): Promise<SkillRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)));
    return row;
  }

  async getByName(workspaceId: string, name: string): Promise<SkillRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.name, name)));
    return row;
  }

  async existingIds(workspaceId: string, ids: string[]): Promise<string[]> {
    if (ids.length === 0) return [];
    const rows = await this.db
      .select({ id: t.skills.id })
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), inArray(t.skills.id, ids)));
    return rows.map((r) => r.id);
  }

  async agentCounts(workspaceId: string): Promise<Map<string, number>> {
    const rows = await this.db
      .select({ skillId: t.agentSkills.skillId, n: count() })
      .from(t.agentSkills)
      .innerJoin(t.skills, eq(t.agentSkills.skillId, t.skills.id))
      .where(eq(t.skills.workspaceId, workspaceId))
      .groupBy(t.agentSkills.skillId);
    return new Map(rows.map((r) => [r.skillId, Number(r.n)]));
  }

  async agentsUsing(skillId: string): Promise<{ id: string; name: string }[]> {
    return this.db
      .select({ id: t.agents.id, name: t.agents.name })
      .from(t.agentSkills)
      .innerJoin(t.agents, eq(t.agentSkills.agentId, t.agents.id))
      .where(eq(t.agentSkills.skillId, skillId))
      .orderBy(asc(t.agents.name));
  }

  async insert(values: InsertSkill): Promise<SkillRow> {
    try {
      return await this.db.transaction(async (tx) => {
        const [row] = await tx
          .insert(t.skills)
          .values({ ...values, version: INITIAL_SKILL_VERSION })
          .returning();
        await tx.insert(t.skillVersions).values(snapshotOf(row!, INITIAL_SKILL_VERSION));
        return row!;
      });
    } catch (err) {
      rethrowDuplicate(err, values.name);
    }
  }

  async update(
    workspaceId: string,
    id: string,
    patch: UpdateSkill,
  ): Promise<SkillRow | undefined> {
    try {
      return await this.db.transaction(async (tx) => {
        const [existing] = await tx
          .select()
          .from(t.skills)
          .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
          .for('update');
        if (!existing) return undefined;

        const changed = isSkillConfigChange(existing, patch);
        const nextVersion = changed ? existing.version + 1 : existing.version;
        const [row] = await tx
          .update(t.skills)
          .set({
            ...(patch.name !== undefined ? { name: patch.name } : {}),
            ...(patch.description !== undefined ? { description: patch.description } : {}),
            ...(patch.type !== undefined ? { type: patch.type } : {}),
            ...(patch.body !== undefined ? { body: patch.body } : {}),
            ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
            ...(changed ? { version: nextVersion } : {}),
            updatedAt: sql`now()`,
          })
          .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
          .returning();
        if (changed && row) {
          await tx
            .insert(t.skillVersions)
            .values(snapshotOf(row, nextVersion))
            .onConflictDoNothing();
        }
        return row;
      });
    } catch (err) {
      rethrowDuplicate(err, patch.name);
    }
  }

  async deleteById(workspaceId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
      .returning({ id: t.skills.id });
    return rows.length > 0;
  }

  async listVersions(skillId: string): Promise<SkillVersionRow[]> {
    return this.db
      .select()
      .from(t.skillVersions)
      .where(eq(t.skillVersions.skillId, skillId))
      .orderBy(desc(t.skillVersions.version));
  }

  async getVersion(skillId: string, version: number): Promise<SkillVersionRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.skillVersions)
      .where(and(eq(t.skillVersions.skillId, skillId), eq(t.skillVersions.version, version)));
    return row;
  }

  // ---- reviews' SkillResolver -------------------------------------------

  /**
   * Skills that reach an agent's prompt: link enabled AND skill enabled, in
   * link order. Workspace-scoped through the skill row.
   */
  async enabledForAgent(workspaceId: string, agentId: string): Promise<ResolvedSkillRow[]> {
    return this.db
      .select({
        id: t.skills.id,
        name: t.skills.name,
        version: t.skills.version,
        type: t.skills.type,
        source: t.skills.source,
        description: t.skills.description,
        body: t.skills.body,
      })
      .from(t.agentSkills)
      .innerJoin(t.skills, eq(t.agentSkills.skillId, t.skills.id))
      .where(
        and(
          eq(t.agentSkills.agentId, agentId),
          eq(t.agentSkills.enabled, true),
          eq(t.skills.enabled, true),
          eq(t.skills.workspaceId, workspaceId),
        ),
      )
      .orderBy(asc(t.agentSkills.order));
  }
}

function snapshotOf(row: SkillRow, version: number) {
  return {
    skillId: row.id,
    version,
    name: row.name,
    description: row.description,
    type: row.type,
    body: row.body,
  };
}
