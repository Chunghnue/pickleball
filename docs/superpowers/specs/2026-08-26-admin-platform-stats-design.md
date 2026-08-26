# Module: Admin — Thống kê toàn nền tảng (Platform Stats) — Thiết kế chi tiết

**Ngày:** 2026-08-26
**Trạng thái:** Chờ review
**Thuộc kiến trúc tổng thể:** [2026-08-23-pickleball-platform-architecture-design.md](./2026-08-23-pickleball-platform-architecture-design.md)
**Liên quan (không phụ thuộc code):** [2026-08-25-dashboard-design.md](./2026-08-25-dashboard-design.md), [2026-08-26-revenue-reports-design.md](./2026-08-26-revenue-reports-design.md) — dùng chung tinh thần định nghĩa "doanh thu"/"hôm nay", nhưng **không** phụ thuộc code của 2 module này vì cả hai **chưa được triển khai** (chỉ mới có spec, xem §1).

## 1. Mục tiêu

Trang tổng quan cho **Admin** (không phải Owner): số liệu toàn nền tảng — tổng số chủ sân/chi nhánh/sân/booking hôm nay/doanh thu hôm nay/khách mới, và biểu đồ doanh thu 30 ngày gần nhất trên **toàn bộ hệ thống**, không lọc theo owner hay venue cụ thể nào.

Module này **chỉ đọc** (read-only aggregation), không có bảng dữ liệu mới, không sửa entity nào. Tính trực tiếp từ `users`, `venues`, `courts`, `bookings`, `payments` đã có.

**Lưu ý quan trọng:** [Dashboard](./2026-08-25-dashboard-design.md) và [Revenue Reports](./2026-08-26-revenue-reports-design.md) (owner-facing) hiện **chưa có code** — chỉ tồn tại dưới dạng spec, thư mục `src/dashboard`, `src/reports` chưa được tạo. Module này **không** tái sử dụng code của 2 module đó (vì không có gì để tái sử dụng) — chỉ tham khảo cách định nghĩa số liệu để giữ nhất quán, và tự viết query riêng. Nếu sau này Dashboard/Revenue Reports được triển khai và phần query trùng lặp đáng kể, cân nhắc factor ra service dùng chung ở thời điểm đó — không làm trước (YAGNI).

**Sửa định nghĩa so với spec Dashboard gốc:** spec Dashboard mô tả doanh thu là `payments.amount`, nhưng entity `Payment` thực tế (`apps/api/src/payments/entities/payment.entity.ts`) **không có cột `amount`** — payment chỉ có `status`/`paidAt`/`bookingId`. Doanh thu phải tính qua `SUM(booking.totalPrice)` join `payment.bookingId = booking.id` với điều kiện `payment.status = 'paid'`. Module này dùng đúng schema thật, không theo spec Dashboard ở điểm này.

## 2. API endpoint

```
GET /admin/stats
```

Guard: `@Roles(UserRole.ADMIN)` (giống các controller admin hiện có). Không có query param — cửa sổ thời gian cố định 30 ngày, không hỗ trợ chọn khoảng ngày tuỳ ý (khác với Revenue Reports).

**Response:**

```jsonc
{
  "owners": { "total": 42, "active": 35, "pendingApproval": 3 },
  "venues": { "total": 58, "active": 50, "pendingApproval": 4 },
  "courts": { "total": 210, "active": 195 },
  "todayBookingsCount": 87,
  "todayRevenue": 12500000,
  "newCustomersThisMonth": 64,
  "revenueByDay": [
    { "date": "2026-07-28", "revenue": 3200000 }
    // 30 ngày gần nhất kể cả hôm nay, ngày không có doanh thu trả revenue: 0
  ]
}
```

## 3. Định nghĩa từng số liệu

Toàn bộ số liệu dưới đây tính trên **toàn hệ thống**, không lọc theo `ownerId`/`venueId` (khác với Dashboard/Revenue Reports là owner-scoped).

| Trường | Định nghĩa |
|---|---|
| `owners.total` | `COUNT(*)` trên `users` với `role = 'owner'`. |
| `owners.active` | Cùng điều kiện trên, thêm `status = 'active'`. |
| `owners.pendingApproval` | Cùng điều kiện trên, thêm `status = 'pending_approval'`. |
| `venues.total` / `.active` / `.pendingApproval` | Tương tự `owners`, trên bảng `venues`, dùng `venues.status` (`active`/`pending_approval`). |
| `courts.total` | `COUNT(*)` trên `courts`. |
| `courts.active` | `COUNT(*)` trên `courts` với `is_active = true`. |
| `todayBookingsCount` | Số dòng `bookings` có `created_at` nằm trong ngày hôm nay (giờ server). Tính cả booking đã huỷ trong ngày (phản ánh "phát sinh trong ngày", cùng định nghĩa với Dashboard §4). |
| `todayRevenue` | `SUM(booking.total_price)`, join `payments.booking_id = bookings.id`, điều kiện `payments.status = 'paid'` và `payments.paid_at` nằm trong ngày hôm nay. |
| `revenueByDay` | Tương tự `todayRevenue` nhưng nhóm theo `DATE(payments.paid_at)`, cho 30 ngày gần nhất (kể cả hôm nay). Ngày không có thanh toán trả `revenue: 0`, không bỏ qua ngày. |
| `newCustomersThisMonth` | Nhóm `bookings` theo `customer_id`, lấy `MIN(created_at)` mỗi khách; đếm số khách có `MIN(created_at)` nằm trong tháng hiện tại — trên **toàn hệ thống**, không lọc theo venue/owner. `Booking.customerId` hiện là cột bắt buộc (not null) trong entity thật, không có khái niệm `customer_contacts`/walk-in trong code hiện tại (khác với dự tính trong spec Dashboard — module Customers chưa triển khai), nên không cần xử lý fallback. |

