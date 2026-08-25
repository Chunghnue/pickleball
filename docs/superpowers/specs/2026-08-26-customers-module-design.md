# Module: Customers (Khách hàng) — Thiết kế chi tiết

**Ngày:** 2026-08-26
**Trạng thái:** Chờ review
**Thuộc kiến trúc tổng thể:** [2026-08-23-pickleball-platform-architecture-design.md](./2026-08-23-pickleball-platform-architecture-design.md)
**Nguồn tham khảo:** [docs/spec/04-khach-hang.md](../../spec/04-khach-hang.md) (khảo sát UI sanbong.vn thực tế)
**Sửa đổi:** [2026-08-24-bookings-module-design.md](./2026-08-24-bookings-module-design.md) (thêm khách walk-in + endpoint owner tạo booking hộ khách), [2026-08-25-dashboard-design.md](./2026-08-25-dashboard-design.md) (xử lý booking không có `customerId`)

## 1. Mục tiêu

CRM cho owner: xem danh sách khách hàng đã từng đặt sân tại venue của mình (dù là khách có tài khoản hay khách vãng lai owner tự nhập tay), số liệu tổng hợp (lượt đặt, tổng chi tiêu), phân loại tự động (Mới/Thường xuyên/VIP), và cho phép owner tạo booking hộ một khách (kể cả khách chưa từng đặt bao giờ).

**Quyết định quan trọng — đảo ngược quyết định trước đó:** spec Bookings ([2026-08-24-bookings-module-design.md](./2026-08-24-bookings-module-design.md) §8) trước đây loại "owner tự tạo booking (walk-in khách vãng lai)" khỏi phạm vi MVP. Quyết định này được **đảo ngược** ở đây — walk-in booking là điều kiện cần cho module Customers có ý nghĩa (owner cần cách để thêm khách mới và đặt hộ ngay tại chỗ).

## 2. Data model

**customer_contacts** (khách vãng lai, không có tài khoản đăng nhập)

| Trường | Mô tả |
|---|---|
| id | UUID |
| owner_id | → users (owner sở hữu contact này) |
| full_name | bắt buộc |
| phone | bắt buộc |
| email, address, note | tuỳ chọn |
| created_at, updated_at | |

**Unique index:** `(owner_id, phone)` — mỗi owner không có 2 contact trùng SĐT. Owner khác nhau có thể có contact cùng SĐT (mỗi owner quản lý sổ khách riêng).

**Sửa bảng `bookings`** (thuộc module Bookings, xem chi tiết ở §4):
- `customer_id` đổi thành **nullable** (trước đây bắt buộc).
- Thêm cột `customer_contact_id` (nullable, FK → `customer_contacts`, `ON DELETE RESTRICT`).
- Thêm CHECK constraint: `(customer_id IS NOT NULL) <> (customer_contact_id IS NOT NULL)` — mỗi booking gắn với đúng một trong hai loại khách, không được cả hai hoặc không có.

Không tạo bảng thống kê riêng — `lượt đặt`, `tổng chi tiêu`, `lần cuối`, `phân loại` đều tính real-time từ `bookings` + `payments` (cùng cách tiếp cận với Dashboard).

## 3. Phân loại khách (tự động, không có nhãn thủ công)

Tính từ các booking **không bị cancelled** thuộc venue của owner:

| Tier | Điều kiện |
|---|---|
| **Mới** | Tổng số booking (không tính cancelled) ≤ 1 |
| **VIP** | Tổng chi tiêu (`payments.amount` với `status='paid'`) ≥ 5.000.000đ **hoặc** tổng số booking ≥ 10 |
| **Thường xuyên** | Còn lại (không rơi vào Mới hoặc VIP) |

Ngưỡng cố định trong code ở MVP này (xem §6 Ngoài phạm vi).

## 4. Sửa đổi module Bookings

### 4.1. Endpoint mới (owner-facing)

```
POST /venues/mine/:venueId/bookings
  body: {
    courtId, date, startTime, endTime,
    customerId?         // khách có tài khoản đã tồn tại
    customerContactId?  // khách walk-in đã có trong sổ
    newCustomer?: { fullName, phone, email?, address?, note? }  // tạo contact mới rồi dùng luôn
  }
```

Đúng một trong ba field khách (`customerId` / `customerContactId` / `newCustomer`) phải được truyền — 400 nếu truyền 0 hoặc ≥2. Áp dụng lại toàn bộ logic transaction/chống double-booking đã có ở booking do customer tự tạo (spec Bookings §5): nếu `newCustomer` được truyền, insert `customer_contacts` trước, lấy id, rồi tiếp tục transaction insert `bookings` + `booking_slots` như cũ.

Validate court/venue/slot-alignment giữ nguyên như cũ (spec Bookings §6). Owner chỉ tạo được booking cho venue mình sở hữu (tái dùng `getOwnedVenueOrThrow`).

### 4.2. Huỷ / hoàn thành booking walk-in

