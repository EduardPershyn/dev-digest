/**
 * Onion Architecture guardrails for the DevDigest backend (server/src + reviewer-core/src).
 * Rationale, ring map and how to fix each violation:
 *   ../.claude/skills/onion-architecture/references/enforcement.md
 *
 * Run:   pnpm lint:arch            (fails only on NEW violations — known ones are baselined)
 * Shrink the baseline after fixing legacy code:  pnpm lint:arch:baseline
 * Never regenerate the baseline to hide a violation you just introduced.
 *
 * Ring by filename inside a flat module (src/modules/<feature>/):
 *   constants.ts · types.ts · helpers.ts · other pure files   → domain
 *   service.ts · ports.ts · *-executor.ts                    → application
 *   repository.ts · repository/** · *.repo.ts                → infrastructure (Drizzle)
 *   routes.ts                                                → delivery (Fastify)
 */

const MODULE = '^src/modules/[^/]+/';
const REPOSITORY_FILES = '(^src/modules/[^/]+/(repository\\.ts|repository/|.*\\.repo\\.ts$))';
const ROUTE_FILES = '^src/modules/[^/]+/routes\\.ts$';
const DOMAIN_FILES = '^src/modules/[^/]+/(constants|types|helpers)\\.ts$';
const VENDOR_SDKS =
  'node_modules/(octokit|@octokit|openai|@anthropic-ai|simple-git|@vscode/ripgrep|@ast-grep|js-tiktoken|postgres|fflate)/';

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    // ── server/src ───────────────────────────────────────────────────────────
    {
      name: 'db-only-in-repositories',
      comment:
        'Only repository files touch Drizzle, the schema, or row types. Routes/services/helpers go through a repository port and use domain types.',
      severity: 'error',
      from: { path: MODULE, pathNot: REPOSITORY_FILES },
      to: { path: ['^src/db/', 'node_modules/drizzle-orm/'] },
    },
    {
      name: 'fastify-only-in-delivery',
      comment:
        'Fastify is a delivery detail. Only routes.ts (and the _shared request-context helper) may import it.',
      severity: 'error',
      from: { path: MODULE, pathNot: [ROUTE_FILES, '^src/modules/_shared/'] },
      to: { path: ['node_modules/fastify/', 'node_modules/fastify-type-provider-zod/', 'node_modules/@fastify/'] },
    },
    {
      name: 'vendor-sdks-only-in-adapters',
      comment:
        'Vendor SDKs live behind ports in src/adapters/ (or reviewer-core/src/llm). Modules depend on the port from @devdigest/shared.',
      severity: 'error',
      from: { path: '^src/(modules|platform)/', pathNot: '^src/platform/container\\.ts$' },
      to: { path: VENDOR_SDKS },
    },
    {
      name: 'concrete-adapters-only-in-composition-root',
      comment:
        'Only the composition root (platform/container.ts, app.ts) constructs concrete adapters. Everyone else receives the port.',
      severity: 'error',
      from: { path: '^src/', pathNot: ['^src/adapters/', '^src/platform/container\\.ts$', '^src/app\\.ts$', '^src/server\\.ts$'] },
      to: { path: '^src/adapters/', pathNot: '^src/adapters/index\\.ts$' },
    },
    {
      name: 'container-only-in-delivery',
      comment:
        'Container is a service locator. Only routes.ts (the module-level wiring point) and _shared/context.ts may see it; services receive narrow ports in their constructor.',
      severity: 'error',
      from: { path: MODULE, pathNot: [ROUTE_FILES, '^src/modules/_shared/'] },
      to: { path: '^src/platform/container\\.ts$' },
    },
    {
      name: 'domain-files-are-pure',
      comment:
        'constants/types/helpers are the domain ring: no application, infrastructure, delivery or platform I/O imports.',
      severity: 'error',
      from: { path: DOMAIN_FILES },
      to: {
        path: [
          '^src/modules/[^/]+/(service|ports|routes|repository)\\.ts$',
          '^src/modules/[^/]+/repository/',
          '^src/(db|adapters)/',
          '^src/platform/(container|jobs|sse|run-logger)\\.ts$',
        ],
      },
    },
    {
      name: 'no-reaching-into-other-modules',
      comment:
        "Use another module through its index.ts, types.ts or constants.ts, or through a port in the container — never its service/repository/routes.",
      severity: 'error',
      from: { path: '^src/modules/([^/]+)/' },
      to: {
        path: '^src/modules/([^/]+)/(service|routes|repository|ports)',
        pathNot: ['^src/modules/$1/', '^src/modules/_shared/'],
      },
    },
    {
      name: 'no-circular',
      comment: 'Cycles make ring order meaningless.',
      severity: 'error',
      from: { path: '^src/' },
      to: { circular: true },
    },

    // ── reviewer-core/src (the pure engine — innermost rings) ────────────────
    {
      name: 'core-does-not-import-server',
      comment: 'reviewer-core may only use @devdigest/shared (server/src/vendor/shared) from the server tree.',
      severity: 'error',
      from: { path: '^\\.\\./reviewer-core/src/' },
      to: { path: '^src/', pathNot: '^src/vendor/shared/' },
    },
    {
      name: 'core-sdk-fenced-to-llm',
      comment: 'The openai SDK is allowed only in reviewer-core/src/llm/ (the fenced adapter area).',
      severity: 'error',
      from: { path: '^\\.\\./reviewer-core/src/', pathNot: '^\\.\\./reviewer-core/src/llm/' },
      to: { path: 'node_modules/openai/' },
    },
    {
      name: 'core-openrouter-only-exported',
      comment:
        'OpenRouterProvider is an adapter: the engine receives an injected LLMProvider and never imports it. Only index.ts re-exports it.',
      severity: 'error',
      from: { path: '^\\.\\./reviewer-core/src/', pathNot: '^\\.\\./reviewer-core/src/(index|llm/openrouter)\\.ts$' },
      to: { path: '^\\.\\./reviewer-core/src/llm/openrouter\\.ts$' },
    },
    {
      name: 'core-no-io-builtins',
      comment: 'The engine is pure: no filesystem, process, or network access.',
      severity: 'error',
      from: { path: '^\\.\\./reviewer-core/src/' },
      to: {
        dependencyTypes: ['core'],
        path: '^(node:)?(fs|fs/promises|child_process|net|http|https|dgram|worker_threads|cluster)$',
      },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(^|/)(dist|test)/|\\.test\\.ts$' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      extensions: ['.ts', '.js', '.json'],
    },
    reporterOptions: { text: { highlightFocused: true } },
  },
};
