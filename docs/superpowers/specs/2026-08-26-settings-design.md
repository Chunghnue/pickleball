# Module: Settings (Cài đặt hệ thống) — Thiết kế chi tiết

**Ngày:** 2026-08-26
**Trạng thái:** Chờ review
**Thuộc kiến trúc tổng thể:** [2026-08-23-pickleball-platform-architecture-design.md](./2026-08-23-pickleball-platform-architecture-design.md)
**Nguồn tham khảo:** [docs/spec/10-cai-dat.md](../../spec/10-cai-dat.md) (khảo sát UI sanbong.vn thực tế)
**Sửa đổi:** [2026-08-24-courts-module-design.md](./2026-08-24-courts-module-design.md) (thêm field venue + operating hours), [2026-08-24-auth-users-module-design.md](./2026-08-24-auth-users-module-design.md) (thêm đổi mật khẩu), [2026-08-24-bookings-module-design.md](./2026-08-24-bookings-module-design.md) / [2026-08-25-payments-module-design.md](./2026-08-25-payments-module-design.md) (bắn email thông báo), [2026-08-26-pricing-and-recurring-schedules-design.md](./2026-08-26-pricing-and-recurring-schedules-design.md) (tái dùng cron scheduler)

## 1. Mục tiêu

4 nhóm cấu hình độc lập, gộp trên cùng 1 trang UI: thông tin venue, giờ hoạt động (hiển thị), bật/tắt loại email thông báo, và tài khoản cá nhân. Phần lớn tận dụng entity/endpoint đã có; phần mới đáng kể nhất là **lần đầu thực sự gửi email** cho sự kiện booking/payment (trước đây `MailService` chỉ dùng cho xác thực email/reset password).

## 2. Tab "Thông tin sân"

Mở rộng `venues` (đã có ở Courts module), thêm cột:

| Trường | Mô tả |
|---|---|
| logo_url | nullable text — dán URL, giống cách `venue_images` đã làm (không thêm upload file mới) |
| phone | nullable |
| email | nullable |
| website | nullable |

Mở rộng `PATCH /venues/mine/:id` (đã có) để nhận thêm 4 field trên cùng với `name`/`address`/`city`/`description` hiện có — không có endpoint mới.

## 3. Tab "Giờ hoạt động"

**venue_operating_hours** (7 dòng cố định mỗi venue)

| Trường | Mô tả |
|---|---|
| id | UUID |
| venue_id | → venues |
| day_of_week | INT 0-6 |
| is_open | BOOLEAN |
| open_time, close_time | nullable TIME — null khi `is_open = false` |

Unique `(venue_id, day_of_week)`.

```
PUT /venues/mine/:venueId/operating-hours
  body: [{ dayOfWeek, isOpen, openTime?, closeTime? }, ...]   // đúng 7 phần tử, dayOfWeek 0-6 không trùng
```

Ghi đè toàn bộ 7 dòng trong 1 transaction (xoá cũ, insert lại — đơn giản hơn PATCH từng ngày).

**Chỉ mang tính hiển thị** trên trang public venue — **không** dùng để sinh khung giờ đặt sân. Việc sinh slot đặt sân (`GET /courts/:id/slots`) tiếp tục dùng `open_time`/`close_time` của từng **court** như đã chốt ở [Courts §5](./2026-08-24-courts-module-design.md), không đổi. Quyết định này tránh có 2 nguồn sự thật cho "giờ mở cửa" ảnh hưởng tới logic đặt sân đã duyệt.

## 4. Tab "Thông báo"

**notification_settings** (1 dòng/owner, áp dụng cho mọi venue owner sở hữu)

| Trường | Mô tả |
|---|---|
| owner_id | PK, → users |
| new_booking | BOOLEAN, default true |
| cancellation | BOOLEAN, default true |
| payment | BOOLEAN, default true |
| daily_report | BOOLEAN, default true |
| created_at, updated_at | |

**Bỏ "Nhắc bảo trì sân"** khỏi phạm vi — không có tính năng bảo trì nào tồn tại để gắn thông báo (Bookings §8 đã loại "chặn slot bảo trì" khỏi MVP); một công tắc điều khiển tính năng không tồn tại là dead weight, sẽ thêm lại khi tính năng bảo trì được thiết kế.

```
GET   /notification-settings/mine
PATCH /notification-settings/mine
```

Owner chưa từng cấu hình → trả về giá trị mặc định (tất cả `true`), tự tạo dòng ở lần `PATCH` đầu tiên.

### 4.1. Điểm bắn thông báo (sửa đổi module đã duyệt)

