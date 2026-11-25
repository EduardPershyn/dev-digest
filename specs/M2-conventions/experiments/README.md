# M2 Conventions — extraction + controlled experiment

Reproducible procedure for [`../../M2-conventions.md`](../../M2-conventions.md) (Agent +
experiment). The question it answers: does a skill **extracted from the repo's own code**
help the **API Contract Reviewer** catch a PR that breaks the repo's house conventions?

Same rules as the M2 skills experiments
([`../../M2-skills/experiments/README.md`](../../M2-skills/experiments/README.md)): the
same PR, the same agent and model, reviewed twice, with only the skill blocks changing.
Nothing in this folder is run by DevDigest. The files are pushed to a **sandbox
repository** you own and have imported into the studio.

## Fixture

`base/src/routes/` has three routes that share four conventions:

| Convention | invoices.ts | orders.ts | customers.ts |
|---|---|---|---|
| Path param is `:id`, parsed with a `Params` Zod schema | ✓ | ✓ | ✓ |
| Query params are optional, with defaults in the destructuring | ✓ | ✓ | ✓ |
| Money is `amount` (major units) + `currency` | ✓ | ✓ | ✓ (`balance`) |
| A missing record answers `404 { error: 'not_found' }` | ✓ | ✓ | ✓ |

The breaking PR is the existing
[`../../M2-skills/experiments/02-api-contract/pr/src/routes/invoices.ts`](../../M2-skills/experiments/02-api-contract/pr/src/routes/invoices.ts).
It renames `:id` to `:invoiceId`, makes `?currency` required and replaces `amount` with
`amount_cents`, which breaks three of the four conventions.

## Before you start

1. The stack is running with migrations applied (`cd server && pnpm db:migrate`, which now
   includes `0012_conventions`) and seeded. The seed creates **API Contract Reviewer** with
   `breaking-change`, `response-schema` and `semver-discipline`.
2. An OpenRouter key is set in **Settings → API Keys**.
3. **Settings → Feature models → Conventions**: pick a cheap model, e.g. the OpenRouter
   DeepSeek flash model the seeded agents use. The registry default (`gpt-5.4`) works but
   costs more.

## 1. Import the third skill (import demo)

**Skills → Add Skill → Import from file…** → `docs/skills-samples/deprecation-policy.md`
→ check the preview → tick the confirmation → **Save skill**. Then **Agents → API Contract
Reviewer → Skills → Attach skill → deprecation-policy**.

## 2. Push the base code to the sandbox repo

```sh
# in a clone of the sandbox repo, on its default branch
mkdir -p src/routes
cp <dev-digest>/specs/M2-conventions/experiments/base/src/routes/*.ts src/routes/
git add src/routes && git commit -m "feat(api): invoices, orders, customers" && git push
```

In the studio, add the repo (or **Refresh** it if it is already imported) and wait for
**Indexed**. Extraction refuses to run (409) until repo-intel has ranked the files.

## 3. Extract conventions → skill

1. Sidebar → **SKILLS LAB → Conventions** (or `g c`) → **Run extraction**. The request is
   synchronous (one model call, usually 10–60 s). The toast shows
   `Kept K of P · I dropped for invalid evidence · D duplicates`.
2. Check each card's evidence link opens GitHub at the cited lines.
3. **Accept** the route / query / money / 404 conventions. **Reject** at least one
   (anything generic or wrong).
4. Optional: **Re-scan**. Accepted and rejected cards stay as they are and are not proposed
   again.
5. **Create skill** → check the merged body → keep the name `repo-conventions` → turn
   **Enabled** on → **Create skill**.
6. **Agents → API Contract Reviewer → Skills → Attach skill → repo-conventions**. The agent
   now has 5 skills (3 seeded, 1 imported, 1 extracted).

> Say this on camera: *"The model proposed these rules, but every card quotes code that the
> server found in the file it was sent. I decide which rules become instructions, and the
> skill reaches a prompt only after I save it and switch it on."*

## 4. Run the experiment

```sh
git checkout -b exp/invoice-conventions
cp <dev-digest>/specs/M2-skills/experiments/02-api-contract/pr/src/routes/invoices.ts src/routes/
git commit -am "refactor(api): tidy invoice route"
git push -u origin exp/invoice-conventions
gh pr create --title "Tidy invoice route" --body "Small cleanup of the invoice handler."
```

In the studio: **Pull Requests → Refresh** → open the PR.

1. **Skills off:** untick all 5 skills on the agent's Skills tab (`0 of 5 enabled`) → **Run
   Review ▾ → API Contract Reviewer**.
2. **Skills on:** tick all 5 (`5 of 5 enabled`) → run again.
3. Open the skills-on run → **Open run trace & logs** → **Prompt assembly**. Expect a
   `Skill · repo-conventions · v1` block whose text carries `source="extracted"`, next to
   the other four blocks.

**Expected with skills:** findings that cite the repo's own conventions. The path param no
longer matches `:id` as in `orders.ts` / `customers.ts`, `currency` is no longer optional
with a default, and `amount` + `currency` became `amount_cents`.
**Expected without skills:** fewer of these, or the same changes reported as generic
breaking changes without the house-rule reference.

## Results (fill in from real runs; copy into the PR description)

Record what you observed, including runs that differ from the expectation. If the
skills-off run already catches everything, make the fixture subtler rather than weakening
the base prompt.

| Run | Agent / version | Skills | Findings that hit the target | Tokens in | Cost |
|---|---|---|---|---|---|
| Extraction | Conventions model: ? | — | kept ? of ? (invalid ?, dup ?) | | |
| API contract | API Contract Reviewer v? | off | | | |
| API contract | API Contract Reviewer v? | on (5) | | | |
