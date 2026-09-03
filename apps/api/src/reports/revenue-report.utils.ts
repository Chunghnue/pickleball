export interface PeriodRange {
  from: string;
  to: string;
}

function formatLocalDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getPreviousPeriodRange(from: string, to: string): PeriodRange {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  const fromDate = new Date(fy, fm - 1, fd);
  const toDate = new Date(ty, tm - 1, td);
  const dayCount = Math.round((toDate.getTime() - fromDate.getTime()) / 86_400_000) + 1;

  const prevTo = new Date(fromDate);
  prevTo.setDate(prevTo.getDate() - 1);
  const prevFrom = new Date(prevTo);
  prevFrom.setDate(prevFrom.getDate() - (dayCount - 1));

  return { from: formatLocalDate(prevFrom), to: formatLocalDate(prevTo) };
}

export function buildTransactionCode(paymentId: string): string {
  return `GD-${paymentId.slice(0, 8).toUpperCase()}`;
}

export function computeAvgPerTransaction(revenue: number, transactionCount: number): number {
  if (transactionCount === 0) return 0;
  return Math.round((revenue / transactionCount) * 100) / 100;
}

export function computeChangePercent(
  currentRevenue: number,
  previousRevenue: number,
): number | null {
  if (previousRevenue === 0) return null;
  return Math.round(((currentRevenue - previousRevenue) / previousRevenue) * 1000) / 10;
}

export function formatDateTimeVN(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

export interface RevenueCsvRow {
  transactionCode: string;
  customerName: string;
  customerPhone: string;
  paidAt: Date;
  amount: number;
}

function csvField(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

const CSV_HEADER = ['Mã GD', 'Khách hàng', 'SĐT', 'Thời gian', 'Số tiền', 'Trạng thái'];

export function toRevenueCsv(rows: RevenueCsvRow[]): string {
  const dataLines = rows.map((row) =>
    [
      row.transactionCode,
      row.customerName,
      row.customerPhone,
      formatDateTimeVN(row.paidAt),
      String(row.amount),
      'Đã thanh toán',
    ]
      .map(csvField)
      .join(','),
  );
  return '﻿' + [CSV_HEADER.join(','), ...dataLines].join('\r\n');
}
