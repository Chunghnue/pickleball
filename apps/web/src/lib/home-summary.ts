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
): HomeSummary {
  const countByCity = new Map<string, number>();
  for (const venue of venues) {
    countByCity.set(venue.city, (countByCity.get(venue.city) ?? 0) + 1);
  }

  return {
    venueCount: venues.length,
    courtCount: venues.reduce((sum, venue) => sum + venue.courtsCount, 0),
    featured: venues.slice(0, 6),
    cities: [...countByCity.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name, 'vi')),
  };
}
