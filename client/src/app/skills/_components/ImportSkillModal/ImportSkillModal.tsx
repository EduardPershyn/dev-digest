/* ImportSkillModal — upload a .md / .zip → server preview (stores nothing) →
   review + edit the extracted draft → explicit confirmation → save.
   Importing a third-party skill puts someone else's instructions into the
   agent's prompt, so the trust notice is shown up front and the save button
   stays disabled until the user ticks the confirmation. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import {
  Button,
  Checkbox,
  FormField,
  Icon,
  Markdown,
  Modal,
  SelectInput,
  Textarea,
  TextInput,
} from "@devdigest/ui";
import type { Skill, SkillImportDraft, SkillImportPreview, SkillType } from "@devdigest/shared";
import { useCreateSkill, useImportSkillPreview } from "@/lib/hooks/skills";
import { ApiError } from "@/lib/api";
import { SKILL_TYPES, fileToBase64, skillNameError } from "@/lib/skills";
import { useToast } from "@/lib/toast";
import { ACCEPT, MAX_BYTES, MODAL_WIDTH } from "./constants";
import { s } from "./styles";

export function ImportSkillModal({ onClose, onSaved }: { onClose: () => void; onSaved?: (skill: Skill) => void }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const previewMut = useImportSkillPreview();
  const create = useCreateSkill();
  const inputRef = React.useRef<HTMLInputElement>(null);

  const [fileError, setFileError] = React.useState<string | null>(null);
  const [preview, setPreview] = React.useState<SkillImportPreview | null>(null);
  const [draft, setDraft] = React.useState<SkillImportDraft | null>(null);
  const [confirmed, setConfirmed] = React.useState(false);
  const [enableNow, setEnableNow] = React.useState(false);
  const [showRaw, setShowRaw] = React.useState(false);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setFileError(null);
    if (file.size > MAX_BYTES) {
      setFileError(t("import.tooLarge"));
      return;
    }
    const content_base64 = await fileToBase64(file);
    previewMut.mutate(
      { filename: file.name, content_base64 },
      {
        onSuccess: (p) => {
          setPreview(p);
          setDraft(p.draft);
          setConfirmed(false);
        },
        onError: (e) => setFileError(e instanceof ApiError ? e.message : String(e)),
      },
    );
  };

  const reset = () => {
    setPreview(null);
    setDraft(null);
    setConfirmed(false);
    setFileError(null);
    create.reset();
    if (inputRef.current) inputRef.current.value = "";
  };

  const patch = (p: Partial<SkillImportDraft>) => setDraft((d) => (d ? { ...d, ...p } : d));

  const nameErr = draft ? skillNameError(draft.name) : null;
  const conflict = !!preview?.name_conflict && draft?.name === preview.draft.name;
  const saveError = create.error instanceof ApiError ? create.error.message : null;
  const canSave =
    !!draft && confirmed && !nameErr && !conflict && !!draft.description.trim() && !!draft.body.trim() && !create.isPending;

  const save = () => {
    if (!draft || !canSave) return;
    create.mutate(
      { ...draft, description: draft.description.trim(), source: "imported_file", enabled: enableNow },
      {
        onSuccess: (skill) => {
          toast.success(t("import.savedToast", { name: skill.name, enabled: String(skill.enabled) }));
          onSaved?.(skill);
          onClose();
        },
      },
    );
  };

  return (
    <Modal
      width={MODAL_WIDTH}
      title={t("import.title")}
      subtitle={t("import.subtitle")}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          {preview && (
            <Button kind="ghost" size="sm" icon="ChevronLeft" onClick={reset}>
              {t("import.back")}
            </Button>
          )}
          <span style={s.spacer} />
          <Button kind="secondary" size="sm" onClick={onClose}>
            {t("import.cancel")}
          </Button>
          {preview && (
            <Button kind="primary" size="sm" icon="Check" onClick={save} disabled={!canSave}>
              {create.isPending ? t("import.saving") : t("import.save")}
            </Button>
          )}
        </div>
      }
    >
      <div style={s.body}>
        <div style={s.trust} role="note">
          <Icon.AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            <div style={s.trustTitle}>{t("import.trustTitle")}</div>
            {t("import.trustBody")}
          </div>
        </div>

        {!preview && (
          <div style={s.drop}>
            <Icon.Upload size={20} />
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPT}
              aria-label={t("import.chooseFile")}
              style={{ display: "none" }}
              onChange={(e) => void pick(e.target.files?.[0])}
            />
            <Button kind="secondary" size="sm" onClick={() => inputRef.current?.click()} disabled={previewMut.isPending}>
              {previewMut.isPending ? t("import.parsing") : t("import.chooseFile")}
            </Button>
            <span>{t("import.accepted")}</span>
            {fileError && (
              <span role="alert" style={s.error}>
                {fileError}
              </span>
            )}
          </div>
        )}

        {preview && draft && (
          <>
            <div style={s.metaRow}>
              <span>
                {t("import.coreFile")} <span className="mono">{preview.core_file}</span>
              </span>
              <span>·</span>
              <span>{t("import.tokens", { count: preview.body_tokens })}</span>
            </div>

            {preview.ignored.length > 0 && (
              <div style={s.listBox}>
                <div style={s.listTitle}>{t("import.ignoredTitle")}</div>
                <ul style={s.list} aria-label={t("import.ignoredTitle")}>
                  {preview.ignored.map((i) => (
                    <li key={i.path}>
                      <span className="mono">{i.path}</span> — {t(`import.reason.${i.reason}`)}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {preview.dropped_frontmatter.length > 0 && (
              <div style={s.listBox}>
                <div style={s.listTitle}>{t("import.droppedTitle")}</div>
                <span className="mono">{preview.dropped_frontmatter.join(", ")}</span>
              </div>
            )}

            {preview.warnings.length > 0 && (
              <div style={s.listBox}>
                <div style={s.listTitle}>{t("import.warningsTitle")}</div>
                <ul style={s.list}>
                  {preview.warnings.map((w) => (
                    <li key={w} style={s.warnItem}>
                      {w}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div style={s.twoCol}>
              <FormField label={t("editor.config.name")} required hint={nameErr ? t(`editor.config.nameErrors.${nameErr}`) : undefined}>
                <TextInput value={draft.name} onChange={(v) => patch({ name: v })} mono />
              </FormField>
              <FormField label={t("editor.config.type")}>
                <SelectInput
                  value={draft.type}
                  onChange={(v) => patch({ type: v as SkillType })}
                  options={SKILL_TYPES.map((ty) => ({ value: ty, label: t(`listItem.type.${ty}`) }))}
                />
              </FormField>
            </div>
            {conflict && (
              <span role="alert" style={s.error}>
                {t("import.nameConflict")}
              </span>
            )}
            <FormField label={t("editor.config.description")} required hint={t("editor.config.descriptionHint")}>
              <Textarea value={draft.description} onChange={(v) => patch({ description: v })} rows={2} />
            </FormField>

            <div>
              <div style={s.bodyHead}>
                <span style={s.listTitle}>{t("editor.config.body")}</span>
                <button type="button" style={s.linkBtn} onClick={() => setShowRaw((r) => !r)}>
                  {showRaw ? t("import.showRendered") : t("import.showRaw")}
                </button>
              </div>
              {showRaw ? (
                <Textarea value={draft.body} onChange={(v) => patch({ body: v })} rows={12} mono />
              ) : (
                <div className="skill-md" style={s.rendered}>
                  <Markdown>{draft.body}</Markdown>
                </div>
              )}
            </div>

            <Checkbox checked={confirmed} onChange={setConfirmed} label={t("import.confirm")} />
            <Checkbox checked={enableNow} onChange={setEnableNow} label={t("import.enableNow")} />
            {saveError && (
              <span role="alert" style={s.error}>
                {saveError}
              </span>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
