export type CustomerKind = "registered" | "walkin";
export type CustomerTier = "new" | "regular" | "vip";

export interface CustomerListItem {
  kind: CustomerKind;
  id: string;
  fullName: string;
  phone: string | null;
  totalBookings: number;
  totalSpent: number;
  lastBookingAt: string | null;
  tier: CustomerTier;
  customerCode: string;
}

export interface CustomerListResponse {
  items: CustomerListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CustomerSummary {
  totalCustomers: number;
  vipCustomers: number;
  totalBookings: number;
  totalSpent: number;
}

export interface CustomerDetail extends CustomerListItem {
  email?: string;
  address?: string;
  note?: string;
  joinedAt: string;
}
