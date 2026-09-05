# Bookings Frontend — Thiết kế chi tiết

**Ngày:** 2026-08-24
**Trạng thái:** Đã duyệt
**Thuộc kiến trúc tổng thể:** [2026-08-23-pickleball-platform-architecture-design.md](./2026-08-23-pickleball-platform-architecture-design.md)
**Xây trên API đã có:** [2026-08-24-bookings-module-design.md](./2026-08-24-bookings-module-design.md)

## 1. Mục tiêu

Xây giao diện Next.js (`apps/web`) cho toàn bộ luồng người dùng của module Bookings đã hoàn thành ở backend: khách hàng chọn slot và đặt sân trên trang venue công khai, khách hàng xem/huỷ booking của mình, chủ sân xem/huỷ booking thuộc venue của mình. Cùng mô hình BFF đã dùng cho Auth+Users và Courts.

Phạm vi: mở rộng trang public `/venues/[id]` đã có (lưới slot không tương tác → có thể chọn + đặt), trang mới `/me/bookings` (khách hàng), section mới trong `/owner/venues/[id]` (chủ sân). Kèm hai thay đổi backend nhỏ bắt buộc (mục 3b, 4) để enrich response cho đủ dữ liệu hiển thị.

## 2. Kiến trúc: BFF qua Next.js Route Handlers

Giữ nguyên kiến trúc đã có (xem [2026-08-24-auth-users-frontend-design.md](./2026-08-24-auth-users-frontend-design.md) mục 2, [2026-08-24-courts-frontend-design.md](./2026-08-24-courts-frontend-design.md) mục 2): trình duyệt không bao giờ gọi thẳng NestJS. Mọi trang là client component (`"use client"`), fetch qua route handler cùng-origin dưới `/api/*`.

### Route handlers mới (proxy 1-1 sang backend)

```
Phía customer (JWT, role customer)
  POST   /api/bookings                                    -> POST /bookings
  GET    /api/bookings/mine                                -> GET /bookings/mine
  GET    /api/bookings/mine/[id]                            -> GET /bookings/mine/:id
  POST   /api/bookings/[id]/cancel                          -> POST /bookings/:id/cancel

Phía owner (JWT, role owner)
  GET    /api/venues/mine/[venueId]/bookings                -> GET /venues/mine/:venueId/bookings
  POST   /api/venues/mine/[venueId]/bookings/[id]/cancel     -> POST /venues/mine/:venueId/bookings/:id/cancel

Phía public (không cần đăng nhập)
  GET    /api/bookings/availability                         -> GET /bookings/availability
```

Mỗi route handler chỉ forward path/method/body/query string sang `fetchApi()` (customer/owner, đính kèm cookie + tự refresh) hoặc `fetch(`${API_BASE_URL}/...`)` trực tiếp (public), rồi trả nguyên response qua `toNextResponse()` — đúng khuôn mẫu đã dùng cho Courts. Owner-scoped route handlers gọi `clearAuthCookies()` khi upstream trả 401, khớp pattern owner-scoped hiện có (`/api/venues/mine/*`).

Bảo vệ route tiếp tục qua `apps/web/src/proxy.ts` đã có: `/me/*` đã yêu cầu role `customer`, `/owner/*` đã yêu cầu role `owner` — không cần sửa `PROTECTED_PREFIXES`/matcher. `/venues/[id]` giữ nguyên là public.

## 3. Luồng đặt sân trên `/venues/[id]`

> **Đã đảo ngược:** luồng chọn slot + xác nhận mô tả dưới đây đã chuyển sang route riêng `/dat-san?venueId=...`, xem [2026-09-05-dat-san-online-design.md](./2026-09-05-dat-san-online-design.md). `/venues/[id]` chỉ còn hiển thị lịch trống dạng xem, không thao tác đặt sân trực tiếp nữa. Giữ nguyên nội dung gốc bên dưới để tham khảo lịch sử thiết kế.

`CourtSlots` (component con hiện có trong trang venue detail) đổi nguồn dữ liệu từ `GET /api/courts/[id]/slots` sang **`GET /api/bookings/availability?courtId=&date=`** — mỗi slot giờ có thêm trường `isBooked`. Route handler `/api/courts/[id]/slots` cũ giữ nguyên, không sửa/xoá — chỉ đổi nguồn fetch ở component này.

**Trạng thái chọn:** `selectedStart: string | null`, `durationSlots: number`.

- Click 1 chip còn trống (`isBooked === false`) → `selectedStart` = giờ bắt đầu chip đó, `durationSlots` reset về 1. Click lại đúng chip đang chọn → bỏ chọn.
- Chip có `isBooked === true` → hiển thị mờ, không click được.
- Khi có `selectedStart`: tính số slot liên tiếp còn trống tối đa kể từ vị trí đó (duyệt mảng slots từ index đã chọn tới khi gặp slot đã đặt hoặc hết mảng) → giới hạn options của dropdown "Số giờ chơi" (`<select>` gốc HTML, options `1..max`). Giờ kết thúc hiển thị lấy trực tiếp từ trường `end` của slot cuối trong dải đã chọn — không cần biết `slotDurationMinutes` ở frontend.
- Khi cả `selectedStart` và `durationSlots` đã có: hiện ngay khối tóm tắt inline bên dưới lưới ("`08:00–10:00 · 200.000đ`") + nút **"Xác nhận đặt sân"**.
- Bấm xác nhận → `POST /api/bookings` với `{ courtId, date, startTime: selectedStart, endTime }`.
  - **201** → toast thành công, refetch availability, reset lựa chọn.
  - **409** (slot vừa bị đặt) → toast lỗi đúng message backend, refetch availability, reset lựa chọn.
  - **401** (chưa đăng nhập) → redirect `/login?returnTo=%2Fvenues%2F<id>`. Lựa chọn slot **không** được giữ qua vòng round-trip đăng nhập — khách quay lại trang phải chọn lại (đơn giản hoá có chủ đích, không xây hạ tầng lưu state qua redirect).
  - Lỗi khác (403 nếu tài khoản không phải customer, 400...) → toast hiển thị message từ backend.

