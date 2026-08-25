# Module: Notifications (email) — Thiết kế chi tiết

**Ngày:** 2026-08-26
**Trạng thái:** Đã duyệt
**Thuộc kiến trúc tổng thể:** [2026-08-23-pickleball-platform-architecture-design.md](./2026-08-23-pickleball-platform-architecture-design.md)

## 1. Mục tiêu

Module thứ năm cần triển khai, sau Auth+Users, Courts, Bookings, Payments. Gửi email cho các sự kiện quan trọng của vòng đời booking — customer và owner luôn biết trạng thái booking/thanh toán của mình mà không cần chủ động kiểm tra hệ thống.

Phạm vi: gửi email cho 5 sự kiện (đặt sân thành công, huỷ booking, có booking mới cho owner, xác nhận thanh toán, xác nhận hoàn tiền). Gửi email là **best-effort** — lỗi gửi mail không bao giờ làm fail request tạo/huỷ booking hay mark-paid/mark-refunded.

Phụ thuộc: **Bookings**, **Payments** (Notifications được gọi từ hai service này). Notifications tự nó chỉ phụ thuộc `MailModule` — không phụ thuộc ngược lại Bookings/Payments.

## 2. Kiến trúc & vị trí module

```
BookingsModule  ──imports──▶ NotificationsModule ──imports──▶ MailModule
PaymentsModule  ──imports──▶ NotificationsModule
```

Module lá (leaf) — không cần `forwardRef` (khác với cặp Bookings↔Payments).

**`MailService`** (đã có, module `mail/`) thêm một method transport chung:
```ts
send(to: string, subject: string, html: string): Promise<void>
```
Hai method cũ `sendVerificationEmail`/`sendPasswordResetEmail` giữ nguyên API, refactor nội bộ để gọi `send()` — không đổi behavior.

**`NotificationsService`** (module mới `notifications/`) sở hữu 5 template tiếng Việt + method tương ứng. Mỗi method **tự try/catch quanh `mailService.send(...)`**, log warning (kèm `to` + tên method) nếu lỗi, **không bao giờ throw**. Nếu `to` rỗng/null (không nên xảy ra vì customer/owner luôn có email hợp lệ) → log warning, bỏ qua, không gọi mail.

`NotificationsService` không tự truy vấn DB — nhận data phẳng do caller (`BookingsService`/`PaymentsService`, vốn đã có sẵn `CourtsService`/`VenuesService`/`UsersService`) tra cứu sẵn và truyền vào.

```ts
notifyBookingConfirmed(params: { to: string; customerName: string; venueName: string; courtName: string; date: string; startTime: string; endTime: string; totalPrice: number }): Promise<void>

notifyBookingCancelled(params: { to: string; venueName: string; courtName: string; date: string; startTime: string; endTime: string; cancelledBy: 'customer' | 'owner' }): Promise<void>

notifyNewBookingForOwner(params: { to: string; venueName: string; courtName: string; date: string; startTime: string; endTime: string; customerName: string; customerPhone: string | null; totalPrice: number }): Promise<void>

notifyPaymentConfirmed(params: { to: string; date: string; startTime: string; endTime: string; totalPrice: number }): Promise<void>

notifyPaymentRefunded(params: { to: string; date: string; startTime: string; endTime: string; totalPrice: number }): Promise<void>
```

Caller gọi các method này **await inline** (giống code style hiện tại của Auth/Bookings/Payments), nhưng vì nội bộ đã swallow lỗi nên request chính không bao giờ fail vì email lỗi. Gọi **sau khi transaction đã commit** — không gửi email rồi rollback.

## 3. Nội dung email

Style giống 2 email hiện có (`sendVerificationEmail`/`sendPasswordResetEmail`) — 1 đoạn `<p>` đơn giản, không cần template HTML phức tạp.

| Method | Subject | Nội dung chính |
|---|---|---|
| notifyBookingConfirmed | "Xác nhận đặt sân" | Tên sân, venue, ngày/giờ, tổng tiền |
| notifyBookingCancelled | "Booking đã được huỷ" | Tên sân, venue, ngày/giờ, ai huỷ (customer/owner) |
| notifyNewBookingForOwner | "Có booking mới" | Tên sân, venue, ngày/giờ, tên + SĐT khách, tổng tiền |
| notifyPaymentConfirmed | "Xác nhận đã thanh toán" | Ngày/giờ, số tiền (không kèm tên sân/venue) |
| notifyPaymentRefunded | "Xác nhận hoàn tiền" | Ngày/giờ, số tiền (không kèm tên sân/venue) |

