# Fastify — the delivery ring

Fastify is a **driving adapter**: it turns HTTP into calls on application services and
turns results/errors back into HTTP. It is also where each module is wired, because a
module *is* a Fastify plugin (`modules/<f>/routes.ts`, registered in `modules/index.ts`).

## A route handler does exactly four things

1. Validate input with the route `schema` (`fastify-type-provider-zod`) — never hand-parse `req.body`.
2. Resolve request context: `getContext(app.container, req)` → `{ workspaceId, userId }`.
3. Call **one** service method with plain values (not `req`, not `reply`).
4. Map the result: status code, response body. Errors are thrown as `AppError` subclasses
   and shaped by the global error handler — no try/catch-to-status mapping in handlers.

If a handler has a loop, a query, an `if` about business state, or calls two services in
sequence, that logic belongs in a service method.

## Module wiring lives at the top of routes.ts

```ts
// modules/repos/routes.ts
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { Container } from '../../platform/container.js';
import { RepoInput } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { RepoRepository } from './repository.js';
import { RepoService } from './service.js';

/** Module composition: the ONLY place this module turns the Container into ports. */
function buildRepoService(c: Container): RepoService {
  return new RepoService({
    store: new RepoRepository(c.db),
    git: c.git,
    jobs: c.jobs,
    secrets: c.secrets,
  });
}

export default async function reposRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = buildRepoService(app.container);

  app.post('/repos', { schema: { body: RepoInput } }, async (req, reply) => {
    const { workspaceId, userId } = await getContext(app.container, req);
    const { repo, created } = await service.add(workspaceId, userId, req.body.url);
    reply.status(created ? 201 : 200);
    return repo;
  });
}
```

Why here and not in `container.ts`: the container stays a registry of *shared*
infrastructure (db, secrets, git, github, llm, jobs, runBus, cross-module repositories),
while each module owns how its own service is assembled. Cross-module repositories that
several modules need (`agentsRepo`, `reviewRepo`) stay as `Container` getters.

The `Container` (service locator) stops at `routes.ts`. `lint:arch` rule
`container-only-in-delivery` enforces this.

## Decorators and encapsulation

- `app.container` is a decorator — outer-ring plumbing. Inner rings never see
  `FastifyInstance`, `FastifyRequest`, `FastifyReply` or decorators.
- Module plugins are encapsulated (no `fastify-plugin`), so hooks/decorators a module adds
  don't leak to siblings. Use `fastify-plugin` only for cross-cutting infra registered from
  `app.ts` (helmet, cors, rate-limit, the container decorator).
- Don't use decorators as a second DI container for business services — that hides
  dependencies the constructor should show.
- `@fastify/awilix` is the official DI plugin; not adopted (team decision: keep the
  hand-written `Container` + constructor injection of ports). Revisit only if wiring
  functions become repetitive across many modules.

## Errors

- Services throw `NotFoundError`, `ValidationError`, `ExternalServiceError`, `ConfigError`
  (or a new `AppError` subclass in `platform/errors.ts`).
- Adapters translate vendor errors (Octokit 404, Postgres unique violation) into these at
  the adapter boundary, so services never `instanceof` a vendor error.
- The global handler in `app.ts` is the single place that maps `AppError` → envelope.

## SSE

SSE endpoints are delivery code: they subscribe to the `runBus` and stream. The service
only *publishes* domain events through a port — see `jobs-and-sse.md`.

## Sources
- https://fastify.dev/docs/latest/Reference/Encapsulation/
- https://fastify.dev/docs/v5.2.x/Guides/Plugins-Guide
- https://github.com/fastify/fastify/blob/main/docs/Reference/Decorators.md
- https://www.npmjs.com/package/@fastify/awilix