## 4. Trang `/me/bookings` (khách hàng)

Trang mới dưới prefix `/me` (đã được `proxy.ts` bảo vệ sẵn, role `customer`). Thêm 1 link nhỏ từ `/me` sang `/me/bookings`.

- Tải qua `GET /api/bookings/mine`. `401` → redirect `/login?returnTo=%2Fme%2Fbookings`.
- Mỗi booking hiển thị dạng `Card`: tên sân + tên venue, ngày, khung giờ, tổng giá, badge trạng thái (`Đã xác nhận` / `Đã huỷ` / `Hoàn thành`, map từ `confirmed`/`cancelled`/`completed`).
- Nút **"Huỷ"** chỉ hiện khi `status === 'confirmed'`. Xác nhận 2 bước: bấm "Huỷ" → đổi thành "Xác nhận huỷ?" kèm nút "Thôi" → bấm lần 2 mới gọi `POST /api/bookings/[id]/cancel`.
  - Thành công → toast + cập nhật trạng thái booking đó thành `cancelled` tại chỗ.
  - Lỗi (403 do trong cutoff, 400 đã huỷ/hoàn thành) → toast hiển thị message backend.
- Danh sách rỗng → "Bạn chưa có booking nào."
- Không sắp xếp lại ở frontend — API đã trả về mới nhất trước.

### 4b. Backend enrichment bắt buộc

`BookingsService.findMineByCustomer` và `.findMineById` trả thêm `courtName`, `venueId`, `venueName` cho mỗi booking, bằng cách join `CourtsService.findByIdOrThrow` + `VenuesService.findByIdOrThrow` (đã inject sẵn trong `BookingsService`). N+1 query chấp nhận được ở quy mô MVP cá nhân, không cần tối ưu batch. Chỉ áp dụng cho 2 endpoint phía customer.

## 5. Section booking trong `/owner/venues/[id]`

Component mới `bookings-section.tsx` (cùng thư mục với `venue-info-section.tsx`, `courts-section.tsx`), nhận `venueId` và `courts` (đã có sẵn từ component cha) để map `courtId → tên sân` cục bộ — không cần enrich `courtName` ở phía owner.

- Tải qua `GET /api/venues/mine/[venueId]/bookings?date=`.
- Bộ lọc ngày: `<input type="date">`, mặc định rỗng (hiển thị toàn bộ booking). Khi chọn ngày → refetch với `?date=`. Link nhỏ "Xem tất cả" để xoá lọc khi đang lọc.
- Mỗi booking hiển thị: tên sân (map từ `courts` prop), tên khách (`customerName`), số điện thoại (`customerPhone`, "Chưa có" nếu `null`), ngày, khung giờ, tổng giá, badge trạng thái.
- Nút **"Huỷ"** hiện khi `status === 'confirmed'`, cùng pattern xác nhận 2 bước → `POST /api/venues/mine/[venueId]/bookings/[id]/cancel` (không giới hạn cutoff cho owner).
- Danh sách rỗng → "Chưa có booking nào."

### 5b. Backend enrichment bắt buộc

`BookingsService.findByVenueForOwner` trả thêm `customerName`, `customerPhone` bằng cách join `UsersService` theo `customerId`, cùng cơ chế với mục 4b.

## 6. Schema/validation & testing

- **Không cần thêm zod schema mới.** Luồng đặt sân hoàn toàn dẫn dắt bằng lựa chọn (click chip + dropdown số giờ), không có input text nào cần validate phía client.
- Tách phần "tính số slot liên tiếp còn trống tối đa kể từ vị trí đã chọn" thành hàm thuần `apps/web/src/lib/slot-selection.ts` (nhận mảng slots + index đã chọn, trả về số slot liên tiếp tối đa), kèm `slot-selection.test.ts` — khớp quy ước hiện tại (chỉ test logic thuần ở `lib/*.test.ts`).
- Badge trạng thái (map `confirmed`/`cancelled`/`completed` sang tiếng Việt) là object literal nhỏ, lặp lại ở 2 nơi (`/me/bookings` và `bookings-section.tsx`) — không đáng tách thành module dùng chung.
- Không viết test file cho trang hay route handler mới — khớp quy ước đã áp dụng cho Auth+Users và Courts frontend.

## 7. Ngoài phạm vi

- Landing page (`/`) không đổi.
- Owner không có calendar/lịch dạng lưới thời gian — chỉ danh sách.
- Không có thông báo email khi đặt/huỷ sân (module Notifications, brainstorm riêng sau).
- Không có giao diện thanh toán (module Payments, brainstorm riêng sau).
- Không giữ lựa chọn slot qua vòng redirect đăng nhập — khách phải chọn lại sau khi login.
- Không có tính năng "đặt lại nhanh" từ lịch sử booking.
- Không thêm component UI kit mới ngoài `<select>`/`<input type="date">` gốc HTML khi cần — không có Dialog/Select/Table kiểu shadcn.
