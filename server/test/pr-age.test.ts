import { describe, it, expect } from 'vitest';
import { ageBucket } from '../src/modules/pulls/pr-age.js';

const NOW = Date.parse('2026-11-27T12:00:00Z');

describe('ageBucket', () => {
  it('buckets by days since opened', () => {
    expect(ageBucket('2026-11-27T00:00:00Z', NOW)).toBe('fresh');
    expect(ageBucket('2026-11-23T00:00:00Z', NOW)).toBe('aging');
    expect(ageBucket('2026-11-01T00:00:00Z', NOW)).toBe('stale');
  });
});
