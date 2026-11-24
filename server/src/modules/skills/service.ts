import type {
  Skill,
  SkillImportPreview,
  SkillImportRequest,
  SkillInput,
  SkillPatch,
  SkillVersion,
} from '@devdigest/shared';
import { SKILL_IMPORT_MAX_BYTES } from '@devdigest/shared';
import { renderSkillBlock } from '@devdigest/reviewer-core';
import { ConflictError, ValidationError } from '../../platform/errors.js';
import {
  IMPORT_MAX_CORE_FILE_BYTES,
  IMPORT_MAX_ENTRIES,
  IMPORT_MAX_TOTAL_UNCOMPRESSED,
  IMPORT_WARN_BODY_TOKENS,
} from './constants.js';
import { toSkillDto, toSkillVersionDto } from './helpers.js';
import {
  bodyWarnings,
  extractSkill,
  isMarkdownPath,
  selectCoreFile,
  type IgnoredEntry,
} from './import-parser.js';
import type { ArchiveReader, SkillStore, TokenCounter } from './ports.js';

/**
 * M2 — skills use cases: the workspace skill library (CRUD + versions) and the
 * stateless import preview. A skill is text only; nothing here executes,
 * fetches or writes files.
 */

export interface SkillsServiceDeps {
  store: SkillStore;
  archive: ArchiveReader;
  tokens: TokenCounter;
}

export interface SkillDetail extends Skill {
  agents: { id: string; name: string }[];
  /** Exactly the block this skill adds to a prompt (same renderer as reviews). */
  prompt_block: string;
}

export class SkillsService {
  constructor(private readonly deps: SkillsServiceDeps) {}

  async list(workspaceId: string): Promise<Skill[]> {
    const [rows, counts] = await Promise.all([
      this.deps.store.list(workspaceId),
      this.deps.store.agentCounts(workspaceId),
    ]);
    return rows.map((r) => toSkillDto(r, counts.get(r.id) ?? 0));
  }

  async get(workspaceId: string, id: string): Promise<SkillDetail | undefined> {
    const row = await this.deps.store.getById(workspaceId, id);
    if (!row) return undefined;
    const agents = await this.deps.store.agentsUsing(row.id);
    const prompt_block = renderSkillBlock({
      id: row.id,
      name: row.name,
      version: row.version,
      type: row.type,
      source: row.source,
      description: row.description,
      body: row.body,
    });
    return { ...toSkillDto(row, agents.length), agents, prompt_block };
  }

  async create(workspaceId: string, input: SkillInput): Promise<Skill> {
    await this.assertNameFree(workspaceId, input.name);
    const source = input.source ?? 'manual';
    const row = await this.deps.store.insert({
      workspaceId,
      name: input.name,
      description: input.description,
      type: input.type,
      source,
      body: input.body,
      // Third-party instructions land disabled unless the user said otherwise.
      enabled: input.enabled ?? source === 'manual',
    });
    return toSkillDto(row, 0);
  }

  async update(workspaceId: string, id: string, patch: SkillPatch): Promise<Skill | undefined> {
    if (patch.name !== undefined) await this.assertNameFree(workspaceId, patch.name, id);
    const row = await this.deps.store.update(workspaceId, id, patch);
    if (!row) return undefined;
    const counts = await this.deps.store.agentCounts(workspaceId);
    return toSkillDto(row, counts.get(row.id) ?? 0);
  }

  async delete(workspaceId: string, id: string): Promise<boolean> {
    return this.deps.store.deleteById(workspaceId, id);
  }

  async listVersions(workspaceId: string, id: string): Promise<SkillVersion[] | undefined> {
    const skill = await this.deps.store.getById(workspaceId, id);
    if (!skill) return undefined;
    const rows = await this.deps.store.listVersions(id);
    return rows.map(toSkillVersionDto);
  }

