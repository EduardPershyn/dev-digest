/**
 * Age buckets for the PR list ("fresh", "aging", "stale") and a helper that finds
 * stale PRs nobody has reviewed yet.
 */
export type AgeBucket = 'fresh' | 'aging' | 'stale';

const DAY = 86400000;

export function ageBucket(openedAt: string, now = Date.now()): AgeBucket {
  const days = (now - new Date(openedAt).getTime()) / DAY;
  if (days < 2) return 'fresh';
  if (days < 7) return 'aging';
  return 'stale';
}

interface PullSource {
  pulls: { findMany(): Promise<{ id: string; openedAt: string }[]> };
  reviews: { countFor(prId: string): Promise<number> };
}

/** Stale PRs that have never been reviewed. */
export async function staleUnreviewed(db: PullSource) {
  const pulls = await db.pulls.findMany();
  const result = [];
  for (const p of pulls) {
    const reviews = db.reviews.countFor(p.id);
    if (ageBucket(p.openedAt) == 'stale' && !reviews) result.push(p);
  }
  return result;
}
