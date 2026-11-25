/* hooks/conventions.ts — React Query hooks for the M2 Conventions Extractor
   (specs/M2-conventions.md): list, run extraction (one synchronous model call),
   curate a candidate, and build a skill draft from accepted conventions.
   Saving the skill is the existing useCreateSkill (hooks/skills). */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  ConventionCandidate,
  ConventionExtractResult,
  ConventionList,
  ConventionPatch,
  ConventionSkillDraft,
  ConventionSkillDraftRequest,
} from "@devdigest/shared";

/* Query keys for the conventions domain (L6). */
export const conventionKeys = {
  list: (repoId: string | null | undefined) => ["conventions", repoId] as const,
};

export function useConventions(repoId: string | null | undefined) {
  return useQuery({
    queryKey: conventionKeys.list(repoId),
    queryFn: () => api.get<ConventionList>(`/repos/${repoId}/conventions`),
    enabled: !!repoId,
  });
}

/** Runs the extraction; on success the result replaces the cached list. */
export function useExtractConventions(repoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<ConventionExtractResult>(`/repos/${repoId}/conventions/extract`),
    onSuccess: (data) => {
      qc.setQueryData<ConventionList>(conventionKeys.list(repoId), {
        candidates: data.candidates,
        last_scan_at: data.last_scan_at,
      });
    },
  });
}

/** Optimistic status / rule change, rolled back on error. */
export function useUpdateConvention(repoId: string) {
  const qc = useQueryClient();
  const key = conventionKeys.list(repoId);
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: ConventionPatch }) =>
      api.put<ConventionCandidate>(`/repos/${repoId}/conventions/${id}`, patch),
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<ConventionList>(key);
      if (previous) {
        qc.setQueryData<ConventionList>(key, {
          ...previous,
          candidates: previous.candidates.map((c) =>
            c.id === id
              ? {
                  ...c,
                  ...(patch.rule !== undefined ? { rule: patch.rule } : {}),
                  ...(patch.status !== undefined
                    ? { status: patch.status, accepted: patch.status === "accepted" }
                    : {}),
                }
              : c,
          ),
        });
      }
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
    },
    onSuccess: (row) => {
      qc.setQueryData<ConventionList>(key, (list) =>
        list ? { ...list, candidates: list.candidates.map((c) => (c.id === row.id ? row : c)) } : list,
      );
    },
  });
}

/** Stateless: the server merges ACCEPTED conventions only. Stores nothing. */
export function useConventionSkillDraft(repoId: string) {
  return useMutation({
    mutationFn: (req: ConventionSkillDraftRequest) =>
      api.post<ConventionSkillDraft>(`/repos/${repoId}/conventions/skill-draft`, req),
  });
}
