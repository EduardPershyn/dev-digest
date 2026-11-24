/* SkillCard — one skill in the /skills grid: name, type, source, description
   and the global enabled toggle. Clicking the card opens the side preview. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Toggle } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { SkillTypeBadge } from "@/components/skill-type-badge";
import { SKILL_TYPE_COLOR, isThirdPartySource } from "@/lib/skills";
import { s } from "./styles";

export function SkillCard({
  skill,
  onOpen,
  onToggle,
}: {
  skill: Skill;
  onOpen: () => void;
  onToggle: (enabled: boolean) => void;
}) {
  const t = useTranslations("skills");
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={skill.name}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onOpen();
        }
      }}
      style={s.card(skill.enabled)}
    >
      <div style={s.headerRow}>
        <div style={s.iconBox(SKILL_TYPE_COLOR[skill.type])}>
          <Icon.Sparkles size={14} />
        </div>
        <span className="mono" style={s.name}>
          {skill.name}
        </span>
        <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} title={t("card.toggle")}>
          <Toggle on={skill.enabled} onChange={onToggle} size={14} />
        </div>
      </div>
      <div style={s.description}>{skill.description}</div>
      <div style={s.metaRow}>
        <SkillTypeBadge type={skill.type} />
        <span style={s.source}>
          {isThirdPartySource(skill.source) ? <Icon.Upload size={12} /> : <Icon.Edit size={12} />}
          {t(`listItem.source.${skill.source}`)}
        </span>
      </div>
      <div style={s.footer}>
        <span>{t("card.agents", { count: skill.agent_count })}</span>
        <span className="mono">{t("card.version", { version: skill.version })}</span>
      </div>
    </div>
  );
}
