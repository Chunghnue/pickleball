# Module: Courts — Thiết kế chi tiết

**Ngày:** 2026-08-24
**Trạng thái:** Đã duyệt
**Thuộc kiến trúc tổng thể:** [2026-08-23-pickleball-platform-architecture-design.md](./2026-08-23-pickleball-platform-architecture-design.md)

## 1. Mục tiêu

Module thứ hai cần triển khai, sau Auth+Users. Cho phép chủ sân (owner) đăng ký địa điểm (venue) và các sân (court) bên trong, cấu hình khung giờ mở cửa & giá; khách vãng lai (chưa cần đăng nhập) tìm kiếm/xem sân. Đây là nền tảng dữ liệu cho module Bookings sau này.

Phạm vi: CRUD venue/court phía owner, duyệt venue phía admin, tìm kiếm/xem phía public, sinh danh sách khung giờ khả dụng theo cấu hình giờ mở cửa. **Chỉ thiết kế API (NestJS)** — spec frontend sẽ được brainstorm riêng sau, theo đúng mô hình đã dùng cho Auth+Users.

## 2. Data model

| Bảng | Trường chính |
|---|---|
| **venues** | id, owner_id (→users), name, address, city, description, status (`pending_approval`\|`active`\|`rejected`), created_at, updated_at |
| **venue_images** | id, venue_id, url, created_at |
| **courts** | id, venue_id, name, price_per_hour, open_time, close_time, slot_duration_minutes, is_active (bool), created_at, updated_at |

Quyết định thiết kế:
- Một owner có thể sở hữu **nhiều venue** (`owner_id` trên venue, không giới hạn số lượng).
- Duyệt (approval) chỉ diễn ra ở **cấp venue**. Court không có trạng thái duyệt riêng — court kế thừa khả năng hiển thị từ venue chứa nó. Thêm court mới vào venue đã `active` thì court đó hiển thị công khai ngay (owner đã được xác minh ở cấp tài khoản lẫn cấp venue).
- `courts.is_active` để owner tự ẩn/hiện một sân riêng lẻ (bảo trì, ngừng hoạt động tạm thời) mà không cần duyệt lại. Không có xoá cứng (hard delete) court/venue trong phạm vi MVP — chỉ ẩn qua `is_active` (court) hoặc không public nếu venue không `active`.
- Giờ mở cửa (`open_time`, `close_time`), độ dài khung giờ (`slot_duration_minutes`) và giá (`price_per_hour`) nằm ở **cấp court**, không phải cấp venue, vì các sân trong cùng venue có thể khác nhau (VD: sân trong nhà và sân ngoài trời khác giờ/giá).
- Ảnh chỉ áp dụng ở cấp venue (`venue_images`), không có ảnh riêng theo từng court — đơn giản hoá cho MVP.
- Ảnh lưu dưới dạng **URL do owner dán vào**, giống cách `avatarUrl` của user hiện tại hoạt động — không xây dựng hạ tầng upload file mới.
- Sửa thông tin venue/court đã `active` **không** yêu cầu duyệt lại — tránh làm gián đoạn owner đang hoạt động; admin vẫn có thể xem lại qua thống kê nếu cần (ngoài phạm vi MVP).

## 3. Trạng thái venue

- Owner tạo venue → `pending_approval`
- Admin duyệt → `active` (venue + toàn bộ court hiện có + court thêm sau này đều hiển thị công khai)
- Admin từ chối → `rejected` (owner có thể sửa và... việc gửi duyệt lại nằm ngoài phạm vi MVP; xử lý thủ công/liên hệ admin)
- Chỉ venue `active` mới xuất hiện trong tìm kiếm/xem công khai. Trong các API công khai, court chỉ hiển thị khi `venue.status = active` **và** `court.is_active = true`.

## 4. API endpoints

