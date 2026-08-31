export type BookingStatus = "confirmed" | "cancelled" | "completed";
export type PaymentStatus = "unpaid" | "paid" | "refunded";

export interface OwnerBooking {
  id: string;
  courtId: string;
  date: string;
  startTime: string;
  endTime: string;
  totalPrice: number;
  status: BookingStatus;
  customerName: string;
  customerPhone: string | null;
  paymentStatus: PaymentStatus;
  paymentNote: string | null;
  bookingCode: string;
  recurringScheduleId: string | null;
}