Không đổi: owner huỷ bất kỳ lúc nào (đã hỗ trợ, không phân biệt loại khách). Booking walk-in **không có luồng khách tự huỷ** (không có tài khoản để đăng nhập) — endpoint `POST /bookings/:id/cancel` (customer-facing) vẫn giữ nguyên, chỉ áp dụng khi có `customerId`.

### 4.3. Đọc booking — trả tên/SĐT khách

Mọi chỗ hiện đang join `users` để lấy tên/SĐT khách (`GET /bookings/mine`, `GET /venues/mine/:venueId/bookings`, `recentBookings` ở Dashboard...) cần sửa thành: nếu `customer_id` có giá trị → lấy từ `users`; nếu `customer_contact_id` có giá trị → lấy từ `customer_contacts`. Về bản chất là một `COALESCE` hai nguồn tên/SĐT.

## 5. API module Customers

Tất cả owner-facing (JWT, role `owner`), scope theo venue owner sở hữu — dùng chung cách tổng hợp nhiều-venue như Dashboard (`?venueId=` tuỳ chọn, mặc định tất cả venue).

```
GET  /customers?venueId=&tier=&search=
     → [{ kind: 'registered'|'walkin', id, fullName, phone, totalBookings, totalSpent, lastBookingAt, tier, customerCode }]
     tier: all|new|regular|vip (mặc định all); search: khớp fullName hoặc phone (LIKE, không phân biệt hoa thường)

GET  /customers/:kind/:id      (kind: registered|walkin)
     → { kind, id, fullName, phone, email?, address?, tier, totalBookings, totalSpent,
         lastBookingAt, customerCode, joinedAt }

POST /customer-contacts
     body: { fullName, phone, email?, address?, note? }
     → tạo khách walk-in mới, chưa kèm đặt sân (dùng khi owner muốn lưu trước, đặt sân sau)
```

**Mã khách hàng:** `KH-` + 8 ký tự đầu của `id` (UUID), viết hoa. Áp dụng như nhau cho cả `registered` và `walkin`.

**Ngày tham gia:** `users.created_at` (registered) hoặc `customer_contacts.created_at` (walkin).

**Thẻ số liệu tổng hợp** (đầu trang danh sách, tính trên toàn bộ khách trong phạm vi lọc):
- Tổng khách = tổng số dòng trong `GET /customers` (registered + walkin).
- Khách VIP = số dòng có `tier = vip`.
- Tổng lượt đặt = tổng `totalBookings` của toàn bộ khách trong danh sách.
- Tổng doanh thu = tổng `totalSpent` của toàn bộ khách trong danh sách.

Truy vấn dùng TypeORM `QueryBuilder` (cùng quyết định kỹ thuật với Dashboard §5) để tính `totalBookings`/`totalSpent`/`lastBookingAt` theo nhóm khách mà không tải toàn bộ bảng vào bộ nhớ.

## 6. Validation

- Role khác `owner` → 403 cho mọi endpoint.
- `POST /customer-contacts`: `fullName`, `phone` bắt buộc; trùng `(ownerId, phone)` đã tồn tại → 409 (gợi ý dùng contact đã có thay vì tạo trùng).
- `POST /venues/mine/:venueId/bookings`: đúng 1 trong 3 field khách → 400 nếu vi phạm; `customerId`/`customerContactId` không tồn tại → 404; `customerContactId` không thuộc owner đang gọi → 404 (không lộ dữ liệu contact của owner khác).
- `GET /customers/:kind/:id`: khách không thuộc phạm vi venue của owner (chưa từng đặt tại venue owner sở hữu, với `kind=registered`) hoặc contact không thuộc owner (`kind=walkin`) → 404.

## 7. Testing

- **Unit:** logic phân loại tier (boundary: đúng 1 lượt đặt, đúng ngưỡng 5.000.000đ, đúng ngưỡng 10 lượt); tạo mã KH đúng định dạng.
- **Integration:** CHECK constraint DB chặn insert booking thiếu cả 2 hoặc đủ cả 2 field khách (test trực tiếp trên Postgres thật, giống cách test unique index ở Bookings).
- **E2E:** owner thêm khách walk-in → đặt sân hộ bằng `newCustomer` → khách xuất hiện trong `GET /customers` với đúng lượt đặt/tổng tiền/tier; owner đặt sân hộ khách đã có tài khoản qua `customerId`; tìm kiếm theo SĐT trả đúng kết quả; lọc theo tier.

## 8. Ngoài phạm vi

- Gắn nhãn VIP thủ công (chỉ tự động theo ngưỡng ở MVP này).
- Ngưỡng phân loại có thể cấu hình qua màn Cài đặt (cố định trong code, sửa sau nếu cần).
- Sửa/xoá `customer_contacts` (chỉ có tạo mới ở MVP; sửa nếu cần dùng trực tiếp DB).
- Gộp một `customer_contact` vào một `user` khi khách walk-in sau này tự đăng ký tài khoản (không có luồng "merge" — hai bản ghi tồn tại độc lập).
- Khách tự chọn/xác nhận trở thành khách hàng "quen" của một venue cụ thể (không có khái niệm loyalty/membership).
- Frontend (spec riêng, sau khi spec API này được duyệt).
