export interface RevenueTransaction {
  id: string;
  transactionCode: string;
  customerName: string;
  customerPhone: string;
  paidAt: string;
  amount: number;
  status: "paid";
}

export interface RevenueSummary {
  currentPeriod: {
    revenue: number;
    transactionCount: number;
    avgPerTransaction: number;
  };
  previousPeriod: { revenue: number };
  changeAmount: number;
  changePercent: number | null;
  revenueByDay: { date: string; revenue: number }[];
  transactions: RevenueTransaction[];
  transactionsPage: number;
  transactionsPageSize: number;
  transactionsTotal: number;
}

export interface DateRange {
  from: string;
  to: string;
}
