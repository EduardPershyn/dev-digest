/* VersionDiff — what changed between two skill snapshots: changed metadata
   fields (name / description / type) and a line diff of the body, with
   unchanged runs folded. `from = null` compares against nothing (v1). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, SelectInput } from "@devdigest/ui";
import type { SkillVersion } from "@devdigest/shared";
import { changedFields, diffLines, diffStats, diffWords, withContext, type DiffLine } from "../../helpers";
import { INITIAL_VALUE } from "./constants";
import { s } from "./styles";

export function VersionDiff({
  versions,
  to,
  from,
  onFromChange,
}: {
  /** All snapshots (newest first) — the "compare with" options. */
  versions: SkillVersion[];
  to: SkillVersion;
  from: SkillVersion | null;
  onFromChange: (version: number | null) => void;
}) {
  const t = useTranslations("skills");
  const [expanded, setExpanded] = React.useState(false);

  const lines = React.useMemo(() => diffLines(from?.body ?? "", to.body), [from, to]);
  const fields = changedFields(from, to);
  const stats = diffStats(lines);
  const rows = expanded ? lines : withContext(lines);
  const hasFolds = rows.some((r) => r.kind === "skip");
  const bodyChanged = stats.added > 0 || stats.removed > 0;
  const unchanged = !bodyChanged && fields.length === 0;

  const options = [
    ...versions
      .filter((v) => v.version !== to.version)
      .map((v) => ({ value: String(v.version), label: `v${v.version}` })),
    { value: INITIAL_VALUE, label: t("editor.versions.diff.nothing") },
  ];

  return (
    <div style={s.wrap} role="region" aria-label={t("editor.versions.diff.label", { to: to.version })}>
      <div style={s.head}>
        <span style={s.headText}>{t("editor.versions.diff.compare")}</span>
        <div style={s.select}>
          <SelectInput
            value={from ? String(from.version) : INITIAL_VALUE}
            onChange={(v) => onFromChange(v === INITIAL_VALUE ? null : Number(v))}
            options={options}
          />
        </div>
        <span className="mono" style={s.headText}>
          → v{to.version}
        </span>
        <span className="mono" style={s.stats}>
          {bodyChanged ? (
            <>
              <span style={s.added}>+{stats.added}</span> <span style={s.removed}>−{stats.removed}</span>
            </>
          ) : (
            !unchanged && t("editor.versions.diff.bodyUnchanged")
          )}
        </span>
        {bodyChanged && (hasFolds || expanded) ? (
          <Button kind="ghost" size="sm" onClick={() => setExpanded((e) => !e)}>
            {expanded ? t("editor.versions.diff.collapse") : t("editor.versions.diff.expand")}
          </Button>
        ) : null}
      </div>

      {unchanged ? (
        <p style={s.empty}>{t("editor.versions.diff.noChanges")}</p>
      ) : (
        <>
          {fields.length > 0 && (
            <div style={s.fields}>
              {fields.map((f) => (
                <div key={f.field} style={s.fieldRow}>
                  <Badge>{t(`editor.versions.diff.fields.${f.field}`)}</Badge>
                  <FieldValues before={f.before} after={f.after} />
                </div>
              ))}
            </div>
          )}
          {bodyChanged && (
            <div className="mono" style={s.code} aria-label={t("editor.versions.diff.body")} role="group">
              {rows.map((r, i) =>
                r.kind === "skip" ? (
                  <div key={`skip-${i}`} style={s.skip}>
                    {t("editor.versions.diff.unchanged", { count: r.count })}
                  </div>
                ) : (
                  <Line key={`${r.oldNo}-${r.newNo}-${i}`} line={r} />
                ),
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

const MARK: Record<DiffLine["kind"], string> = { same: " ", add: "+", del: "−" };

function Line({ line }: { line: DiffLine }) {
  return (
    <div style={s.line(line.kind)} data-kind={line.kind}>
      <span style={s.no}>{line.oldNo ?? ""}</span>
      <span style={s.no}>{line.newNo ?? ""}</span>
      <span style={s.mark(line.kind)}>{MARK[line.kind]}</span>
      <span style={s.text}>{line.text || " "}</span>
    </div>
  );
}

/** Old value above the new one; only the words that changed are highlighted. */
function FieldValues({ before, after }: { before: string; after: string }) {
  const words = React.useMemo(() => diffWords(before, after), [before, after]);
  return (
    <div style={s.fieldValues}>
      <div style={s.fieldBefore} data-side="before">
        <span style={s.fieldMark}>−</span>
        {words
          .filter((w) => w.kind !== "add")
          .map((w, i) => (w.kind === "del" ? <del key={i} style={s.wordDel}>{w.text}</del> : <span key={i}>{w.text}</span>))}
      </div>
      <div style={s.fieldAfter} data-side="after">
        <span style={s.fieldMark}>+</span>
        {words
          .filter((w) => w.kind !== "del")
          .map((w, i) => (w.kind === "add" ? <ins key={i} style={s.wordAdd}>{w.text}</ins> : <span key={i}>{w.text}</span>))}
      </div>
    </div>
  );
}
