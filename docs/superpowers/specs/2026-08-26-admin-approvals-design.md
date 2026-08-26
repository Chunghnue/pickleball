# Module: Admin — Hàng đợi duyệt hợp nhất (Owners + Venues) — Thiết kế chi tiết

**Ngày:** 2026-08-26
**Trạng thái:** Chờ review
**Thuộc kiến trúc tổng thể:** [2026-08-23-pickleball-platform-architecture-design.md](./2026-08-23-pickleball-platform-architecture-design.md)
**Sửa đổi:** [2026-08-23-auth-users-module-design.md](./2026-08-23-auth-users-module-design.md) (định nghĩa `admin/owners`), [2026-08-24-courts-module-design.md](./2026-08-24-courts-module-design.md) §"Phía admin" (định nghĩa `admin/venues`), [2026-08-26-notifications-module-design.md](./2026-08-26-notifications-module-design.md) (thêm 4 email mới vào `NotificationsService`).

## 1. Mục tiêu

Admin hiện phải kiểm tra 2 trang riêng biệt (`admin/owners`, `admin/venues`) để tìm việc cần duyệt, và không thấy được owner của một venue đang chờ duyệt có tài khoản đang ở trạng thái nào. Vì `POST /venues/mine` chỉ kiểm tra `role=owner` (không kiểm tra `status`), một owner có thể tạo venue trong khi tài khoản của chính họ vẫn đang `pending_approval` — nghĩa là owner và venue của họ có thể cùng chờ duyệt độc lập với nhau, và admin dễ bỏ sót một trong hai.

Module này thêm **một hàng đợi duyệt hợp nhất**: gộp owner đang chờ duyệt và venue đang chờ duyệt vào một danh sách duy nhất (mới nhất trước), mỗi dòng venue hiển thị kèm trạng thái tài khoản của owner sở hữu nó. Đây **không** phải module mới — chỉ thêm 1 endpoint tổng hợp (đọc) và mở rộng nhẹ 2 endpoint reject đã có, tái dùng toàn bộ logic duyệt/từ chối hiện có ở `UsersService`/`VenuesService`.

**Quyết định có chủ đích (đã chốt cùng user):**
- **Không** thêm trạng thái duyệt cho `Court`. Quyết định "duyệt chỉ diễn ra ở cấp venue" ở [courts-module-design.md §Ghi chú](./2026-08-24-courts-module-design.md) giữ nguyên.
- Không thêm bảng/cột mới. Lý do reject là văn bản tự do, chỉ dùng để soạn nội dung email, **không lưu trữ**.
- Trang admin gộp (`/admin/approvals`) **thay thế** hoàn toàn 2 trang hiện có (`/admin/owners`, `/admin/venues`), không giữ song song.

## 2. API endpoints

**Đọc (mới):**
```
GET /admin/approvals
```
Trả về mảng đã sắp xếp mới nhất trước, gồm 2 loại dòng:
```json
{ "type": "owner", "id": "...", "fullName": "...", "email": "...", "phone": "...", "submittedAt": "..." }
{ "type": "venue", "id": "...", "name": "...", "address": "...", "city": "...", "submittedAt": "...",
  "owner": { "id": "...", "fullName": "...", "status": "pending_approval|active|rejected|suspended|pending_verification" } }
```
`submittedAt` = `createdAt` của `User` (dòng owner) hoặc `Venue` (dòng venue) tương ứng — không phải cột mới.

Guard: `@Roles(UserRole.ADMIN)` (giống 2 controller admin hiện có).

**Hành động (đã có, mở rộng nhẹ):**
```
POST /admin/owners/:id/approve                  (không đổi)
POST /admin/owners/:id/reject   { reason?: string }   (mới: body optional)
POST /admin/venues/:id/approve                  (không đổi)
POST /admin/venues/:id/reject   { reason?: string }   (mới: body optional)
```
`reason` chỉ được dùng để đưa vào nội dung email từ chối (§4), không lưu vào DB.

## 3. Triển khai backend

- **`AdminApprovalsController`** (`admin/admin-approvals.controller.ts`) + **`AdminApprovalsService`** (`admin/admin-approvals.service.ts`), đăng ký trong `admin.module.ts` hiện có.
- `AdminApprovalsService.findAll()`:
  1. Gọi `usersService.findPendingOwners()` và `venuesService.findPendingVenues()` (không đổi, tái dùng nguyên trạng).
  2. Batch-load owner của các venue: `usersService.findByIds(venues.map(v => v.ownerId))` — **1 query `IN (...)`**, không N+1.
  3. Map thành 2 loại dòng ở §2, gộp 2 mảng, sort theo `submittedAt` giảm dần (mới nhất trước).
