import {
  buildTransactionCode,
  computeAvgPerTransaction,
  computeChangePercent,
  formatDateTimeVN,
  getPreviousPeriodRange,
  toRevenueCsv,
} from './revenue-report.utils';

describe('getPreviousPeriodRange', () => {
  it('matches the worked example from the spec: 25-day period', () => {
    expect(getPreviousPeriodRange('2026-08-01', '2026-08-25')).toEqual({
      from: '2026-07-07',
      to: '2026-07-31',
    });
  });

  it('handles a single-day period', () => {
    expect(getPreviousPeriodRange('2026-08-15', '2026-08-15')).toEqual({
      from: '2026-08-14',
      to: '2026-08-14',
    });
  });

  it('rolls the previous period back across a year boundary', () => {
    expect(getPreviousPeriodRange('2026-01-01', '2026-01-05')).toEqual({
      from: '2025-12-27',
      to: '2025-12-31',
    });
  });
});

describe('buildTransactionCode', () => {
  it('prefixes GD- and uppercases the first 8 chars of the payment id', () => {
    expect(buildTransactionCode('3f9a2b1c-e29b-41d4-a716-446655440000')).toBe('GD-3F9A2B1C');
  });
});

describe('computeAvgPerTransaction', () => {
  it('divides revenue by count, rounded to 2 decimals', () => {
    expect(computeAvgPerTransaction(15000000, 42)).toBe(357142.86);
  });

  it('returns 0 when there are no transactions, without dividing by zero', () => {
    expect(computeAvgPerTransaction(0, 0)).toBe(0);
  });
});

describe('computeChangePercent', () => {
  it('computes a positive percent change, rounded to 1 decimal', () => {
    expect(computeChangePercent(15000000, 12000000)).toBe(25);
  });

  it('computes a negative percent change', () => {
    expect(computeChangePercent(9000000, 12000000)).toBe(-25);
  });

  it('returns null when the previous period had zero revenue', () => {
    expect(computeChangePercent(5000000, 0)).toBeNull();
  });
});

describe('formatDateTimeVN', () => {
  it('formats a Date as dd/MM/yyyy HH:mm', () => {
    expect(formatDateTimeVN(new Date(2026, 7, 5, 9, 5))).toBe('05/08/2026 09:05');
  });
});

describe('toRevenueCsv', () => {
  it('starts with a UTF-8 BOM and a Vietnamese header row', () => {
    const csv = toRevenueCsv([]);
    expect(csv.startsWith('﻿Mã GD,Khách hàng,SĐT,Thời gian,Số tiền,Trạng thái')).toBe(true);
  });

  it('renders one data row per transaction, "Đã thanh toán" as the status', () => {
    const csv = toRevenueCsv([
      {
        transactionCode: 'GD-3F9A2B1C',
        customerName: 'Nguyễn Văn A',
        customerPhone: '0900000000',
        paidAt: new Date(2026, 7, 15, 10, 30),
        amount: 250000,
      },
    ]);
    const lines = csv.split('\r\n');
    expect(lines[1]).toBe('GD-3F9A2B1C,Nguyễn Văn A,0900000000,15/08/2026 10:30,250000,Đã thanh toán');
  });

  it('quotes a customer name that contains a comma', () => {
    const csv = toRevenueCsv([
      {
        transactionCode: 'GD-00000000',
        customerName: 'Trần, Văn B',
        customerPhone: '0911111111',
        paidAt: new Date(2026, 7, 1, 0, 0),
        amount: 100000,
      },
    ]);
    expect(csv.split('\r\n')[1]).toContain('"Trần, Văn B"');
  });
});
