export type CourtStatus = "active" | "maintenance" | "closed";

export interface CourtImage {
  id: string;
  url: string;
}

export interface Court {
  id: string;
  venueId: string;
  name: string;
  pricePerHour: number;
  openTime: string;
  closeTime: string;
  slotDurationMinutes: number;
  status: CourtStatus;
  description: string | null;
  capacity: number | null;
  displayOrder: number;
  images: CourtImage[];
}

export interface CourtWithVenueName extends Court {
  venueName: string;
}

export interface VenueImage {
  id: string;
  url: string;
}

export interface Venue {
  id: string;
  name: string;
  address: string;
  city: string;
  district: string | null;
  slug: string | null;
  latitude: number | null;
  longitude: number | null;
  description: string | null;
  phone: string | null;
  email: string | null;
  isDefault: boolean;
  isHidden: boolean;
  status: "pending_approval" | "active" | "rejected";
  images: VenueImage[];
}
