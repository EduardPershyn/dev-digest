import type {
  Agent,
  AgentSkillLink,
  AgentVersion,
  CiFailOn,
  ModelInfo,
  Provider,
  LLMProvider,
  ReviewStrategy,
} from '@devdigest/shared';
import { ValidationError } from '../../platform/errors.js';
import type { AgentStore, SkillLinkInput } from './ports.js';
import { duplicateIds, toAgentDto, toAgentVersionDto, withLinkedSkill } from './helpers.js';

/**
 * A2 — agents service. Business logic for the Agents tab + Agent Editor.
 * Provider/model selection uses the LLM adapter's dynamic model list.
 *
 * An Agent = provider + model + system_prompt + linked skills + output_schema +
 * enabled. Config changes are versioned via `agent_versions` (repository).
 */

// Re-exported for backwards compatibility; implementation lives in ./helpers.
export { toAgentDto } from './helpers.js';

export interface CreateAgentInput {
  name: string;
  description?: string;
  provider: Provider;
  model: string;
  system_prompt: string;
  output_schema?: unknown;
  strategy?: ReviewStrategy;
  ci_fail_on?: CiFailOn;
  repo_intel?: boolean;
  enabled?: boolean;
}

export interface UpdateAgentInput {
  name?: string;
  description?: string;
  provider?: Provider;
  model?: string;
  system_prompt?: string;
  output_schema?: unknown;
  strategy?: ReviewStrategy;
  ci_fail_on?: CiFailOn;
  repo_intel?: boolean;
  enabled?: boolean;
}

/** Ports the agents use cases need — wired in routes.ts. */
export interface AgentsServiceDeps {
  store: AgentStore;
  /** Resolve an LLM provider by id (throws when its key isn't configured). */
  llm: (provider: Provider) => Promise<LLMProvider>;
}

export class AgentsService {
  private readonly repo: AgentStore;

  constructor(private readonly deps: AgentsServiceDeps) {
    this.repo = deps.store;
  }

  async list(workspaceId: string): Promise<Agent[]> {
    const [rows, counts] = await Promise.all([
      this.repo.list(workspaceId),
      this.repo.activeSkillCounts(workspaceId),
    ]);
    return rows.map((r) => toAgentDto(r, counts.get(r.id) ?? 0));
  }

  async get(workspaceId: string, id: string): Promise<Agent | undefined> {
    const row = await this.repo.getById(workspaceId, id);
    if (!row) return undefined;
    const counts = await this.repo.activeSkillCounts(workspaceId);
    return toAgentDto(row, counts.get(row.id) ?? 0);
  }

  /** Delete an agent (and its versions/skill-links, via cascade). */
  async delete(workspaceId: string, id: string): Promise<boolean> {
    return this.repo.deleteById(workspaceId, id);
  }

  async create(workspaceId: string, input: CreateAgentInput, userId?: string): Promise<Agent> {
    const row = await this.repo.insert({
      workspaceId,
      name: input.name,
      description: input.description,
      provider: input.provider,
      model: input.model,
      systemPrompt: input.system_prompt,
      outputSchema: input.output_schema,
      ...(input.strategy !== undefined ? { strategy: input.strategy } : {}),
      ...(input.ci_fail_on !== undefined ? { ciFailOn: input.ci_fail_on } : {}),
      ...(input.repo_intel !== undefined ? { repoIntel: input.repo_intel } : {}),
      enabled: input.enabled,
      createdBy: userId ?? null,
    });
    return toAgentDto(row, 0);
  }

