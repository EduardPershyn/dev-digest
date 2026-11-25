/* ConventionsView — /repos/:repoId/conventions (M2, specs/M2-conventions.md).
   Run extraction (ONE synchronous model call on the server), curate candidates
   (accept / reject / edit), and merge the accepted ones into a skill. While a
   scan runs the existing cards stay visible; a failed scan leaves the list
   untouched because the server writes nothing. */
"use client";

import React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { ApiError } from "@/lib/api";
import { acceptedConventions } from "@/lib/conventions";
import { useConventions, useExtractConventions, useUpdateConvention } from "@/lib/hooks/conventions";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { useToast } from "@/lib/toast";
import { ConventionCard } from "../ConventionCard";
import { CreateConventionSkillModal } from "../CreateConventionSkillModal";
import { SKELETON_CARDS } from "./constants";
import { s } from "./styles";

export function ConventionsView() {
  const t = useTranslations("conventions");
  const format = useFormatter();
  const toast = useToast();
  const { repoId } = useParams<{ repoId: string }>();
  const { activeRepo } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);
  const { data, isLoading, isError, error, refetch } = useConventions(repoId);
  const extract = useExtractConventions(repoId);
  const update = useUpdateConvention(repoId);

  const [modalOpen, setModalOpen] = React.useState(false);
  const [savedSkill, setSavedSkill] = React.useState<Skill | null>(null);

  const repoName = activeRepo?.full_name ?? t("page.repoFallback");
  const crumb = [{ label: t("page.crumbLab") }, { label: t("page.crumbConventions") }];
  const candidates = data?.candidates ?? [];
  const accepted = acceptedConventions(candidates);
  const scanning = extract.isPending;

  const run = () => {
    extract.mutate(undefined, {
      onSuccess: (r) =>
        toast.success(
          t("page.extractDone", {
            kept: r.stats.kept,
            proposed: r.stats.proposed,
            invalid: r.stats.rejected_invalid_evidence,
            duplicates: r.stats.skipped_duplicates,
          }),
        ),
    });
  };

  if (repoNotFound) {
    return (
      <AppShell crumb={crumb}>
        <RepoNotFound />
      </AppShell>
    );
  }

  const extractError = extract.error instanceof ApiError ? extract.error : null;
  const neverScanned = !!data && data.last_scan_at === null && candidates.length === 0;

  return (
    <AppShell crumb={crumb}>
      <div style={s.page}>
        <div style={s.header}>
          <div style={s.headerText}>
            <h1 style={s.h1}>
              {t("page.headingPrefix")}
              <span className="mono">{repoName}</span>
            </h1>
            <p style={s.subtitle}>
              {data && data.last_scan_at
                ? `${t("page.candidateCount", { count: candidates.length })} · ${t("page.lastScan", {
                    when: format.relativeTime(new Date(data.last_scan_at)),
                  })}`
                : t("page.subtitle")}
            </p>
          </div>
          {data && !neverScanned && (
            <div style={s.headerActions}>
              <span className="tnum" style={s.count}>
                {t("page.accepted", { accepted: accepted.length, total: candidates.length })}
              </span>
              <Button kind="secondary" size="sm" icon="RefreshCw" onClick={run} disabled={scanning} loading={scanning}>
                {scanning ? t("page.scanning") : t("page.rescan")}
              </Button>
              <span title={accepted.length === 0 ? t("page.createSkillDisabled") : undefined}>
                <Button
                  kind="primary"
                  size="sm"
                  icon="Sparkles"
                  onClick={() => setModalOpen(true)}
                  disabled={accepted.length === 0 || scanning}
                >
                  {t("page.createSkill")}
                </Button>
              </span>
            </div>
          )}
        </div>

        {extractError && (
          <div role="alert" style={s.errorBanner}>
            <Icon.AlertTriangle size={16} style={{ flexShrink: 0 }} />
            <span style={s.errorText}>
              {t("page.extractionFailed")}: {extractError.message}
              {extractError.status === 409 && / index/i.test(extractError.message) ? ` ${t("page.notIndexed")}` : ""}
            </span>
            <Button kind="secondary" size="sm" icon="RefreshCw" onClick={run} disabled={scanning}>
              {t("page.retry")}
            </Button>
          </div>
        )}

        {savedSkill && (
          <div role="status" style={s.savedBanner}>
            <Icon.Check size={16} style={{ flexShrink: 0 }} />
            <span style={s.errorText}>{t("modal.saved", { name: savedSkill.name })}</span>
            <Link href={`/skills/${savedSkill.id}`} style={s.link}>
              {t("page.openSkill")}
            </Link>
            <Button kind="ghost" size="sm" onClick={() => setSavedSkill(null)}>
              {t("page.dismiss")}
            </Button>
          </div>
        )}

        {isLoading && (
          <div style={s.list}>
            {Array.from({ length: SKELETON_CARDS }, (_, i) => (
              <Skeleton key={i} height={150} />
            ))}
          </div>
        )}

        {isError && (
          <ErrorState
            title={t("page.loadError")}
            body={error instanceof ApiError ? error.message : undefined}
            onRetry={() => void refetch()}
          />
        )}

        {neverScanned && (
          <EmptyState
            icon="ListChecks"
            title={t("page.empty.title")}
            body={t("page.empty.body")}
            cta={scanning ? t("page.scanning") : t("page.empty.cta")}
            onCta={run}
            ctaLoading={scanning}
          />
        )}

        {candidates.length > 0 && (
          <div style={s.list}>
            {candidates.map((c) => (
              <ConventionCard
                key={c.id}
                convention={c}
                disabled={scanning}
                onChange={(patch) => update.mutate({ id: c.id, patch })}
              />
            ))}
          </div>
        )}
      </div>

      {modalOpen && (
        <CreateConventionSkillModal
          repoId={repoId}
          repoFullName={repoName}
          accepted={accepted}
          onClose={() => setModalOpen(false)}
          onSaved={setSavedSkill}
        />
      )}
    </AppShell>
  );
}
