# Insights — cross-module

Accumulated findings that span more than one package. Module-specific lessons go in
`<module>/INSIGHTS.md`. Newest first.

**Entry format:** `### YYYY-MM-DD — short title`, then **Symptom** → **Cause** → **Rule**.
When a rule keeps biting, promote it to one line in the relevant `CLAUDE.md` (Gotchas)
and mark the entry `(promoted)`.

---

### 2026-11-19 — The two `@devdigest/shared` copies have diverged (promoted)
- **Symptom:** `diff -rq client/src/vendor/shared server/src/vendor/shared` reports
  differences in `adapters.ts`, `contracts/eval-ci.ts`, `knowledge.ts`, `productionize.ts`, `trace.ts`.
- **Cause:** contracts are vendored per package (no workspace); edits landed in one copy only.
- **Rule:** a contract change touches both copies; reviewer-core reads the server copy.

### 2026-11-19 — "Reset everything" advice conflicts with real data (promoted)
- **Symptom:** README Troubleshooting suggests `docker compose down -v`; `e2e/README.md`
  warns that `-v` deletes the `devdigest_pgdata` volume with every imported repo.
- **Cause:** the reset advice predates people using the studio on real repos.
- **Rule:** to get a clean DB for tests use `./scripts/e2e.sh` (isolated Postgres), not `down -v`.