  /**
   * Parse an upload into an editable draft. STATELESS: stores nothing — the
   * user confirms by sending the draft to `create` with source `imported_file`.
   */
  async previewImport(
    workspaceId: string,
    req: SkillImportRequest,
  ): Promise<SkillImportPreview> {
    const filename = req.filename.split(/[\\/]/).pop() ?? req.filename;
    const bytes = Buffer.from(req.content_base64, 'base64');
    if (bytes.length === 0) throw new ValidationError('The uploaded file is empty');
    if (bytes.length > SKILL_IMPORT_MAX_BYTES) {
      throw new ValidationError(`File too large (max ${SKILL_IMPORT_MAX_BYTES} bytes)`);
    }

    let markdown: string;
    let coreFile = filename;
    let ignored: IgnoredEntry[] = [];

    if (isMarkdownPath(filename)) {
      if (bytes.length > IMPORT_MAX_CORE_FILE_BYTES) {
        throw new ValidationError(`Markdown file too large (max ${IMPORT_MAX_CORE_FILE_BYTES} bytes)`);
      }
      markdown = bytes.toString('utf8');
    } else if (filename.toLowerCase().endsWith('.zip')) {
      ({ markdown, coreFile, ignored } = this.readArchive(bytes));
    } else {
      throw new ValidationError('Unsupported file type — upload a .md file or a .zip archive');
    }

    const { draft, droppedFrontmatter } = extractSkill(markdown, coreFile);
    if (!draft.body) throw new ValidationError(`"${coreFile}" has no Markdown body to import`);

    const bodyTokens = this.deps.tokens.count(draft.body);
    const warnings = bodyWarnings(draft.body, ignored);
    if (droppedFrontmatter.length > 0) {
      warnings.unshift(
        `Dropped frontmatter: ${droppedFrontmatter.join(', ')} — skills cannot use tools, ` +
          'scripts or other capabilities.',
      );
    }
    if (bodyTokens > IMPORT_WARN_BODY_TOKENS) {
      warnings.push(`The body is ~${bodyTokens} tokens; it will be added to every review.`);
    }
    if (!draft.description) warnings.push('No description found — write one before saving.');

    const nameConflict = (await this.deps.store.getByName(workspaceId, draft.name)) !== undefined;

    return {
      draft,
      source_filename: filename,
      core_file: coreFile,
      body_tokens: bodyTokens,
      ignored,
      dropped_frontmatter: droppedFrontmatter,
      warnings,
      name_conflict: nameConflict,
    };
  }

  private readArchive(bytes: Uint8Array): {
    markdown: string;
    coreFile: string;
    ignored: IgnoredEntry[];
  } {
    let entries;
    try {
      entries = this.deps.archive.list(bytes);
    } catch (err) {
      throw new ValidationError(`Could not read the archive: ${(err as Error).message}`);
    }
    if (entries.length > IMPORT_MAX_ENTRIES) {
      throw new ValidationError(`Archive has too many entries (max ${IMPORT_MAX_ENTRIES})`);
    }
    const declared = entries.reduce((n, e) => n + e.size, 0);
    if (declared > IMPORT_MAX_TOTAL_UNCOMPRESSED) {
      throw new ValidationError('Archive is too large when uncompressed');
    }

    const { core, ignored } = selectCoreFile(entries);
    if (!core) {
      const tooLarge = ignored.find((e) => e.reason === 'too-large');
      throw new ValidationError(
        tooLarge
          ? `"${tooLarge.path}" is too large to import (max ${IMPORT_MAX_CORE_FILE_BYTES} bytes)`
          : 'No skill Markdown found in the archive (expected SKILL.md, README.md or a single .md file)',
        { entries: entries.map((e) => e.path).slice(0, 50) },
      );
    }

    try {
      const markdown = this.deps.archive.readText(bytes, core.path, IMPORT_MAX_CORE_FILE_BYTES);
      return { markdown, coreFile: core.path, ignored };
    } catch (err) {
      throw new ValidationError(`Could not read "${core.path}": ${(err as Error).message}`);
    }
  }

  private async assertNameFree(workspaceId: string, name: string, selfId?: string) {
    const existing = await this.deps.store.getByName(workspaceId, name);
    if (existing && existing.id !== selfId) {
      throw new ConflictError(`A skill named "${name}" already exists`);
    }
  }
}
