# Module: Admin — Xử lý khiếu nại booking/thanh toán (Dispute Handling) — Thiết kế chi tiết

**Ngày:** 2026-08-26
**Trạng thái:** Chờ review
**Thuộc kiến trúc tổng thể:** [2026-08-23-pickleball-platform-architecture-design.md](./2026-08-23-pickleball-platform-architecture-design.md)
**Liên quan:** [2026-08-25-payments-module-design.md](./2026-08-25-payments-module-design.md) (đã triển khai — `PaymentsService.markRefunded` là nền tảng cho `adminRefund` mới ở module này), [2026-08-26-admin-approvals-design.md](./2026-08-26-admin-approvals-design.md) (mẫu controller/notification admin đã có).

## 1. Mục tiêu

Kênh để khách hàng khiếu nại về một booking đã thanh toán (bị tính sai tiền, chủ sân không xử lý hoàn tiền, v.v.), và để Admin xem xét, quyết định hoàn tiền hoặc từ chối. Đây là mảnh cuối trong ý tưởng "Admin" ban đầu (cùng với [Admin Approvals](./2026-08-26-admin-approvals-design.md) và [Admin Platform Stats](./2026-08-26-admin-platform-stats-design.md) đã triển khai) — phạm vi thu hẹp có chủ đích vào **khiếu nại booking/thanh toán**, không phải hệ thống ticket hỗ trợ chung hay khiếu nại về hành vi chủ sân (xem §8).

**Quyết định có chủ đích:**
- Khách hàng **tự nộp** khiếu nại (không phải admin tự tra cứu thủ công) — cho một hàng đợi rõ ràng, có chủ (attributable), giống tinh thần hàng đợi duyệt đã có.
- Khi Admin quyết định "hoàn tiền", hệ thống **thực sự thực hiện hoàn tiền** (gọi logic hoàn tiền thật), không chỉ ghi nhận quyết định — tránh tình trạng quyết định được ghi lại nhưng quên xử lý.
- Trang riêng `/admin/disputes`, **không** gộp vào `/admin/approvals` — đây là luồng nghiệp vụ khác hẳn (điều tra + chọn 1 trong 2 hành động gắn với 1 booking cụ thể), không phải nhị phân duyệt/từ chối đơn giản như owner/venue.

## 2. Data model

**disputes** (bảng mới)

| Trường | Mô tả |
|---|---|
| id | UUID |
| booking_id | → `bookings.id`, **unique** — mỗi booking chỉ được khiếu nại **một lần duy nhất** (không được nộp lại sau khi đã resolved/rejected) |
| customer_id | → `users.id` — denormalize từ `booking.customer_id` để truy vấn "khiếu nại của tôi" không cần join, và làm điều kiện kiểm soát truy cập trực tiếp |
| reason | text, bắt buộc — mô tả tự do của khách hàng |
| status | enum: `pending` \| `resolved_refund` \| `rejected`, default `pending` |
| admin_note | text, nullable — ghi chú của admin khi xử lý (cả 2 trường hợp hoàn tiền/từ chối) |
| resolved_by | nullable, → `users.id` (admin đã xử lý) |
| resolved_at | nullable timestamp |
| created_at, updated_at | |

**Điều kiện được nộp khiếu nại:** `payment.status = 'paid'` cho booking đó (có tiền thật để có thể hoàn) — booking chưa thanh toán hoặc đã hoàn tiền rồi thì không cho nộp (400).

## 3. API endpoints

**Customer-facing:**
```
POST /bookings/:id/disputes        { reason: string }
```
Role `customer`. Booking phải thuộc về người gọi (404 nếu không — tái dùng pattern `findMineById`). `payment.status` của booking phải là `paid` (400 nếu không). Đã tồn tại dispute cho booking này rồi (bất kể status) → 409.

```
GET /disputes/mine
```
Role `customer`. Danh sách khiếu nại của chính khách hàng, mới nhất trước.

**Admin-facing:**
```
GET /admin/disputes?status=pending|all
```
Role `admin`. Mặc định (`status` bỏ trống hoặc `pending`) chỉ trả `pending`, mới nhất trước. `status=all` trả toàn bộ. Mỗi dòng kèm thông tin booking (sân, ngày giờ, số tiền) và khách hàng (tên, email) để admin có đủ ngữ cảnh mà không cần gọi thêm API.

```
POST /admin/disputes/:id/resolve   { action: 'refund' | 'reject', note?: string }
```
Role `admin`. Dispute không ở trạng thái `pending` → 400 ("Chỉ có thể xử lý khiếu nại đang chờ xử lý"). `action = 'refund'`: gọi `PaymentsService.adminRefund` (xem §4), set `status = 'resolved_refund'`. `action = 'reject'`: set `status = 'rejected'`, không đụng tới payment. Cả 2 trường hợp: set `resolvedBy`/`resolvedAt`, lưu `note` vào `admin_note` nếu có.

## 4. Triển khai backend

**`PaymentsService.adminRefund(bookingId: string, adminId: string, note?: string): Promise<Payment>`** (method mới) — logic giống hệt `markRefunded` hiện có (chuyển `status` sang `refunded`, set `refundedAt`/`refundedBy`, gửi `notifyPaymentRefunded`) nhưng **không** kiểm tra quyền sở hữu owner/venue (admin có quyền trên toàn nền tảng, không cần `ownerId`/`venueId`). Dùng `bookingsService.findByIdOrThrow(bookingId)` (method mới, xem dưới) thay vì `findByIdForOwnerOrThrow`. `refundedBy` được set bằng `adminId` — phản ánh đúng ai thực sự thực hiện hành động, không gán nhầm cho owner.

