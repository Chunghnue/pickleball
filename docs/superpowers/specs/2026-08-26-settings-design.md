# Module: Settings (Cài đặt hệ thống) — Thiết kế chi tiết

**Ngày:** 2026-08-26 (cập nhật 2026-09-03)
**Trạng thái:** Chờ review
**Thuộc kiến trúc tổng thể:** [2026-08-23-pickleball-platform-architecture-design.md](./2026-08-23-pickleball-platform-architecture-design.md)
**Nguồn tham khảo:** [docs/spec/10-cai-dat.md](../../spec/10-cai-dat.md) (khảo sát UI sanbong.vn thực tế)
**Sửa đổi:** [2026-08-24-courts-module-design.md](./2026-08-24-courts-module-design.md) (thêm field venue + operating hours), [2026-08-24-auth-users-module-design.md](./2026-08-24-auth-users-module-design.md) (thêm đổi mật khẩu), [2026-08-24-bookings-module-design.md](./2026-08-24-bookings-module-design.md) / [2026-08-25-payments-module-design.md](./2026-08-25-payments-module-design.md) (bắn email thông báo), [2026-08-26-pricing-and-recurring-schedules-design.md](./2026-08-26-pricing-and-recurring-schedules-design.md) (tái dùng cron scheduler)
**Frontend:** [2026-09-03-settings-frontend-design.md](./2026-09-03-settings-frontend-design.md)

## 0. Cập nhật 2026-09-03 — đối chiếu lại với những gì đã build từ 2026-08-26

Spec này được viết khi chưa module nào trong 4 tab tồn tại. Từ đó tới nay, 2 module khác đã hiện thực xong và **đè lên đúng phạm vi của tab 1 và tab 3**:

- **[Branches module](./2026-08-26-branches-design.md)** (đã build, `/owner/branches`) đã cho owner sửa đầy đủ `name`/`address`/`city`/`district`/`phone`/`email`/`description` **và upload file logo thật** (`POST /venues/mine/:id/logo`, không phải dán URL như §2 dưới đây từng giả định) cho **từng venue**. Tab "Thông tin sân" ở đây giờ trùng lặp gần như hoàn toàn về mặt dữ liệu — **quyết định (theo yêu cầu người dùng): vẫn giữ tab này, sửa được đầy đủ y như tài liệu khảo sát gốc**, chấp nhận 2 nơi cùng ghi vào `venues` (Settings và Branches). Vì nền tảng đa chi nhánh (khác sanbong.vn gốc chỉ 1 sân), tab không có ô chọn venue riêng — nó thao tác trên **venue đang chọn ở bộ chuyển đổi chi nhánh toàn cục**, xem §2.
- **[Notifications module](./2026-08-26-notifications-module-design.md)** (đã build, trạng thái "Đã duyệt") đã bắn email cho *một phần* các sự kiện dưới đây — nhưng **không đúng như §4 dưới đây từng giả định**: `notifyNewBookingForOwner` đã gọi *không điều kiện* mỗi khi có booking mới, còn `notifyBookingCancelled`/`notifyPaymentConfirmed`/`notifyPaymentRefunded` **chỉ gửi cho customer, chưa từng gửi cho owner**. §4 dưới đây viết lại cho khớp: gate lại call đã có (đặt lịch mới), và **thêm mới** 2 call gửi-cho-owner (huỷ lịch, thanh toán) chưa từng tồn tại.
- `GET`/`PATCH /users/me` (tab 4) đã có sẵn từ Auth+Users, đúng như spec này giả định — không đổi. `usersService.updatePassword()` cũng đã có sẵn (dùng nội bộ bởi luồng quên mật khẩu) — tái dùng được, xem §5.

## 1. Mục tiêu

4 nhóm cấu hình độc lập, gộp trên cùng 1 trang UI: thông tin venue, giờ hoạt động (hiển thị), bật/tắt loại email thông báo, và tài khoản cá nhân. Tab 1 và 4 chủ yếu tái dùng entity/endpoint đã có (xem §0); phần việc backend mới thực sự còn lại là: cột `website` trên `venues`, bảng `venue_operating_hours` + endpoint, bảng `notification_settings` + gate/thêm 3 điểm bắn email cho owner, và `POST /auth/change-password`.

## 2. Tab "Thông tin sân"

`logo_url`/`phone`/`email` **đã tồn tại** trên `venues` (do Branches module thêm, xem §0) — chỉ còn thiếu 1 cột:

| Trường | Mô tả |
|---|---|
| website | nullable text — cột mới duy nhất cần thêm |

