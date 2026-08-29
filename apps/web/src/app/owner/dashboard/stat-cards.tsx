import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface StatCardsProps {
  todayBookingsCount: number;
  todayRevenue: number;
  courts: { active: number; total: number };
  newCustomersThisMonth: number;
}

const currencyFormatter = new Intl.NumberFormat("vi-VN");

export function StatCards({
  todayBookingsCount,
  todayRevenue,
  courts,
  newCustomersThisMonth,
}: StatCardsProps) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm text-muted-foreground">
            Đơn đặt hôm nay
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold">{todayBookingsCount}</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm text-muted-foreground">
            Doanh thu hôm nay
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold">
            {currencyFormatter.format(todayRevenue)} đ
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm text-muted-foreground">
            Sân hoạt động
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold">
            {courts.active}/{courts.total}
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm text-muted-foreground">
            Khách mới tháng này
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold">{newCustomersThisMonth}</p>
        </CardContent>
      </Card>
    </div>
  );
}
