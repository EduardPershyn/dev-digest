/**
 * M2 — Conventions Extractor limits (specs/M2-conventions.md). Domain ring.
 */

/** Ranked source files taken from `repoIntel.getConventionSamples`. */
export const SAMPLE_COUNT = 12;
/** Config files (ESLint / TS / Prettier / EditorConfig) added before the samples. */
export const MAX_CONFIG_FILES = 6;
/** Per-file cut (on a line boundary). Lines past the cut are not citable. */
export const MAX_FILE_CHARS = 8_000;
/** Total file text sent to the model in one extraction. */
export const MAX_INPUT_CHARS = 80_000;
/** Max candidates the model may return (mirrors `CONVENTION_EXTRACTION_MAX`). */
export const MAX_CANDIDATES = 15;
/** Already-decided rules listed as "do not repeat". */
export const MAX_DECIDED_RULES = 40;

/** Evidence snippet bounds (validation). */
export const MIN_SNIPPET_CHARS = 10;
export const MAX_SNIPPET_LINES = 30;

/** Category label cap (the model is asked for 1–3 words). */
export const MAX_CATEGORY_CHARS = 40;

/** Skill draft: snippet lines per rule, and the base name. */
export const DRAFT_SNIPPET_LINES = 8;
export const DRAFT_BASE_NAME = 'repo-conventions';
export const DRAFT_FALLBACK_CATEGORY = 'general';

/** Model call settings: ONE call, no repair re-prompts. */
export const EXTRACTION_TEMPERATURE = 0.2;
export const EXTRACTION_TIMEOUT_MS = 120_000;
export const EXTRACTION_SCHEMA_NAME = 'ConventionExtraction';

/** Prompt template (src/prompts). */
export const SYSTEM_PROMPT_TEMPLATE = 'conventions.system.md';

/** Directories never scanned for config files (one level below the root). */
export const CONFIG_SCAN_SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  'out',
  'coverage',
  'vendor',
  'target',
]);
