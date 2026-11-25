# M2 — controlled experiments (skills off vs. on)

Reproducible procedure for the three checks in [`../../M2-skills.md`](../../M2-skills.md)
(Design → Controlled experiments). Each experiment reviews **the same PR, with the same
agent and model, twice**: once with all of the agent's skills unticked, once with them
ticked. The only variable is the skill blocks in the prompt.

The fixtures here are plain files. DevDigest reviews GitHub PRs, so each experiment is
pushed as a PR to a **sandbox repository** you have imported into the studio (any repo
you own; a fresh empty one is cleanest). Nothing in this folder is run by DevDigest.

## Before you start

1. Stack up: `./scripts/dev.sh` (or `pnpm dev` in `server/` and `client/`), migrations
   applied (`cd server && pnpm db:migrate`) and seeded (`pnpm db:seed`). The seed creates
   **Test Quality Reviewer** and **API Contract Reviewer** with their skills.
2. An OpenRouter key in **Settings → API Keys** (the seeded agents use
   `openrouter/deepseek/deepseek-v4-flash`). Each run costs a few tenths of a cent.
3. Import the third skill through the UI (this is the import demo):
   **Skills → Add Skill → Import from file…** → `docs/skills-samples/test-smells-skill.zip`.
   Check the preview: `SKILL.md` extracted; `scripts/detect-flaky.sh` and
   `scripts/count_mocks.py` listed as *executable — not imported*; `allowed-tools, hooks`
   dropped. Tick the confirmation, tick **Enable now**, **Save skill**.
   Then **Agents → Test Quality Reviewer → Skills → Attach skill → mocking-and-flakiness**.
4. Add the sandbox repo in the studio (**Onboarding → Add repository**) and wait for
   **Indexed**.

> Say this on camera when importing: *"Importing a third-party skill means putting someone
> else's instructions into my agent's prompt. The import only takes the Markdown text,
> shows me what it dropped (scripts, tool permissions) and saves nothing until I confirm."*

## Experiment 1 — test quality (Test Quality Reviewer)

The PR adds `applyDiscount` with four behaviours (unknown-code `throw`, the `> 100 %`
clamp hit by `STAFF120`, the `price === 0` early return, case/whitespace normalisation)
and a test that covers only the happy path.

```sh
# in a clone of the sandbox repo
git checkout -b exp/happy-path-test
mkdir -p src/pricing
cp <dev-digest>/specs/M2-skills/experiments/01-test-quality/src/pricing/* src/pricing/
git add src/pricing && git commit -m "feat(pricing): discount codes"
git push -u origin exp/happy-path-test
gh pr create --title "Add discount codes" --body "Adds applyDiscount with tests."
```

In the studio: **Pull Requests → Refresh** → open the PR.

1. **Skills off.** Agents → Test Quality Reviewer → Skills: untick every skill
   (the badge reads `0 of 3 enabled`). PR → **Run Review ▾ → Test Quality Reviewer**.
2. **Skills on.** Tick all three again (`3 of 3 enabled`). Run the same agent again.
3. Compare the two runs in the PR's **Timeline** (each run shows the agent version).

**Expected with skills:** findings citing `discount.ts` for the untested `throw` (unknown
code), the untested clamp (`STAFF120` → 100 %), the untested `priceCents === 0` branch, and
missing boundary cases (0, negative price, lowercase/whitespace code, rounding).
**Expected without skills:** fewer or none of these; the agent's base prompt has no
branch/boundary checklist.

## Experiment 2 — API contract (API Contract Reviewer)

The base branch has `GET /invoices/:id`; the PR renames the path parameter to `:invoiceId`,
makes `?currency` required, and renames the response field `amount` (units) to
`amount_cents` (cents), with no alias, version bump or client change.

```sh
git checkout main
mkdir -p src/routes
cp <dev-digest>/specs/M2-skills/experiments/02-api-contract/base/src/routes/invoices.ts src/routes/
git add src/routes && git commit -m "feat(api): invoice endpoint" && git push

git checkout -b exp/invoice-contract
cp <dev-digest>/specs/M2-skills/experiments/02-api-contract/pr/src/routes/invoices.ts src/routes/
git commit -am "refactor(api): tidy invoice route"
git push -u origin exp/invoice-contract
gh pr create --title "Tidy invoice route" --body "Small cleanup of the invoice handler."
```

Run **API Contract Reviewer** twice exactly as in experiment 1 (skills unticked, then
ticked: `breaking-change`, `response-schema`, `semver-discipline`, `deprecation-policy`).

**Expected with skills:** CRITICAL breaking-change findings for the renamed path param, the
now-required `currency` query param, and `amount` → `amount_cents` (renamed field + unit
change), each citing the changed line.
**Expected without skills:** the rename may be read as a refactor and missed or under-rated.

