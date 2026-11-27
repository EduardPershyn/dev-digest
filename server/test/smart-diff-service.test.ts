import { describe, it, expect } from 'vitest';
import { SmartDiffResponse } from '@devdigest/shared';
import { SmartDiffService } from '../src/modules/smart-diff/service.js';
import type { SmartDiffSource } from '../src/modules/smart-diff/ports.js';
import { NotFoundError } from '../src/platform/errors.js';
import type { PrFileRecord, PullRecord } from '../src/modules/_shared/records.js';

const WS = 'ws-1';
const PR = 'pr-1';

function prFile(path: string): PrFileRecord {
  return { id: path, prId: PR, path, additions: 2, deletions: 1, patch: null };
}

/** In-memory fake of the port: one PR in WS with the given files and no reviews. */
function fakeSource(files: PrFileRecord[]): SmartDiffSource {
  const pull = { id: PR, workspaceId: WS } as PullRecord;
  return {
    getPull: async (workspaceId, prId) =>
      workspaceId === WS && prId === PR ? pull : undefined,
    getPrFiles: async (prId) => (prId === PR ? files : []),
    reviewsForPull: async () => [],
  };
}

describe('SmartDiffService.forPull', () => {
  it('rejects with NotFoundError for an unknown PR or a PR of another workspace', async () => {
    const service = new SmartDiffService({ source: fakeSource([]) });
    await expect(service.forPull(WS, 'nope')).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.forPull('other-ws', PR)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('before any review: groups present, every finding_lines empty, response parses', async () => {
    const service = new SmartDiffService({
      source: fakeSource([prFile('src/a.ts'), prFile('src/a.test.ts'), prFile('README.md')]),
    });
    const res = await service.forPull(WS, PR);
    expect(() => SmartDiffResponse.parse(res)).not.toThrow();
    expect(res.groups.map((g) => g.role)).toEqual(['core', 'tests', 'docs']);
    expect(res.groups.flatMap((g) => g.files).every((f) => f.finding_lines.length === 0)).toBe(true);
    expect(res.split_suggestion.total_lines).toBe(9);
  });
});
