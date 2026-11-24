import { describe, it, expect } from 'vitest';
import { applyDiscount } from './discount';

describe('applyDiscount', () => {
  it('applies a valid code', () => {
    expect(applyDiscount(10_000, 'WELCOME10')).toBe(9_000);
  });
});
