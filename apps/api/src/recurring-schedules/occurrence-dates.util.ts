export function generateOccurrenceDates(
  validFrom: string,
  validTo: string,
  dayOfWeek: number,
): string[] {
  const jsDay = (dayOfWeek + 1) % 7;
  const dates: string[] = [];
  const cursor = new Date(`${validFrom}T00:00:00Z`);
  const end = new Date(`${validTo}T00:00:00Z`);
  while (cursor <= end) {
    if (cursor.getUTCDay() === jsDay) {
      dates.push(cursor.toISOString().slice(0, 10));
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}
