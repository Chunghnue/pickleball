import { describe, it, expect } from 'vitest';
import { computeHomeSummary, type PublicVenueSummary } from './home-summary';

function venue(overrides: Partial<PublicVenueSummary>): PublicVenueSummary {
  return {
    id: 'venue-1',
    name: 'Sân A',
    address: '123 Đường ABC',
    city: 'Hà Nội',
    courtsCount: 2,
    ...overrides,
  };
}

describe('computeHomeSummary', () => {
  it('returns all-zero/empty values for an empty venue list', () => {
    expect(computeHomeSummary([])).toEqual({
      venueCount: 0,
      courtCount: 0,
      featured: [],
      cities: [],
    });
  });

  it('sums courtsCount across all venues for courtCount', () => {
    const venues = [
      venue({ id: 'v1', courtsCount: 2 }),
      venue({ id: 'v2', courtsCount: 3 }),
      venue({ id: 'v3', courtsCount: 0 }),
    ];
    expect(computeHomeSummary(venues).courtCount).toBe(5);
    expect(computeHomeSummary(venues).venueCount).toBe(3);
  });

  it('caps featured at the first 6 venues, preserving input order', () => {
    const venues = Array.from({ length: 8 }, (_, i) =>
      venue({ id: `v${i}`, name: `Sân ${i}` }),
    );
    const featured = computeHomeSummary(venues).featured;
    expect(featured).toHaveLength(6);
    expect(featured.map((v) => v.id)).toEqual([
      'v0', 'v1', 'v2', 'v3', 'v4', 'v5',
    ]);
  });

  it('returns fewer than 6 featured venues when there are fewer than 6 total', () => {
    const venues = [venue({ id: 'v1' }), venue({ id: 'v2' })];
    expect(computeHomeSummary(venues).featured).toHaveLength(2);
  });

  it('dedupes cities, preserving first-occurrence order', () => {
    const venues = [
      venue({ id: 'v1', city: 'Hà Nội' }),
      venue({ id: 'v2', city: 'Hồ Chí Minh' }),
      venue({ id: 'v3', city: 'Hà Nội' }),
    ];
    expect(computeHomeSummary(venues).cities).toEqual(['Hà Nội', 'Hồ Chí Minh']);
  });
});
