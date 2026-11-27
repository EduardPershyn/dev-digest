#!/usr/bin/env bash
# PreToolUse hook for the `planner` subagent (.claude/agents/planner.md).
# Keeps Bash read-only: every command segment must start with an allowlisted
# read-only program, and nothing may write files or run arbitrary code.
# Exit 0 = allow, exit 2 = block (stderr is shown to the agent). Fails closed.
set -uo pipefail

block() { echo "readonly-bash: blocked — $1. The planner is read-only; use Read/Grep/Glob or a read-only command." >&2; exit 2; }

command -v jq >/dev/null 2>&1 || block "jq is not installed, cannot inspect the command"
input="$(cat)"
cmd="$(printf '%s' "$input" | jq -r '.tool_input.command // empty')" || block "unreadable hook input"
[ -n "$cmd" ] || exit 0

# Substitutions execute even inside double quotes, so check the raw command.
case "$cmd" in
  *'$('*|*'`'*)     block "command substitution" ;;
  *'<('*|*'>('*)    block "process substitution" ;;
esac

# Mask quoted text (keeps the quote chars, replaces contents with x) so that
# patterns like rg 'a|b' or rg '=>' are not mistaken for pipes or redirects.
mask() {
  awk 'BEGIN { RS = "\001" } {
    out = ""; q = ""; n = length($0)
    for (i = 1; i <= n; i++) {
      c = substr($0, i, 1)
      if (q != "") { if (c == q) { q = ""; out = out c } else out = out "x"; continue }
      if (c == "\047" || c == "\"") { q = c; out = out c; continue }
      if (c == "\\" && i < n) { out = out "xx"; i++; continue }
      out = out c
    }
    printf "%s", out
  }'
}

# Harmless redirections are stripped before the write checks.
clean="$(printf '%s' "$cmd" | mask | sed -E 's/[0-9]*>&[0-9]+//g; s#[0-9]*>+ */dev/null##g')"

case "$clean" in
  *'>'*)            block "output redirection" ;;
esac
printf '%s' "$clean" | grep -Eq -- '(^|[[:space:]])--(output|pre|exec)(=|[[:space:]]|$)' \
  && block "an option that writes output or runs a program (--output/--pre/--exec)"

allowed_prog=' git ls cat head tail rg grep find wc jq diff sort uniq cut tr echo printf pwd cd test stat file basename dirname realpath true '
allowed_git=' log show diff blame status merge-base ls-files ls-tree rev-parse grep cat-file shortlog describe '

# Split into segments on | || && ; and newlines.
while IFS= read -r seg; do
  seg="$(printf '%s' "$seg" | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//')"
  [ -z "$seg" ] && continue
  read -r -a words <<<"$seg"
  prog="${words[0]}"
  case "$allowed_prog" in *" $prog "*) ;; *) block "'$prog' is not on the read-only allowlist" ;; esac
  case "$prog" in
    git)
      sub=""
      for w in "${words[@]:1}"; do
        case "$w" in --no-pager|-P) continue ;; -*) block "git global option '$w'" ;; *) sub="$w"; break ;; esac
      done
      case "$allowed_git" in *" $sub "*) ;; *) block "'git $sub' is not read-only" ;; esac
      ;;
    find)
      printf '%s' "$seg" | grep -Eq -- '-(exec|execdir|ok|okdir|delete|fprint|fprint0|fprintf|fls)\b' \
        && block "find with an action that writes or executes"
      ;;
    sort)
      printf '%s' "$seg" | grep -Eq -- '(^|[[:space:]])-[a-zA-Z]*o' && block "sort -o writes a file"
      ;;
  esac
done < <(printf '%s\n' "$clean" | sed -E 's/\|\||&&|[|;&]/\n/g')

exit 0
