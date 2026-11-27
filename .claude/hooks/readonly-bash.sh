#!/usr/bin/env bash
# PreToolUse hook (matcher "Bash") that keeps a subagent's Bash read-only: every command
# segment must start with an allowlisted read-only program, and nothing may write files or
# run arbitrary code. An optional profile also allows a few exact check commands:
#
#   (none) / readonly  planner, doc-writer        read-only programs only
#   --profile arch     architecture-reviewer      + pnpm lint:arch, the client architecture test
#   --profile checks   plan-verifier              + arch, typecheck, test suites, node --test
#                                                   on .claude tests, ./scripts/e2e.sh
#   --profile tests    test-writer                + checks, node .claude/scripts/mutation-probe.mjs
#
# Profile commands are matched word by word (after `cd <dir> &&` splitting). Their arguments
# are allowlisted too, so snapshot updates (-u), watch mode, coverage/report files, config
# overrides, installs, the dependency-cruiser baseline and db:* scripts are never reachable.
# Exit 0 = allow, exit 2 = block (stderr is shown to the agent). Fails closed.
# Tests: node --test .claude/hooks/hooks.test.mjs
set -uo pipefail

profile="readonly"
if [ "${1:-}" = "--profile" ]; then profile="${2:-}"; fi

block() {
  echo "readonly-bash[$profile]: blocked — $1. This agent's Bash is read-only (plus the exact check commands its profile allows); use Read/Grep/Glob or an allowed command." >&2
  exit 2
}

case "$profile" in readonly|arch|checks|tests) ;; *) block "unknown profile '$profile'" ;; esac

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

has_profile() { # has_profile <minimum profile>: arch < checks < tests
  case "$1:$profile" in
    arch:arch|arch:checks|arch:tests|checks:checks|checks:tests|tests:tests) return 0 ;;
  esac
  return 1
}

filter_re='^[A-Za-z0-9._/-]+$'          # a test-file/name filter: no glob, no bracket, no leading dash
quoted_re="^'x*'$|^\"x*\"$"             # a whole word that was quoted (contents masked)

# Vitest arguments after `vitest run` / `pnpm test` / `npm test --`: name filters, plus a few
# options that only select or format tests. Everything else (-u, --watch, --coverage,
# --outputFile, --config, --root, --dir, --ui, --api, --globalSetup, ...) is refused.
check_vitest_args() {
  local i=0 w n=$#
  local args=("$@")
  while [ "$i" -lt "$n" ]; do
    w="${args[$i]}"
    case "$w" in
      --exclude|-t|--testNamePattern)
        i=$((i + 1))
        [ "$i" -lt "$n" ] || block "'$w' needs a value"
        local v="${args[$i]}"
        printf '%s' "$v" | grep -Eq -- "$quoted_re|$filter_re" || block "unsupported value for '$w'"
        ;;
      --reporter=default|--reporter=verbose|--reporter=dot|--reporter=basic|--passWithNoTests|--no-file-parallelism|--bail=[0-9]*) ;;
      -*) block "test option '$w' is not allowed (no -u, --watch, --coverage, --outputFile, --config, ...)" ;;
      *) printf '%s' "$w" | grep -Eq -- "$filter_re" || block "test filter '$w' must be a plain name or path fragment (no quotes, globs or brackets)" ;;
    esac
    i=$((i + 1))
  done
}

# Returns 0 if the segment is a command the profile allows, 1 if not; blocks on bad arguments.
profile_command() {
  local words=("$@")
  local n=${#words[@]}
  local line="${words[*]}"
  has_profile arch || return 1
  case "$line" in
    "pnpm lint:arch") return 0 ;;
    "pnpm exec vitest run src/test/architecture.test.ts") return 0 ;;
  esac
  has_profile checks || return 1
  case "$line" in
    "pnpm typecheck"|"npm run typecheck"|"./scripts/e2e.sh"|"../scripts/e2e.sh") return 0 ;;
  esac
  if [ "$n" -ge 2 ] && [ "${words[0]}" = pnpm ] && [ "${words[1]}" = test ]; then
    check_vitest_args "${words[@]:2}"; return 0
  fi
  if [ "$n" -ge 4 ] && [ "${words[0]} ${words[1]} ${words[2]} ${words[3]}" = "pnpm exec vitest run" ]; then
    check_vitest_args "${words[@]:4}"; return 0
  fi
  if [ "$n" -ge 2 ] && [ "${words[0]}" = npm ] && [ "${words[1]}" = test ]; then
    if [ "$n" -gt 2 ]; then
      [ "${words[2]}" = "--" ] || block "pass test arguments after '--' (npm test -- <filter>)"
      check_vitest_args "${words[@]:3}"
    fi
    return 0
  fi
  if [ "$n" -ge 3 ] && [ "${words[0]}" = node ] && [ "${words[1]}" = --test ]; then
    local f
    for f in "${words[@]:2}"; do
      printf '%s' "$f" | grep -Eq -- '^\.claude/[A-Za-z0-9._/-]+\.test\.mjs$' \
        && ! printf '%s' "$f" | grep -q -- '\.\.' \
        || block "node --test only runs .claude/**/*.test.mjs files ('$f')"
    done
    return 0
  fi
  has_profile tests || return 1
  if [ "$n" -ge 2 ] && [ "${words[0]}" = node ] \
     && { [ "${words[1]}" = .claude/scripts/mutation-probe.mjs ] || [ "${words[1]}" = ../.claude/scripts/mutation-probe.mjs ]; }; then
    return 0   # the probe validates its own arguments
  fi
  return 1
}

used_profile=0
# Split into segments on | || && ; and newlines.
while IFS= read -r seg; do
  seg="$(printf '%s' "$seg" | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//')"
  [ -z "$seg" ] && continue
  read -r -a words <<<"$seg"
  prog="${words[0]}"
  case "$allowed_prog" in
    *" $prog "*) ;;
    *)
      # Quoted words survive only as option values (check_vitest_args) or probe arguments;
      # the exact-shape commands never match a quoted word.
      if profile_command "${words[@]}"; then
        used_profile=1
        continue
      fi
      block "'$prog' is not on the read-only allowlist"
      ;;
  esac
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

# Masking hides what the shell will expand. Profile commands run repo code, so a command that
# uses one may not contain variable expansion or backslash escapes anywhere.
if [ "$used_profile" = 1 ]; then
  case "$cmd" in
    *'$'*)  block "variable expansion in a command that runs checks" ;;
    *'\'*)  block "backslash escapes in a command that runs checks" ;;
  esac
fi

exit 0
