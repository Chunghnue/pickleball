export interface PublicVenueSummary {
  id: string;
  name: string;
  address: string;
  city: string;
  courtsCount: number;
  logoUrl: string | null;
}

export interface CityCount {
  name: string;
  count: number;
}

export interface HomeSummary {
  venueCount: number;
  courtCount: number;
  featured: PublicVenueSummary[];
  cities: CityCount[];
}

export function computeHomeSummary(
  venues: PublicVenueSummary[],
  venueCount: number,
  cities: CityCount[],
): HomeSummary {
  return {
    venueCount,
    courtCount: venues.reduce((sum, venue) => sum + venue.courtsCount, 0),
    featured: venues.slice(0, 6),
    cities,
  };
}
