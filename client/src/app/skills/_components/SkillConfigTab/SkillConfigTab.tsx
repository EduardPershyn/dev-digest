/* SkillConfigTab — the skill form: Name, Description (the skill's interface,
   written as a directive), Type, Markdown body, Enabled. Creates when `skill`
   is undefined, otherwise updates (a text change creates a new version). */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Badge, Button, FormField, Icon, SelectInput, Textarea, TextInput, Toggle } from "@devdigest/ui";
import type { Skill, SkillType } from "@devdigest/shared";
import { useCreateSkill, useUpdateSkill } from "@/lib/hooks/skills";
import { ApiError } from "@/lib/api";
import { SKILL_TYPES, estimateTokens, isThirdPartySource, skillNameError } from "@/lib/skills";
import { useToast } from "@/lib/toast";
import { s } from "./styles";

interface FormState {
  name: string;
  description: string;
  type: SkillType;
  body: string;
  enabled: boolean;
}

const EMPTY: FormState = { name: "", description: "", type: "rubric", body: "", enabled: true };

function fromSkill(skill: Skill | undefined): FormState {
  return skill
    ? { name: skill.name, description: skill.description, type: skill.type, body: skill.body, enabled: skill.enabled }
    : EMPTY;
}

export function SkillConfigTab({ skill }: { skill?: Skill }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const router = useRouter();
  const create = useCreateSkill();
  const update = useUpdateSkill();
  const [form, setForm] = React.useState<FormState>(() => fromSkill(skill));
  const [touched, setTouched] = React.useState(false);

  // Reset when switching skills or after a save lands a new version.
  React.useEffect(() => {
    setForm(fromSkill(skill));
    setTouched(false);
  }, [skill?.id, skill?.version]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));
  const saved = fromSkill(skill);
  const dirty = (Object.keys(form) as (keyof FormState)[]).some((k) => form[k] !== saved[k]);

  const nameErr = skillNameError(form.name);
  const descErr = !form.description.trim();
  const bodyErr = !form.body.trim();
  const invalid = !!nameErr || descErr || bodyErr;
  const pending = create.isPending || update.isPending;
  const serverError = (create.error ?? update.error) instanceof ApiError ? (create.error ?? update.error)!.message : null;

  const submit = () => {
    setTouched(true);
    if (invalid) return;
    const payload = { ...form, description: form.description.trim() };
    if (!skill) {
      create.mutate(payload, {
        onSuccess: (created) => {
          toast.success(t("editor.config.createdToast", { name: created.name }));
          router.replace(`/skills/${created.id}?tab=config`);
        },
      });
      return;
    }
    update.mutate(
      { id: skill.id, patch: payload },
      { onSuccess: (data) => toast.success(t("editor.config.savedToast", { version: data.version })) },
    );
  };

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("editor.config.title")}</h2>
        {skill && <Badge mono>{t("card.version", { version: skill.version })}</Badge>}
        <label style={s.enabledLabel}>
          {t("editor.config.enabled")}
          <Toggle on={form.enabled} onChange={(v) => set("enabled", v)} size={16} />
        </label>
      </div>

      {skill && isThirdPartySource(skill.source) && (
        <div style={s.notice} role="note">
          <Icon.AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>{t("trust.notice")}</span>
        </div>
      )}

      <FormField
        label={t("editor.config.name")}
        required
        hint={
          touched && nameErr ? (
            <span style={s.error}>{t(`editor.config.nameErrors.${nameErr}`)}</span>
          ) : (
            t("editor.config.nameHint")
          )
        }
      >
        <TextInput value={form.name} onChange={(v) => set("name", v)} placeholder="test-coverage-gaps" mono />
      </FormField>

      <FormField
        label={t("editor.config.description")}
        required
        hint={
          touched && descErr ? (
            <span style={s.error}>{t("editor.config.descriptionRequired")}</span>
          ) : (
            t("editor.config.descriptionHint")
          )
        }
      >
        <Textarea
          value={form.description}
          onChange={(v) => set("description", v)}
          placeholder={t("editor.config.descriptionPlaceholder")}
          rows={2}
        />
      </FormField>

      <FormField label={t("editor.config.type")}>
        <SelectInput
          value={form.type}
          onChange={(v) => set("type", v as SkillType)}
          options={SKILL_TYPES.map((ty) => ({ value: ty, label: t(`listItem.type.${ty}`) }))}
        />
      </FormField>

      <FormField
        label={t("editor.config.body")}
        required
        hint={
          touched && bodyErr ? (
            <span style={s.error}>{t("editor.config.bodyRequired")}</span>
          ) : (
            t("editor.config.bodyHint")
          )
        }
      >
        <div>
          <div style={s.editorHead}>
            <Icon.FileText size={13} />
            <span className="mono" style={s.fileName}>
              {(form.name || "skill") + ".md"}
            </span>
            {dirty && <Badge color="var(--warn)">{t("editor.config.unsaved")}</Badge>}
            <span className="mono" style={s.tokens}>
              {t("editor.config.tokens", { count: estimateTokens(form.body) })}
            </span>
          </div>
          <Textarea value={form.body} onChange={(v) => set("body", v)} rows={18} mono placeholder={"# Rule\n- …"} />
        </div>
      </FormField>

      <div style={s.actions}>
        <Button kind="primary" icon="Check" onClick={submit} disabled={pending || (!!skill && !dirty)}>
          {skill
            ? pending
              ? t("editor.config.saving")
              : t("editor.config.save")
            : pending
              ? t("editor.config.creating")
              : t("editor.config.create")}
        </Button>
        {serverError && (
          <span role="alert" style={s.error}>
            {serverError}
          </span>
        )}
      </div>
    </div>
  );
}
