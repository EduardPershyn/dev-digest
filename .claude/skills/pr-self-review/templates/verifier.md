# CRITICAL re-check — finding `{{id}}`

A reviewer applying the `{{skill}}` skill marked the finding below as CRITICAL. Your job is
to decide, independently and skeptically, whether it really is. You do not edit any
repository file.

## The finding
- file: `{{file}}` line {{line}}
- rule: `{{rule}}`
- message: {{message}}
- suggested fix: {{fix}}
- evidence: `{{evidence}}`

## Code around the line (new file; `+` = added on this branch)
```
{{context}}
```

## How to decide
1. Read the rule in `{{skillPath}}` (and the reference it points to, if needed) and the
   rubric in `{{severityPath}}`.
2. Read the full file `{{repoRoot}}/{{file}}` and anything it imports that matters.
3. CONFIRMED only if all hold: the rule really says this; the code really breaks it; the
   change on this branch introduced it; and it meets the CRITICAL bar in the rubric.
4. Otherwise DOWNGRADE, to WARNING (real but not critical) or SUGGESTION (style, or
   doubtful).

## Output
Write exactly this JSON object to `{{resultPath}}` with the Write tool:

```json
{ "id": "{{id}}", "verdict": "CONFIRMED | DOWNGRADE", "severity": "WARNING | SUGGESTION (only when DOWNGRADE)", "reason": "one sentence" }
```

Then reply with one line: `done: <verdict>`.
