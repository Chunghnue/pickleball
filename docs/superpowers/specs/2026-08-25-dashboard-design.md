# Module: Dashboard (Tổng quan) — Thiết kế chi tiết

**Ngày:** 2026-08-25 (cập nhật 2026-08-29 — sửa lại theo schema thực tế)
**Trạng thái:** Đã duyệt
**Thuộc kiến trúc tổng thể:** [2026-08-23-pickleball-platform-architecture-design.md](./2026-08-23-pickleball-platform-architecture-design.md)
**Nguồn tham khảo:** [docs/spec/01-dashboard.md](../../spec/01-dashboard.md) (khảo sát UI sanbong.vn thực tế)

## 1. Mục tiêu

Trang đầu tiên khi owner đăng nhập, tổng hợp nhanh tình hình kinh doanh: số đơn/doanh thu hôm nay, tỷ lệ sân hoạt động, khách mới, biểu đồ doanh thu theo ngày, doanh thu theo từng sân, và danh sách đặt sân gần nhất.

Module này **chỉ đọc** (read-only aggregation) — không có bảng dữ liệu mới, không thay đổi state của bất kỳ entity nào. Toàn bộ số liệu được tính từ dữ liệu đã có ở các module **Courts** (`venues`, `courts`), **Bookings** (`bookings`), **Payments** (`payments`), **Users** (`users`).

Phụ thuộc: Courts, Bookings, Payments, Users (chỉ đọc qua repository/query builder, không sửa entity của các module đó).

## 2. Khác biệt so với tài liệu khảo sát gốc

Tài liệu `docs/spec/01-dashboard.md` mô tả sanbong.vn — nền tảng đa môn thể thao. Nền tảng hiện tại chỉ phục vụ pickleball (xem kiến trúc tổng thể mục 1-2), nên:

- **Bỏ** biểu đồ "Loại sân" (donut chart theo môn thể thao Bóng đá/Cầu lông/Tennis/Pickleball/Bóng rổ) — không có khái niệm sport-type trong schema hiện tại và không áp dụng cho nền tảng đơn môn.
- **Thay thế** bằng breakdown doanh thu theo từng **court** (`revenueByCourt`) — giữ tinh thần "biểu đồ cơ cấu" của bản gốc nhưng dùng chiều dữ liệu có thật (court thay vì sport).
- Module **Chi nhánh** (multi-branch) chưa tồn tại trong kiến trúc hiện tại. Owner có thể sở hữu nhiều venue (đã xác nhận ở [2026-08-24-courts-module-design.md](./2026-08-24-courts-module-design.md)), nên Dashboard mặc định **tổng hợp tất cả venue của owner**, có tuỳ chọn lọc theo 1 venue qua query param — thay cho "bộ chọn chi nhánh" trong bản gốc.

## 3. API endpoint

```
GET /dashboard/summary?venueId=<uuid, optional>
```

JWT, role `owner`. Nếu có `venueId`, dùng lại nguyên trạng `venuesService.getOwnedVenueOrThrow(ownerId, venueId)` đã có ở `venues.service.ts` — venue không tồn tại → **404**, venue tồn tại nhưng thuộc owner khác → **403** (đúng hành vi hiện tại của helper này, đã dùng thống nhất ở các module khác, xem `venues.service.spec.ts:147`). Nếu không truyền `venueId`, tổng hợp trên toàn bộ venue owner sở hữu.

**Response:**

```jsonc
{
  "todayBookingsCount": 12,
  "todayRevenue": 3500000,
  "courts": { "active": 4, "total": 5 },
  "newCustomersThisMonth": 8,
  "revenueByDay": [
    { "date": "2026-07-27", "revenue": 1200000 },
    // ... 30 ngày gần nhất, kể cả ngày không có doanh thu (revenue: 0)
    { "date": "2026-08-25", "revenue": 3500000 }
  ],
  "revenueByCourt": [
    { "courtId": "uuid", "courtName": "Sân 1", "revenue": 15000000 }
    // mọi court trong phạm vi lọc đều xuất hiện, kể cả revenue = 0
  ],
  "recentBookings": [
    {
      "id": "uuid",
      "customerName": "Nguyễn Văn A",
      "customerPhone": "0900000000",
      "courtName": "Sân 1",
      "date": "2026-08-25",
      "startTime": "18:00",
      "endTime": "19:00",
      "totalPrice": 250000,
      "status": "confirmed"
    }
    // tối đa 10, mới nhất trước (createdAt desc)
  ]
}
```

