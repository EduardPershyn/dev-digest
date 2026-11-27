import { z } from 'zod';

/**
 * PR Brief building blocks: Intent, Blast radius, Risks, PR History,
 * Smart Diff. Composed into PrBrief.
 */

// ---- Intent ----
/** Caps shared by the classifier output and the persisted record. */
const IntentScopeList = z.array(z.string().max(200)).max(10);

export const Intent = z.object({
  /** What the PR changes and why, in at most 3 sentences. */
  summary: z.string().max(600),
  /** Functional areas / files the PR deliberately changes. */
  in_scope: IntentScopeList,
  /** Functional areas / files the PR deliberately leaves alone. */
  out_of_scope: IntentScopeList,
});
export type Intent = z.infer<typeof Intent>;

export const IntentConfidence = z.enum(['high', 'medium', 'low']);
export type IntentConfidence = z.infer<typeof IntentConfidence>;

export const IntentSourceKind = z.enum([
  'pr_title',
  'pr_body',
  'issue',
  'pr',
  'file',
  'changed_files',
]);
export type IntentSourceKind = z.infer<typeof IntentSourceKind>;

/** One input the classifier actually read (no content, only its size). */
export const IntentSource = z.object({
  kind: IntentSourceKind,
  /** `#12`, a repo path, or the kind itself for title/body/changed files. */
  ref: z.string(),
  title: z.string().nullish(),
  chars: z.number().int(),
  truncated: z.boolean(),
  status: z.enum(['used', 'empty']),
});
export type IntentSource = z.infer<typeof IntentSource>;

/** A linked document the classifier could NOT read; adds no text to the prompt. */
export const IntentMissingContext = z.object({
  /** Query string and fragment stripped. */
  url: z.string(),
  kind: z.enum(['external', 'cross_repo', 'issue', 'pr', 'file']),
  reason: z.enum([
    'unsupported_host',
    'cross_repo',
    'not_found',
    'forbidden',
    'github_unavailable',
    'too_large',
    'binary',
    'limit',
  ]),
});
export type IntentMissingContext = z.infer<typeof IntentMissingContext>;

/** LLM output of the intent classifier (strict-json-schema friendly). */
export const IntentClassification = Intent.extend({
  confidence: IntentConfidence,
});
export type IntentClassification = z.infer<typeof IntentClassification>;

// ---- Blast radius ----
export const ChangedSymbol = z.object({
  name: z.string(),
  file: z.string(),
  kind: z.string(),
});
export type ChangedSymbol = z.infer<typeof ChangedSymbol>;

export const BlastCaller = z.object({
  name: z.string(),
  file: z.string(),
  line: z.number().int(),
});
export type BlastCaller = z.infer<typeof BlastCaller>;

export const DownstreamImpact = z.object({
  symbol: z.string(),
  callers: z.array(BlastCaller),
  endpoints_affected: z.array(z.string()),
  crons_affected: z.array(z.string()),
});
export type DownstreamImpact = z.infer<typeof DownstreamImpact>;

export const BlastRadius = z.object({
  changed_symbols: z.array(ChangedSymbol),
  downstream: z.array(DownstreamImpact),
  summary: z.string(),
});
export type BlastRadius = z.infer<typeof BlastRadius>;

// ---- Risks ----
export const RiskSeverity = z.enum(['high', 'medium', 'low']);
export type RiskSeverity = z.infer<typeof RiskSeverity>;

export const Risk = z.object({
  kind: z.string(),
  title: z.string(),
  explanation: z.string(),
  severity: RiskSeverity,
  file_refs: z.array(z.string()),
});
export type Risk = z.infer<typeof Risk>;

export const Risks = z.object({
  risks: z.array(Risk),
});
export type Risks = z.infer<typeof Risks>;

// ---- PR History ----
export const PrHistoryItem = z.object({
  pr_number: z.number().int(),
  title: z.string(),
  merged_at: z.string(),
  author: z.string(),
  files_overlap: z.array(z.string()),
  notes: z.string(),
});
export type PrHistoryItem = z.infer<typeof PrHistoryItem>;

export const PrHistory = z.object({
  history: z.array(PrHistoryItem),
});
export type PrHistory = z.infer<typeof PrHistory>;

// ---- Smart Diff ----
export const SmartDiffRole = z.enum(['core', 'tests', 'wiring', 'docs', 'boilerplate']);
export type SmartDiffRole = z.infer<typeof SmartDiffRole>;

export const SmartDiffFile = z.object({
  path: z.string(),
  pseudocode_summary: z.string().nullish(),
  additions: z.number().int(),
  deletions: z.number().int(),
  finding_lines: z.array(z.number().int()),
});
export type SmartDiffFile = z.infer<typeof SmartDiffFile>;

export const SmartDiffGroup = z.object({
  role: SmartDiffRole,
  files: z.array(SmartDiffFile),
});
export type SmartDiffGroup = z.infer<typeof SmartDiffGroup>;

export const ProposedSplit = z.object({
  name: z.string(),
  files: z.array(z.string()),
});
export type ProposedSplit = z.infer<typeof ProposedSplit>;

export const SmartDiff = z.object({
  groups: z.array(SmartDiffGroup),
  split_suggestion: z.object({
    too_big: z.boolean(),
    total_lines: z.number().int(),
    proposed_splits: z.array(ProposedSplit),
  }),
});
export type SmartDiff = z.infer<typeof SmartDiff>;

// ---- Composed PR Brief (pr_brief.json) ----
export const PrBrief = z.object({
  intent: Intent,
  blast: BlastRadius,
  risks: Risks,
  history: PrHistory,
});
export type PrBrief = z.infer<typeof PrBrief>;
