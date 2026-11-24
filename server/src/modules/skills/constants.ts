/** Constants for the skills module (M2, specs/M2-skills.md). */

/** Version recorded for a freshly created skill. */
export const INITIAL_SKILL_VERSION = 1;

// ---- import limits (checked on declared sizes BEFORE anything is inflated) ----

/** Max entries an archive may list. */
export const IMPORT_MAX_ENTRIES = 200;
/** Max total declared uncompressed size of all archive entries (zip-bomb guard). */
export const IMPORT_MAX_TOTAL_UNCOMPRESSED = 5 * 1024 * 1024;
/** Max size of the one Markdown file we do inflate (enforced while streaming too). */
export const IMPORT_MAX_CORE_FILE_BYTES = 256 * 1024;
/** Above this many body tokens the preview warns (the skill rides in every review). */
export const IMPORT_WARN_BODY_TOKENS = 8_000;

/** Markdown extensions a core skill file may have. */
export const MARKDOWN_EXTENSIONS = ['.md', '.markdown'] as const;

/**
 * Archive entries that are code / executables. They are listed in the preview as
 * "executable — not imported" and their bytes are never decompressed.
 */
export const EXECUTABLE_EXTENSIONS = [
  '.sh', '.bash', '.zsh', '.fish', '.ps1', '.psm1', '.bat', '.cmd', '.com',
  '.py', '.pyc', '.js', '.mjs', '.cjs', '.ts', '.mts', '.cts', '.jsx', '.tsx',
  '.rb', '.pl', '.php', '.lua', '.go', '.rs', '.java', '.class', '.jar',
  '.exe', '.dll', '.so', '.dylib', '.bin', '.wasm', '.app', '.msi', '.deb', '.rpm',
] as const;

/** Folders whose contents are treated as executable regardless of extension. */
export const EXECUTABLE_DIRS = ['scripts', 'bin', 'hooks', 'tools'] as const;

/** Frontmatter keys that map onto the skill. Every other key is dropped + reported. */
export const KEPT_FRONTMATTER_KEYS = ['name', 'description', 'type'] as const;

/** Core-file preference order inside an archive (case-insensitive basename). */
export const CORE_FILE_PREFERENCE = ['skill.md', 'readme.md'] as const;
