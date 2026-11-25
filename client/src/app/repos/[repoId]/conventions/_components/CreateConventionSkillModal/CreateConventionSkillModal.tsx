/* CreateConventionSkillModal — merge ACCEPTED conventions into one skill.
   The server builds the draft (it ignores anything not accepted); everything is
   editable here, and nothing is stored until "Create skill" sends the existing
   POST /skills with type 'convention' + source 'extracted' (disabled by default). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Checkbox, FormField, Modal, Textarea, TextInput, Toggle } from "@devdigest/ui";
import type { ConventionCandidate, Skill } from "@devdigest/shared";
import { useConventionSkillDraft } from "@/lib/hooks/conventions";
import { useCreateSkill } from "@/lib/hooks/skills";
import { ApiError } from "@/lib/api";
import { estimateTokens, skillNameError } from "@/lib/skills";
import { useToast } from "@/lib/toast";
import { MODAL_WIDTH } from "./constants";
import { s } from "./styles";

interface Fields {
  name: string;
  description: string;
  body: string;
}

export function CreateConventionSkillModal({
  repoId,
  repoFullName,
  accepted,
  onClose,
  onSaved,
}: {
  repoId: string;
  repoFullName: string;
  accepted: ConventionCandidate[];
  onClose: () => void;
  onSaved?: (skill: Skill) => void;
}) {
  const t = useTranslations("conventions");
  const toast = useToast();
  const draftMut = useConventionSkillDraft(repoId);
  const create = useCreateSkill();

  const [selected, setSelected] = React.useState<string[]>(() => accepted.map((c) => c.id));
  const [fields, setFields] = React.useState<Fields | null>(null);
  const [built, setBuilt] = React.useState<Fields | null>(null);
  const [enabled, setEnabled] = React.useState(false);

  // The last server-built draft, read inside mutation callbacks (no stale closure).
  const builtRef = React.useRef<Fields | null>(null);
  const { mutate: mutateDraft } = draftMut;

  const requestDraft = React.useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return;
      mutateDraft(
        { convention_ids: ids },
        {
          onSuccess: (d) => {
            const next = { name: d.name, description: d.description, body: d.body };
            const prevBuilt = builtRef.current;
            setFields((prev) => ({
              // keep a hand-edited name / description; the body follows the selection
              name: prev && prevBuilt && prev.name !== prevBuilt.name ? prev.name : next.name,
              description:
                prev && prevBuilt && prev.description !== prevBuilt.description
                  ? prev.description
                  : next.description,
              body: next.body,
            }));
            builtRef.current = next;
            setBuilt(next);
          },
        },
      );
    },
    [mutateDraft],
  );

  // First draft on open; later drafts follow checklist changes.
  const initialIds = React.useRef(selected);
  React.useEffect(() => {
    requestDraft(initialIds.current);
  }, [requestDraft]);

  const bodyEdited = !!fields && !!built && fields.body !== built.body;

  const toggle = (id: string, on: boolean) => {
    const next = on ? [...selected, id] : selected.filter((x) => x !== id);
    if (bodyEdited && !window.confirm(t("modal.rebuildConfirm"))) return;
    setSelected(next);
    requestDraft(next);
  };

  const patch = (p: Partial<Fields>) => setFields((f) => (f ? { ...f, ...p } : f));

  const nameErr = fields ? skillNameError(fields.name) : null;
  const saveErr = create.error instanceof ApiError ? create.error : null;
  const nameConflict = saveErr?.status === 409 ? saveErr.message : null;
  const otherSaveErr = saveErr && saveErr.status !== 409 ? saveErr.message : null;
  const canCreate =
    !!fields &&
    selected.length > 0 &&
    !nameErr &&
    !!fields.description.trim() &&
    !!fields.body.trim() &&
    !draftMut.isPending &&
    !create.isPending;

  const submit = () => {
    if (!fields || !canCreate) return;
    create.mutate(
      {
        name: fields.name,
        description: fields.description.trim(),
        type: "convention",
        source: "extracted",
        body: fields.body,
        enabled,
      },
      {
        onSuccess: (skill) => {
          toast.success(t("modal.saved", { name: skill.name }));
          onSaved?.(skill);
          onClose();
        },
      },
    );
  };

  return (
    <Modal
      width={MODAL_WIDTH}
      title={t("modal.title")}
      subtitle={t("modal.subtitle", { count: selected.length, repo: repoFullName })}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <span style={s.spacer} />
          <Button kind="secondary" size="sm" onClick={onClose}>
            {t("modal.cancel")}
          </Button>
          <Button kind="primary" size="sm" icon="Check" onClick={submit} disabled={!canCreate}>
            {create.isPending ? t("modal.creating") : t("modal.create")}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        <div style={s.listBox}>
          <div style={s.listTitle}>{t("modal.included")}</div>
          <div style={s.checklist}>
            {accepted.map((c) => (
              <Checkbox
                key={c.id}
                checked={selected.includes(c.id)}
                onChange={(on) => toggle(c.id, on)}
                label={c.rule}
              />
            ))}
          </div>
        </div>

        {draftMut.isError && (
          <span role="alert" style={s.error}>
            {t("modal.draftError")} {draftMut.error instanceof ApiError ? draftMut.error.message : ""}
          </span>
        )}
        {!fields && draftMut.isPending && <div style={s.muted}>{t("modal.loading")}</div>}

        {fields && (
          <>
            <div style={s.twoCol}>
              <FormField
                label={t("modal.name")}
                required
                hint={nameErr ? t(`modal.nameErrors.${nameErr}`) : t("modal.nameHint")}
              >
                <TextInput value={fields.name} onChange={(v) => patch({ name: v })} mono />
              </FormField>
              <FormField label={t("modal.type")}>
                <div style={s.typeChip}>
                  <Badge color="var(--ok)" bg="var(--ok-bg)">
                    convention
                  </Badge>
                </div>
              </FormField>
            </div>
            {nameConflict && (
              <span role="alert" style={s.error}>
                {nameConflict}
              </span>
            )}
            <FormField label={t("modal.description")} required>
              <Textarea value={fields.description} onChange={(v) => patch({ description: v })} rows={2} />
            </FormField>
            <div style={s.enabledRow}>
              <Toggle on={enabled} onChange={setEnabled} size={14} />
              <div>
                <div style={s.enabledLabel}>{t("modal.enabled")}</div>
                <div style={s.muted}>{t("modal.enabledHint")}</div>
              </div>
            </div>
            <div>
              <div style={s.bodyHead}>
                <span style={s.listTitle}>
                  {t("modal.body")} <span style={s.required}>*</span>
                </span>
                <span className="mono" style={s.muted}>
                  {fields.name || "skill"}.md
                </span>
                {bodyEdited && <span style={s.unsaved}>{t("modal.unsaved")}</span>}
                <span style={s.spacer} />
                <span className="tnum" style={s.muted}>
                  {t("modal.tokens", { count: estimateTokens(fields.body) })}
                </span>
              </div>
              <Textarea value={fields.body} onChange={(v) => patch({ body: v })} rows={14} mono />
            </div>
            {otherSaveErr && (
              <span role="alert" style={s.error}>
                {otherSaveErr}
              </span>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
