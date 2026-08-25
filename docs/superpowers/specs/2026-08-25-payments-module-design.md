# Module: Payments — Thiết kế chi tiết

**Ngày:** 2026-08-25
**Trạng thái:** Đã duyệt
**Thuộc kiến trúc tổng thể:** [2026-08-23-pickleball-platform-architecture-design.md](./2026-08-23-pickleball-platform-architecture-design.md)

## 1. Mục tiêu

Module thứ tư cần triển khai, sau Auth+Users, Courts, Bookings. Thanh toán trong MVP là **thủ công** — không tích hợp cổng thanh toán nào. Khách chuyển khoản/đưa tiền mặt cho chủ sân ngoài hệ thống; hệ thống chỉ **tracking trạng thái**: chủ sân xác nhận đã nhận tiền, và sau này xác nhận đã hoàn tiền nếu cần.

Phạm vi: mỗi booking có đúng một payment record đi kèm; owner đánh dấu đã nhận tiền / đã hoàn tiền cho booking thuộc venue của mình; customer xem trạng thái thanh toán của booking mình (read-only).

Phụ thuộc: **Bookings** (booking phải tồn tại trước khi có payment; payment tham chiếu `booking_id`).

## 2. Data model

**payments** (1-1 với `bookings`)

| Trường | Mô tả |
|---|---|
| id | UUID |
| booking_id | → bookings, **unique** (mỗi booking tối đa 1 payment record) |
| status | `unpaid` \| `paid` \| `refunded`, default `unpaid` |
| note | TEXT, nullable — ghi chú tự do owner nhập khi xác nhận (vd. "CK Vietcombank") |
| paid_at | nullable timestamp |
| paid_by | nullable, → users — owner nào xác nhận đã nhận tiền |
| refunded_at | nullable timestamp |
| refunded_by | nullable, → users — owner nào xác nhận đã hoàn tiền |
| created_at, updated_at | |

**Ghi chú kiến trúc — phụ thuộc hai chiều giữa Bookings và Payments:**

Theo bảng phụ thuộc ở architecture doc, Payments phụ thuộc Bookings (một chiều). Nhưng để mọi booking luôn có sẵn payment record ngay khi tạo (thay vì suy ra mặc định `unpaid` khi thiếu record), `BookingsService.create()` gọi thẳng `PaymentsService` để insert payment row (`status = unpaid`) cùng lúc. Đồng thời, các method đọc của `BookingsService` (`findMineByCustomer`, `findMineById`, `findByVenueForOwner`) cũng gọi `PaymentsService` để nhúng `paymentStatus`/`paymentNote`/... vào response — giống hệt cách chúng đang nhúng thông tin court/venue/customer hiện nay.

Ngược lại, `PaymentsService` cần xác thực quyền sở hữu booking (owner sở hữu venue chứa booking đó) trước khi cho phép mark-paid/mark-refunded, nên gọi lại `BookingsService`.

Kết quả: `BookingsModule` và `PaymentsModule` phụ thuộc lẫn nhau. Giải quyết bằng `forwardRef()` ở cả hai `@Module()` — pattern chuẩn của NestJS cho đúng tình huống này, không cần event bus hay bảng trung gian.

## 3. State machine

Chuyển trạng thái chỉ đi tới (forward-only), không có undo — nhất quán với state machine của Booking:

- Tạo booking → tự động tạo payment `status = unpaid` (cùng transaction với `BookingsService.create()`).
- `unpaid → paid`: chỉ owner, endpoint `mark-paid`, bất kỳ lúc nào (không phụ thuộc trạng thái booking).
- `paid → refunded`: chỉ owner, endpoint `mark-refunded`, bất kỳ lúc nào. **Huỷ booking không tự động chuyển `paid → refunded`** — owner chủ động đánh dấu sau khi đã hoàn tiền thật (ngoài hệ thống).
- Mọi transition khác (`unpaid → refunded`, `paid → paid`, `refunded → *`) → lỗi 400.

## 4. API endpoints