**Phía owner** (yêu cầu JWT, role `owner`, chỉ thao tác trên venue/court thuộc chính mình):
```
POST   /venues                        tạo venue mới (status = pending_approval)
GET    /venues/mine                   danh sách venue của owner hiện tại
GET    /venues/mine/:id               chi tiết 1 venue (kể cả không active)
PATCH  /venues/mine/:id               sửa thông tin venue (không đổi status)
POST   /venues/mine/:id/images        thêm ảnh (url)
DELETE /venues/mine/:id/images/:imageId

POST   /venues/mine/:venueId/courts       thêm court
GET    /venues/mine/:venueId/courts       danh sách court của venue
PATCH  /venues/mine/:venueId/courts/:id   sửa court (kể cả bật/tắt is_active)
```

**Phía admin** (mở rộng module Admin hiện có, theo đúng mẫu owner-approval đã có):
```
GET    /admin/venues/pending          danh sách venue chờ duyệt
POST   /admin/venues/:id/approve
POST   /admin/venues/:id/reject
```

**Phía public** (không cần đăng nhập):
```
GET    /venues?query=<text>           danh sách venue đang active; query lọc theo name/address/city (LIKE, không phân biệt hoa/thường)
GET    /venues/:id                    chi tiết venue active + danh sách court is_active của nó
GET    /courts/:id/slots?date=YYYY-MM-DD   danh sách khung giờ khả dụng trong ngày
```

## 5. Sinh khung giờ (`/courts/:id/slots`)

Tính **on-the-fly** trong code ứng dụng tại thời điểm gọi API — không lưu bảng slot riêng. Lý do: tránh vấn đề dữ liệu lệch pha khi owner đổi giờ/giá (nếu lưu sẵn slot sẽ phải đồng bộ lại), và hiện chưa có nhu cầu override từng slot riêng lẻ. Nếu Bookings sau này cần gắn trạng thái độc lập cho từng slot, quyết định lại lúc đó.

Thuật toán: chia đều từ `open_time` đến `close_time` theo bước `slot_duration_minutes`; mỗi slot trả về `{ start, end, price }`. Nếu khoảng `open_time`–`close_time` không chia hết cho `slot_duration_minutes`, bỏ phần dư cuối cùng (không sinh slot lẻ).

**Cập nhật ([2026-08-26-pricing-and-recurring-schedules-design.md](./2026-08-26-pricing-and-recurring-schedules-design.md)):** `price` không còn tính thẳng từ `price_per_hour * (slot_duration_minutes / 60)` — gọi `PricingService.resolvePrice(courtId, date, slotStart)` (module Pricing mới) để có giá/giờ đã áp dụng khung giá phù hợp, rồi mới nhân `slot_duration_minutes / 60`. `price_per_hour` vẫn giữ vai trò giá fallback khi không có pricing rule nào khớp.

`date` trong quá khứ (< hôm nay theo giờ server) → trả lỗi 400. Vì Bookings module chưa tồn tại, endpoint này **chưa biết slot nào đã được đặt** — mọi slot sinh ra đều coi là còn trống. Bookings module sau này sẽ bổ sung việc lọc/đánh dấu slot đã đặt (documented as out of scope here, not a gap).

## 6. Validation

- `open_time < close_time`
- `slot_duration_minutes` trong khoảng hợp lý (15–240 phút)
- `price_per_hour > 0`
- Owner chỉ được tạo/sửa venue/court thuộc chính mình (403 nếu không phải chủ sở hữu)
- `venues.city`, `name`, `address` bắt buộc; `description` tùy chọn

## 7. Ngoài phạm vi (module Courts)

- Frontend (spec riêng, sau khi spec này được duyệt)
- Lọc theo bản đồ/khoảng cách địa lý
- Ảnh upload dạng file thật (hiện dùng URL)
- Đánh dấu slot đã đặt (thuộc Bookings)
- Gửi lại venue bị `rejected` để duyệt lại (xử lý thủ công ngoài hệ thống trong MVP)
- Xoá cứng venue/court (chỉ ẩn qua status/is_active)
