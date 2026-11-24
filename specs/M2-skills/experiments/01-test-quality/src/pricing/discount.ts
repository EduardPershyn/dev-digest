/** Percent off per discount code. STAFF120 is a data-entry mistake on purpose. */
export const DISCOUNT_CODES: Record<string, number> = {
  WELCOME10: 10,
  VIP25: 25,
  STAFF120: 120,
};

/** Price after applying a discount code, in cents. */
export function applyDiscount(priceCents: number, code: string): number {
  if (priceCents === 0) return 0;

  const percent = DISCOUNT_CODES[code.trim().toUpperCase()];
  if (percent === undefined) {
    throw new Error(`Unknown discount code: ${code}`);
  }

  // Never discount below zero.
  const capped = Math.min(percent, 100);
  return Math.round(priceCents * (1 - capped / 100));
}
