/* SmartDiffGroup — one role group of the Smart order: a sticky header (chevron,
   role colour, label, description, flagged-file counter, file count) and, when
   expanded, the group's files in the shared DiffViewer. Owns its collapse state. */
import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import { DiffViewer, type DiffCommentApi, type DiffFindingApi } from "@/components/diff-viewer";
import { ROLE_META } from "../../constants";
import type { OrderedGroup } from "../../helpers";
import { s, roleSquare, groupChevron } from "../../styles";

export function SmartDiffGroup({
  group,
  reviewed,
  commenting,
  findings,
}: {
  group: OrderedGroup;
  /** Counters only make sense once a review has run. */
  reviewed: boolean;
  commenting: DiffCommentApi;
  findings: DiffFindingApi;
}) {
  const t = useTranslations("prReview.smartDiff");
  const meta = ROLE_META[group.role];
  const [collapsed, setCollapsed] = React.useState<boolean>(meta.defaultCollapsed);
  const label = t(meta.labelKey);

  return (
    <section data-role={group.role}>
      <div style={s.groupHeader}>
        <button
          type="button"
          aria-expanded={!collapsed}
          aria-label={t(collapsed ? "expandGroup" : "collapseGroup", { label })}
          onClick={() => setCollapsed((c) => !c)}
          style={s.chevronBtn}
        >
          <Icon.ChevronRight size={14} style={groupChevron(!collapsed)} />
          <span style={roleSquare(meta.color)} />
          <span style={s.groupLabel}>{label}</span>
          <span style={s.groupDesc}>{t(meta.descKey)}</span>
        </button>
        <span style={s.groupRight}>
          {reviewed && group.flaggedCount > 0 && (
            <span style={s.flagged} aria-label={t("flaggedFiles", { count: group.flaggedCount })}>
              ● {group.flaggedCount}
            </span>
          )}
          <span className="tnum">{t("filesCount", { count: group.files.length })}</span>
        </span>
      </div>
      {!collapsed && <DiffViewer files={group.files} commenting={commenting} findings={findings} />}
    </section>
  );
}