## 4. Định nghĩa từng số liệu

**Lưu ý schema (đã xác minh lại 2026-08-29):** bảng `payments` **không có cột `amount`** — doanh thu lấy từ `bookings.total_price`, join sang `payments` để lọc theo trạng thái đã thanh toán (đúng cách `AdminStatsService` — `apps/api/src/admin/admin-stats.service.ts` — đã làm cho thống kê toàn nền tảng). Cột `customer_contact_id` chưa tồn tại (mới chỉ là đề xuất ở [2026-08-26-customers-module-design.md](./2026-08-26-customers-module-design.md)) và `bookings.customer_id` hiện đang `NOT NULL`, nên khái niệm "khách walk-in không tài khoản" chưa áp dụng được — bỏ hẳn nhánh này khỏi Dashboard, sẽ bổ sung lại nếu/khi module Customers triển khai.

| Số liệu | Định nghĩa |
|---|---|
| `todayBookingsCount` | Số dòng `bookings` có `createdAt` nằm trong ngày hôm nay (giờ server), thuộc court của venue trong phạm vi lọc. Tính cả booking đã bị huỷ trong ngày (phản ánh đúng "phát sinh trong ngày", không phải "đang active"). |
| `todayRevenue` | Tổng `bookings.total_price`, inner join `payments` (`booking.id::text = payment.booking_id`) với `payments.status = 'paid'` và `payments.paid_at` nằm trong ngày hôm nay, giới hạn `bookings.court_id` thuộc venue trong phạm vi lọc. |
| `courts.active` / `courts.total` | Đếm `courts.isActive = true` / tổng số `courts`, trong các venue thuộc phạm vi lọc (không lọc theo `venue.status` — venue `pending_approval`/`rejected` không có court nào hiển thị public nhưng vẫn tính vào dashboard của owner). |
| `newCustomersThisMonth` | Nhóm theo `bookings.customer_id`, lấy `MIN(createdAt)` mỗi khách (giới hạn bookings thuộc venue trong phạm vi lọc); đếm số khách có `MIN(createdAt)` nằm trong tháng hiện tại. Nghĩa là "khách đặt sân lần đầu tại (các) venue này trong tháng này" — không suy ra từ toàn hệ thống, chỉ trong phạm vi venue của owner này. |
| `revenueByDay` | 30 ngày gần nhất (kể cả hôm nay), mỗi ngày = tổng `bookings.total_price` (cùng join `payments` như `todayRevenue`), nhóm theo `TO_CHAR(payments.paid_at, 'YYYY-MM-DD')`. Ngày không có thanh toán trả về `revenue: 0` (không bỏ qua ngày) — tái dùng `fillRevenueByDay`/`getLast30Days` từ `admin-stats.utils`. |
| `revenueByCourt` | Bắt đầu từ danh sách `courts` trong phạm vi lọc (không phải từ `payments`), `LEFT JOIN` sang tổng `bookings.total_price` đã thanh toán (`status='paid'`, toàn bộ lịch sử, không giới hạn thời gian) theo `court_id`. Court chưa có doanh thu vẫn xuất hiện với `revenue: 0`. Sắp giảm dần theo revenue. |
| `recentBookings` | 10 booking mới nhất theo `createdAt desc`, thuộc phạm vi lọc, join `users` (qua `customer_id`, luôn có giá trị) lấy tên/SĐT khách, join `courts` lấy tên sân. |

