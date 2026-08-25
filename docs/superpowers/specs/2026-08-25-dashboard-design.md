# Module: Dashboard (Tổng quan) — Thiết kế chi tiết

**Ngày:** 2026-08-25
**Trạng thái:** Chờ review
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

JWT, role `owner`. Nếu có `venueId`, phải thuộc sở hữu của owner đang đăng nhập (dùng lại pattern `getOwnedVenueOrThrow` đã có ở `venues.service.ts`) — nếu không thuộc, trả **404**. Nếu không truyền `venueId`, tổng hợp trên toàn bộ venue owner sở hữu.

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

| Số liệu | Định nghĩa |
|---|---|
| `todayBookingsCount` | Số dòng `bookings` có `createdAt` nằm trong ngày hôm nay (giờ server), thuộc court của venue trong phạm vi lọc. Tính cả booking đã bị huỷ trong ngày (phản ánh đúng "phát sinh trong ngày", không phải "đang active"). |
| `todayRevenue` | Tổng `payments.amount` với `status = 'paid'` và `paidAt` nằm trong ngày hôm nay, join qua `booking → court → venue` để lọc theo owner/venue. |
| `courts.active` / `courts.total` | Đếm `courts.isActive = true` / tổng số `courts`, trong các venue thuộc phạm vi lọc (không lọc theo `venue.status` — venue `pending_approval`/`rejected` không có court nào hiển thị public nhưng vẫn tính vào dashboard của owner). |
| `newCustomersThisMonth` | Nhóm theo định danh khách — `customerId` nếu có, ngược lại `customerContactId` (xem [2026-08-26-customers-module-design.md](./2026-08-26-customers-module-design.md) §4, `bookings.customer_id` có thể null với booking walk-in) — lấy `MIN(createdAt)` mỗi khách; đếm số khách có `MIN(createdAt)` nằm trong tháng hiện tại. Nghĩa là "khách đặt sân lần đầu tại (các) venue này trong tháng này" — không suy ra từ toàn hệ thống, chỉ trong phạm vi venue của owner này. |
| `revenueByDay` | 30 ngày gần nhất (kể cả hôm nay), mỗi ngày = tổng `payments.amount` với `status='paid'`, nhóm theo `DATE(paidAt)`. Ngày không có thanh toán trả về `revenue: 0` (không bỏ qua ngày). |
| `revenueByCourt` | Tổng `payments.amount` (`status='paid'`, không giới hạn thời gian — toàn bộ lịch sử) nhóm theo `court_id`, join `courts` lấy tên. Sắp giảm dần theo revenue. |
| `recentBookings` | 10 booking mới nhất theo `createdAt desc`, thuộc phạm vi lọc, kèm tên/SĐT khách và tên sân (join `courts`). Tên/SĐT khách lấy từ `users` nếu `customerId` có giá trị, ngược lại lấy từ `customer_contacts` qua `customerContactId` (booking walk-in). |

"Ngày hôm nay" / "tháng hiện tại" dùng giờ hệ thống server (không có khái niệm timezone theo owner ở MVP — nhất quán với cách `bookings.date` đã được xử lý ở module Bookings).

## 5. Truy vấn & hiệu năng

Đây là module đầu tiên cần các phép `SUM`/`COUNT`/`GROUP BY` thật sự (`todayRevenue`, `revenueByDay`, `revenueByCourt`, `newCustomersThisMonth`). Các module trước (Bookings, Payments, Courts) chỉ dùng repository pattern (`find`/`findOne`/`save`) vì không cần tổng hợp.

**Quyết định:** dùng TypeORM `QueryBuilder` (`createQueryBuilder`, `getRawMany`/`getRawOne`) cho riêng các query tổng hợp trong `DashboardService`. Đây là điểm khác biệt có chủ đích so với quy ước hiện tại — tổng hợp qua `find()` rồi cộng dồn bằng JS sẽ phải tải toàn bộ bảng `payments`/`bookings` vào bộ nhớ mỗi lần gọi dashboard, không phù hợp kể cả ở quy mô MVP khi dữ liệu tăng dần theo thời gian.

Tất cả các query đều lọc theo `venueId IN (...)` (danh sách venue thuộc owner, hoặc 1 venue nếu có `?venueId=`) ngay từ điều kiện `WHERE`/`JOIN` đầu tiên — không tải dữ liệu ngoài phạm vi rồi lọc sau.

## 6. Validation

- Role khác `owner` → 403.
- `venueId` (nếu truyền) không thuộc owner đang đăng nhập → 404 (tái dùng pattern `getOwnedVenueOrThrow`).
- Owner chưa có venue nào → trả về summary với toàn bộ số liệu = 0 / mảng rỗng (không lỗi).

## 7. Testing

- **Unit:** tính đúng ranh giới "hôm nay"/"tháng này" (boundary: 23:59:59 hôm qua vs 00:00:00 hôm nay); `newCustomersThisMonth` không đếm trùng khách có nhiều booking trong tháng; `revenueByDay` trả đủ 30 ngày kể cả ngày revenue = 0.
- **E2E:** dựng fixture (venue + court + bookings + payments ở nhiều ngày/nhiều trạng thái) rồi gọi `GET /dashboard/summary`, assert từng field khớp số liệu kỳ vọng; test `?venueId=` lọc đúng khi owner có nhiều venue; test 404 khi truyền `venueId` không thuộc owner; test 403 khi gọi bằng tài khoản `customer`.

## 8. Ngoài phạm vi

- Biểu đồ "Loại sân theo môn thể thao" — không áp dụng cho nền tảng đơn môn pickleball (xem mục 2).
- Bộ chọn chi nhánh dạng UI (chờ module Chi nhánh riêng, nếu được quyết định triển khai).
- Cache/pre-aggregation số liệu — MVP tính real-time mỗi request; cân nhắc lại nếu số lượng booking/payment lớn ảnh hưởng hiệu năng.
- Tuỳ chỉnh khoảng thời gian biểu đồ doanh thu (chỉ cố định 30 ngày ở MVP, chưa có bộ lọc "7 ngày/90 ngày/tuỳ chọn").
- Frontend (spec riêng, sau khi spec API này được duyệt — theo đúng mẫu đã làm ở Courts/Bookings/Payments).
- Dải nút lối tắt (Quick actions) và lời chào theo thời điểm trong ngày — thuần UI tĩnh phía frontend, không cần API riêng, sẽ đưa vào spec frontend.