Mở rộng `UpdateVenueDto`/`PATCH /venues/mine/:id` (đã có, đã nhận `name`/`address`/`city`/`district`/`description`/`phone`/`email` từ Branches module) để nhận thêm `website?: string` — không có endpoint mới. Logo dùng nguyên `POST /venues/mine/:id/logo` đã có (upload file thật, JPG/PNG/WEBP, tối đa 5MB — xem `venue-logo-upload.config.ts`), **không** phải dán URL như bản trước của spec này từng giả định.

**Venue mục tiêu của tab này:** không có ô chọn venue riêng trong tab — dùng venue đang chọn ở bộ chuyển đổi chi nhánh toàn cục (`selectedVenueId` từ `useBranch()`). Khi đang ở "Tất cả chi nhánh" (`ALL_BRANCHES_ID`), fallback về venue có `is_default = true` của owner (cùng pattern fallback trang Pricing đã dùng: fetch `GET /venues/mine`, tự chọn 1 venue cụ thể vì API cần `venueId` rõ ràng). Đây là quyết định frontend thuần tuý, không cần backend hỗ trợ thêm.

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

### 4.1. Điểm bắn thông báo (retrofit vào Notifications module đã duyệt — xem §0)

`NotificationsService`/`MailService` đã tồn tại và đã gửi *không điều kiện* cho 1 trong 4 sự kiện dưới đây; 4.1 này vừa **gate lại** call đã có, vừa **thêm mới** 2 call gửi-cho-owner chưa từng tồn tại. Mỗi điểm tra `notification_settings` của owner sở hữu venue trước khi gửi, gửi tới `venue.email` nếu có, ngược lại `owner.email`:

- **Bookings, tạo booking mới** (`bookings.service.ts`, cả 2 nhánh tạo booking — customer tự đặt và owner đặt hộ qua module Customers) — **đã có** call `notificationsService.notifyNewBookingForOwner({ to: owner.email, ... })` không điều kiện. Sửa: bọc trong `if (notificationSettings.newBooking)`, đổi `to` từ `owner?.email` sang `venue.email ?? owner?.email`.
- **Bookings, huỷ booking** (`bookings.service.ts`, luồng cancel) — **hiện chưa gửi cho owner** (chỉ có `notifyBookingCancelled` gửi cho customer). Thêm 1 call mới `notifyBookingCancelled`-tương tự nhưng `to` là venue/owner, chỉ khi `cancellation = true` **và** `cancelledBy` là customer (không gửi khi chính owner tự huỷ — tránh tự thông báo cho hành động của mình).
- **Payments, mark-paid** (`payments.service.ts`) — **hiện chưa gửi cho owner** (chỉ có `notifyPaymentConfirmed` gửi cho customer). Thêm 1 call mới, chỉ khi `payment = true`.
- **Báo cáo ngày** (mới, cần scheduler): tái dùng `@nestjs/schedule` đã thêm ở [Pricing/Recurring Schedules §3.4](./2026-08-26-pricing-and-recurring-schedules-design.md) (không thêm hạ tầng cron mới) — cron chạy hàng ngày lúc 23:00 giờ server, với mỗi owner có `daily_report = true` và ≥1 venue: tính `todayBookingsCount`/`todayRevenue` (định nghĩa y hệt [Dashboard §4](./2026-08-25-dashboard-design.md)) rồi gửi email tóm tắt.

Gửi email **không** rollback transaction nếu thất bại (log lỗi, không throw) — tạo booking/thanh toán vẫn thành công dù email lỗi. `NotificationsService.sendSafely` đã tự try/catch nội bộ, các call mới thêm ở trên chỉ cần gọi await inline như các call hiện có.

## 5. Tab "Tài khoản cá nhân"

Phần lớn đã có sẵn ở [Auth+Users](./2026-08-23-auth-users-module-design.md) / [frontend](./2026-08-24-auth-users-frontend-design.md), không đổi:

- Xem/sửa tên, SĐT, avatar: `GET`/`PATCH /users/me` (đã có).
- Đăng xuất: `POST /auth/logout` (đã có).

**Thêm mới:**

```
POST /auth/change-password
  body: { currentPassword, newPassword }
```