  async update(
    workspaceId: string,
    id: string,
    patch: UpdateAgentInput,
  ): Promise<Agent | undefined> {
    const row = await this.repo.update(workspaceId, id, {
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.provider !== undefined ? { provider: patch.provider } : {}),
      ...(patch.model !== undefined ? { model: patch.model } : {}),
      ...(patch.system_prompt !== undefined ? { systemPrompt: patch.system_prompt } : {}),
      ...(patch.output_schema !== undefined ? { outputSchema: patch.output_schema } : {}),
      ...(patch.strategy !== undefined ? { strategy: patch.strategy } : {}),
      ...(patch.ci_fail_on !== undefined ? { ciFailOn: patch.ci_fail_on } : {}),
      ...(patch.repo_intel !== undefined ? { repoIntel: patch.repo_intel } : {}),
      ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
    });
    if (!row) return undefined;
    const counts = await this.repo.activeSkillCounts(workspaceId);
    return toAgentDto(row, counts.get(row.id) ?? 0);
  }

  /**
   * Config history for an agent, newest version first. Workspace-scoped: returns
   * undefined when the agent isn't in this workspace (the route maps that to 404)
   * so version snapshots can't be read across tenants.
   */
  async listVersions(workspaceId: string, agentId: string): Promise<AgentVersion[] | undefined> {
    const agent = await this.repo.getById(workspaceId, agentId);
    if (!agent) return undefined;
    const rows = await this.repo.listVersions(agentId);
    return rows.map(toAgentVersionDto);
  }

  /**
   * A single config snapshot for an agent. Returns undefined when the agent isn't
   * in this workspace OR that version was never recorded (route → 404).
   */
  async getVersion(
    workspaceId: string,
    agentId: string,
    version: number,
  ): Promise<AgentVersion | undefined> {
    const agent = await this.repo.getById(workspaceId, agentId);
    if (!agent) return undefined;
    const row = await this.repo.getVersion(agentId, version);
    return row ? toAgentVersionDto(row) : undefined;
  }

  /** Linked skills for an agent as AgentSkillLink[] (ordered, with per-agent switch). */
  async skillLinks(agentId: string): Promise<AgentSkillLink[]> {
    const links = await this.repo.linkedSkills(agentId);
    return links.map((l) => ({
      agent_id: agentId,
      skill_id: l.skill.id,
      order: l.order,
      enabled: l.enabled,
    }));
  }

  /**
   * M2 — replace the agent's ordered skill list (Skills tab). Every skill must
   * belong to the workspace (the link table has no workspace_id of its own) and
   * appear once. Bumps the agent version. undefined → agent not found.
   */
  async setSkillLinks(
    workspaceId: string,
    agentId: string,
    links: SkillLinkInput[],
  ): Promise<AgentSkillLink[] | undefined> {
    const agent = await this.repo.getById(workspaceId, agentId);
    if (!agent) return undefined;
    const ids = links.map((l) => l.skillId);
    const dupes = duplicateIds(ids);
    if (dupes.length > 0) throw new ValidationError('A skill can be linked only once', { dupes });
    const known = new Set(await this.repo.existingSkillIds(workspaceId, ids));
    const unknown = ids.filter((id) => !known.has(id));
    if (unknown.length > 0) throw new ValidationError('Unknown skill id(s)', { unknown });
    await this.repo.replaceSkillLinks(workspaceId, agentId, links);
    return this.skillLinks(agentId);
  }

  /** Legacy POST: replace the set with `skillIds` (all enabled), in that order. */
  async setSkills(
    workspaceId: string,
    agentId: string,
    skillIds: string[],
  ): Promise<AgentSkillLink[] | undefined> {
    return this.setSkillLinks(
      workspaceId,
      agentId,
      skillIds.map((skillId) => ({ skillId, enabled: true })),
    );
  }

  /** Legacy POST: link one skill (append, or move to `order`), keeping the others. */
  async linkSkill(
    workspaceId: string,
    agentId: string,
    skillId: string,
    order?: number,
  ): Promise<AgentSkillLink[] | undefined> {
    const agent = await this.repo.getById(workspaceId, agentId);
    if (!agent) return undefined;
    const existing = await this.repo.linkedSkills(agentId);
    const next = withLinkedSkill(
      existing.map((l) => ({ skillId: l.skill.id, enabled: l.enabled })),
      skillId,
      order,
    );
    return this.setSkillLinks(workspaceId, agentId, next);
  }

  /**
   * Dynamic model list from the provider adapter's /models. Degrades gracefully
   * to [] if the provider key is not configured (the editor still renders).
   */
  async listModels(provider: Provider): Promise<ModelInfo[]> {
    try {
      const llm = await this.deps.llm(provider);
      return await llm.listModels();
    } catch {
      return [];
    }
  }
}
