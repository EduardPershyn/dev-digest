/* SkillVersionsTab — immutable snapshots of the skill's text config, newest
   first. "Changes" opens a diff against the previous snapshot (or any other).
   Restore re-saves an old snapshot, which creates a NEW version, so history is
   never rewritten and past review runs stay reproducible. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, ErrorState, Skeleton } from "@devdigest/ui";
import type { Skill, SkillVersion } from "@devdigest/shared";
import { useSkillVersions, useUpdateSkill } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { firstLine, previousVersion, restorePatch } from "./helpers";
import { VersionDiff } from "./_components/VersionDiff";
import { s } from "./styles";

export function SkillVersionsTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const { data: versions, isLoading, isError, refetch } = useSkillVersions(skill.id);
  const update = useUpdateSkill();
  /** Open diff: the row being inspected and the version it is compared with (null = nothing). */
  const [diff, setDiff] = React.useState<{ to: number; from: number | null } | null>(null);

  const toggleDiff = (v: SkillVersion) =>
    setDiff((d) =>
      d?.to === v.version ? null : { to: v.version, from: previousVersion(versions ?? [], v.version)?.version ?? null },
    );

  const restore = (v: SkillVersion) => {
    const next = skill.version + 1;
    if (!window.confirm(t("editor.versions.restoreConfirm", { version: v.version, next }))) return;
    update.mutate(
      { id: skill.id, patch: restorePatch(v) },
      { onSuccess: (data) => toast.success(t("editor.versions.restoredToast", { version: v.version, next: data.version })) },
    );
  };

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("editor.versions.title")}</h2>
        {versions && <Badge>{t("editor.versions.count", { count: versions.length })}</Badge>}
      </div>
      <p style={s.sub}>{t("editor.versions.subtitle")}</p>

      {isLoading && <Skeleton height={160} />}
      {isError && <ErrorState body={t("editor.loadError")} onRetry={() => refetch()} />}
      {versions && versions.length === 0 && <p style={s.sub}>{t("editor.versions.empty")}</p>}

      <div style={s.list}>
        {(versions ?? []).map((v) => {
          const current = v.version === skill.version;
          const open = diff?.to === v.version;
          return (
            <div key={v.version} style={s.item(open)}>
              <div style={s.row}>
                <span className="mono" style={s.vBadge(current)}>
                  v{v.version}
                </span>
                <div style={s.rowText}>
                  <div style={s.rowTitle}>{firstLine(v.body)}</div>
                  <div className="mono" style={s.rowMeta}>
                    {new Date(v.created_at).toLocaleString()}
                    {v.name && v.name !== skill.name ? ` · ${v.name}` : ""}
                  </div>
                </div>
                <Button
                  kind="ghost"
                  size="sm"
                  icon="Code"
                  onClick={() => toggleDiff(v)}
                  aria-expanded={open}
                  aria-label={t("editor.versions.diff.toggleLabel", { version: v.version })}
                >
                  {open ? t("editor.versions.diff.hide") : t("editor.versions.diff.show")}
                </Button>
                {current ? (
                  <Badge color="var(--ok)" dot>
                    {t("editor.versions.current")}
                  </Badge>
                ) : (
                  <Button kind="secondary" size="sm" icon="History" onClick={() => restore(v)} disabled={update.isPending}>
                    {t("editor.versions.restore")}
                  </Button>
                )}
              </div>
              {open && (
                <VersionDiff
                  versions={versions ?? []}
                  to={v}
                  from={(versions ?? []).find((x) => x.version === diff.from) ?? null}
                  onFromChange={(from) => setDiff({ to: v.version, from })}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
