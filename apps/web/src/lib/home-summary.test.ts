import { describe, it, expect } from 'vitest';
import {
  computeHomeSummary,
  type PublicVenueSummary,
  type CityCount,
} from './home-summary';

function venue(overrides: Partial<PublicVenueSummary>): PublicVenueSummary {
  return {
    id: 'venue-1',
    name: 'Sân A',
    address: '123 Đường ABC',
    city: 'Hà Nội',
    courtsCount: 2,
    logoUrl: null,
    ...overrides,
  };
}

describe('computeHomeSummary', () => {
  it('returns all-zero/empty values for an empty venue list', () => {
    expect(computeHomeSummary([], 0, [])).toEqual({
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
    expect(computeHomeSummary(venues, 3, []).courtCount).toBe(5);
  });

  it('uses the venueCount argument as-is, not venues.length', () => {
    const venues = [venue({ id: 'v1' }), venue({ id: 'v2' })];
    expect(computeHomeSummary(venues, 150, []).venueCount).toBe(150);
  });

  it('caps featured at the first 6 venues, preserving input order', () => {
    const venues = Array.from({ length: 8 }, (_, i) =>
      venue({ id: `v${i}`, name: `Sân ${i}` }),
    );
    const featured = computeHomeSummary(venues, 8, []).featured;
    expect(featured).toHaveLength(6);
    expect(featured.map((v) => v.id)).toEqual([
      'v0', 'v1', 'v2', 'v3', 'v4', 'v5',
    ]);
  });

  it('returns fewer than 6 featured venues when there are fewer than 6 total', () => {
    const venues = [venue({ id: 'v1' }), venue({ id: 'v2' })];
    expect(computeHomeSummary(venues, 2, []).featured).toHaveLength(2);
  });

  it('passes logoUrl through unchanged for featured venues', () => {
    const venues = [
      venue({ id: 'v1', logoUrl: '/uploads/venues/v1/logo.webp' }),
      venue({ id: 'v2', logoUrl: null }),
    ];
    expect(
      computeHomeSummary(venues, 2, []).featured.map((v) => v.logoUrl),
    ).toEqual(['/uploads/venues/v1/logo.webp', null]);
  });

  it('passes the cities argument through unchanged, without re-deriving it from venues', () => {
    const cities: CityCount[] = [
      { name: 'Hà Nội', count: 12 },
      { name: 'Hồ Chí Minh', count: 30 },
    ];
    const venues = [venue({ id: 'v1', city: 'Đà Nẵng' })];
    expect(computeHomeSummary(venues, 1, cities).cities).toEqual(cities);
  });
});
