import { z } from 'zod';
import { ConventionCandidate, ConventionStatus } from './knowledge.js';
import { SkillName } from './skills.js';

/**
 * M2 — Conventions Extractor API (spec: specs/M2-conventions.md).
 * `ConventionCandidate` / `ConventionStatus` live in ./knowledge.ts.
 *
 * This file is identical in server/src/vendor/shared and client/src/vendor/shared.
 */

export const CONVENTION_RULE_MAX = 500;
export const CONVENTION_EXTRACTION_MAX = 15;

/** One candidate as the model returns it (schemaName 'ConventionExtraction'). */
export const ExtractedConvention = ConventionCandidate.pick({
  rule: true,
  evidence_path: true,
  evidence_snippet: true,
  confidence: true,
}).extend({ category: z.string() });
export type ExtractedConvention = z.infer<typeof ExtractedConvention>;

export const ConventionExtraction = z.object({
  conventions: z.array(ExtractedConvention).max(CONVENTION_EXTRACTION_MAX),
});
export type ConventionExtraction = z.infer<typeof ConventionExtraction>;

/** GET /repos/:id/conventions */
export const ConventionList = z.object({
  /** Ordered: pending, accepted, rejected; then confidence desc. */
  candidates: z.array(ConventionCandidate),
  /** Newest candidate's created_at; null → never scanned. */
  last_scan_at: z.string().nullable(),
});
export type ConventionList = z.infer<typeof ConventionList>;

/** POST /repos/:id/conventions/extract */
export const ConventionExtractResult = ConventionList.extend({
  stats: z.object({
    /** Files actually sent to the model (samples + configs). */
    sample_files: z.number().int(),
    /** Candidates the model returned. */
    proposed: z.number().int(),
    rejected_invalid_evidence: z.number().int(),
    skipped_duplicates: z.number().int(),
    kept: z.number().int(),
  }),
  usage: z.object({
    model: z.string(),
    tokens_in: z.number().int(),
    tokens_out: z.number().int(),
    cost_usd: z.number().nullable(),
  }),
});
export type ConventionExtractResult = z.infer<typeof ConventionExtractResult>;

/** PUT /repos/:id/conventions/:conventionId — evidence is never editable. */
export const ConventionPatch = z
  .object({
    status: ConventionStatus.optional(),
    rule: z.string().trim().min(1).max(CONVENTION_RULE_MAX).optional(),
  })
  .strict()
  .refine((p) => p.status !== undefined || p.rule !== undefined, {
    message: 'Provide status and/or rule',
  });
export type ConventionPatch = z.infer<typeof ConventionPatch>;

/** POST /repos/:id/conventions/skill-draft — stateless; stores nothing. */
export const ConventionSkillDraftRequest = z
  .object({
    /** Subset of accepted conventions; default = all accepted. Non-accepted ids are ignored. */
    convention_ids: z.array(z.string().uuid()).optional(),
  })
  .strict();
export type ConventionSkillDraftRequest = z.infer<typeof ConventionSkillDraftRequest>;

export const ConventionSkillDraft = z.object({
  name: SkillName,
  description: z.string(),
  type: z.literal('convention'),
  body: z.string(),
  /** The accepted ids actually merged into the body. */
  convention_ids: z.array(z.string()),
});
export type ConventionSkillDraft = z.infer<typeof ConventionSkillDraft>;
