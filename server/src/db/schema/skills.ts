import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  jsonb,
  primaryKey,
  uniqueIndex,
  timestamp,
} from 'drizzle-orm/pg-core';
import { now } from './_shared';
import { workspaces } from './core';

// M2 — a skill is TEXT ONLY (no tools / code). `name` is a workspace-unique slug.
export const skills = pgTable(
  'skills',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description').notNull(),
    type: text('type', { enum: ['rubric', 'convention', 'security', 'custom'] }).notNull(),
    source: text('source', {
      enum: ['manual', 'imported_file', 'imported_url', 'extracted', 'community'],
    }).notNull(),
    body: text('body').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    version: integer('version').notNull().default(1),
    evidenceFiles: jsonb('evidence_files').$type<string[]>(),
    createdAt: now(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({ nameUq: uniqueIndex('skills_workspace_name_uq').on(t.workspaceId, t.name) }),
);

export const skillVersions = pgTable(
  'skill_versions',
  {
    skillId: uuid('skill_id')
      .notNull()
      .references(() => skills.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    // M2 — the whole text config is snapshotted (nullable: older rows had body only).
    name: text('name'),
    description: text('description'),
    type: text('type', { enum: ['rubric', 'convention', 'security', 'custom'] }),
    body: text('body').notNull(),
    createdAt: now(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.skillId, t.version] }) }),
);