- **`UsersService`**: thêm `findByIds(ids: string[]): Promise<User[]>`.
- **`VenuesService`**: `approveVenue`/`rejectVenue` nhận thêm `reason?: string` (chỉ `rejectVenue` dùng), gọi `notificationsService.notifyVenue{Approved,Rejected}` sau khi lưu thành công. Cần join/lookup owner (qua `usersService.findById(venue.ownerId)`) để lấy email — `CourtsModule` import thêm `UsersModule` và `NotificationsModule`.
- **`UsersService`**: `approveOwner`/`rejectOwner` nhận thêm `reason?: string` (chỉ `rejectOwner` dùng), gọi `notificationsService.notifyOwner{Approved,Rejected}` sau khi lưu thành công. `UsersModule` import thêm `NotificationsModule`.
- Nếu gửi email thất bại, hành vi giữ nguyên pattern `sendSafely` hiện có (log warning, không rollback transaction duyệt/từ chối — duyệt/từ chối đã thành công về mặt dữ liệu là ưu tiên, email là best-effort).

## 4. Notifications (mở rộng `NotificationsService`)

4 method mới, theo đúng pattern `notify*`/`sendSafely` hiện có (`apps/api/src/notifications/notifications.service.ts`):

| Method | Khi nào gọi | Nội dung |
|---|---|---|
| `notifyOwnerApproved({ to, fullName })` | `UsersService.approveOwner` thành công | Thông báo tài khoản chủ sân đã được duyệt, có thể đăng nhập/tạo chi nhánh |
| `notifyOwnerRejected({ to, fullName, reason? })` | `UsersService.rejectOwner` thành công | Thông báo tài khoản bị từ chối; nếu có `reason`, chèn vào email |
| `notifyVenueApproved({ to, ownerName, venueName })` | `VenuesService.approveVenue` thành công | Thông báo chi nhánh đã được duyệt, hiển thị công khai |
| `notifyVenueRejected({ to, ownerName, venueName, reason? })` | `VenuesService.rejectVenue` thành công | Thông báo chi nhánh bị từ chối; nếu có `reason`, chèn vào email |

## 5. Frontend

- Trang mới `apps/web/src/app/admin/approvals/page.tsx`: 1 bảng, cột "Loại" (badge Owner/Venue), dòng venue có thêm badge phụ "Chủ sân: <trạng thái>" lấy từ `owner.status`. Nút Duyệt/Từ chối inline; Từ chối mở ô nhập lý do (optional) trước khi submit.
- Xoá `apps/web/src/app/admin/owners/page.tsx` và `apps/web/src/app/admin/venues/page.tsx`. Cập nhật `apps/web/src/components/admin-nav.tsx` trỏ về `/admin/approvals`.
- Proxy route mới `apps/web/src/app/api/admin/approvals/route.ts` (GET). Giữ nguyên các proxy route action hiện có cho owners/venues approve/reject, chỉ forward thêm `reason` trong body khi có.

## 6. Testing

- **Unit (`AdminApprovalsService`):** gộp + sort đúng thứ tự mới nhất trước; venue có owner **đã active** (không nằm trong danh sách pending owners) vẫn hiển thị đúng `owner.status = active`; venue có owner đang pending hiển thị đúng `owner.status = pending_approval`.
- **Unit (`NotificationsService`):** `notifyOwnerRejected`/`notifyVenueRejected` chèn đúng `reason` vào HTML khi có, bỏ qua khi không có.
- **E2E:** `GET /admin/approvals` (đăng nhập admin) trả về đúng owner + venue đang pending, đã gộp và sort; `POST /admin/venues/:id/reject` kèm `reason` → email gửi tới đúng owner với nội dung chứa reason; luồng approve owner/venue vẫn hoạt động như cũ và nay có gửi email tương ứng.

## 7. Ngoài phạm vi

- Duyệt ở cấp `Court` (quyết định giữ nguyên từ Courts module, xem §1).
- Lưu trữ `reason` từ chối vào DB / hiển thị lại lịch sử lý do từ chối trong UI admin.
- Duyệt hàng loạt (bulk approve/reject nhiều dòng cùng lúc).
- Phân trang cho `GET /admin/approvals` (quy mô hàng đợi hiện tại nhỏ; thêm sau nếu cần).
- Thống kê/dashboard admin (số liệu tổng quan platform) và xử lý khiếu nại/tranh chấp — 2 hạng mục còn lại trong ý tưởng "Admin" ban đầu, sẽ là spec riêng.