Thêm gọi `MailService` (đã có, dùng cho email xác thực) vào các điểm sau — mỗi điểm tra `notification_settings` của owner sở hữu venue trước khi gửi, gửi tới `venues.email` nếu có, ngược lại `users.email` của owner:

- **Bookings, tạo booking mới** (cả customer tự đặt và owner đặt hộ qua module Customers): nếu `new_booking = true` → email owner.
- **Bookings, huỷ booking**: nếu `cancellation = true` **và** `cancelled_by` là customer (không gửi khi chính owner tự huỷ — tránh tự thông báo cho hành động của mình) → email owner.
- **Payments, mark-paid**: nếu `payment = true` → email owner.
- **Báo cáo ngày** (mới, cần scheduler): tái dùng `@nestjs/schedule` đã thêm ở [Pricing/Recurring Schedules §3.4](./2026-08-26-pricing-and-recurring-schedules-design.md) (không thêm hạ tầng cron mới) — cron chạy hàng ngày lúc 23:00 giờ server, với mỗi owner có `daily_report = true` và ≥1 venue: tính `todayBookingsCount`/`todayRevenue` (định nghĩa y hệt [Dashboard §4](./2026-08-25-dashboard-design.md)) rồi gửi email tóm tắt.

Gửi email **không** rollback transaction nếu thất bại (log lỗi, không throw) — tạo booking/thanh toán vẫn thành công dù email lỗi.

## 5. Tab "Tài khoản cá nhân"

Phần lớn đã có sẵn ở [Auth+Users](./2026-08-23-auth-users-module-design.md) / [frontend](./2026-08-24-auth-users-frontend-design.md), không đổi:

- Xem/sửa tên, SĐT, avatar: `GET`/`PATCH /users/me` (đã có).
- Đăng xuất: `POST /auth/logout` (đã có).

**Thêm mới:**

```
POST /users/me/change-password
  body: { currentPassword, newPassword }
```

Validate `currentPassword` khớp `password_hash` hiện tại (bcrypt compare) → sai trả 400. Đổi thành công → hash `newPassword`, cập nhật, và **thu hồi mọi refresh token khác** của user đó (tái dùng cơ chế revoke đã có ở Auth §5 "refresh token lưu hash trong DB nên thu hồi được") — buộc đăng nhập lại trên các thiết bị khác, đúng thông lệ bảo mật khi đổi mật khẩu.

**Sửa email: ngoài phạm vi.** Email giữ bất biến sau khi verify (quyết định ngầm định đã có từ Auth module — `PATCH /users/me` hiện không nhận field `email`) — cho phép sửa sẽ phải mở lại toàn bộ luồng xác thực email (unique check, gửi lại verification, xử lý trạng thái `email_verified` khi đang chờ xác thực địa chỉ mới), không cần thiết cho MVP này.

## 6. Validation

- Mọi endpoint owner-facing (§2-4): role khác `owner` → 403; venue không thuộc owner → 404.
- `PUT .../operating-hours`: đúng 7 phần tử, `dayOfWeek` phủ đủ 0-6 không trùng; nếu `isOpen = true` thì `openTime < closeTime` bắt buộc; nếu `isOpen = false` thì `openTime`/`closeTime` phải là null.
- `POST /users/me/change-password`: `newPassword` áp cùng rule độ mạnh mật khẩu đã dùng ở đăng ký (Auth module); `currentPassword` sai → 400, không tiết lộ thêm chi tiết.

## 7. Testing

- **Unit:** validate đủ 7 ngày operating-hours; logic chọn email người nhận (`venues.email` ưu tiên, fallback `users.email`); điều kiện gửi thông báo huỷ chỉ khi `cancelled_by` là customer.
- **Integration:** đổi mật khẩu thành công → refresh token cũ không dùng lại được (401 khi gọi `/auth/refresh` bằng token cũ).
- **E2E:** cập nhật thông tin venue (kèm logo/phone/email/website) → phản ánh đúng ở `GET /venues/:id` public; tắt `new_booking` → tạo booking mới không gửi email (mock `MailService`, assert không gọi); bật lại → có gọi; cron báo cáo ngày (gọi trực tiếp hàm xử lý trong test, không đợi thật) gửi đúng nội dung số liệu khớp Dashboard.

## 8. Ngoài phạm vi

- "Nhắc bảo trì sân" (không có tính năng bảo trì để gắn vào).
- Upload file logo (chỉ dán URL, giống venue images).
- Sửa email tài khoản cá nhân.
- Tuỳ chỉnh nội dung/mẫu email thông báo (dùng template cố định, không có trình soạn thảo).
- Lịch sử gửi thông báo (không lưu log gửi thành công/thất bại để owner xem lại).
- Frontend (spec riêng, sau khi spec API này được duyệt).
