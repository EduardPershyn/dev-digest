import { z } from 'zod';
import { SkillType } from './knowledge.js';

/**
 * M2 — Skills in the product (spec: specs/M2-skills.md).
 *
 * A skill is TEXT ONLY: name, description, type, Markdown body. There is
 * deliberately no field for tools, scripts, hooks, a model or anything
 * executable, and the input schemas are `.strict()` so unknown keys (e.g.
 * `tools`, `allowed-tools`) are rejected instead of silently stored.
 *
 * This file is identical in server/src/vendor/shared and client/src/vendor/shared.
 */

/** Workspace-unique kebab-case slug; rendered as the prompt block's `name=` attribute. */
export const SKILL_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const SKILL_NAME_MAX = 64;
export const SKILL_DESCRIPTION_MAX = 500;
export const SKILL_BODY_MAX = 50_000;

export const SkillName = z
  .string()
  .min(1)
  .max(SKILL_NAME_MAX)
  .regex(SKILL_NAME_PATTERN, 'Use lowercase letters, digits and single hyphens (kebab-case)');
export type SkillName = z.infer<typeof SkillName>;

/** Sources a client may set when creating a skill. */
export const SkillInputSource = z.enum(['manual', 'imported_file']);
export type SkillInputSource = z.infer<typeof SkillInputSource>;

/** POST /skills body. */
export const SkillInput = z
  .object({
    name: SkillName,
    description: z.string().trim().min(1).max(SKILL_DESCRIPTION_MAX),
    type: SkillType,
    body: z.string().min(1).max(SKILL_BODY_MAX),
    enabled: z.boolean().optional(),
    source: SkillInputSource.optional(),
  })
  .strict();
export type SkillInput = z.infer<typeof SkillInput>;

/** PUT /skills/:id body — any subset; `source` is fixed at creation. */
export const SkillPatch = z
  .object({
    name: SkillName.optional(),
    description: z.string().trim().min(1).max(SKILL_DESCRIPTION_MAX).optional(),
    type: SkillType.optional(),
    body: z.string().min(1).max(SKILL_BODY_MAX).optional(),
    enabled: z.boolean().optional(),
  })
  .strict();
export type SkillPatch = z.infer<typeof SkillPatch>;

/** One immutable snapshot from `skill_versions` (Versions tab). */
export const SkillVersion = z.object({
  skill_id: z.string(),
  version: z.number().int(),
  name: z.string().nullish(),
  description: z.string().nullish(),
  type: SkillType.nullish(),
  body: z.string(),
  created_at: z.string(),
});
export type SkillVersion = z.infer<typeof SkillVersion>;

/** PUT /agents/:id/skills — the agent's full ordered link list (order = index). */
export const AgentSkillLinksInput = z
  .object({
    links: z.array(z.object({ skill_id: z.string().uuid(), enabled: z.boolean() }).strict()),
  })
  .strict();
export type AgentSkillLinksInput = z.infer<typeof AgentSkillLinksInput>;

// ---- Import (POST /skills/import/preview) ----------------------------------

/** Accepted upload extensions. Archives: .zip only. */
export const SKILL_IMPORT_EXTENSIONS = ['.md', '.markdown', '.zip'] as const;
/** Max upload size (bytes, before base64). */
export const SKILL_IMPORT_MAX_BYTES = 1_000_000;

export const SkillImportRequest = z
  .object({
    filename: z.string().min(1).max(255),
    content_base64: z.string().min(1),
  })
  .strict();
export type SkillImportRequest = z.infer<typeof SkillImportRequest>;

/** Why an archive entry was not imported. Nothing listed here is decompressed. */
export const SkillImportIgnoreReason = z.enum([
  'executable',
  'not-markdown',
  'extra-markdown',
  'unsafe-path',
  'too-large',
]);
export type SkillImportIgnoreReason = z.infer<typeof SkillImportIgnoreReason>;

export const SkillImportDraft = z.object({
  name: z.string(),
  description: z.string(),
  type: SkillType,
  body: z.string(),
});
export type SkillImportDraft = z.infer<typeof SkillImportDraft>;

/**
 * The stateless preview. Nothing is stored until the user confirms and the
 * client sends the (possibly edited) draft to POST /skills.
 */
export const SkillImportPreview = z.object({
  draft: SkillImportDraft,
  source_filename: z.string(),
  /** Path of the file the skill was extracted from (the upload itself for .md). */
  core_file: z.string(),
  body_tokens: z.number().int(),
  ignored: z.array(z.object({ path: z.string(), reason: SkillImportIgnoreReason })),
  /** Frontmatter keys that were dropped (anything but name/description/type). */
  dropped_frontmatter: z.array(z.string()),
  warnings: z.array(z.string()),
  name_conflict: z.boolean(),
});
export type SkillImportPreview = z.infer<typeof SkillImportPreview>;
