/* SkillsTab — attach library skills to this agent, enable/disable them per
   agent, and order them. The order is the order of the skill blocks in the
   agent's prompt. Every change saves the whole ordered list (and bumps the
   agent version). */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Badge, Button, Checkbox, Dropdown, EmptyState, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { SkillTypeBadge } from "@/components/skill-type-badge";
import { useAgentSkills, useSetAgentSkills, useSkills } from "@/lib/hooks/skills";
import { filterSkills, joinAgentSkills, moveItem, reachesPrompt, unlinkedSkills, type AgentSkillRow } from "@/lib/skills";
import { s } from "./styles";

type LinkInput = { skill_id: string; enabled: boolean };

export function SkillsTab({ agent }: { agent: Agent }) {
  const t = useTranslations("agents");
  const router = useRouter();
  const { data: links, isLoading, isError, refetch } = useAgentSkills(agent.id);
  const { data: library } = useSkills();
  const save = useSetAgentSkills(agent.id);
  const [filter, setFilter] = React.useState("");
  const [dragFrom, setDragFrom] = React.useState<number | null>(null);
  const [dragOver, setDragOver] = React.useState<number | null>(null);

  const rows = joinAgentSkills(links ?? [], library ?? []);
  const enabledCount = rows.filter(reachesPrompt).length;
  const toInput = (r: AgentSkillRow[]): LinkInput[] =>
    r.map((x) => ({ skill_id: x.link.skill_id, enabled: x.link.enabled }));
  const commit = (next: LinkInput[]) => save.mutate(next);

  const move = (from: number, to: number) => commit(toInput(moveItem(rows, from, to)));
  const toggle = (i: number, enabled: boolean) =>
    commit(toInput(rows).map((l, j) => (j === i ? { ...l, enabled } : l)));
  const detach = (i: number) => commit(toInput(rows).filter((_, j) => j !== i));
  const attach = (skillId: string) => commit([...toInput(rows), { skill_id: skillId, enabled: true }]);

  // Filtering hides rows but never changes their order; drag is off while filtering.
  const q = filter.trim();
  const visible = new Set(filterSkills(rows.map((r) => r.skill).filter((x) => x !== undefined), q).map((x) => x.id));
  const unlinked = unlinkedSkills(links ?? [], library ?? []);

  const attachItems = [
    ...(unlinked.length === 0
      ? [{ label: t("skills.attachEmpty"), muted: true }]
      : unlinked.map((sk) => ({ label: sk.name, icon: "Sparkles" as const, hint: sk.type, onClick: () => attach(sk.id) }))),
    { divider: true },
    { label: t("skills.manage"), icon: "ExternalLink" as const, onClick: () => router.push("/skills") },
  ];

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("skills.title")}</h2>
        <Badge color="var(--accent-text)" bg="var(--accent-bg)">
          {t("skills.enabledCount", { enabled: enabledCount, total: rows.length })}
        </Badge>
        <span style={s.spacer} />
        <div style={s.filter}>
          <Icon.Search size={12} style={{ color: "var(--text-muted)" }} />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={t("skills.filterPlaceholder")}
            aria-label={t("skills.filterPlaceholder")}
            style={s.filterInput}
          />
        </div>
        <Dropdown
          width={260}
          align="right"
          trigger={
            <Button kind="primary" size="sm" icon="Plus" iconRight="ChevronDown">
              {t("skills.attach")}
            </Button>
          }
          items={attachItems}
        />
      </div>
      <p style={s.hint}>{t("skills.orderHint")}</p>

      {isLoading && <Skeleton height={160} />}
      {isError && <ErrorState body={t("skills.loadError")} onRetry={() => refetch()} />}
      {!isLoading && !isError && rows.length === 0 && (
        <EmptyState icon="Sparkles" title={t("skills.empty.title")} body={t("skills.empty.body")} />
      )}
      {rows.length > 0 && q && visible.size === 0 && <div style={s.muted}>{t("skills.noMatch", { q })}</div>}

      <div style={s.list} role="list">
        {rows.map((row, i) => {
          if (q && (!row.skill || !visible.has(row.skill.id))) return null;
          const name = row.skill?.name ?? t("skills.missing");
          const globallyOff = row.skill !== undefined && !row.skill.enabled;
          return (
            <div
              key={row.link.skill_id}
              role="listitem"
              aria-label={name}
              data-testid="agent-skill-row"
              draggable={!q}
              onDragStart={() => setDragFrom(i)}
              onDragOver={(e) => {
                if (dragFrom === null) return;
                e.preventDefault();
                setDragOver(i);
              }}
              onDragLeave={() => setDragOver((o) => (o === i ? null : o))}
              onDrop={(e) => {
                e.preventDefault();
                if (dragFrom !== null && dragFrom !== i) move(dragFrom, i);
                setDragFrom(null);
                setDragOver(null);
              }}
              onDragEnd={() => {
                setDragFrom(null);
                setDragOver(null);
              }}
              style={s.row(dragOver === i, reachesPrompt(row))}
            >
              <span style={s.handle} title={t("skills.dragHandle", { name })} aria-hidden>
                <Icon.Menu size={14} />
              </span>
              <span style={s.name} title={t("skills.enableLabel", { name })}>
                <Checkbox
                  checked={row.link.enabled}
                  onChange={(v) => toggle(i, v)}
                  label={<span className="mono" style={s.nameText}>{name}</span>}
                />
              </span>
              {globallyOff && (
                <span style={s.chip} title={t("skills.disabledGloballyHint")}>
                  {t("skills.disabledGlobally")}
                </span>
              )}
              {row.skill && <SkillTypeBadge type={row.skill.type} />}
              <button
                type="button"
                style={s.iconBtn}
                aria-label={t("skills.moveUp", { name })}
                disabled={i === 0 || save.isPending}
                onClick={() => move(i, i - 1)}
              >
                <Icon.ArrowUp size={13} />
              </button>
              <button
                type="button"
                style={s.iconBtn}
                aria-label={t("skills.moveDown", { name })}
                disabled={i === rows.length - 1 || save.isPending}
                onClick={() => move(i, i + 1)}
              >
                <Icon.ArrowDown size={13} />
              </button>
              <button
                type="button"
                style={s.iconBtn}
                aria-label={t("skills.remove", { name })}
                disabled={save.isPending}
                onClick={() => detach(i)}
              >
                <Icon.X size={13} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
