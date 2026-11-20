# e2e/specs/ — browser flows (executable specs)

Each `NN-name.flow.json` is an executable specification of one user journey; `run.ts`
runs only `*.flow.json`, so Markdown here is ignored by the runner. Flow format:
[`../README.md`](../README.md). Feature specs for other packages live in
[`../../specs/`](../../specs/README.md).

| Flow | Journey |
|------|---------|
| `01-app-boot.flow.json` | App boots and lands on a repo's PR list |
| `02-repo-pulls-detail.flow.json` | Open a PR from the list and load its review detail |
| `03-agents.flow.json` | Agents list renders the seeded reviewer agents |
| `04-pr-findings.flow.json` | PR detail shows the seeded review run, verdict, and findings |
| `05-pr-diff.flow.json` | PR detail Files changed tab renders the seeded diff |
| `06-onboarding.flow.json` | Onboarding add-repository screen renders |
| `07-settings.flow.json` | Settings renders the API Keys and Feature Models sections |