**`BookingsService.findByIdOrThrow(id: string): Promise<Booking>`** (method mới) — tra cứu booking theo id, không lọc theo customer/owner, ném `NotFoundException` nếu không tồn tại. Cùng mẫu với `VenuesService.findByIdOrThrow`/`CourtsService.findByIdOrThrow` đã có.

**`DisputesModule`** (module mới): `Dispute` entity, `DisputesService` (tạo/liệt kê/xử lý dispute, gọi `PaymentsService`/`BookingsService` cho phần booking/payment thay vì tự thao tác trực tiếp lên bảng `payments`/`bookings`), `DisputesController` (customer-facing: `POST /bookings/:id/disputes`, `GET /disputes/mine`), `AdminDisputesController` (admin-facing: `GET /admin/disputes`, `POST /admin/disputes/:id/resolve`) — 2 controller tách theo role, cùng mẫu `AdminController`/`AdminVenuesController` đã tách theo resource trong module `admin`.

`DisputesModule` import `BookingsModule`, `PaymentsModule` (lấy `BookingsService`/`PaymentsService`), `UsersModule` (lấy thông tin khách hàng để hiển thị trong `GET /admin/disputes`), `NotificationsModule`.

## 5. Notifications (mở rộng `NotificationsService`)

| Method | Khi nào gọi | Nội dung |
|---|---|---|
| `notifyDisputeRejected({ to, customerName, reason?: string })` | `resolve` với `action='reject'` thành công | Thông báo khiếu nại đã bị từ chối; nếu có `note` (admin), chèn vào email dưới dạng "Lý do" — cùng mẫu `notifyOwnerRejected`/`notifyVenueRejected` |

Trường hợp `action='refund'` tái dùng nguyên `notifyPaymentRefunded` đã có (qua `adminRefund` gọi lại đúng logic của `markRefunded`) — không cần email mới.

## 6. Validation

- `POST /bookings/:id/disputes`: booking không thuộc khách hàng gọi → 404. `payment.status != 'paid'` → 400. Đã có dispute cho booking này → 409. `reason` rỗng → 400 (`class-validator` `@IsNotEmpty`).
- `POST /admin/disputes/:id/resolve`: dispute không tồn tại → 404. `dispute.status != 'pending'` → 400. `action` không phải `refund`/`reject` → 400 (`class-validator` enum).
- Role sai (customer gọi endpoint admin hoặc ngược lại) → 403. Chưa đăng nhập → 401.

## 7. Frontend

- Trang lịch sử booking của khách hàng: thêm nút "Báo cáo vấn đề" trên mỗi booking đã thanh toán chưa có dispute — mở ô nhập lý do (bắt buộc) rồi gọi `POST /bookings/:id/disputes`.
- Trang mới `apps/web/src/app/admin/disputes/page.tsx`: danh sách dispute `pending`, mỗi dòng hiển thị thông tin booking/khách hàng/lý do, 2 nút "Hoàn tiền"/"Từ chối" (nút từ chối mở ô nhập ghi chú tuỳ chọn, cùng mẫu nút "Từ chối" ở `/admin/approvals`).
- Thêm mục thứ 3 vào `apps/web/src/components/admin-nav.tsx`: "Khiếu nại" → `/admin/disputes`.
- Proxy routes tương ứng dưới `apps/web/src/app/api/` theo đúng mẫu `fetchApi`/`toNextResponse` đã dùng ở mọi route admin khác.

## 8. Testing

- **Unit (`DisputesService`):** không cho nộp dispute khi `payment.status != 'paid'`; không cho nộp trùng (booking đã có dispute); `resolve` với `action='refund'` gọi đúng `PaymentsService.adminRefund` với `adminId` đúng; `resolve` với `action='reject'` không gọi payment; không cho `resolve` dispute không ở trạng thái `pending`.
- **Unit (`PaymentsService.adminRefund`):** chuyển đúng status/`refundedBy`/`refundedAt`, gửi `notifyPaymentRefunded`, không yêu cầu `ownerId`/`venueId`.
- **E2E:** khách hàng nộp dispute cho booking đã thanh toán → xuất hiện trong `GET /admin/disputes`; admin resolve `refund` → `GET /payments`/booking liên quan phản ánh `status=refunded`, email hoàn tiền được gửi; admin resolve `reject` → payment không đổi, email từ chối kèm `note` được gửi; nộp dispute lần 2 cho cùng booking → 409; resolve dispute đã resolved → 400; 403 khi customer gọi endpoint admin và ngược lại; 401 khi chưa đăng nhập.

## 9. Ngoài phạm vi

- Khiếu nại về hành vi/uy tín chủ sân hoặc chất lượng venue (không gắn với 1 booking cụ thể) — cần mô hình dữ liệu khác (gắn với `venue`/`user` thay vì `booking`), để lại cho spec riêng nếu có nhu cầu.
- Hệ thống ticket hỗ trợ chung (câu hỏi kỹ thuật, vấn đề tài khoản không liên quan booking).
- Trao đổi qua lại nhiều lượt giữa khách hàng và admin trên 1 dispute (chỉ có 1 lượt nộp lý do + 1 lượt quyết định ở MVP, không có thread bình luận).
- Hoàn tiền một phần (partial refund) — `adminRefund` hoàn toàn bộ `booking.totalPrice`, giống hệt hành vi `markRefunded` hiện có.
- Đính kèm file/ảnh minh chứng khi nộp khiếu nại.
- Thông báo cho chủ sân khi có dispute liên quan tới booking của họ — MVP chỉ luồng khách hàng ↔ admin.
