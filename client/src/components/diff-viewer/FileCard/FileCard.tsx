/* FileCard — one collapsible file in the diff: header (path, findings dot,
   +/- stat, comment count) and, when open, its parsed lines plus any outdated
   comments and review findings outside the patch. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import type { PrFile } from "@/lib/types";
import { AUTO_EXPAND_MAX_LINES } from "../constants";
import { parsePatch, type Line } from "../helpers";
import {
  buildThreads,
  keysForLine,
  partitionThreads,
  type CommentThread,
  type DiffCommentApi,
} from "../comments";
import { type DiffFindingApi, findingKey, partitionFindings } from "../findings";
import { s, fs, chevronFor } from "../styles";
import { CodeLine } from "../CodeLine";
import { OutdatedComments } from "../OutdatedComments";
import { OutOfPatchFindings } from "../OutOfPatchFindings";

/** Threads anchored to a given parsed line (RIGHT=new, LEFT=old). */
function threadsForLine(ln: Line, matched: Map<string, CommentThread[]>): CommentThread[] {
  if (matched.size === 0) return [];
  const out: CommentThread[] = [];
  for (const key of keysForLine(ln)) {
    const list = matched.get(key);
    if (list) out.push(...list);
  }
  return out;
}

const NO_FINDINGS: FindingRecord[] = [];

/** Findings anchored to a parsed line (new side only, see `findingKey`). */
function findingsForLine(ln: Line, matched: Map<string, FindingRecord[]>): FindingRecord[] | undefined {
  if (matched.size === 0) return undefined;
  if ((ln.kind !== "add" && ln.kind !== "ctx") || ln.newNo == null) return undefined;
  const key = findingKey({ start_line: ln.newNo });
  return key ? matched.get(key) : undefined;
}

export function FileCard({
  file,
  commenting,
  findings,
}: {
  file: PrFile;
  commenting?: DiffCommentApi;
  findings?: DiffFindingApi;
}) {
  const t = useTranslations("shell");
  const [open, setOpen] = React.useState(
    (file.additions ?? 0) + (file.deletions ?? 0) <= AUTO_EXPAND_MAX_LINES
  );
  const lines = React.useMemo(() => parsePatch(file.patch), [file.patch]);

  // Group this file's comments into threads, then split into ones we can anchor
  // to a rendered line vs. "outdated" (GitHub dropped the line / it's not here).
  const renderedKeys = React.useMemo(() => {
    const keys = new Set<string>();
    for (const ln of lines) for (const k of keysForLine(ln)) keys.add(k);
    return keys;
  }, [lines]);

  const comments = commenting?.comments;
  const { matched, outdated } = React.useMemo(() => {
    if (!comments) return { matched: new Map<string, CommentThread[]>(), outdated: [] };
    const fileThreads = buildThreads(comments.filter((c) => c.path === file.path));
    return partitionThreads(fileThreads, renderedKeys);
  }, [comments, file.path, renderedKeys]);

  // Review findings on this file: anchored under `RIGHT:start_line`, or listed
  // at the end of the card when that line is not part of the patch.
  const allFindings = findings?.findings;
  const { matched: findingsByKey, outOfPatch } = React.useMemo(
    () =>
      partitionFindings(
        (allFindings ?? NO_FINDINGS).filter((f) => f.file === file.path),
        renderedKeys,
      ),
    [allFindings, file.path, renderedKeys],
  );
  const flagged = !!findings?.flaggedPaths.has(file.path);

  const commentCount = commenting
    ? commenting.comments.filter((c) => c.path === file.path).length
    : 0;

  return (
    <div style={s.fileCard}>
      <div onClick={() => setOpen((o) => !o)} style={s.fileHeader}>
        <Icon.ChevronRight size={13} style={chevronFor(open)} />
        <Icon.FileText size={14} style={s.fileIcon} />
        <span className="mono" style={s.filePath}>
          {file.path}
        </span>
        {flagged && findings && (
          <span
            role="img"
            aria-label={findings.labels.findingDot}
            title={findings.labels.findingDot}
            style={fs.dot}
          />
        )}
        <span className="mono tnum" style={s.fileStat}>
          <span style={s.addText}>+{file.additions}</span>{" "}
          <span style={s.delText}>−{file.deletions}</span>
        </span>
        {commentCount > 0 && (
          <span
            style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--text-muted)" }}
          >
            <Icon.MessageSquare size={12} />
            {commentCount}
          </span>
        )}
      </div>
      {open && (
        <div style={s.fileBody}>
          {lines.length === 0 ? (
            <div style={s.noDiff}>{t("diffViewer.noDiffText")}</div>
          ) : (
            lines.map((ln, i) => (
              <CodeLine
                key={i}
                ln={ln}
                path={file.path}
                threads={threadsForLine(ln, matched)}
                commenting={commenting}
                lineFindings={findingsForLine(ln, findingsByKey)}
                findings={findings}
              />
            ))
          )}
          {commenting && commenting.showComments && <OutdatedComments threads={outdated} />}
          {findings && findings.show && (
            <OutOfPatchFindings findings={outOfPatch} api={findings} />
          )}
        </div>
      )}
    </div>
  );
}
