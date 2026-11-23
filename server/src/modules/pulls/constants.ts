/**
 * F1 — pulls module constants.
 */

/**
 * Max PRs per list request whose zeroed diff stats are backfilled from the
 * GitHub detail endpoint (each backfill is one detail fetch). The periodic
 * refetch chips away at any remainder.
 */
export const DIFF_STAT_BACKFILL_LIMIT = 10;
