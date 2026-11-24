import type { CiFailOn, Provider, ReviewStrategy } from '@devdigest/shared';
import type { AgentRecord, AgentVersionRecord } from '../_shared/records.js';

/**
 * A2 — agents application ports. `AgentsService` depends on these; the Drizzle
 * implementation is `AgentsRepository` (./repository.ts).
 */

export interface InsertAgent {
  workspaceId: string;
  name: string;
  description?: string;
  provider: Provider;
  model: string;
  systemPrompt: string;
  outputSchema?: unknown;
  strategy?: ReviewStrategy;
  ciFailOn?: CiFailOn;
  repoIntel?: boolean;
  enabled?: boolean;
  createdBy?: string | null;
}

export interface UpdateAgent {
  name?: string;
  description?: string;
  provider?: Provider;
  model?: string;
  systemPrompt?: string;
  outputSchema?: unknown;
  strategy?: ReviewStrategy;
  ciFailOn?: CiFailOn;
  repoIntel?: boolean;
  enabled?: boolean;
}

/** A skill linked to an agent (with its order + per-agent switch). */
export interface LinkedSkill {
  skill: { id: string; enabled: boolean; version: number };
  order: number;
  enabled: boolean;
}

/** One entry of an agent's ordered skill list (order = array index). */
export interface SkillLinkInput {
  skillId: string;
  enabled: boolean;
}

/** Persistence of agents, their version snapshots and skill links. Workspace-scoped. */
export interface AgentStore {
  list(workspaceId: string): Promise<AgentRecord[]>;
  getById(workspaceId: string, id: string): Promise<AgentRecord | undefined>;
  deleteById(workspaceId: string, id: string): Promise<boolean>;
  /** Insert an agent AND record version 1 (immutable snapshot). */
  insert(values: InsertAgent): Promise<AgentRecord>;
  /** Any config change bumps the version and snapshots it. */
  update(workspaceId: string, id: string, patch: UpdateAgent): Promise<AgentRecord | undefined>;
  listVersions(agentId: string): Promise<AgentVersionRecord[]>;
  getVersion(agentId: string, version: number): Promise<AgentVersionRecord | undefined>;
  linkedSkills(agentId: string): Promise<LinkedSkill[]>;
  /** Per agent: links whose link AND skill are enabled (what reaches the prompt). */
  activeSkillCounts(workspaceId: string): Promise<Map<string, number>>;
  /** Which of `skillIds` are skills of this workspace. */
  existingSkillIds(workspaceId: string, skillIds: string[]): Promise<string[]>;
  /**
   * Replace the agent's ordered skill links in one transaction; bumps the
   * agent version and snapshots it (a skill-set change is a config change).
   */
  replaceSkillLinks(workspaceId: string, agentId: string, links: SkillLinkInput[]): Promise<void>;
}
