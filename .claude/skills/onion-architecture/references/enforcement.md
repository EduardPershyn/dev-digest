# Enforcement — dependency-cruiser

Config: `server/.dependency-cruiser.cjs` (one config cruises `server/src` **and**
`../reviewer-core/src`; reviewer-core paths appear as `../reviewer-core/src/...`).
Baseline: `server/.dependency-cruiser-known-violations.json`.

```bash
cd server
pnpm lint:arch            # fails only on violations NOT in the baseline
pnpm lint:arch:baseline   # regenerate baseline — only after FIXING legacy violations
npx depcruise src ../reviewer-core/src --config .dependency-cruiser.cjs --no-ignore-known --output-type err   # see everything
```

## Rules and how to fix a hit

| Rule | Meaning | Fix |
|---|---|---|
| `db-only-in-repositories` | non-repository module file imports `src/db/*` or `drizzle-orm` | add a method to the module's store port + repository; return domain types |
| `fastify-only-in-delivery` | Fastify imported outside `routes.ts` / `_shared/` | pass plain values into the service; keep `req`/`reply` in the route |
| `vendor-sdks-only-in-adapters` | module/platform imports octokit, openai, anthropic, simple-git, ripgrep, ast-grep, tiktoken, postgres | define/extend a port, implement it in `src/adapters/<tech>/`, wire in container |
| `concrete-adapters-only-in-composition-root` | anything but `container.ts`/`app.ts`/`adapters/` imports `src/adapters/*` | depend on the port type from `@devdigest/shared`; move pure helpers out of `adapters/` |
| `container-only-in-delivery` | a service/helper imports `platform/container.ts` | constructor `deps` of ports; build them in `routes.ts` |
| `domain-files-are-pure` | `constants`/`types`/`helpers` import service/repository/routes/db/adapters/container/jobs/sse | take domain types as input; move I/O to service/repository |
| `no-reaching-into-other-modules` | module A imports module B's service/routes/repository/ports | use B's `index.ts`/`types.ts`/`constants.ts`, or a shared port via `Container` |
| `no-circular` | import cycle | usually a service importing `container.ts` — inject instead |
| `core-does-not-import-server` | reviewer-core imports server code other than `vendor/shared` | pass the data in as an argument |
| `core-sdk-fenced-to-llm` | `openai` imported outside `reviewer-core/src/llm/` | use the `LLMProvider` port |
| `core-openrouter-only-exported` | engine code imports `llm/openrouter.ts` | receive `LLMProvider` as an argument |
| `core-no-io-builtins` | reviewer-core imports fs/child_process/net/http… | caller does the I/O and passes data in |

## Changing the rules

- A rule change needs a reason in its `comment` and a line in the module's `INSIGHTS.md`.
- Prefer tightening. Loosening a rule to get a PR green is the same as growing the baseline.
- Probe new rules with a throwaway violating file and confirm they fire, then delete it —
  a rule that can't fire is worse than none (e.g. `node_modules` must not be in `options.exclude`,
  or SDK rules silently never match).
- When `.github/workflows/` should run `pnpm lint:arch`, read `TESTING.md` first.

## Sources
- https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md
- https://spin.atomicobject.com/dependency-cruiser-imports/
- https://xebia.com/blog/taking-frontend-architecture-serious-with-dependency-cruiser/
- https://medium.com/better-programming/validate-dependencies-according-to-clean-architecture-743077ea084c
