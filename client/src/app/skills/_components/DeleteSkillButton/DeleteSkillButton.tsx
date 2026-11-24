/* DeleteSkillButton — confirm (naming the agents that lose the skill), delete,
   toast. Used by the preview drawer and the skill editor header. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import { useDeleteSkill } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";

export function DeleteSkillButton({
  skill,
  agents,
  onDeleted,
  kind = "ghost",
}: {
  skill: { id: string; name: string };
  /** Agents linked to the skill; named in the confirm because their prompts change. */
  agents: { name: string }[];
  onDeleted: () => void;
  kind?: "ghost" | "danger";
}) {
  const t = useTranslations("skills");
  const toast = useToast();
  const del = useDeleteSkill();

  const remove = () => {
    const msg =
      agents.length > 0
        ? t("drawer.deleteConfirm", { name: skill.name, agents: agents.map((a) => a.name).join(", ") })
        : t("drawer.deleteConfirmUnused", { name: skill.name });
    if (!window.confirm(msg)) return;
    del.mutate(skill.id, {
      onSuccess: () => {
        toast.success(t("drawer.deleted", { name: skill.name }));
        onDeleted();
      },
      onError: (err) => toast.error(err.message),
    });
  };

  return (
    <Button kind={kind} size="sm" icon="Trash" onClick={remove} disabled={del.isPending}>
      {t("drawer.delete")}
    </Button>
  );
}
