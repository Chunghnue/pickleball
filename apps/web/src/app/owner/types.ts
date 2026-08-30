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
  description: string | null;
  phone: string | null;
  status: "pending_approval" | "active" | "rejected";
  images: VenueImage[];
}