## 4. Điểm tích hợp

**a) `BookingsService.create()`** — sau khi transaction trả về `savedBooking` (court/venue đã fetch sẵn trong method để validate):
- Lấy `customer = usersService.findById(customerId)` và `owner = usersService.findById(venue.ownerId)`.
- `await notifyBookingConfirmed({ to: customer.email, customerName: customer.fullName, venueName: venue.name, courtName: court.name, date, startTime, endTime, totalPrice })`
- `await notifyNewBookingForOwner({ to: owner.email, venueName: venue.name, courtName: court.name, date, startTime, endTime, customerName: customer.fullName, customerPhone: customer.phone, totalPrice })`

**b) `BookingsService.cancel()` (private, dùng chung cho `cancelByCustomer`/`cancelByOwner`)** — sau khi transaction huỷ xong:
- `cancelByCustomer` đã fetch `court`/`venue` sẵn (cho cutoff check) → truyền xuống `cancel()` để khỏi query lại.
- `cancelByOwner` hiện chưa fetch court/venue → thêm 2 lần fetch (giống pattern `enrichWithCourtInfo`).
- Lấy `customer = usersService.findById(booking.customerId)`.
- Xác định `cancelledBy: 'customer' | 'owner'` bằng cách so sánh param `cancelledBy` (user id thực hiện huỷ) với `booking.customerId`.
- `await notifyBookingCancelled({ to: customer.email, venueName, courtName, date, startTime, endTime, cancelledBy })`

**c) `PaymentsService.markPaid()` / `markRefunded()`**
- Thêm `UsersModule` vào import của `PaymentsModule` (dependency mới, an toàn — Users là module nền tảng, không tạo vòng lặp với Payments).
- Bắt lấy giá trị trả về của `bookingsService.findByIdForOwnerOrThrow(...)` (hiện đang bị bỏ qua) để có `booking.customerId/date/startTime/endTime/totalPrice`.
- Lấy `customer = usersService.findById(booking.customerId)`.
- `markPaid` → `await notifyPaymentConfirmed({ to: customer.email, date: booking.date, startTime: booking.startTime, endTime: booking.endTime, totalPrice: booking.totalPrice })`
- `markRefunded` → `await notifyPaymentRefunded({ to: customer.email, date: booking.date, startTime: booking.startTime, endTime: booking.endTime, totalPrice: booking.totalPrice })`
- Không cần `CourtsModule`/`VenuesService` mới trong Payments — nội dung email payment không kèm tên sân/venue (quyết định giữ Payments gọn).

## 5. Testing

- **Unit `NotificationsService`** (mock `MailService`): mỗi trong 5 method gọi đúng `mailService.send` với `to`/`subject`/`html` chứa đúng thông tin; khi `mailService.send` reject → method vẫn resolve (không throw), có log warning.
- **Unit `MailService`**: thêm test cho `send()` generic; test cũ cho `sendVerificationEmail`/`sendPasswordResetEmail` giữ nguyên (đảm bảo refactor không đổi behavior).
- **Unit `BookingsService`/`PaymentsService`** (mở rộng spec hiện có): thêm case gọi đúng `notificationsService.notifyXxx` với đúng tham số ở từng điểm tích hợp (create, cancel, markPaid, markRefunded); test rằng nếu `notificationsService.notifyXxx` reject, method chính vẫn resolve bình thường (best-effort).
- **E2E**: mở rộng `test-app.ts` — thêm `send: jest.fn().mockResolvedValue(undefined)` vào `mockMailService`, **giữ `NotificationsService` thật** (không mock) để test đúng luồng tích hợp thật. Trong `bookings.e2e-spec.ts`/`payments.e2e-spec.ts` thêm assertion: sau khi tạo/huỷ booking hoặc mark-paid/refunded, `mockMailService.send` được gọi với `to` đúng email, `subject`/`html` chứa đúng nội dung mong đợi.

## 6. Ngoài phạm vi (module Notifications)

- SMS/Zalo OA (đã loại khỏi MVP tổng thể theo architecture doc).
- Cấu hình tuỳ chọn nhận/không nhận thông báo (notification preferences) cho user.
- Hàng đợi/retry cho email gửi lỗi — best-effort là đủ cho MVP cá nhân, lỗi thì bỏ qua, không retry.
- Email khi booking chuyển sang `completed` (lazy transition) — không có hành động chủ động của người dùng nên không cần thông báo.
- Template email dạng branding/HTML đẹp — giữ `<p>` đơn giản như 2 email hiện có.
