export const VIP_MIN_TOTAL_SPENT = 5_000_000;
export const VIP_MIN_TOTAL_BOOKINGS = 10;
export const NEW_MAX_TOTAL_BOOKINGS = 1;

export type CustomerTier = 'new' | 'regular' | 'vip';

export function classifyTier(totalBookings: number, totalSpent: number): CustomerTier {
  if (totalSpent >= VIP_MIN_TOTAL_SPENT || totalBookings >= VIP_MIN_TOTAL_BOOKINGS) {
    return 'vip';
  }
  if (totalBookings <= NEW_MAX_TOTAL_BOOKINGS) {
    return 'new';
  }
  return 'regular';
}

export function buildCustomerCode(id: string): string {
  return `KH-${id.slice(0, 8).toUpperCase()}`;
}
