export interface VenueImage {
  id: string;
  url: string;
}

export interface Court {
  id: string;
  name: string;
  pricePerHour: number;
  openTime: string;
  closeTime: string;
  slotDurationMinutes: number;
  isActive: boolean;
}

export interface Venue {
  id: string;
  name: string;
  address: string;
  city: string;
  description: string | null;
  status: "pending_approval" | "active" | "rejected";
  images: VenueImage[];
}
