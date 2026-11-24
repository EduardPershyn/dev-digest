import { SKILL_IMPORT_EXTENSIONS, SKILL_IMPORT_MAX_BYTES } from "@devdigest/shared";

/** `accept` attribute for the file picker. */
export const ACCEPT = SKILL_IMPORT_EXTENSIONS.join(",");

/** Client-side size guard (the server enforces the same limit). */
export const MAX_BYTES = SKILL_IMPORT_MAX_BYTES;

/** Modal width (px). */
export const MODAL_WIDTH = 760;
