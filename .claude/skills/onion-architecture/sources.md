# Sources

Research behind this skill (compiled 2026-11-23). "Canonical" = standard references cited
from prior knowledge, not re-fetched during the research.

## Onion Architecture and related styles
- Jeffrey Palermo — The Onion Architecture, part 1: https://jeffreypalermo.com/2008/07/the-onion-architecture-part-1/
- Palermo — part 3 (vs. traditional layering): https://jeffreypalermo.com/2008/08/the-onion-architecture-part-3/
- Palermo — series incl. Part 4 "After Four Years": https://jeffreypalermo.com/tag/onion-architecture
- Herberto Graça — Onion Architecture: https://herbertograca.com/2017/09/21/onion-architecture/
- Graça — DDD, Hexagonal, Onion, Clean, CQRS… How I put it all together: https://herbertograca.com/2017/11/16/explicit-architecture-01-ddd-hexagonal-onion-clean-cqrs-how-i-put-it-all-together/
- Graça — Reflecting architecture and domain in code: https://herbertograca.com/2019/06/05/reflecting-architecture-and-domain-in-code/
- Oliver Drotbohm — Sliced Onion Architecture: https://odrotbohm.github.io/2023/07/sliced-onion-architecture
- Allegro Tech — Onion Architecture: https://blog.allegro.tech/2023/02/onion-architecture.html
- NDepend — Onion Architecture layers: https://blog.ndepend.com/onion-architecture-layers/
- Bitloops — Onion Architecture: https://bitloops.com/resources/software-architecture/onion-architecture
- Canonical: Alistair Cockburn — Hexagonal Architecture: https://alistair.cockburn.us/hexagonal-architecture/
- Canonical: Robert C. Martin — The Clean Architecture: https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html
- Mark Seemann — Functional architecture is Ports and Adapters: https://blog.ploeh.dk/2016/03/18/functional-architecture-is-ports-and-adapters/
- Seemann — Dependency rejection: https://blog.ploeh.dk/2017/02/02/dependency-rejection/
- Seemann — Impureim sandwich: https://blog.ploeh.dk/2020/03/02/impureim-sandwich/
- Seemann — Dependency inversion without inversion of control: https://blog.ploeh.dk/2025/01/27/dependency-inversion-without-inversion-of-control/

## TypeScript / Node.js
- Remo Jansen — Onion Architecture in Node.js with TypeScript and InversifyJS: https://dev.to/remojansen/implementing-the-onion-architecture-in-nodejs-with-typescript-and-inversifyjs-10ad
- Khalil Stemmler — Clean Node.js Architecture: https://khalilstemmler.com/articles/enterprise-typescript-nodejs/clean-nodejs-architecture/
- Domain-Driven Hexagon: https://github.com/code-xhyun/domain-driven-hexagon
- Onion Architecture with NestJS and Nx: https://betterprogramming.pub/onion-architecture-with-nest-js-and-nx-d9b5c7126b37

## Fastify
- Encapsulation: https://fastify.dev/docs/latest/Reference/Encapsulation/
- Plugins Guide: https://fastify.dev/docs/v5.2.x/Guides/Plugins-Guide
- Decorators: https://github.com/fastify/fastify/blob/main/docs/Reference/Decorators.md
- Ecosystem: https://fastify.dev/docs/latest/Guides/Ecosystem.md
- @fastify/awilix: https://www.npmjs.com/package/@fastify/awilix
- fastify-clean-architecture example: https://github.com/revell29/fastify-clean-architecture
- node-clean-architecture: https://github.com/rasouza/node-clean-architecture
- Snyk — Fastify plugins: https://snyk.io/blog/fastify-plugins-for-backend-node-js-api/

## Drizzle / persistence / transactions
- Drizzle — Transactions: https://orm.drizzle.team/docs/transactions
- Sentry — Atomic repositories in Clean Architecture and TypeScript: https://blog.sentry.io/atomic-repositories-in-clean-architecture-and-typescript
- Transactions with DDD and repository pattern in TypeScript (part 2): https://medium.com/@joaojbs199/transactions-with-ddd-and-repository-pattern-in-typescript-a-guide-to-good-implementation-part-2-da0af3e10901
- Repository pattern in NestJS with Drizzle: https://medium.com/@vimulatus/repository-pattern-in-nest-js-with-drizzle-orm-e848aa75ecae
- Cosmic Python — Repository pattern chapter: https://github.com/cosmicpython/book/blob/667b2fd80e09251871dc4e20e645eae3ecb42442/chapter_02_repository.asciidoc

## Zod / boundaries
- Canonical: Alexis King — Parse, don't validate: https://lexi-lambda.github.io/blog/2019/11/05/parse-don-t-validate/
- Validation at the boundary: https://jagreehal.github.io/jagreehal-typescript-patterns/patterns/validation
- Where Zod ends and the type system begins: https://dev.to/gabrielanhaia/runtime-validation-in-typescript-where-zod-ends-and-the-type-system-begins-4e9e
- Parse, don't validate in TypeScript: https://dev.to/paradane/parse-dont-validate-in-typescript-a-practical-tutorial-1ahc

## LLM / external-service ports
- llm-ports — Ports and adapters: https://baabakk.github.io/llm-ports/concepts/ports-and-adapters
- The 2-file rule for LLM SDK calls: https://dev.to/baabbakk/stop-scattering-llm-sdkapi-calls-across-your-codebase-here-is-the-2-file-rule-that-fixed-mine-54on
- Tian Pan — Ports and Adapters for Agents: https://tianpan.co/blog/2026-07-02-ports-and-adapters-for-agents

## Testing
- DZone — Testing repository adapters with hexagonal architecture: https://dzone.com/articles/testing-repository-adapters-with-hexagonal-architecture
- Malt — repository contract test example: https://github.com/Maltcommunity/repository-test-example
- Hexagonal in practice — tests that skip the database: https://dev.to/tacoda/hexagonal-architecture-in-practice-ports-adapters-and-tests-that-skip-the-database-5b19
- Testing use cases without a database: https://dev.to/gabrielanhaia/testing-use-cases-without-a-database-and-why-your-tests-are-slow-3403

## Enforcement
- dependency-cruiser rules reference: https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md
- Atomic Object — restrict imports with dependency-cruiser: https://spin.atomicobject.com/dependency-cruiser-imports/
- Xebia — architecture with dependency-cruiser: https://xebia.com/blog/taking-frontend-architecture-serious-with-dependency-cruiser/
- Validate dependencies according to Clean Architecture: https://medium.com/better-programming/validate-dependencies-according-to-clean-architecture-743077ea084c
- fresh-onion: https://dev.to/remojansen/enforce-clean-architecture-in-your-typescript-projects-with-fresh-onion-45pi
