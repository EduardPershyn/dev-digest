import type { Skill, SkillVersion } from '@devdigest/shared';
import { SKILL_NAME_MAX, SKILL_NAME_PATTERN } from '@devdigest/shared';
import type { SkillRecord, SkillVersionRecord } from '../_shared/records.js';

/**
 * Pure helpers for the skills module — record ⇄ DTO mapping, the version-bump
 * rule and name normalisation. No I/O.
 */

/** Map a persisted skill (+ its link count) to the public `Skill` DTO. */
export function toSkillDto(row: SkillRecord, agentCount = 0): Skill {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    type: row.type,
    source: row.source,
    body: row.body,
    enabled: row.enabled,
    version: row.version,
    evidence_files: row.evidenceFiles ?? null,
    used_by_agents: agentCount,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

export function toSkillVersionDto(row: SkillVersionRecord): SkillVersion {
  return {
    skill_id: row.skillId,
    version: row.version,
    name: row.name,
    description: row.description,
    type: row.type,
    body: row.body,
    created_at: row.createdAt.toISOString(),
  };
}

/** The text-config fields of a skill; changing any of them bumps the version. */
export interface SkillConfigPatch {
  name?: string;
  description?: string;
  type?: SkillRecord['type'];
  body?: string;
}

/** True when the patch changes text config (vs. only toggling `enabled`). */
export function isSkillConfigChange(
  existing: Pick<SkillRecord, 'name' | 'description' | 'type' | 'body'>,
  patch: SkillConfigPatch,
): boolean {
  return (
    (patch.name !== undefined && patch.name !== existing.name) ||
    (patch.description !== undefined && patch.description !== existing.description) ||
    (patch.type !== undefined && patch.type !== existing.type) ||
    (patch.body !== undefined && patch.body !== existing.body)
  );
}

/**
 * Turn arbitrary text (a frontmatter name, an H1, a filename) into a valid
 * kebab-case skill slug, or `undefined` when nothing usable is left.
 */
export function slugifySkillName(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const slug = raw
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SKILL_NAME_MAX)
    .replace(/-+$/g, '');
  return SKILL_NAME_PATTERN.test(slug) ? slug : undefined;
}
