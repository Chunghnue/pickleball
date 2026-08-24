# Courts Frontend — Thiết kế chi tiết

**Ngày:** 2026-08-24
**Trạng thái:** Đã duyệt
**Thuộc kiến trúc tổng thể:** [2026-08-23-pickleball-platform-architecture-design.md](./2026-08-23-pickleball-platform-architecture-design.md)
**Xây trên API đã có:** [2026-08-24-courts-module-design.md](./2026-08-24-courts-module-design.md)

## 1. Mục tiêu

Xây giao diện Next.js (`apps/web`) cho toàn bộ luồng người dùng của module Courts đã hoàn thành ở backend: chủ sân đăng ký venue/sân, admin duyệt venue, khách tìm kiếm/xem sân và khung giờ. Cùng mô hình BFF đã dùng cho Auth+Users.

## 2. Kiến trúc: BFF qua Next.js Route Handlers

Giữ nguyên kiến trúc đã có (xem [2026-08-24-auth-users-frontend-design.md](./2026-08-24-auth-users-frontend-design.md) mục 2): trình duyệt không bao giờ gọi thẳng NestJS. Route handlers mới dùng `fetchApi()` (helper đã có sẵn ở `apps/web/src/lib/fetch-api.ts`) để đính kèm cookie access token và tự động refresh khi cần.

Bảo vệ route tiếp tục qua `apps/web/proxy.ts` + `route-protection.ts` đã có: `/owner/*` đã yêu cầu role `owner`, `/admin/*` đã yêu cầu role `admin` — không cần sửa `PROTECTED_PREFIXES`. `/venues` và `/venues/[id]` là public, không thêm vào danh sách bảo vệ.

### Route handlers mới (proxy 1-1 sang backend)

```
Phía owner (JWT, role owner)
  POST   /api/venues                              -> POST /venues
  GET    /api/venues/mine                          -> GET /venues/mine
  GET    /api/venues/mine/[id]                     -> GET /venues/mine/:id
  PATCH  /api/venues/mine/[id]                      -> PATCH /venues/mine/:id
  POST   /api/venues/mine/[id]/images               -> POST /venues/mine/:id/images
  DELETE /api/venues/mine/[id]/images/[imageId]     -> DELETE /venues/mine/:id/images/:imageId
  POST   /api/venues/mine/[venueId]/courts          -> POST /venues/mine/:venueId/courts
  GET    /api/venues/mine/[venueId]/courts          -> GET /venues/mine/:venueId/courts
  PATCH  /api/venues/mine/[venueId]/courts/[id]     -> PATCH /venues/mine/:venueId/courts/:id

Phía admin (JWT, role admin)
  GET    /api/admin/venues/pending                 -> GET /admin/venues/pending
  POST   /api/admin/venues/[id]/approve             -> POST /admin/venues/:id/approve
  POST   /api/admin/venues/[id]/reject              -> POST /admin/venues/:id/reject

Phía public (không cần đăng nhập)
  GET    /api/venues?query=                         -> GET /venues?query=
  GET    /api/venues/[id]                            -> GET /venues/:id
  GET    /api/courts/[id]/slots?date=                -> GET /courts/:id/slots?date=
```

Mỗi route handler chỉ forward path/method/body/query string sang `fetchApi()` và trả nguyên response qua `toNextResponse()` (helper đã có, dùng lại pattern của `/api/admin/owners/*`).

## 3. Màn hình phía chủ sân (owner)

- **`/owner`** (thay placeholder hiện tại) — "Sân của tôi": danh sách venue của owner dạng card (tên, thành phố, badge trạng thái `pending_approval`/`active`/`rejected`), mỗi card link tới trang chi tiết; có nút/link "Thêm sân mới".
- **`/owner/venues/new`** — form (react-hook-form + zod, cùng pattern với `/register`) cho `name`, `address`, `city`, `description`; thành công thì redirect sang trang chi tiết venue vừa tạo.
- **`/owner/venues/[id]`** — không gian quản lý chính:
  - Thông tin venue: form chỉnh sửa inline (name/address/city/description), cùng pattern với `/me`, submit qua `PATCH`.
  - Ảnh: danh sách URL đã dán, kèm ô nhập "thêm URL" nhỏ và nút xoá cho từng ảnh.
  - Danh sách sân (courts): mỗi card hiển thị tên, giá/giờ, giờ mở cửa, badge active/inactive; có nút "sửa" để hiện form inline (tên, giá, giờ mở/đóng, độ dài slot, checkbox "Đang hoạt động" — dùng `<input type="checkbox">` thường, không cần component Switch riêng). Bên dưới danh sách là form "thêm sân" dùng cùng bộ trường (không có checkbox active — sân mới luôn tạo với `isActive` mặc định `true` ở backend).
  - Venue bị `rejected` hiển thị `Alert` banner thông báo trạng thái (chỉ thông tin, không có hành động gửi lại — đúng theo quyết định "không có luồng resubmission" ở spec backend mục 7).

