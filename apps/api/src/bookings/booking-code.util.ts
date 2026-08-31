export function buildBookingCode(id: string): string {
  return `DL-${id.slice(0, 8).toUpperCase()}`;
}
