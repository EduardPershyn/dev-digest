"use client";

/* DiffTab — the PR "Files changed" tab. Smart order (M3, default): files grouped
   by role from GET /pulls/:id/smart-diff, with review findings inside the diff.
   Original order: the flat GitHub list. Comments and findings share one
   show/hide switch. */
import React from "react";
import { useTranslations } from "next-intl";
import type { FindingRecord, Severity } from "@devdigest/shared";
import { DiffViewer, type DiffCommentApi, type DiffFindingApi } from "@/components/diff-viewer";
import {
  usePrComments,
  useCreatePrComment,
  usePrReviews,
  useSmartDiff,
  useFindingAction,
} from "@/lib/hooks/reviews";
import { notify } from "@/lib/toast";
import type { PrFile } from "@devdigest/shared";
import { FindingCard } from "../FindingCard";
import { SEVERITY_LABEL_KEY, type DiffOrder } from "./constants";
import { diffTotals, flaggedPaths, hasReviews, latestReviewFindings, orderedGroups } from "./helpers";
import { s } from "./styles";
import { SmartDiffHeader } from "./_components/SmartDiffHeader";
import { SmartDiffGroup } from "./_components/SmartDiffGroup";

interface DiffTabProps {
  prId: string | null;
  files: PrFile[];
  /** Inline commenting is offered only on open PRs (GitHub rejects otherwise). */
  canComment?: boolean;
}

const NO_FINDINGS: FindingRecord[] = [];

export function DiffTab({ prId, files, canComment }: DiffTabProps) {
  const t = useTranslations("prReview.smartDiff");
  const { data: comments } = usePrComments(prId);
  const create = useCreatePrComment(prId);
  const { data: reviews } = usePrReviews(prId);
  const smart = useSmartDiff(prId);
  const action = useFindingAction();
  // Comments and findings start visible (owner decision, M3 Smart Diff): expanding a file shows
  // its finding cards at once. The same switch hides both to keep the diff clean.
  const [showComments, setShowComments] = React.useState(true);
  const [order, setOrder] = React.useState<DiffOrder>("smart");

  const findingList = React.useMemo(
    () => (reviews ? latestReviewFindings(reviews) : NO_FINDINGS),
    [reviews],
  );
  const flagged = React.useMemo(() => flaggedPaths(smart.data), [smart.data]);
  const reviewed = hasReviews(reviews);
  const toggleCount = (comments?.length ?? 0) + findingList.length;

  const commenting: DiffCommentApi = {
    comments: comments ?? [],
    canComment: !!canComment && !!prId,
    showComments,
    posting: create.isPending,
    onSubmit: async (input) => {
      try {
        const res = await create.mutateAsync(input);
        setShowComments(true); // a just-posted comment shouldn't stay hidden
        return res;
      } catch (err) {
        notify.error(err instanceof Error ? err.message : "Couldn't post the comment to GitHub.");
        throw err;
      }
    },
  };

  const findings: DiffFindingApi = {
    findings: findingList,
    show: showComments,
    flaggedPaths: flagged,
    Card: FindingCard,
    onAction: (f, a) => action.mutate({ findingId: f.id, action: a, prId: prId ?? undefined }),
    pendingId: action.isPending ? (action.variables?.findingId ?? null) : null,
    labels: {
      severity: {
        CRITICAL: t(SEVERITY_LABEL_KEY.CRITICAL),
        WARNING: t(SEVERITY_LABEL_KEY.WARNING),
        SUGGESTION: t(SEVERITY_LABEL_KEY.SUGGESTION),
      } satisfies Record<Severity, string>,
      outOfPatch: (count) => t("outOfPatchTitle", { count }),
      findingDot: t("findingDot"),
    },
  };

  // While the smart-diff query loads or fails, fall back to the flat list so the tab never blanks.
  const groups = order === "smart" && smart.data ? orderedGroups(smart.data, files) : null;

  return (
    <section>
      <SmartDiffHeader
        totals={diffTotals(files)}
        order={order}
        onOrderChange={setOrder}
        toggleCount={toggleCount}
        showComments={showComments}
        onToggleComments={() => setShowComments((v) => !v)}
        notReviewed={!!groups && reviews !== undefined && !reviewed}
      />
      {groups ? (
        <div style={s.groups}>
          {groups.map((g) => (
            <SmartDiffGroup
              key={g.role}
              group={g}
              reviewed={reviewed}
              commenting={commenting}
              findings={findings}
            />
          ))}
        </div>
      ) : (
        <DiffViewer files={files} commenting={commenting} findings={findings} />
      )}
    </section>
  );
}
