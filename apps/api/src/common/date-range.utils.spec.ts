import {
  getTodayRange,
  getCurrentMonthRange,
  getLast30Days,
  fillRevenueByDay,
} from './date-range.utils';

describe('getTodayRange', () => {
  it('returns [start of day, start of next day)', () => {
    const now = new Date('2026-08-26T15:30:00');
    const { start, end } = getTodayRange(now);

    expect(start.getFullYear()).toBe(2026);
    expect(start.getMonth()).toBe(7);
    expect(start.getDate()).toBe(26);
    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);
    expect(start.getSeconds()).toBe(0);
    expect(end.getFullYear()).toBe(2026);
    expect(end.getMonth()).toBe(7);
    expect(end.getDate()).toBe(27);
  });

  it('rolls over to the next month at a month boundary', () => {
    const now = new Date('2026-08-31T23:59:59');
    const { end } = getTodayRange(now);

    expect(end.getMonth()).toBe(8);
    expect(end.getDate()).toBe(1);
  });
});

describe('getCurrentMonthRange', () => {
  it('returns [1st of month, 1st of next month)', () => {
    const now = new Date('2026-08-15T10:00:00');
    const { start, end } = getCurrentMonthRange(now);

    expect(start.getDate()).toBe(1);
    expect(start.getMonth()).toBe(7);
    expect(start.getHours()).toBe(0);
    expect(end.getDate()).toBe(1);
    expect(end.getMonth()).toBe(8);
  });

  it('rolls over to next year in December', () => {
    const now = new Date('2026-12-10T10:00:00');
    const { end } = getCurrentMonthRange(now);

    expect(end.getFullYear()).toBe(2027);
    expect(end.getMonth()).toBe(0);
    expect(end.getDate()).toBe(1);
  });
});

describe('getLast30Days', () => {
  it('returns exactly 30 date strings, oldest first, ending with today', () => {
    const now = new Date('2026-08-26T12:00:00');
    const days = getLast30Days(now);

    expect(days).toHaveLength(30);
    expect(days[29]).toBe('2026-08-26');
    expect(days[0]).toBe('2026-07-28');
  });

  it('has no gaps or duplicates between consecutive days', () => {
    const now = new Date('2026-08-26T12:00:00');
    const days = getLast30Days(now);
    const uniqueDays = new Set(days);

    expect(uniqueDays.size).toBe(30);
  });
});

describe('fillRevenueByDay', () => {
  it('fills missing days with revenue 0, in the given day order', () => {
    const days = ['2026-08-24', '2026-08-25', '2026-08-26'];
    const rows = [{ date: '2026-08-25', revenue: '3200000.00' }];

    const result = fillRevenueByDay(rows, days);

    expect(result).toEqual([
      { date: '2026-08-24', revenue: 0 },
      { date: '2026-08-25', revenue: 3200000 },
      { date: '2026-08-26', revenue: 0 },
    ]);
  });

  it('converts numeric-string revenue to a number', () => {
    const result = fillRevenueByDay(
      [{ date: '2026-08-26', revenue: 150000 }],
      ['2026-08-26'],
    );

    expect(result[0].revenue).toBe(150000);
    expect(typeof result[0].revenue).toBe('number');
  });
});
