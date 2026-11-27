import { describe, it, expect } from 'vitest';
import { classifyFile } from '../src/modules/smart-diff/helpers.js';

/**
 * Gap cases for `classifyFile` (M3 Smart Diff, spec: specs/M3-smart-diff.md → Classifier).
 * The base path → role table lives in smart-diff-helpers.test.ts; this file pins the
 * edges of each spec glob: depth, root anchoring, rule precedence, look-alike names
 * that must stay `core`, and path normalisation.
 */

describe('classifyFile — glob edges', () => {
  it.each([
    // Barrel index files at any depth → wiring; look-alikes are not barrels.
    ['server/src/modules/smart-diff/index.ts', 'wiring'],
    ['client/src/components/diff-viewer/index.ts', 'wiring'],
    ['index.js', 'wiring'],
    ['src/reindex.ts', 'core'],
    ['src/index-utils.ts', 'core'],
  ] as const)('barrel: %s → %s', (path, role) => {
    expect(classifyFile(path)).toBe(role);
  });

  it.each([
    // `build/**` and `dist/**` are build output only at the repo root.
    ['build/index.js', 'boilerplate'], // boilerplate precedes the barrel (wiring) rule
    ['dist/index.js', 'boilerplate'],
    ['src/build.ts', 'core'],
    ['src/build/steps.ts', 'core'], // a source folder named build is not build output
    ['scripts/build-all.ts', 'core'],
    ['src/dist.ts', 'core'],
  ] as const)('build output: %s → %s', (path, role) => {
    expect(classifyFile(path)).toBe(role);
  });

  it.each([
    // `.env*` matches the basename at any depth; names merely containing "env" do not.
    ['.env', 'wiring'],
    ['.env.local', 'wiring'],
    ['server/.env.production', 'wiring'],
    ['src/environment.ts', 'core'],
    ['src/dotenv.ts', 'core'],
  ] as const)('env: %s → %s', (path, role) => {
    expect(classifyFile(path)).toBe(role);
  });

  it.each([
    ['docker-compose.override.yml', 'wiring'],
    ['infra/docker-compose.dev.yml', 'wiring'],
    ['.eslintrc', 'wiring'],
    ['client/.eslintrc.json', 'wiring'],
    ['tsconfig.base.json', 'wiring'],
    ['server/drizzle.config.ts', 'wiring'],
    // `.github/**` and `.claude/**` win over the docs rule.
    ['.github/PULL_REQUEST_TEMPLATE.md', 'wiring'],
    ['.claude/agents/test-writer.md', 'wiring'],
    // Only a root `.github/` is CI wiring.
    ['src/.github-client.ts', 'core'],
  ] as const)('wiring: %s → %s', (path, role) => {
    expect(classifyFile(path)).toBe(role);
  });

  it.each([
    ['CHANGELOG.md', 'docs'],
    ['CHANGELOG', 'docs'],
    ['packages/ui/CHANGELOG.md', 'docs'],
    ['README.ru.md', 'docs'],
    ['client/README', 'docs'],
    ['LICENSE', 'docs'],
    ['docs/index.ts', 'wiring'], // the barrel rule (wiring) precedes `docs/**`
    ['src/readme-parser.ts', 'core'],
    ['src/license.ts', 'core'],
    ['src/docs.ts', 'core'],
  ] as const)('docs: %s → %s', (path, role) => {
    expect(classifyFile(path)).toBe(role);
  });

  it.each([
    // Directory rules need a whole `test`/`tests` segment.
    ['src/latest/x.ts', 'core'],
    ['src/contest/x.ts', 'core'],
    ['src/testing.ts', 'core'],
    ['src/tests.ts', 'core'],
    ['src/a.test.helpers.ts', 'core'],
    // Tests precede wiring: config inside a test tree travels with the tests.
    ['e2e/tsconfig.json', 'tests'],
    ['server/test/helpers/index.ts', 'tests'],
    // Boilerplate precedes tests: generated / lock files inside a test tree are skimmed.
    ['test/fixtures/package-lock.json', 'boilerplate'],
    ['src/__tests__/api.generated.ts', 'boilerplate'],
    // `e2e/**` is root-anchored.
    ['client/src/e2e-helpers.ts', 'core'],
  ] as const)('tests: %s → %s', (path, role) => {
    expect(classifyFile(path)).toBe(role);
  });

  it.each([
    ['vendor/jquery.min.js', 'boilerplate'],
    ['src/admin.js', 'core'],
    ['src/locker.ts', 'core'],
    ['src/snapshot.ts', 'core'],
  ] as const)('boilerplate look-alikes: %s → %s', (path, role) => {
    expect(classifyFile(path)).toBe(role);
  });
});

describe('classifyFile — path normalisation', () => {
  it.each([
    // Windows separators: root-anchored rules still apply after `\` → `/`.
    ['.github\\workflows\\ci.yml', 'wiring'],
    ['dist\\bundle.js', 'boilerplate'],
    ['e2e\\README.md', 'tests'],
    ['docs\\guide\\setup.md', 'docs'],
    ['server\\src\\modules\\smart-diff\\index.ts', 'wiring'],
    ['src\\__snapshots__\\a.snap', 'boilerplate'],
    // `./` prefix: root-anchored rules still apply once it is stripped.
    ['./dist/a.js', 'boilerplate'],
    ['./build/out.js', 'boilerplate'],
    ['./e2e/specs/10-smart-diff.flow.json', 'tests'],
    ['./.github/workflows/ci.yml', 'wiring'],
    ['./.claude/skills/security/SKILL.md', 'wiring'],
    ['./docs/architecture.png', 'docs'],
    // Both at once: `.\` becomes `./`, then the prefix is stripped.
    ['.\\docs\\architecture.png', 'docs'],
  ] as const)('%s → %s', (path, role) => {
    expect(classifyFile(path)).toBe(role);
  });
});
