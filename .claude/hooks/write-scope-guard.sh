#!/usr/bin/env bash
# PreToolUse hook (matcher "Edit|Write|MultiEdit|NotebookEdit") for the writer subagents
# that may only touch one kind of file:
#
#   --profile test-writer   test files, test helpers/fixtures, e2e flows (.claude/agents/test-writer.md)
#   --profile doc-writer    documentation Markdown                      (.claude/agents/doc-writer.md)
#
# Allowlist first, then a denylist of carve-outs. Both profiles may append to INSIGHTS.md
# (engineering-insights) but never rewrite it. The lists are hard-coded on purpose: there is
# no config file the agent could edit.
# Exit 0 = allow, exit 2 = block (stderr is shown to the agent). Fails closed.
# Tests: node --test .claude/hooks/hooks.test.mjs
set -uo pipefail

profile=""
if [ "${1:-}" = "--profile" ]; then profile="${2:-}"; fi

block() {
  echo "write-scope-guard[$profile]: blocked — $1. Don't work around it: report the change under 'Needed production changes' / 'Proposed edits outside my scope'." >&2
  exit 2
}

case "$profile" in test-writer|doc-writer) ;; *) block "unknown or missing profile '$profile'" ;; esac
command -v jq >/dev/null 2>&1 || block "jq is not installed, cannot inspect the tool call"

input="$(cat)"
tool="$(printf '%s' "$input" | jq -r '.tool_name // empty')" || block "unreadable hook input"
root="$(realpath -m -- "${CLAUDE_PROJECT_DIR:-$(pwd)}")"

case "$tool" in
  Edit|Write|MultiEdit) ;;
  NotebookEdit) block "notebooks are outside this agent's scope" ;;
  *) exit 0 ;;
esac

path="$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty')"
[ -n "$path" ] || block "no file_path in the tool call"
case "$path" in /*) abs="$(realpath -m -- "$path")" ;; *) abs="$(realpath -m -- "$root/$path")" ;; esac
case "$abs" in "$root"/*) rel="${abs#"$root"/}" ;; *) block "'$path' is outside the repository" ;; esac

matches() { printf '%s' "$rel" | grep -Eq -- "$1"; }

insights_re='^((server|client|reviewer-core|e2e)/)?INSIGHTS\.md$'

if [ "$profile" = test-writer ]; then
  allow_re='^(server/test/.+\.test\.ts|server/test/(helpers|fixtures)/.+|server/src/.+\.test\.ts|reviewer-core/(test|src)/.+\.test\.ts|reviewer-core/test/(helpers|fixtures)/.+|client/src/.+\.test\.tsx?|client/src/test/.+|e2e/specs/[0-9]{2}-[a-z0-9-]+\.flow\.json|e2e/specs/README\.md)$'
  deny_re='^client/src/test/(architecture\.test\.ts|setup\.ts)$|/__snapshots__/'
  what="test files, test helpers/fixtures and e2e flows"
else
  allow_re='^((README|TESTING)\.md|docs/.+\.md|(server|client|reviewer-core|e2e)/README\.md|(server|client|reviewer-core|e2e)/docs/.+\.md|(server|client|reviewer-core)/src/.+/README\.md)$'
  deny_re='^docs/(skills|skills-samples)/|^docs/agent-prompts/.+-reviewer\.md$|^client/src/vendor/|(^|/)CLAUDE\.md$|(^|/)specs/|^\.claude/'
  what="documentation Markdown (docs/, <module>/docs/, READMEs, TESTING.md)"
fi

if matches "$insights_re"; then
  # Append-only: never overwrite; an edit may only add after the text it anchors on,
  # or replace the "_None yet._" placeholder.
  [ "$tool" = Write ] && [ -e "$abs" ] && block "INSIGHTS.md is append-only; use Edit to append, never Write"
  if [ "$tool" != Write ]; then
    printf '%s' "$input" | jq -e '
      (if .tool_name == "MultiEdit" then .tool_input.edits else [.tool_input] end) as $e
      | ($e | length) > 0 and all($e[];
          (.replace_all // false) == false
          and (.old_string | type) == "string" and (.new_string | type) == "string"
          and (. as $x | ($x.new_string | startswith($x.old_string)) or $x.old_string == "_None yet._"))
    ' >/dev/null || block "INSIGHTS.md is append-only: new_string must start with old_string (or replace '_None yet._'), no replace_all"
  fi
  exit 0
fi

matches "$allow_re" || block "'$rel' is not one of this agent's files ($what)"
matches "$deny_re"  && block "'$rel' is excluded from this agent's scope"

if [ "$profile" = test-writer ]; then
  # Focused or skipped tests would turn a red suite green by not running it.
  added="$(printf '%s' "$input" | jq -r '
    .tool_input | [.content, .new_string, (.edits // [] | .[].new_string)] | map(select(. != null)) | join("\n")')"
  printf '%s' "$added" | grep -Eq -- '\.(only|skip|fails|todo)\(|(^|[^A-Za-z0-9_.])(xit|xdescribe|xtest|fit|fdescribe)\(' \
    && block "focused/skipped tests (.only/.skip/.fails/.todo, xit, fit, ...) are not allowed"
fi

exit 0
