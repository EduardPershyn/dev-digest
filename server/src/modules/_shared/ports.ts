/**
 * Cross-module application ports (driven side). Implemented by platform
 * infrastructure and handed to services by each module's `routes.ts` wiring.
 * Services depend on these narrow shapes — never on `Container` or the concrete
 * `JobRunner` / `runBus` classes.
 */

/** Enqueue a background job (implemented by `platform/jobs.ts` JobRunner). */
export interface JobQueue {
  enqueue(workspaceId: string, kind: string, payload: unknown): Promise<unknown>;
}

/** Structured warning sink (pino-compatible `(obj, msg)`; routes pass `app.log`). */
export interface WarnLogger {
  warn(obj: unknown, msg?: string): void;
}