"Ngày hôm nay" / "tháng hiện tại" dùng giờ hệ thống server, nhất quán với quy ước đã dùng ở spec Dashboard/Revenue Reports.

## 4. Triển khai backend

- `AdminStatsService` (`admin/admin-stats.service.ts`) + `AdminStatsController` (`admin/admin-stats.controller.ts`), đăng ký thêm vào `admin.module.ts` hiện có.
- `AdminStatsService` dùng `@InjectRepository` trực tiếp trên `User`, `Venue`, `Court`, `Booking`, `Payment` để có `QueryBuilder` (không đi qua `UsersService`/`VenuesService` — 2 service này chỉ export các method nghiệp vụ đã có, không hỗ trợ aggregation tuỳ ý). Vì vậy `admin.module.ts` cần thêm `TypeOrmModule.forFeature([User, Venue, Court, Booking, Payment])` vào `imports` (bên cạnh `UsersModule`, `CourtsModule` đã có) — NestJS cho phép cùng 1 entity được đăng ký `forFeature` ở nhiều module khác nhau, không xung đột với cách `UsersModule`/`CourtsModule`/`BookingsModule`/`PaymentsModule` đã đăng ký các entity này cho chính chúng.
- Dùng TypeORM `QueryBuilder` (`createQueryBuilder`, `getRawMany`/`getRawOne`) cho các phép `SUM`/`COUNT`/`GROUP BY` — không tải toàn bộ bảng `bookings`/`payments` vào bộ nhớ rồi cộng dồn bằng JS (cùng lý do đã nêu ở spec Dashboard §5).
- `AdminStatsService.getStats()` chạy các query độc lập song song (`Promise.all`) rồi gộp kết quả thành 1 object response — không có phép tính nào phụ thuộc kết quả của phép tính khác.

## 5. Validation

- Role khác `admin` → 403 (dùng `RolesGuard` như các controller admin khác).
- Không có tham số đầu vào nào cần validate (không query param).
- Hệ thống chưa có owner/venue/booking nào → trả về toàn bộ số liệu = 0, không lỗi (cùng quy ước với Dashboard §6).

## 6. Frontend

- Trang mới `apps/web/src/app/admin/stats/page.tsx`: các thẻ số liệu (owners/venues/courts/hôm nay) + biểu đồ doanh thu 30 ngày (line/bar chart đơn giản, không có tương tác drill-down).
- Thêm vào `apps/web/src/components/admin-nav.tsx`: mục thứ 2 bên cạnh "Chờ duyệt", trỏ tới `/admin/stats`.
- Proxy route `apps/web/src/app/api/admin/stats/route.ts` (GET), theo đúng mẫu `fetchApi`/`toNextResponse` đã dùng ở các route admin khác.

## 7. Testing

- **Unit (`AdminStatsService`):** mock repository/query builder, kiểm tra từng số liệu đếm đúng theo `status`; ranh giới "hôm nay"/"tháng này" (giống cách đã kiểm ở Dashboard); `revenueByDay` trả đủ 30 ngày kể cả ngày revenue = 0.
- **E2E:** dựng fixture nhiều owner (active/pending) ở nhiều venue (active/pending), nhiều booking/payment ở nhiều ngày → gọi `GET /admin/stats`, assert từng field khớp số liệu kỳ vọng, không lẫn dữ liệu của owner/venue khác (khác Dashboard, ở đây **phải** thấy tổng của tất cả); test 403 khi gọi bằng tài khoản `owner`/`customer`; test 401 khi không đăng nhập.

## 8. Ngoài phạm vi

- Biểu đồ tăng trưởng owner/venue mới theo thời gian (growth chart dạng time-series).
- Bảng xếp hạng "top venue theo doanh thu" toàn nền tảng.
- Danh sách booking gần nhất toàn nền tảng (liên quan tới việc lộ thông tin khách hàng cá nhân của nhiều owner khác nhau trên cùng 1 màn hình — cần bàn riêng nếu có nhu cầu).
- Khoảng thời gian tuỳ chỉnh cho `revenueByDay` (chỉ cố định 30 ngày ở MVP).
- Cache/pre-aggregation số liệu — MVP tính real-time mỗi request.
