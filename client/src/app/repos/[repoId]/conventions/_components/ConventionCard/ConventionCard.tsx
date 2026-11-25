/* ConventionCard — one extracted convention: rule (inline-editable), category +
   status chips, verbatim evidence with a GitHub link at the cited lines,
   confidence bar, and Accept / Reject toggles (clicking the active one returns
   the card to pending). Evidence is never editable. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Icon, IconBtn, Textarea } from "@devdigest/ui";
import type { ConventionCandidate, ConventionPatch } from "@devdigest/shared";
import { confidenceColor, confidencePct, evidenceLabel, nextStatus } from "@/lib/conventions";
import { useToast } from "@/lib/toast";
import { s } from "./styles";

export function ConventionCard({
  convention: c,
  onChange,
  disabled,
}: {
  convention: ConventionCandidate;
  onChange: (patch: ConventionPatch) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("conventions");
  const toast = useToast();
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(c.rule);

  const pct = confidencePct(c.confidence);
  const label = evidenceLabel(c);
  const canSave = draft.trim().length > 0 && draft.trim() !== c.rule;

  const startEdit = () => {
    setDraft(c.rule);
    setEditing(true);
  };
  const save = () => {
    if (!canSave) return;
    onChange({ rule: draft.trim() });
    setEditing(false);
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(c.evidence_snippet);
      toast.success(t("card.copied"));
    } catch {
      /* clipboard unavailable — nothing to do */
    }
  };

  return (
    <article style={s.card(c.status)} aria-label={c.rule} data-status={c.status}>
      <div style={s.head}>
        {editing ? (
          <div
            style={s.editBox}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                save();
              } else if (e.key === "Escape") {
                setEditing(false);
              }
            }}
          >
            <Textarea value={draft} onChange={setDraft} rows={2} />
            <div style={s.editActions}>
              <Button kind="ghost" size="sm" onClick={() => setEditing(false)}>
                {t("card.cancel")}
              </Button>
              <Button kind="primary" size="sm" icon="Check" onClick={save} disabled={!canSave}>
                {t("card.save")}
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div style={s.rule}>{c.rule}</div>
            <IconBtn icon="Edit" label={t("card.edit")} size={26} onClick={startEdit} />
          </>
        )}
      </div>

      <div style={s.chips}>
        {c.category && <Badge>{c.category}</Badge>}
        {c.status === "accepted" && (
          <Badge color="var(--ok)" bg="var(--ok-bg)" icon="Check">
            {t("card.accepted")}
          </Badge>
        )}
        {c.status === "rejected" && (
          <Badge color="var(--text-muted)" icon="X">
            {t("card.rejected")}
          </Badge>
        )}
      </div>

      <div style={s.evidence}>
        <div style={s.evidenceHead}>
          {c.evidence_url ? (
            <a
              className="mono"
              href={c.evidence_url}
              target="_blank"
              rel="noopener noreferrer"
              style={s.evidenceLink}
              title={t("card.openOnGithub")}
            >
              {label}
              <Icon.ExternalLink size={12} />
            </a>
          ) : (
            <span className="mono">{label}</span>
          )}
          <span style={s.spacer} />
          <IconBtn icon="Copy" label={t("card.copy")} size={24} onClick={() => void copy()} />
        </div>
        <pre className="mono" style={s.pre}>
          {c.evidence_snippet}
        </pre>
      </div>

      <div style={s.foot}>
        <span style={s.confLabel}>{t("card.confidence")}</span>
        <div style={s.bar} aria-hidden>
          <div style={s.barFill(pct, confidenceColor(pct))} />
        </div>
        <span className="tnum" style={{ ...s.pct, color: confidenceColor(pct) }}>
          {pct}%
        </span>
        <div style={s.actions}>
          <Button
            kind={c.status === "rejected" ? "secondary" : "ghost"}
            size="sm"
            icon="X"
            active={c.status === "rejected"}
            aria-pressed={c.status === "rejected"}
            disabled={disabled}
            onClick={() => onChange({ status: nextStatus(c.status, "rejected") })}
          >
            {t("card.reject")}
          </Button>
          <Button
            kind={c.status === "accepted" ? "primary" : "secondary"}
            size="sm"
            icon="Check"
            active={c.status === "accepted"}
            aria-pressed={c.status === "accepted"}
            disabled={disabled}
            onClick={() => onChange({ status: nextStatus(c.status, "accepted") })}
          >
            {t("card.accept")}
          </Button>
        </div>
      </div>
    </article>
  );
}
