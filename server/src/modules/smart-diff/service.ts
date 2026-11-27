import type { SmartDiffResponse } from '@devdigest/shared';
import { NotFoundError } from '../../platform/errors.js';
import { buildSmartDiff, latestReviewFindings } from './helpers.js';
import type { SmartDiffSource } from './ports.js';

export interface SmartDiffServiceDeps {
  source: SmartDiffSource;
}

/**
 * M3 — Smart Diff use case. Deliberately has no LLM port: the route is
 * structurally unable to call a model (spec AC P2-3).
 */
export class SmartDiffService {
  private readonly source: SmartDiffSource;

  constructor(deps: SmartDiffServiceDeps) {
    this.source = deps.source;
  }

  async forPull(workspaceId: string, prId: string): Promise<SmartDiffResponse> {
    const pull = await this.source.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    const [files, rows] = await Promise.all([
      this.source.getPrFiles(prId),
      this.source.reviewsForPull(prId),
    ]);
    return buildSmartDiff(files, latestReviewFindings(rows));
  }
}
