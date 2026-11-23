import { eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { RepoRow } from '../../db/rows.js';
import type { WorkspaceStore } from './ports.js';

/** F1 — workspace data-access: the workspace's repos (read-only overview). */
export class WorkspaceRepository implements WorkspaceStore {
  constructor(private db: Db) {}

  async listRepos(workspaceId: string): Promise<RepoRow[]> {
    return this.db.select().from(t.repos).where(eq(t.repos.workspaceId, workspaceId));
  }
}