"Ngày hôm nay" / "tháng hiện tại" dùng giờ hệ thống server (không có khái niệm timezone theo owner ở MVP — nhất quán với cách `bookings.date` đã được xử lý ở module Bookings).

## 5. Truy vấn & hiệu năng

Toàn bộ entity trong codebase hiện tại (Booking, Payment, Court, Venue, User) **không khai báo quan hệ TypeORM** (`@ManyToOne`/`@OneToOne`) — join giữa các bảng luôn thực hiện thủ công qua cột FK thô trong `QueryBuilder` (ví dụ `booking.id::text = payment.booking_id`). Dashboard tiếp tục theo đúng quy ước này, không thêm decorator quan hệ mới.

`AdminStatsService` (`apps/api/src/admin/admin-stats.service.ts`) đã là tiền lệ cho các query tổng hợp kiểu này ở phạm vi toàn nền tảng — dùng TypeORM `QueryBuilder` (`createQueryBuilder`, `getRawMany`/`getRawOne`) cho `SUM`/`COUNT`/`GROUP BY`, thay vì tải toàn bộ bảng qua `find()` rồi cộng dồn bằng JS. `DashboardService` áp dụng lại đúng pattern này, chỉ khác ở chỗ mọi query đều lọc thêm theo `venueId IN (...)` (danh sách venue thuộc owner, hoặc 1 venue nếu có `?venueId=`) ngay từ điều kiện `WHERE`/`JOIN` đầu tiên — không tải dữ liệu ngoài phạm vi rồi lọc sau. Có thể tái dùng trực tiếp `getTodayRange`/`getCurrentMonthRange`/`getLast30Days`/`fillRevenueByDay` từ `admin-stats.utils`.

## 6. Validation

- Role khác `owner` → 403.
- `venueId` (nếu truyền) không tồn tại → 404; tồn tại nhưng thuộc owner khác → 403 (tái dùng nguyên trạng `getOwnedVenueOrThrow`, không viết logic riêng).
- Owner chưa có venue nào → trả về summary với toàn bộ số liệu = 0 / mảng rỗng (không lỗi).

## 7. Testing

- **Unit:** tính đúng ranh giới "hôm nay"/"tháng này" (boundary: 23:59:59 hôm qua vs 00:00:00 hôm nay); `newCustomersThisMonth` không đếm trùng khách có nhiều booking trong tháng; `revenueByDay` trả đủ 30 ngày kể cả ngày revenue = 0; `revenueByCourt` trả đủ mọi court trong phạm vi lọc kể cả court chưa có doanh thu.
- **E2E:** dựng fixture (venue + court + bookings + payments ở nhiều ngày/nhiều trạng thái) rồi gọi `GET /dashboard/summary`, assert từng field khớp số liệu kỳ vọng; test `?venueId=` lọc đúng khi owner có nhiều venue; test 404 khi truyền `venueId` không tồn tại; test 403 khi truyền `venueId` thuộc owner khác; test 403 khi gọi bằng tài khoản `customer`.

## 8. Ngoài phạm vi

- Biểu đồ "Loại sân theo môn thể thao" — không áp dụng cho nền tảng đơn môn pickleball (xem mục 2).
- Bộ chọn chi nhánh dạng UI (chờ module Chi nhánh riêng, nếu được quyết định triển khai).
- Cache/pre-aggregation số liệu — MVP tính real-time mỗi request; cân nhắc lại nếu số lượng booking/payment lớn ảnh hưởng hiệu năng.
- Tuỳ chỉnh khoảng thời gian biểu đồ doanh thu (chỉ cố định 30 ngày ở MVP, chưa có bộ lọc "7 ngày/90 ngày/tuỳ chọn").
- Frontend (spec riêng, sau khi spec API này được duyệt — theo đúng mẫu đã làm ở Courts/Bookings/Payments).
- Dải nút lối tắt (Quick actions) và lời chào theo thời điểm trong ngày — thuần UI tĩnh phía frontend, không cần API riêng, sẽ đưa vào spec frontend.
