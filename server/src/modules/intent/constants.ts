/**
 * M3 — Intent layer limits and model-call settings (specs/M3-intent-layer.md).
 * Domain ring.
 */

/** Bumped whenever the classifier prompt or inputs change; part of the input hash. */
export const CLASSIFIER_VERSION = 'intent-v1';
export const INTENT_SCHEMA_NAME = 'IntentClassification';

/** ONE model call, deterministic, no repair re-prompts. */
export const INTENT_TEMPERATURE = 0;
export const INTENT_TIMEOUT_MS = 60_000;
export const INTENT_MAX_RETRIES = 0;

/** Prompt template (src/prompts). */
export const SYSTEM_PROMPT_TEMPLATE = 'intent.system.md';

/** A body shorter than this (after trim) caps confidence at `low`. */
export const MIN_BODY_CHARS = 40;

/** Input caps (Data sources table in the spec). */
export const MAX_TITLE_CHARS = 300;
export const MAX_BODY_CHARS = 4_000;
export const MAX_DOC_CHARS = 6_000;
export const MAX_TOTAL_DOC_CHARS = 20_000;
export const MAX_REFS = 10;
export const MAX_MISSING = 10;
export const MAX_CHANGED_FILES = 300;
export const MAX_HEADERS_PER_FILE = 5;
export const MAX_HEADER_CHARS = 160;
/** Missing-context URLs are cut to this length. */
export const MAX_URL_CHARS = 300;
/** Stored / returned error messages are cut to this length. */
export const MAX_ERROR_CHARS = 500;

/** File extensions treated as images (never a reference, never missing). */
export const IMAGE_EXTENSIONS = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'svg',
  'webp',
  'bmp',
  'ico',
  'avif',
]);