## 4. Màn hình phía admin

- **Thanh điều hướng admin dùng chung**: component `AdminNav` nhỏ (2 link: "Chủ sân chờ duyệt" | "Sân chờ duyệt") hiển thị ở đầu cả `/admin/owners` và `/admin/venues`. `/admin/owners` được thêm component này vào, phần còn lại giữ nguyên.
- **`/admin/venues`** — cùng pattern danh sách + nút duyệt/từ chối như `/admin/owners` hiện có: gọi `GET /api/admin/venues/pending`, render mỗi venue thành `Card` (tên, địa chỉ, thành phố), nút "Duyệt"/"Từ chối" gọi route handler tương ứng rồi tải lại danh sách.

## 5. Màn hình công khai (public)

- **`/venues`** — trang tìm kiếm: ô nhập text gắn với `?query=`, gọi `GET /api/venues`; kết quả hiển thị dạng grid/list card venue (tên, thành phố, địa chỉ) link sang trang chi tiết. Trạng thái rỗng: "Không tìm thấy sân nào phù hợp."
- **`/venues/[id]`** — chi tiết venue: thông tin venue (tên/địa chỉ/thành phố/mô tả, ảnh nếu có) và danh sách court đang active. Mỗi court hiển thị tên/giá/giờ mở cửa và một ô chọn ngày (mặc định hôm nay), khi đổi ngày gọi `GET /api/courts/[id]/slots?date=` và hiển thị kết quả dạng lưới chip không tương tác (`start–end`, giá). Response lỗi ngày quá khứ/không hợp lệ (400) hiển thị lỗi inline; venue/court không tồn tại (404) dùng `notFound()` của Next.js.

## 6. Schema & validation dùng chung

Thêm vào `apps/web/src/lib/schemas.ts` (cùng phong cách với `updateProfileSchema`):
- `createVenueSchema` / `updateVenueSchema`: `name`, `address`, `city` bắt buộc khi tạo (tối thiểu 1 ký tự), tuỳ chọn khi sửa; `description` tuỳ chọn.
- `addVenueImageSchema`: `url` (bắt buộc, phải là URL hợp lệ).
- `createCourtSchema` / `updateCourtSchema`: `name` (bắt buộc khi tạo), `pricePerHour` (số, coerce từ input text, tối thiểu 0.01), `openTime`/`closeTime` (chuỗi khớp pattern `HH:mm`), `slotDurationMinutes` (số nguyên, coerce, 15–240), `isActive` (boolean, chỉ có ở schema update).

Các giới hạn validate phía client khớp chính xác với giới hạn backend đã định nghĩa (spec backend mục 6) để input sai không bao giờ tới được API.

## 7. Testing

Codebase hiện tại không có test cho page component (không có `*.test.tsx`), chỉ test logic thuần ở `lib/*.test.ts` (`fetch-api-core.test.ts`, `route-protection.test.ts`, `schemas.test.ts`). Giữ nguyên quy ước này:
- Thêm test case vào `schemas.test.ts` cho các schema mới, tập trung vào biên giá trị (VD: `slotDurationMinutes` ngoài khoảng 15–240, `openTime` sai định dạng, `pricePerHour` <= 0).
- Không viết test file mới cho các trang — khớp với cách `/me` và `/admin/owners` đã triển khai trước đó.

## 8. Ngoài phạm vi

- Landing page (`/`) không thay đổi — không thêm link "Tìm sân" (quyết định rõ ràng, không phải thiếu sót).
- Không có hành động đặt sân (booking) trên lưới slot — chỉ hiển thị thông tin, chờ module Bookings.
- Không có luồng gửi lại venue bị `rejected` để duyệt lại — khớp với backend.
- Không có modal/dialog — mọi form đều inline trên trang, vì UI kit hiện tại chưa có component Dialog.
- Không thêm component UI kit mới (Table, Select, Switch, Textarea...) trừ khi cần thiết tối thiểu; ưu tiên tái dùng `Card`/`Button`/`Input`/`Label`/`Alert` đã có.