**Phía owner** (JWT, role `owner`, venue phải thuộc chính mình — cùng pattern guard với booking cancel):
```
POST /venues/mine/:venueId/bookings/:id/payment/mark-paid       { note?: string }
POST /venues/mine/:venueId/bookings/:id/payment/mark-refunded   { note?: string }
```

**Không có endpoint đọc riêng.** Thông tin payment được nhúng thẳng vào response của các endpoint Bookings đã có sẵn (thêm field `paymentStatus`, `paymentNote`, `paidAt`, `refundedAt`):
```
GET /bookings/mine
GET /bookings/mine/:id
GET /venues/mine/:venueId/bookings
```
Nhờ vậy frontend chỉ cần 1 lần gọi list là có đủ dữ liệu, không cần gọi thêm rồi merge.

## 5. Validation

- `mark-paid` / `mark-refunded`: 404 nếu booking không tồn tại hoặc không thuộc venue của owner đang gọi (dùng lại cơ chế xác thực owner+venue hiện có của Bookings).
- `mark-paid`: 400 nếu payment hiện tại không phải `unpaid`.
- `mark-refunded`: 400 nếu payment hiện tại không phải `paid`.

## 6. Frontend

**Owner** (`bookings-section.tsx`): mỗi booking card thêm dòng trạng thái thanh toán + nút hành động, cạnh nút Huỷ hiện có:
- `unpaid` → "Chưa thanh toán" + nút "Đã nhận tiền".
- `paid` → "Đã thanh toán" (kèm note nếu có) + nút "Đánh dấu đã hoàn tiền" (hiển thị bất kể trạng thái booking, vì hoàn tiền có thể xảy ra sau khi huỷ).
- `refunded` → "Đã hoàn tiền", không còn hành động nào.

Nút hành động dùng **cùng pattern hai bước với nút Huỷ hiện tại**, nhưng mở rộng thêm một ô nhập ghi chú tuỳ chọn:
1. Bấm "Đã nhận tiền" / "Đánh dấu đã hoàn tiền" → hiện inline: ô input note (optional, để trống mặc định) + nút "Xác nhận" + nút "Thôi".
2. Bấm "Xác nhận" → gọi endpoint tương ứng với `{ note }` (chuỗi rỗng gửi thành `undefined`).

**Customer** (`/me/bookings/page.tsx`): thêm badge trạng thái thanh toán read-only cạnh badge trạng thái booking hiện có — "Chưa thanh toán" / "Đã thanh toán" / "Đã hoàn tiền". Không có nút thao tác nào.

**BFF route handlers mới** (`apps/web/src/app/api/...`), proxy hai action endpoint của owner:
```
apps/web/src/app/api/venues/mine/[venueId]/bookings/[id]/payment/mark-paid/route.ts
apps/web/src/app/api/venues/mine/[venueId]/bookings/[id]/payment/mark-refunded/route.ts
```

## 7. Testing

- **Unit (PaymentsService):** transition hợp lệ (`unpaid→paid`, `paid→refunded`) thành công; transition không hợp lệ (`unpaid→refunded`, `paid→paid`, `refunded→*`) ném lỗi 400; kiểm tra quyền sở hữu — booking thuộc venue của owner khác → 404.
- **Unit (BookingsService):** tạo booking cũng tạo kèm payment row `status=unpaid`; các method đọc trả về `paymentStatus` đã nhúng.
- **E2E:** customer đặt sân → `/bookings/mine` trả về `paymentStatus: unpaid` → owner gọi `mark-paid` (kèm note) → trạng thái cập nhật ở cả view owner và customer → owner gọi `mark-refunded` → trạng thái cập nhật tiếp → gọi lại `mark-paid` trên booking đã `paid` → 400.

## 8. Ngoài phạm vi (module Payments)

- Tích hợp cổng thanh toán online thật (VNPay, Momo, Stripe, ...).
- Thanh toán một phần / theo dõi số tiền thực nhận dưới dạng sổ cái (payment chỉ là trạng thái, không phải ledger).
- Tự động chuyển `paid → refunded` khi booking bị huỷ.
- Undo / sửa nhầm (`paid → unpaid`) nếu owner bấm nhầm.
