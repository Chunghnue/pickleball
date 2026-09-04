export interface PublicVenueSummary {
  id: string;
  name: string;
  address: string;
  city: string;
  courtsCount: number;
  logoUrl: string | null;
}

export interface HomeSummary {
  venueCount: number;
  courtCount: number;
  featured: PublicVenueSummary[];
  cities: string[];
}

export function computeHomeSummary(
  venues: PublicVenueSummary[],
): HomeSummary {
  return {
    venueCount: venues.length,
    courtCount: venues.reduce((sum, venue) => sum + venue.courtsCount, 0),
    featured: venues.slice(0, 6),
    cities: [...new Set(venues.map((venue) => venue.city))],
  };
}