**Đặt trên `AuthController`** (cạnh `forgot-password`/`reset-password` đã có), **không phải** `UsersController` — `AuthService` đã inject sẵn `UsersService` (một chiều: `AuthModule` import `UsersModule`); đặt endpoint ở `UsersController` sẽ buộc `UsersModule` phải import ngược lại `AuthModule` để lấy `AuthService` (cần `RefreshTokenRepository`), tạo circular dependency `UsersModule ↔ AuthModule` — đúng kiểu phức tạp Bookings↔Payments từng phải xử lý bằng `forwardRef`, tránh được hoàn toàn bằng cách đặt endpoint đúng module sở hữu `RefreshTokenRepository`. **Khác với mọi route khác của `AuthController`** (`register`/`login`/`refresh`/`logout`/`forgot-password`/`reset-password` đều không cần JWT — tự thân đã là cơ chế xác thực hoặc pre-auth), route này cần biết *ai* đang đổi mật khẩu nên phải thêm `@UseGuards(JwtAuthGuard)` + `@CurrentUser()` (tái dùng decorator đã có, hiện chỉ dùng ở `UsersController`) riêng cho route này — không áp guard cho cả controller. Validate `currentPassword` khớp `password_hash` hiện tại (bcrypt compare) → sai trả 400. Đổi thành công → gọi `usersService.updatePassword()` (**đã có sẵn**, hiện chỉ dùng nội bộ bởi luồng quên mật khẩu ở `AuthService.resetPassword`), rồi **thu hồi mọi refresh token** của user đó — tái dùng đúng câu query đã có ở `resetPassword` (`refreshTokenRepository.update({ userId, revokedAt: IsNull() }, { revokedAt: new Date() })`), factor ra 1 private method dùng chung `revokeAllRefreshTokens(userId)` cho cả 2 luồng — buộc đăng nhập lại trên mọi thiết bị, đúng thông lệ bảo mật khi đổi mật khẩu.

**Sửa email: ngoài phạm vi.** Email giữ bất biến sau khi verify (quyết định ngầm định đã có từ Auth module — `PATCH /users/me` hiện không nhận field `email`) — cho phép sửa sẽ phải mở lại toàn bộ luồng xác thực email (unique check, gửi lại verification, xử lý trạng thái `email_verified` khi đang chờ xác thực địa chỉ mới), không cần thiết cho MVP này.

## 6. Validation

- Mọi endpoint owner-facing (§2-4): role khác `owner` → 403; venue không thuộc owner → 404.
- `PUT .../operating-hours`: đúng 7 phần tử, `dayOfWeek` phủ đủ 0-6 không trùng; nếu `isOpen = true` thì `openTime < closeTime` bắt buộc; nếu `isOpen = false` thì `openTime`/`closeTime` phải là null.
- `POST /auth/change-password`: `newPassword` áp cùng rule độ mạnh mật khẩu đã dùng ở đăng ký (Auth module); `currentPassword` sai → 400, không tiết lộ thêm chi tiết.

## 7. Testing

- **Unit:** validate đủ 7 ngày operating-hours; logic chọn email người nhận (`venue.email` ưu tiên, fallback `owner.email`); điều kiện gửi thông báo huỷ chỉ khi `cancelledBy` là customer; `AuthService.changePassword` — `currentPassword` sai → không gọi `updatePassword`/không revoke.
- **Integration:** đổi mật khẩu thành công → refresh token cũ không dùng lại được (401 khi gọi `/auth/refresh` bằng token cũ).
- **E2E:** cập nhật thông tin venue (kèm `website` mới, cộng logo/phone/email đã có từ Branches) → phản ánh đúng ở `GET /venues/:id` public; tắt `new_booking` → tạo booking mới không gửi email cho owner (mock `MailService`, assert không gọi — email cho customer vẫn phải gửi); bật lại → có gọi; huỷ lịch bởi customer với `cancellation = true` → owner nhận email (trước đây không có); mark-paid với `payment = true` → owner nhận email (trước đây không có); cron báo cáo ngày (gọi trực tiếp hàm xử lý trong test, không đợi thật) gửi đúng nội dung số liệu khớp Dashboard.

## 8. Ngoài phạm vi

- "Nhắc bảo trì sân" (không có tính năng bảo trì để gắn vào).
- Sửa email tài khoản cá nhân.
- Tuỳ chỉnh nội dung/mẫu email thông báo (dùng template cố định, không có trình soạn thảo).
- Lịch sử gửi thông báo (không lưu log gửi thành công/thất bại để owner xem lại).
- Hợp nhất/loại bỏ trùng lặp UI giữa tab "Thông tin sân" và trang Branches — quyết định có chủ đích giữ cả 2 (xem §0), không phải nợ kỹ thuật cần dọn trong spec này.
- Frontend — xem [2026-09-03-settings-frontend-design.md](./2026-09-03-settings-frontend-design.md).
