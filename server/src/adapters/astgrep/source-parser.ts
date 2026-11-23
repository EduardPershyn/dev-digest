/**
 * SourceParser adapter — the repo-intel `SourceParser` port implemented with
 * the ast-grep parser (symbols/references/imports/invocation heads) plus the
 * regex fact extractor (endpoints/crons). Wired in `platform/container.ts`;
 * the indexer and RepoIntelService never import these functions directly.
 *
 * Typing the object as `SourceParser` is the conformance check between this
 * adapter's own result types (ParsedSymbol extends ExtractedSymbol, …) and the
 * port's.
 */
import type { SourceParser } from '../../modules/repo-intel/ports.js';
import { extractCrons, extractEndpoints } from '../codeindex/extract.js';
import {
  langForFile,
  parseImports,
  parseInvocationHeads,
  parseReferences,
  parseSymbols,
} from './index.js';

export const astGrepSourceParser: SourceParser = {
  supports: (file) => langForFile(file) !== null,
  parseSymbols,
  parseReferences,
  parseImports,
  parseInvocationHeads,
  extractEndpoints,
  extractCrons,
};
