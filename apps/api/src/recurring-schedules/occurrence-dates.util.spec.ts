import { generateOccurrenceDates } from './occurrence-dates.util';

describe('generateOccurrenceDates', () => {
  it('returns every Monday (dayOfWeek 0) in the range, inclusive', () => {
    // 2024-01-01 is a Monday, 2024-01-14 is a Sunday.
    expect(generateOccurrenceDates('2024-01-01', '2024-01-14', 0)).toEqual([
      '2024-01-01',
      '2024-01-08',
    ]);
  });

  it('returns every Sunday (dayOfWeek 6) in the range, inclusive', () => {
    expect(generateOccurrenceDates('2024-01-01', '2024-01-14', 6)).toEqual([
      '2024-01-07',
      '2024-01-14',
    ]);
  });

  it('returns an empty array when the range is shorter than a week and does not include the day', () => {
    expect(generateOccurrenceDates('2024-01-02', '2024-01-03', 0)).toEqual([]);
  });
});
