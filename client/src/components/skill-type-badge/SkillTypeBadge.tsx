/* SkillTypeBadge — coloured skill type chip (rubric / convention / security /
   custom). Shared by the Skills page and the agent editor's Skills tab. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@devdigest/ui";
import type { SkillType } from "@devdigest/shared";
import { SKILL_TYPE_COLOR } from "@/lib/skills";

export function SkillTypeBadge({ type }: { type: SkillType }) {
  const t = useTranslations("skills");
  return (
    <Badge color={SKILL_TYPE_COLOR[type]} mono>
      {t(`listItem.type.${type}`)}
    </Badge>
  );
}
