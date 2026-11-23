#!/usr/bin/env bash
# Creates the change set for one pr-self-review eval on a NEW branch off the current HEAD,
# commits it, and prints the base SHA to pass as --base-ref.
# Run only in a disposable clone: it switches branches in the repo it runs in.
#   .claude/skills/pr-self-review/evals/fixtures/make-fixture.sh <ui-only|backend-critical|docs-only>
set -euo pipefail
case_name="${1:?usage: make-fixture.sh <ui-only|backend-critical|docs-only>}"
root="$(git rev-parse --show-toplevel)"
cd "$root"
if [ -n "$(git status --porcelain)" ]; then
  echo "working tree not clean; run in a disposable clone" >&2
  exit 1
fi
base="$(git rev-parse HEAD)"
git switch -q -c "eval/pr-self-review-${case_name}-$(date +%s)"

case "$case_name" in
  ui-only)
    mkdir -p client/src/components/eval-widget
    cat > client/src/components/eval-widget/EvalWidget.tsx <<'TSX'
"use client";
import React, { useEffect, useState } from "react";

// Eval fixture: a component that fetches in an effect and owns a business rule.
export function EvalWidget({ repoId }: { repoId: string }) {
  const [findings, setFindings] = useState<any[]>([]);
  useEffect(() => {
    fetch(`/api/repos/${repoId}/findings`).then((r) => r.json()).then(setFindings);
  }, []);
  const blocked = findings.filter((f) => f.severity === "CRITICAL").length > 0 && findings.length > 3;
  return <div>{blocked ? "Merge blocked" : `${findings.length} findings`}</div>;
}
TSX
    ;;
  backend-critical)
    cat >> server/src/modules/agents/helpers.ts <<'TS'

// Eval fixture: a domain helper reaching into the database.
import { db } from '../../db/client.js';
export async function countAgentsDirect(): Promise<number> {
  const rows = await (db as any).query.agents.findMany();
  return rows.length;
}
TS
    ;;
  docs-only)
    printf '\n## Eval fixture\n\nThis paragraph only exists to give pr-self-review a docs-only diff.\n' >> docs/architecture.md
    ;;
  *)
    echo "unknown case: $case_name" >&2
    exit 2
    ;;
esac

git add -A
git -c user.name=eval -c user.email=eval@example.com commit -q -m "eval fixture: ${case_name}"
echo "$base"
