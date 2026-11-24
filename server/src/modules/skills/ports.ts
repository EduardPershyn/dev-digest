import type { SkillRecord, SkillVersionRecord } from '../_shared/records.js';
import type { ArchiveEntryMeta } from './import-parser.js';

/**
 * M2 — skills application ports. `SkillsService` depends on these; Drizzle
 * implements `SkillStore` (./repository.ts), fflate implements `ArchiveReader`
 * (src/adapters/archive/zip.ts), tiktoken implements `TokenCounter`.
 */

export interface InsertSkill {
  workspaceId: string;
  name: string;
  description: string;
  type: SkillRecord['type'];
  source: SkillRecord['source'];
  body: string;
  enabled: boolean;
}

export interface UpdateSkill {
  name?: string;
  description?: string;
  type?: SkillRecord['type'];
  body?: string;
  enabled?: boolean;
}

/** Persistence of skills + their version snapshots. Workspace-scoped. */
export interface SkillStore {
  list(workspaceId: string): Promise<SkillRecord[]>;
  getById(workspaceId: string, id: string): Promise<SkillRecord | undefined>;
  getByName(workspaceId: string, name: string): Promise<SkillRecord | undefined>;
  /** Which of `ids` exist in the workspace. */
  existingIds(workspaceId: string, ids: string[]): Promise<string[]>;
  /** Link counts per skill id (any link state). */
  agentCounts(workspaceId: string): Promise<Map<string, number>>;
  /** Agents (id + name) a skill is linked to. */
  agentsUsing(skillId: string): Promise<{ id: string; name: string }[]>;
  /** Insert + snapshot v1. Throws ConflictError on a duplicate name. */
  insert(values: InsertSkill): Promise<SkillRecord>;
  /**
   * Patch a skill; a text-config change bumps the version and snapshots it.
   * Throws ConflictError on a duplicate name.
   */
  update(workspaceId: string, id: string, patch: UpdateSkill): Promise<SkillRecord | undefined>;
  deleteById(workspaceId: string, id: string): Promise<boolean>;
  listVersions(skillId: string): Promise<SkillVersionRecord[]>;
  getVersion(skillId: string, version: number): Promise<SkillVersionRecord | undefined>;
}

/**
 * Read-only archive access. `list` reads entry headers only; `readText`
 * inflates ONE entry and must abort once `maxBytes` is exceeded (it may not
 * trust the declared size). Nothing is ever written to disk or executed.
 */
export interface ArchiveReader {
  list(bytes: Uint8Array): ArchiveEntryMeta[];
  readText(bytes: Uint8Array, path: string, maxBytes: number): string;
}

/** Token counter for body size hints (structurally the repo-intel Tokenizer). */
export interface TokenCounter {
  count(text: string): number;
}
