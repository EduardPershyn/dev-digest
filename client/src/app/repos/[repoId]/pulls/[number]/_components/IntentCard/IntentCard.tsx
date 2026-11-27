/* IntentCard — M3 (specs/M3-intent-layer.md). The PR's derived intent at the
   top of the "Agent runs" tab: summary, scope lists, confidence, sources used,
   linked docs that could not be read, model + age, a stale badge, and
   Classify / Reclassify. */
"use client";

import React from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Badge, Button, Icon, Skeleton } from "@devdigest/ui";
import type { PrIntentRecord } from "@devdigest/shared";
import { useClassifyIntent, usePrIntent } from "@/lib/hooks/intent";
import { cardState, confidenceTone, externalHref, missingReasonKey, sourceLabelKey } from "./helpers";
import { s } from "./styles";

export function IntentCard({ prId }: { prId: string }) {
  const t = useTranslations("prReview.intent");
  const { data, isLoading, isError, error } = usePrIntent(prId);
  const classify = useClassifyIntent(prId);
  const intent = data?.intent ?? null;
  const state = cardState(intent);
  const errorText = (e: unknown) => (e instanceof Error && e.message ? e.message : t("unknownError"));

  const action = (
    <Button
      kind={state === "empty" ? "primary" : "secondary"}
      size="sm"
      icon={state === "empty" ? "Sparkles" : "RefreshCw"}
      loading={classify.isPending}
      disabled={classify.isPending}
      onClick={() => classify.mutate()}
    >
      {state === "empty" ? t("classify") : t("reclassify")}
    </Button>
  );

  return (
    <section style={s.card} aria-label={t("title")}>
      <div style={s.head}>
        <Icon.Target size={15} style={{ color: "var(--accent)" }} />
        <span style={s.title}>{t("title")}</span>
        {intent && state === "ok" && (
          <Badge {...confidenceTone(intent.confidence)}>{t(`confidence.${intent.confidence}`)}</Badge>
        )}
        {intent?.stale && (
          <Badge color="var(--warn)" bg="var(--warn-bg)" icon="Clock">
            {t("stale")}
          </Badge>
        )}
        <div style={s.headRight}>{!isLoading && !isError && action}</div>
      </div>

      {isLoading ? (
        <div aria-label={t("loading")}>
          <Skeleton height={16} width={420} />
        </div>
      ) : isError ? (
        <div role="alert" style={s.error}>
          {t("loadFailed", { error: errorText(error) })}
        </div>
      ) : state === "empty" ? (
        <div>
          <div style={s.title}>{t("emptyTitle")}</div>
          <div style={s.muted}>{t("emptyBody")}</div>
        </div>
      ) : state === "failed" ? (
        <div>
          <div style={s.error}>
            {t("failedTitle")}: {intent?.error ?? t("unknownError")}
          </div>
          <div style={s.muted}>{t("failedNoIntent")}</div>
        </div>
      ) : (
        intent && <IntentBody intent={intent} />
      )}

      {classify.isError && (
        <div role="alert" style={s.error}>
          {t("classifyFailed", { error: errorText(classify.error) })}
        </div>
      )}
    </section>
  );
}

function IntentBody({ intent }: { intent: PrIntentRecord }) {
  const t = useTranslations("prReview.intent");
  const format = useFormatter();
  return (
    <>
      <p style={s.summary}>{intent.summary}</p>

      <div style={s.scopeGrid}>
        <ScopeList title={t("inScope")} items={intent.in_scope} empty={t("noneListed")} />
        <ScopeList title={t("outOfScope")} items={intent.out_of_scope} empty={t("noneListed")} />
      </div>

      {intent.sources.length > 0 && (
        <div>
          <div style={s.subhead}>{t("sources")}</div>
          <div style={s.chips}>
            {intent.sources.map((src) => {
              const label = t(sourceLabelKey(src.kind), { ref: src.ref });
              return (
                <Badge key={`${src.kind}:${src.ref}`}>
                  {src.status === "empty" ? t("sourceEmpty", { label }) : label}
                </Badge>
              );
            })}
          </div>
        </div>
      )}

      {intent.missing_context.length > 0 && (
        <div>
          <div style={s.subhead}>{t("missing")}</div>
          <div style={s.muted}>{t("missingHint")}</div>
          <ul style={s.list}>
            {intent.missing_context.map((m) => {
              const href = externalHref(m.url);
              return (
                <li key={m.url}>
                  <span style={s.missingRow}>
                    {href ? (
                      <a className="mono" href={href} target="_blank" rel="noopener noreferrer" style={s.missingUrl}>
                        {m.url}
                      </a>
                    ) : (
                      <span className="mono" style={s.missingUrl}>
                        {m.url}
                      </span>
                    )}
                    <span style={s.meta}>{t(missingReasonKey(m.reason))}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {intent.status === "failed" && (
        <div style={s.error}>{t("lastAttemptFailed", { error: intent.error ?? t("unknownError") })}</div>
      )}

      {intent.model && (
        <div style={s.meta}>
          {t("classifiedWith", {
            model: intent.model,
            when: intent.classified_at ? format.relativeTime(new Date(intent.classified_at)) : "—",
          })}
        </div>
      )}
    </>
  );
}

function ScopeList({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return (
    <div>
      <div style={s.subhead}>{title}</div>
      {items.length === 0 ? (
        <span style={s.muted}>{empty}</span>
      ) : (
        <ul style={s.list}>
          {items.map((it) => (
            <li key={it}>{it}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
