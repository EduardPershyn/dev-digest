/* OutOfPatchFindings — footer block for review findings whose start line is not
   a rendered line of this file's patch (or the file has no patch at all). */
"use client";

import React from "react";
import type { FindingRecord } from "@devdigest/shared";
import { cs } from "../comments";
import { type DiffFindingApi } from "../findings";

export function OutOfPatchFindings({
  findings,
  api,
}: {
  findings: FindingRecord[];
  api: DiffFindingApi;
}) {
  if (findings.length === 0) return null;
  const { Card } = api;
  return (
    <div style={cs.outdatedWrap}>
      <span style={cs.outdatedTitle}>{api.labels.outOfPatch(findings.length)}</span>
      {findings.map((f) => (
        <Card
          key={f.id}
          f={f}
          defaultExpanded
          pending={api.pendingId === f.id}
          onAction={(a) => api.onAction(f, a)}
        />
      ))}
    </div>
  );
}
