import {
  computeConversionRate,
  computePercent,
  fillViewsByDay,
  toPageViewsCsv,
} from './page-view-report.utils';

describe('fillViewsByDay', () => {
  it('fills in zero for days with no rows', () => {
    const days = ['2026-08-01', '2026-08-02', '2026-08-03'];
    const rows = [{ date: '2026-08-02', views: '5' }];
    expect(fillViewsByDay(rows, days)).toEqual([
      { date: '2026-08-01', views: 0 },
      { date: '2026-08-02', views: 5 },
      { date: '2026-08-03', views: 0 },
    ]);
  });

  it('coerces numeric string counts to numbers', () => {
    const rows = [{ date: '2026-08-01', views: '42' }];
    expect(fillViewsByDay(rows, ['2026-08-01'])).toEqual([{ date: '2026-08-01', views: 42 }]);
  });
});

describe('computePercent', () => {
  it('computes a percentage rounded to 1 decimal', () => {
    expect(computePercent(3, 5)).toBe(60);
    expect(computePercent(1, 3)).toBe(33.3);
  });

  it('returns 0 when total is 0, without dividing by zero', () => {
    expect(computePercent(0, 0)).toBe(0);
  });
});

describe('computeConversionRate', () => {
  it('computes bookings/views as a percent rounded to 1 decimal', () => {
    expect(computeConversionRate(1, 5)).toBe(20);
    expect(computeConversionRate(2, 27)).toBe(7.4);
  });

  it('returns null when there are no views, without dividing by zero', () => {
    expect(computeConversionRate(0, 0)).toBeNull();
  });

  it('returns 0 when there are views but no bookings', () => {
    expect(computeConversionRate(0, 10)).toBe(0);
  });
});

describe('toPageViewsCsv', () => {
  it('starts with a UTF-8 BOM and a Vietnamese header row', () => {
    const csv = toPageViewsCsv([]);
    expect(csv.startsWith('﻿Ngày,Lượt xem,Lượt xem kỳ trước')).toBe(true);
  });

  it('renders one data row per day', () => {
    const csv = toPageViewsCsv([{ date: '2026-08-15', views: 10, previousViews: 7 }]);
    const lines = csv.split('\r\n');
    expect(lines[1]).toBe('2026-08-15,10,7');
  });
});
