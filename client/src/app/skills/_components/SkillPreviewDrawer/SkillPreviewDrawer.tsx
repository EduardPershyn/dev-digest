/* SkillPreviewDrawer — side preview opened from a SkillCard: metadata, the body
   rendered as the agent receives it, which agents use it, Edit / Delete. */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Badge, Button, Drawer, Icon, Markdown, Skeleton, Toggle } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { SkillTypeBadge } from "@/components/skill-type-badge";
import { useSkill, useUpdateSkill } from "@/lib/hooks/skills";
import { isThirdPartySource } from "@/lib/skills";
import { DeleteSkillButton } from "../DeleteSkillButton";
import { DRAWER_WIDTH } from "./constants";
import { s } from "./styles";

export function SkillPreviewDrawer({
  skill,
  onClose,
  onEdit,
}: {
  /** The list row — rendered immediately while the detail (agents) loads. */
  skill: Skill;
  onClose: () => void;
  onEdit: () => void;
}) {
  const t = useTranslations("skills");
  const { data: detail, isLoading } = useSkill(skill.id);
  const update = useUpdateSkill();
  const current = detail ?? skill;
  const agents = detail?.agents ?? [];

  return (
    <Drawer
      width={DRAWER_WIDTH}
      title={<span className="mono">{current.name}</span>}
      subtitle={
        <span style={s.metaRow}>
          <SkillTypeBadge type={current.type} />
          <Badge mono>{t("card.version", { version: current.version })}</Badge>
          <span style={s.muted}>{t(`listItem.source.${current.source}`)}</span>
          {isThirdPartySource(current.source) && <Badge color="var(--warn)">{t("trust.badge")}</Badge>}
        </span>
      }
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <DeleteSkillButton skill={current} agents={agents} onDeleted={onClose} />
          <Button kind="primary" size="sm" icon="Edit" onClick={onEdit}>
            {t("drawer.edit")}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        <label style={s.enabledLabel}>
          <Toggle
            on={current.enabled}
            onChange={(enabled) => update.mutate({ id: current.id, patch: { enabled } })}
            size={16}
          />
          {current.enabled ? t("drawer.enabled") : t("drawer.disabled")}
        </label>

        {isThirdPartySource(current.source) && (
          <div style={s.notice} role="note">
            <Icon.AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>{t("trust.notice")}</span>
          </div>
        )}

        <section>
          <div style={s.label}>{t("drawer.description")}</div>
          <div style={s.description}>{current.description}</div>
        </section>

        <section>
          <div style={s.label}>{t("drawer.attachedTo")}</div>
          {isLoading ? (
            <Skeleton height={24} width={200} />
          ) : agents.length > 0 ? (
            <div style={s.agents}>
              {agents.map((a) => (
                <Link key={a.id} href={`/agents/${a.id}?tab=skills`} style={s.agentLink}>
                  <Icon.Cpu size={12} />
                  {a.name}
                </Link>
              ))}
            </div>
          ) : (
            <div style={s.muted}>{t("drawer.notAttached")}</div>
          )}
        </section>

        <section>
          <div style={s.label}>{t("drawer.body")}</div>
          <div style={s.hint}>{t("drawer.rendered")}</div>
          <div className="skill-md" style={s.rendered}>
            <Markdown>{current.body}</Markdown>
          </div>
        </section>
      </div>
    </Drawer>
  );
}
