export interface PricingRule {
  id: string;
  courtId: string;
  name: string;
  daysOfWeek: number[];
  startTime: string;
  endTime: string;
  price: number;
  priority: number;
  advanceBookingHours: number | null;
  advancePrice: number | null;
  validFrom: string | null;
  validTo: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PricingSummary {
  pricingRulesCount: number;
  activeRecurringSchedulesCount: number;
  estimatedMonthlyRecurringRevenue: number;
}

export type RecurringScheduleStatus = "active" | "cancelled";

export interface RecurringSchedule {
  id: string;
  courtId: string;
  customerId: string | null;
  customerContactId: string | null;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  pricePerSession: number;
  discountPercent: number | null;
  validFrom: string;
  validTo: string;
  note: string | null;
  autoRenew: boolean;
  status: RecurringScheduleStatus;
  createdAt: string;
  updatedAt: string;
}

export interface RecurringScheduleListItem extends RecurringSchedule {
  occurrenceCount: number;
}

export type OccurrenceStatus = "confirmed" | "cancelled" | "completed";

export interface RecurringScheduleOccurrence {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  status: OccurrenceStatus;
  totalPrice: number;
}

export interface RecurringScheduleDetail {
  schedule: RecurringSchedule;
  occurrences: RecurringScheduleOccurrence[];
}

export interface CreateRecurringScheduleResult {
  schedule: RecurringSchedule;
  generatedCount: number;
  conflictingDates: string[];
}
