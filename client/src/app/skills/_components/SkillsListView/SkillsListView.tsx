/* /skills — the workspace skill library (M2): card grid with a global enabled
   toggle, side preview on click, Add → Create / Import. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Dropdown, EmptyState, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { useSkills, useUpdateSkill } from "@/lib/hooks/skills";
import { filterSkills } from "@/lib/skills";
import { SkillCard } from "../SkillCard";
import { SkillPreviewDrawer } from "../SkillPreviewDrawer";
import { ImportSkillModal } from "../ImportSkillModal";
import { s } from "./styles";

export function SkillsListView() {
  const t = useTranslations("skills");
  const router = useRouter();
  const { data: skills, isLoading, isError, refetch } = useSkills();
  const update = useUpdateSkill();
  const [search, setSearch] = React.useState("");
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [importing, setImporting] = React.useState(false);

  const list = filterSkills(skills ?? [], search);
  const open = (skills ?? []).find((sk) => sk.id === openId);

  return (
    <AppShell crumb={[{ label: t("page.crumbLab") }, { label: t("page.crumbSkills") }]}>
      {importing && <ImportSkillModal onClose={() => setImporting(false)} onSaved={(sk) => setOpenId(sk.id)} />}
      {open && (
        <SkillPreviewDrawer
          skill={open}
          onClose={() => setOpenId(null)}
          onEdit={() => router.push(`/skills/${open.id}?tab=config`)}
        />
      )}
      <div style={s.page}>
        <div style={s.header}>
          <div style={s.headerText}>
            <h1 style={s.h1}>{t("page.heading")}</h1>
            <p style={s.subtitle}>{t("page.subtitle")}</p>
          </div>
          <div style={s.search}>
            <Icon.Search size={13} style={s.searchIcon} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("page.searchPlaceholder")}
              aria-label={t("page.searchPlaceholder")}
              style={s.searchInput}
            />
          </div>
          <Dropdown
            width={220}
            align="right"
            trigger={
              <Button kind="primary" size="sm" icon="Plus" iconRight="ChevronDown">
                {t("page.addSkill")}
              </Button>
            }
            items={[
              { label: t("page.create"), icon: "Edit", onClick: () => router.push("/skills/new") },
              { label: t("page.importFile"), icon: "Upload", onClick: () => setImporting(true) },
            ]}
          />
        </div>

        {isLoading && (
          <div style={s.grid}>
            <Skeleton height={140} />
            <Skeleton height={140} />
            <Skeleton height={140} />
          </div>
        )}
        {isError && <ErrorState body={t("page.loadError")} onRetry={() => refetch()} />}
        {!isLoading && !isError && (skills ?? []).length === 0 && (
          <EmptyState
            icon="Sparkles"
            title={t("page.empty.title")}
            body={t("page.empty.body")}
            cta={t("page.create")}
            onCta={() => router.push("/skills/new")}
          />
        )}
        {(skills ?? []).length > 0 && list.length === 0 && (
          <div style={s.noMatch}>{t("page.noMatch", { q: search })}</div>
        )}
        {list.length > 0 && (
          <div style={s.grid}>
            {list.map((sk) => (
              <SkillCard
                key={sk.id}
                skill={sk}
                onOpen={() => setOpenId(sk.id)}
                onToggle={(enabled) => update.mutate({ id: sk.id, patch: { enabled } })}
              />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
