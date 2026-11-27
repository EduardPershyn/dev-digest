/* hooks/intent.ts — React Query hooks for the M3 intent layer
   (specs/M3-intent-layer.md): read a PR's stored intent and reclassify it
   (one synchronous model call on the server). */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { PrIntentRecord, PrIntentResponse } from "@devdigest/shared";

/* Query keys for the intent domain (L6). */
export const intentKeys = {
  detail: (prId: string | null | undefined) => ["pr-intent", prId] as const,
};

/** The stored intent of a PR (`{ intent: null }` until it is classified).
   Reading makes no GitHub or model call; `stale` is computed by the server. */
export function usePrIntent(prId: string | null | undefined) {
  return useQuery({
    queryKey: intentKeys.detail(prId),
    queryFn: () => api.get<PrIntentResponse>(`/pulls/${prId}/intent`),
    enabled: !!prId,
  });
}

/** Classify (or reclassify) the PR now. On success the returned record replaces
   the cached one; on failure the server has recorded `status: failed`, so the
   cached record is refetched to show it. */
export function useClassifyIntent(prId: string) {
  const qc = useQueryClient();
  const key = intentKeys.detail(prId);
  return useMutation({
    mutationFn: () => api.post<PrIntentRecord>(`/pulls/${prId}/intent/classify`),
    onSuccess: (record) => {
      qc.setQueryData<PrIntentResponse>(key, { intent: record });
    },
    onError: () => {
      qc.invalidateQueries({ queryKey: key });
    },
  });
}