## Experiment 3 — execution trace

Open the **skills-on** run from experiment 1 (PR timeline → the run's **Open run trace & logs**) →
**Prompt assembly**:

- A header `Skills — 3 blocks · +N tokens`, then one block per skill
  (`Skill · branch-coverage-gaps · v1`, …) in the order of the agent's Skills tab, each
  with its own `+N tok` count. Expanding a block shows the exact
  `<skill name=… source=…>` text the model received; the imported one carries
  `source="imported_file"`.
- The **skills-off** run has no Skills section at all.
- Untick one skill, re-run: that block is gone from the new trace. Untoggle a skill on the
  **Skills** page (global switch): it disappears from every agent's next run.
- Compare **TOKENS** between the two runs: the difference is roughly the sum of the
  `+N tok` counts.

## Experiment 4 — API Contract Reviewer skills on a real route (PR #2)

The API Contract Reviewer has four skills, each with a directive description and a
Good / Bad example: seeded `breaking-change`, `response-schema` and `semver-discipline`
(`docs/skills/`), and `deprecation-policy`, which you **import** yourself from
`docs/skills-samples/deprecation-policy.md` (the import demo for this agent).

The PR is ready on the owner's fork:
[EduardPershyn/dev-digest#2](https://github.com/EduardPershyn/dev-digest/pull/2), branch
`exp/skill-history-route` → base `exp/skill-history-base`. The base branch is local `main`
(`5b11854`), because GitHub `main` on the fork is behind and would drag the whole M2 skills
diff into the PR. Throwaway: do not merge; delete both branches when done. The PR is
titled "Tidy skill history route" and changes three server files:

| Change | Line | Which skill should catch it |
|---|---|---|
| `GET /skills/:id/versions` → `GET /skills/:id/history` (old path gone) | `skills/routes.ts` | `breaking-change`, `deprecation-policy` |
| new **required** `?limit` query param (no default) | `skills/routes.ts` `HistoryQuery` | `breaking-change` |
| response field `agent_count` → `used_by_agents`, no alias | `skills/helpers.ts` | `response-schema`, `deprecation-policy` |
| server contract copy renamed, **client copy not** (`client/src/vendor/shared/contracts/knowledge.ts` still has `agent_count`; `client/src/lib/hooks/skills.ts` still calls `/versions`) | `server/src/vendor/shared/contracts/knowledge.ts` | `response-schema` |
| breaking change shipped without a version bump or `/v2` | — | `semver-discipline` |

Steps:
1. Reseed if this DB predates the new skills: `cd server && pnpm db:seed`. It adds the three
   seeded skills to the library. It does **not** relink an agent that already has links, so
   on an existing DB open **Agents → API Contract Reviewer → Skills**, detach the old
   `api-contract-breaking-changes` / `shared-contract-sync`, and attach
   `breaking-change`, `response-schema`, `semver-discipline`.
2. **Import:** **Skills → Add Skill → Import from file…** →
   `docs/skills-samples/deprecation-policy.md` → the preview shows name `deprecation-policy`,
   type `convention`, nothing dropped, no warnings → tick the confirmation, tick **Enable
   now** → **Save skill**. Then **Attach skill → deprecation-policy** on the agent
   (`4 of 4 enabled`).
3. Import `EduardPershyn/dev-digest` in the studio if it is not there yet, **Pull Requests →
   Refresh**, open PR #2.
4. **Skills off** (`0 of 4 enabled`) → **Run Review ▾ → API Contract Reviewer**. Then
   **skills on** (`4 of 4 enabled`) → run again. Compare the two runs in the Timeline.

**Expected with skills:** separate findings for the removed `/versions` path, the required
`limit`, the `agent_count` rename with the stale client contract, and the missing version
bump / deprecation step, each naming the missing alias or marker.
**Expected without skills:** the path and field renames are likely reported as one generic
breaking change, or read as a tidy-up. The stale client copy, the required `limit` and the
missing deprecation / version step are likely missed.

## Results (fill in from real runs)

Record what you observed, including runs where the outcome differs from the expectation.
If the skills-off run already catches the issue, make the fixture subtler (for example,
hide the clamp behind a helper); do not weaken the base prompt.

| Experiment | Agent / version | Skills | Findings that hit the target | Tokens in | Cost |
|---|---|---|---|---|---|
| 1 test quality | Test Quality Reviewer v? | off | | | |
| 1 test quality | Test Quality Reviewer v? | on (3) | | | |
| 2 API contract | API Contract Reviewer v? | off | | | |
| 2 API contract | API Contract Reviewer v? | on (4) | | | |
| 4 skill history route | API Contract Reviewer v? | off | | | |
| 4 skill history route | API Contract Reviewer v? | on (4) | | | |
