# External services — ports in the core, SDKs in adapters

## The pattern already in place

`server/src/vendor/shared/adapters.ts` defines the ports: `LLMProvider`, `Embedder`,
`GitHubClient`, `GitClient`, `CodeIndex`, `SecretsProvider`, `AuthProvider`.
`src/adapters/<tech>/` implements them; `platform/container.ts` constructs them lazily and
lets tests swap them through `ContainerOverrides`. Keep extending this; don't bypass it.

| Port | Adapter(s) | SDK confined there |
|---|---|---|
| `LLMProvider` | `adapters/llm/openai.ts`, `adapters/llm/anthropic.ts`, `reviewer-core/src/llm/openrouter.ts` | `openai`, `@anthropic-ai/sdk` |
| `GitHubClient` | `adapters/github/octokit.ts` | `octokit` |
| `GitClient` | `adapters/git/simple-git.ts` | `simple-git` |
| `CodeIndex` | `adapters/codeindex/ripgrep.ts` | `@vscode/ripgrep` |
| `Embedder` | `adapters/embedder/openai.ts` | `openai` |
| `DepGraph`, `Tokenizer`, `SourceParser` (ports owned by `repo-intel/ports.ts`) | `adapters/depgraph`, `adapters/tokenizer`, `adapters/astgrep/source-parser.ts` | `dependency-cruiser`, `js-tiktoken`, `@ast-grep/napi` |

## Adding a new external service (e.g. GitLab, a new LLM vendor)

1. **Port first**, shaped by what the use case needs, in domain terms. Shared across
   modules → `@devdigest/shared/adapters.ts`; one module only → `modules/<f>/ports.ts`.
2. **Adapter** in `src/adapters/<tech>/`: the only file importing the SDK. It maps vendor
   types → domain types and vendor errors → `ExternalServiceError`/`NotFoundError`.
3. **Wire** it in `container.ts` (lazy getter, secret via `SecretsProvider`, override slot
   in `ContainerOverrides`, mock in `adapters/mocks.ts`).
4. **Inject** it into services via their `deps`.

A second LLM vendor = a new adapter implementing `LLMProvider`; zero changes in services or
reviewer-core. If a change needs a vendor-specific option in a service, extend the port
with a vendor-neutral option instead.

## reviewer-core purity

reviewer-core is the innermost, most reused code (studio + CI runner):

- Imports only `@devdigest/shared` from the server tree, plus `zod`.
- No filesystem, network, process or DB access. Everything comes in as arguments
  (diff, agent config, repo map…); the only side effect is the injected `LLMProvider`.
- **Fenced adapter area: `reviewer-core/src/llm/`** (team decision). `openrouter.ts`
  may import `openai` because both consumers need the same OpenRouter provider. Rules:
  - only `src/llm/` may import `openai`;
  - only `src/index.ts` may import `llm/openrouter.ts` (to re-export it);
  - engine code (`review/`, `prompt.ts`, `grounding.ts`, `output/`) receives an `LLMProvider`
    and never knows it's OpenRouter.
- Untrusted content still goes through `wrapUntrusted`; grounding is never bypassed —
  see `reviewer-core/CLAUDE.md`.

## Pure helpers that ended up in adapters/

Pure code under `src/adapters/` that a module imports trips
`concrete-adapters-only-in-composition-root`. Two accepted fixes:
- **Move it inward** when it's general domain logic — e.g. the unified-diff parser now
  lives in `platform/diff-parser.ts`.
- **Wrap it behind a port** when it's tied to a technology — e.g. ast-grep parsing and
  regex fact extraction are exposed as `astGrepSourceParser: SourceParser`
  (`adapters/astgrep/source-parser.ts`), injected via `container.sourceParser`.
  Typing the adapter object as the port is the conformance check.

A module-owned port that an adapter implements (`repo-intel/ports.ts` ← `adapters/tokenizer`)
is fine: infrastructure depending inward is the point.

## Sources
- https://baabakk.github.io/llm-ports/concepts/ports-and-adapters
- https://dev.to/baabbakk/stop-scattering-llm-sdkapi-calls-across-your-codebase-here-is-the-2-file-rule-that-fixed-mine-54on
- https://tianpan.co/blog/2026-07-02-ports-and-adapters-for-agents
- https://blog.ploeh.dk/2017/02/02/dependency-rejection/
- https://blog.ploeh.dk/2020/03/02/impureim-sandwich/
