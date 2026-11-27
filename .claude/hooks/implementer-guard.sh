#!/usr/bin/env bash
# PreToolUse hook for the `implementer` subagent (.claude/agents/implementer.md).
# Enforces the repo's "Do not touch" rules (root + module CLAUDE.md, INSIGHTS.md)
# that must hold on every call, independent of the prompt.
# Exit 0 = allow, exit 2 = block (stderr is shown to the agent). Fails closed.
set -uo pipefail

block() { echo "implementer-guard: blocked — $1. If the plan really needs this, stop and report it as a Deviation." >&2; exit 2; }

command -v jq >/dev/null 2>&1 || block "jq is not installed, cannot inspect the tool call"
input="$(cat)"
tool="$(printf '%s' "$input" | jq -r '.tool_name // empty')"
root="${CLAUDE_PROJECT_DIR:-$(pwd)}"

# Paths (repo-relative) that must never be edited.
protected_re='^(client/src/vendor/ui/|server/\.dependency-cruiser-known-violations\.json$|\.claude/(agents|skills|hooks)/|\.claude/settings[^/]*$|(.*/)?\.env(\.local)?$)'
migrations_re='^server/src/db/migrations/'

case "$tool" in
  Edit|Write|MultiEdit|NotebookEdit)
    path="$(printf '%s' "$input" | jq -r '.tool_input.file_path // .tool_input.notebook_path // empty')"
    [ -n "$path" ] || exit 0
    abs="$(realpath -m -- "$path")"
    rel="${abs#"$(realpath -m -- "$root")"/}"
    printf '%s' "$rel" | grep -Eq "$protected_re" && block "'$rel' is a protected path"
    if printf '%s' "$rel" | grep -Eq "$migrations_re" && [ -e "$abs" ]; then
      block "existing migrations are append-only ('$rel'); add a new one with 'pnpm db:generate'"
    fi
    ;;
  Bash)
    cmd="$(printf '%s' "$input" | jq -r '.tool_input.command // empty')"
    [ -n "$cmd" ] || exit 0
    has() { printf '%s' "$cmd" | grep -Eq -- "$1"; }
    has 'docker[ -]compose[^|;&]*down[^|;&]*(-v\b|--volumes)' && block "'docker compose down -v' deletes the dev DB volume; use ./scripts/e2e.sh"
    has 'docker[[:space:]]+volume[[:space:]]+(rm|prune)'       && block "removing docker volumes"
    has 'lint:arch:baseline|depcruise-baseline'                 && block "the dependency-cruiser baseline must never grow"
    has '(^|[[:space:];&|])git[[:space:]]+(commit|push|reset|clean|checkout|switch|restore|stash|rebase|merge|cherry-pick|revert|tag|branch[[:space:]]+-[dDmM])\b' \
      && block "git history/working-tree commands are the user's call (commits only when the user asks)"
    has '--no-verify'                                           && block "--no-verify skips the repo's checks"
    # Shell writes into protected or append-only paths (/dev/null and fd redirects are harmless).
    writes="$(printf '%s' "$cmd" | sed -E 's/[0-9]*>&[0-9]+//g; s#[0-9]*>+ */dev/null##g')"
    if has '(client/src/vendor/ui/|server/src/db/migrations/|dependency-cruiser-known-violations|\.claude/(agents|skills|hooks|settings))' \
       && printf '%s' "$writes" | grep -Eq -- '(sed[[:space:]]+-i|>|tee[[:space:]]|(^|[[:space:];&|])(rm|mv|cp|truncate)[[:space:]])'; then
      block "shell write to a protected or append-only path"
    fi
    ;;
esac
exit 0
