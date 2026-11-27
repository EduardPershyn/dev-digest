/* CodeLine — one rendered diff line: gutter number, +/- sign, text, plus the
   hover "+" affordance, any anchored comment threads, and an inline composer.
   M3: a line with review findings gets a severity strip + right-aligned label,
   and the finding cards render under it (caller-provided Card slot). */
"use client";

import React from "react";
import { Icon, SEV } from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import { commentTargetFor, type CommentThread, type DiffCommentApi, cs } from "../comments";
import { type Line } from "../helpers";
import { type DiffFindingApi, lineMark } from "../findings";
import { s, fs, lineRowFor, lineSignFor, findingStripFor } from "../styles";
import { CommentThreadView } from "../CommentThreadView";
import { InlineComposer } from "../InlineComposer";

export function CodeLine({
  ln,
  path,
  threads,
  commenting,
  lineFindings,
  findings,
}: {
  ln: Line;
  path: string;
  threads: CommentThread[];
  commenting?: DiffCommentApi;
  /** Review findings anchored to this line (dismissed included). */
  lineFindings?: FindingRecord[];
  findings?: DiffFindingApi;
}) {
  const [hover, setHover] = React.useState(false);
  const [composing, setComposing] = React.useState(false);

  if (ln.kind === "hunk") {
    return (
      <div className="mono" style={s.hunk}>
        {ln.text}
      </div>
    );
  }

  const sign = ln.kind === "add" ? "+" : ln.kind === "del" ? "−" : "";
  const target = commenting?.canComment ? commentTargetFor(ln) : null;
  const showAdd = hover && !!target && !composing;
  const showFindings = !!findings?.show && !!lineFindings && lineFindings.length > 0;
  const mark = showFindings ? lineMark(lineFindings!) : null;
  const MarkIcon = mark ? Icon[SEV[mark].icon] : null;

  return (
    <div
      style={cs.rowWrap}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div
        style={mark ? { ...lineRowFor(ln.kind), ...findingStripFor(SEV[mark].c) } : lineRowFor(ln.kind)}
        data-finding-mark={mark ?? undefined}
      >
        <span className="mono tnum" style={{ ...s.lineNo, position: "relative" }}>
          {showAdd && target && (
            <button
              type="button"
              title="Add a comment on this line"
              aria-label="Add a comment on this line"
              onClick={() => setComposing(true)}
              style={cs.addBtn}
            >
              +
            </button>
          )}
          {ln.newNo ?? ln.oldNo ?? ""}
        </span>
        <span className="mono" style={lineSignFor(ln.kind)}>
          {sign}
        </span>
        <span className="mono" style={s.lineText}>
          {ln.text || " "}
        </span>
        {mark && MarkIcon && findings && (
          <span style={{ ...fs.label, color: SEV[mark].c }}>
            <MarkIcon size={12} />
            {findings.labels.severity[mark]}
          </span>
        )}
      </div>

      {showFindings && findings && (
        <div style={cs.thread}>
          {lineFindings!.map((f) => (
            <findings.Card
              key={f.id}
              f={f}
              defaultExpanded
              pending={findings.pendingId === f.id}
              onAction={(a) => findings.onAction(f, a)}
            />
          ))}
        </div>
      )}

      {commenting &&
        commenting.showComments &&
        threads.map((th) => (
          <CommentThreadView key={th.rootId} thread={th} commenting={commenting} path={path} />
        ))}

      {commenting && composing && target && (
        <InlineComposer
          commenting={commenting}
          path={path}
          line={target.line}
          side={target.side}
          onClose={() => setComposing(false)}
        />
      )}
    </div>
  );
}
