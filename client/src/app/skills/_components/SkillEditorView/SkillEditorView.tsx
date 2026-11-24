/* /skills/:id and /skills/new — Skill editor (M2). Left: skill list. Right:
   Config · Preview · Versions (?tab=). `/skills/new` shows Config only. */
"use client";

import React from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Badge, Button, Dropdown, ErrorState, Icon, Skeleton, Tabs } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { SkillTypeBadge } from "@/components/skill-type-badge";
import { useSkill, useSkills, useUpdateSkill } from "@/lib/hooks/skills";
import { ApiError } from "@/lib/api";
import { SkillCard } from "../SkillCard";
import { SkillConfigTab } from "../SkillConfigTab";
import { SkillPreviewTab } from "../SkillPreviewTab";
import { SkillVersionsTab } from "../SkillVersionsTab";
import { ImportSkillModal } from "../ImportSkillModal";
import { DeleteSkillButton } from "../DeleteSkillButton";
import { TABS, type EditorTab } from "./constants";
import { s } from "./styles";

export function SkillEditorView({ isNew = false }: { isNew?: boolean }) {
  const t = useTranslations("skills");
  const params = useParams<{ id?: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const id = isNew ? undefined : params.id;

  const { data: skills } = useSkills();
  const { data: skill, isLoading, isError, error, refetch } = useSkill(id);
  const update = useUpdateSkill();
  const [importing, setImporting] = React.useState(false);

  const requested = search.get("tab") as EditorTab["key"] | null;
  const tab: EditorTab["key"] = !isNew && requested && TABS.some((tb) => tb.key === requested) ? requested : "config";
  const setTab = (next: string) => {
    const sp = new URLSearchParams(search.toString());
    sp.set("tab", next);
    router.replace(`/skills/${id}?${sp.toString()}`);
  };

  const crumb = [
    { label: t("page.crumbLab") },
    { label: t("page.crumbSkills"), href: "/skills" },
    { label: isNew ? t("editor.crumbNew") : (skill?.name ?? "…") },
  ];

  if (!isNew && (isError || (!isLoading && !skill))) {
    return (
      <AppShell crumb={crumb}>
        <ErrorState
          fullScreen
          title={t("editor.loadError")}
          body={error instanceof ApiError && error.status !== 404 ? error.message : t("editor.notFound")}
          onRetry={() => refetch()}
        />
      </AppShell>
    );
  }

  const tabs = (isNew ? TABS.filter((tb) => tb.key === "config") : TABS).map((tb) => ({
    key: tb.key,
    label: t(tb.labelKey),
    icon: tb.icon,
  }));

  return (
    <AppShell crumb={crumb}>
      {importing && (
        <ImportSkillModal onClose={() => setImporting(false)} onSaved={(sk) => router.push(`/skills/${sk.id}`)} />
      )}
      <div style={s.frame}>
        <div style={s.list}>
          <div style={s.listHead}>
            <h1 style={s.listTitle}>{t("editor.listTitle")}</h1>
            <Dropdown
              width={210}
              align="right"
              trigger={
                <Button kind="primary" size="sm" icon="Plus">
                  {t("page.addSkill")}
                </Button>
              }
              items={[
                { label: t("page.create"), icon: "Edit", onClick: () => router.push("/skills/new") },
                { label: t("page.importFile"), icon: "Upload", onClick: () => setImporting(true) },
              ]}
            />
          </div>
          <div style={s.listBody}>
            {(skills ?? []).map((sk) => (
              <div key={sk.id} style={s.activeRing(sk.id === id)}>
                <SkillCard
                  skill={sk}
                  onOpen={() => router.push(`/skills/${sk.id}?tab=${tab}`)}
                  onToggle={(enabled) => update.mutate({ id: sk.id, patch: { enabled } })}
                />
              </div>
            ))}
          </div>
        </div>

        {!isNew && (isLoading || !skill) ? (
          <div style={s.loading}>
            <Skeleton height={24} width={240} />
            <Skeleton height={200} />
          </div>
        ) : (
          <div style={s.main}>
            <div style={s.head}>
              <Icon.Sparkles size={18} style={{ color: "var(--accent)" }} />
              <h1 className="mono" style={s.h1}>
                {isNew ? t("editor.newTitle") : skill!.name}
              </h1>
              {skill && <SkillTypeBadge type={skill.type} />}
              {skill && <Badge mono>{t("card.version", { version: skill.version })}</Badge>}
              {skill && (
                <div style={s.headActions}>
                  <DeleteSkillButton
                    kind="danger"
                    skill={skill}
                    agents={skill.agents}
                    onDeleted={() => router.replace("/skills")}
                  />
                </div>
              )}
            </div>
            <div style={s.tabsBar}>
              <Tabs tabs={tabs} value={tab} onChange={setTab} pad="0 28px" />
            </div>
            <div style={s.body}>
              {tab === "config" && <SkillConfigTab skill={skill} />}
              {tab === "preview" && skill && <SkillPreviewTab skill={skill} />}
              {tab === "versions" && skill && <SkillVersionsTab skill={skill} />}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
