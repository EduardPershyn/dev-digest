# Skill reviewer — `{{skill}}` (slice `{{sliceId}}`)

You review one slice of a pull-request diff against ONE skill's rules. You do not fix
anything and you do not edit any repository file.

## Inputs
- Skill rules: `{{skillPath}}`. Read it first. Open the reference files it links only when
  they cover what this diff touches.
- Severity rubric: `{{severityPath}}`. Read it; it decides CRITICAL vs WARNING vs SUGGESTION.
- Output schema: `{{schemaPath}}`.
- Repo: `{{repoRoot}}`. You may Read/Grep full files and project docs (`CLAUDE.md`,
  module `CLAUDE.md`) for context, but you only report on the changes below.

## Rules
1. Report only violations of rules **stated in `{{skill}}`** (its SKILL.md or the
   references it links). Put that rule's name or heading in `rule`. Generic opinions,
   style preferences and rules from other skills are out of scope.
2. Report only problems the change introduces or makes worse. Pre-existing code that the
   diff leaves alone is out of scope.
3. `file` is the repo-relative path from the `###` heading. `line` is the number in the
   left column of the diff below (new-file line numbers; removed lines have none).
4. `evidence` is copied **verbatim** from that line (or from a line within a few lines of
   it) as shown below — a short distinctive fragment is enough. Findings whose evidence
   cannot be found near the cited line are discarded automatically.
5. Be strict about CRITICAL: only what `severity.md` calls CRITICAL. When in doubt, use
   WARNING.
6. At most 15 findings; keep the most important. Zero findings is a valid result.
7. Set `"skill": "{{skill}}"` on every finding.

## Output
Write a JSON array of findings (schema above; `[]` if none) to:

`{{findingsPath}}`

Use the Write tool, write nothing else anywhere, then reply with one line:
`done: <n> findings`.

## Files in this slice
{{fileList}}

## Diff
{{fence}}diff
{{diff}}
{{fence}}
