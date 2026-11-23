import type { GitClient } from '@devdigest/shared';
import type {
  CachedReferenceRow,
  CachedSymbolRow,
  FileRankRow,
  FullSymbolRow,
  IndexerEdgeRow,
  IndexerFileFactsRow,
  IndexerFileRankRow,
  IndexerReferenceRow,
  IndexerSymbolRow,
  IndexState,
  IndexStateUpsert,
  RepoBasics,
  RepoMapCandidateRow,
  ResolvedCallerRow,
} from './types.js';

/**
 * repo-intel application ports. The indexer pipeline and `RepoIntelService`
 * depend ONLY on these; implementations are wired in the composition root
 * (`platform/container.ts`):
 *   RepoIntelStore → RepoIntelRepository (./repository.ts, Drizzle)
 *   SourceParser   → astGrepSourceParser (adapters/astgrep/source-parser.ts)
 *   DepGraph       → DepCruiseGraph      (adapters/depgraph)
 *   Tokenizer      → TiktokenTokenizer   (adapters/tokenizer)
 */

// ---- Code parsing ------------------------------------------------------------

/** A declaration found in a source file. */
export interface ParsedSymbol {
  name: string;
  kind: string;
  /** 1-based start line. */
  line: number;
  /** True when the declaration is reached through an `export` form. */
  exported: boolean;
  /** Declaration head trimmed to MAX_SIGNATURE_CHARS; null for kinds without one. */
  signature: string | null;
  /** 1-based line of the closing token of the declaration body. */
  endLine: number;
}

/** A bare-identifier reference to a symbol. */
export interface ParsedReference {
  toSymbol: string;
  line: number;
  /** Path passed in by the caller — surfaced so consumers can fan-out. */
  refFile: string;
}

export interface ParsedImport {
  name: string;
  source: string;
  isType: boolean;
}

/** A bare identifier being invoked (callee, ctor, or JSX tag) — phantom-gate fuel. */
export interface ParsedInvocationHead {
  name: string;
  /** 1-based line of the invocation. */
  line: number;
  kind: 'call' | 'new' | 'jsx';
}

/** Source-code analysis (AST parse + regex fact extraction). Synchronous and side-effect free. */
export interface SourceParser {
  /** True when the AST parser handles this file's language. */
  supports(file: string): boolean;
  parseSymbols(file: string, source: string): ParsedSymbol[];
  parseReferences(file: string, source: string): ParsedReference[];
  parseImports(file: string, source: string): ParsedImport[];
  parseInvocationHeads(file: string, source: string): ParsedInvocationHead[];
  /** "METHOD /path" route declarations in the file. */
  extractEndpoints(source: string): string[];
  /** Cron expressions declared in the file. */
  extractCrons(source: string): string[];
}

// ---- Import graph + token counting ------------------------------------------

export interface FileEdge {
  from: string;
  to: string;
}

export interface DepGraph {
  /**
   * Resolve the local import edges among `files` (repo-relative) under `root`.
   * Never throws — returns `[]` on any failure.
   */
  buildEdges(root: string, files: string[]): Promise<FileEdge[]>;
}

/** Token counter for the repo-map budget search. Must never throw. */
export interface Tokenizer {
  count(text: string): number;
}

// ---- Persistence --------------------------------------------------------------

export interface RepoIntelStore {
  getRepoBasics(repoId: string): Promise<RepoBasics | null>;
  getCachedSymbols(repoId: string): Promise<CachedSymbolRow[]>;
  getCachedSymbolsForFiles(repoId: string, paths: string[]): Promise<CachedSymbolRow[]>;
  getCachedReferencesTo(repoId: string, toSymbols: string[]): Promise<CachedReferenceRow[]>;
  tryGetIndexState(repoId: string): Promise<IndexState | null>;
  deleteAllForRepo(repoId: string): Promise<void>;
  deleteForFiles(repoId: string, paths: string[]): Promise<void>;
  insertSymbols(rows: IndexerSymbolRow[]): Promise<void>;
  insertReferences(rows: IndexerReferenceRow[]): Promise<void>;
  upsertIndexState(state: IndexStateUpsert): Promise<void>;
  touchIndexState(repoId: string, stats?: Record<string, unknown>): Promise<void>;
  advanceSha(repoId: string, sha: string): Promise<void>;
  replaceEdges(repoId: string, edges: IndexerEdgeRow[]): Promise<void>;
  replaceFileRank(repoId: string, rows: IndexerFileRankRow[]): Promise<void>;
  replaceFileFacts(repoId: string, rows: IndexerFileFactsRow[]): Promise<void>;
  resolveReferences(repoId: string, opts: { reset: boolean }): Promise<void>;
  getEdges(repoId: string): Promise<IndexerEdgeRow[]>;
  getFileRankFor(repoId: string, paths: string[]): Promise<FileRankRow[]>;
  getRankedPaths(repoId: string, limit: number): Promise<Array<{ path: string; rank: number }>>;
  getRepoMapCandidates(repoId: string): Promise<RepoMapCandidateRow[]>;
  getSymbolRows(repoId: string, paths: string[]): Promise<FullSymbolRow[]>;
  getResolvedCallers(repoId: string, declFiles: string[], names: string[]): Promise<ResolvedCallerRow[]>;
  getFileFacts(repoId: string, files: string[]): Promise<IndexerFileFactsRow[]>;
  getRepoMapCache(
    repoId: string,
    commitSha: string,
    tokenBudget: number,
  ): Promise<{ mapText: string; tokenCount: number } | null>;
  putRepoMapCache(
    repoId: string,
    commitSha: string,
    tokenBudget: number,
    mapText: string,
    tokenCount: number,
  ): Promise<void>;
  deleteRepoMapCache(repoId: string): Promise<void>;
  patchFileFacts(repoId: string, files: string[], rows: IndexerFileFactsRow[]): Promise<void>;
}

// ---- Indexer pipeline deps ------------------------------------------------------

/** Everything the full/incremental indexer needs besides the store. */
export interface IndexerDeps {
  git: Pick<GitClient, 'currentHead' | 'diffNameOnly'>;
  depgraph: DepGraph;
  tokenizer: Tokenizer;
  parser: SourceParser;
}
