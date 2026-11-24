/* hooks/skills.ts — React Query hooks for the M2 skill library (/skills) and the
   import preview. A skill is text only: name, description, type, Markdown body. */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { agentKeys } from "./agents";
import type {
  AgentSkillLink,
  AgentSkillLinksInput,
  Skill,
  SkillImportPreview,
  SkillImportRequest,
  SkillInput,
  SkillPatch,
  SkillVersion,
} from "@devdigest/shared";

/** A skill plus the agents it is linked to and its rendered prompt block (GET /skills/:id). */
export type SkillDetail = Skill & { agents: { id: string; name: string }[]; prompt_block: string };

/* Query keys for the skills domain (L6). */
export const skillKeys = {
  all: ["skills"] as const,
  detail: (id: string | null | undefined) => ["skill", id] as const,
  versions: (id: string | null | undefined) => ["skill-versions", id] as const,
};

export function useSkills() {
  return useQuery({
    queryKey: skillKeys.all,
    queryFn: () => api.get<Skill[]>("/skills"),
  });
}

export function useSkill(id: string | null | undefined) {
  return useQuery({
    queryKey: skillKeys.detail(id),
    queryFn: () => api.get<SkillDetail>(`/skills/${id}`),
    enabled: !!id,
  });
}

export function useSkillVersions(id: string | null | undefined) {
  return useQuery({
    queryKey: skillKeys.versions(id),
    queryFn: () => api.get<SkillVersion[]>(`/skills/${id}/versions`),
    enabled: !!id,
  });
}

/** Skill changes move agent skill counts and link lists, so refresh those too. */
function invalidateSkillViews(qc: ReturnType<typeof useQueryClient>, id?: string) {
  qc.invalidateQueries({ queryKey: skillKeys.all });
  qc.invalidateQueries({ queryKey: agentKeys.all });
  qc.invalidateQueries({ queryKey: agentKeys.skillsAll });
  if (id) {
    qc.invalidateQueries({ queryKey: skillKeys.detail(id) });
    qc.invalidateQueries({ queryKey: skillKeys.versions(id) });
  }
}

export function useCreateSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SkillInput) => api.post<Skill>("/skills", input),
    onSuccess: (data) => invalidateSkillViews(qc, data.id),
  });
}

export function useUpdateSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: SkillPatch }) => api.put<Skill>(`/skills/${id}`, patch),
    onSuccess: (data) => invalidateSkillViews(qc, data.id),
  });
}

export function useDeleteSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<{ ok: boolean }>(`/skills/${id}`),
    onSuccess: (_d, id) => {
      invalidateSkillViews(qc);
      qc.removeQueries({ queryKey: skillKeys.detail(id) });
    },
  });
}

/** Stateless parse of an upload. Stores nothing — saving is a separate useCreateSkill call. */
export function useImportSkillPreview() {
  return useMutation({
    mutationFn: (req: SkillImportRequest) => api.post<SkillImportPreview>("/skills/import/preview", req),
  });
}

/** M2 — the agent's ordered skill links (with per-agent enabled). */
export function useAgentSkills(id: string | null | undefined) {
  return useQuery({
    queryKey: agentKeys.skills(id),
    queryFn: () => api.get<AgentSkillLink[]>(`/agents/${id}/skills`),
    enabled: !!id,
  });
}

/**
 * M2 — replace the agent's ordered skill list (order = array index). Optimistic:
 * the Skills tab reorders/toggles instantly and rolls back on error. A change
 * bumps the agent version, so the agent detail/list are refetched.
 */
export function useSetAgentSkills(agentId: string) {
  const qc = useQueryClient();
  const key = agentKeys.skills(agentId);
  return useMutation({
    mutationFn: (links: AgentSkillLinksInput["links"]) =>
      api.put<AgentSkillLink[]>(`/agents/${agentId}/skills`, { links }),
    onMutate: async (links) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<AgentSkillLink[]>(key);
      qc.setQueryData<AgentSkillLink[]>(
        key,
        links.map((l, order) => ({ agent_id: agentId, skill_id: l.skill_id, enabled: l.enabled, order })),
      );
      return { previous };
    },
    onError: (_e, _links, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
    },
    onSuccess: (data) => {
      qc.setQueryData(key, data);
      qc.invalidateQueries({ queryKey: agentKeys.all });
      qc.invalidateQueries({ queryKey: agentKeys.detail(agentId) });
      qc.invalidateQueries({ queryKey: skillKeys.all });
    },
  });
}
