# Trang "Danh sách sân" (owner) — Thiết kế chi tiết

**Ngày:** 2026-08-30
**Trạng thái:** Đã duyệt
**Thuộc kiến trúc tổng thể:** [2026-08-23-pickleball-platform-architecture-design.md](./2026-08-23-pickleball-platform-architecture-design.md)
**Sửa đổi:** [2026-08-24-courts-module-design.md](./2026-08-24-courts-module-design.md) (data model + API `courts`), [2026-08-24-courts-frontend-design.md](./2026-08-24-courts-frontend-design.md) (thay màn hình quản lý sân phía owner, bỏ ràng buộc "không dùng Dialog" cho riêng form sân), [2026-08-26-branches-design.md](./2026-08-26-branches-design.md) (di chuyển màn hình quản lý venue sang `/owner/branches` đúng theo route đã định nghĩa ở đó)
**Nguồn khảo sát UI:** `docs/spec/02-quan-ly-san-danh-sach-san.md`

## 1. Mục tiêu & phạm vi

Thay trang `/owner` hiện tại (danh sách **chi nhánh/venue**, tên "Sân của tôi") bằng trang **"Danh sách sân"** đúng như nhãn đã có sẵn trên sidebar: hiển thị **sân (court)** của chi nhánh đang chọn, với thẻ số liệu tổng hợp, tìm kiếm, chuyển đổi hiển thị lưới/bảng, và form thêm/sửa/xóa sân đầy đủ trường hơn bản hiện tại. Quản lý thông tin venue (tạo/sửa chi nhánh) chuyển sang `/owner/branches`.

**Các quyết định đã chốt khi brainstorm (khác với bản khảo sát gốc):**
- Nền tảng chỉ phục vụ pickleball (theo kiến trúc tổng thể) → **bỏ** tab lọc/field "loại môn thể thao" mô tả trong bản khảo sát.
- Trạng thái sân chuyển từ `isActive` (boolean) sang enum 3 giá trị, có ảnh hưởng tới API công khai.
- Ảnh sân xây upload file thật (không chỉ dán URL như venue), lưu đĩa cục bộ trên API server — chấp nhận rủi ro mất ảnh nếu sau này deploy nhiều instance/serverless không có volume dùng chung; sẽ xử lý khi có quyết định hạ tầng deploy.
- "Tất cả chi nhánh" gộp sân của mọi venue, thêm cột/nhãn "Chi nhánh" để phân biệt.
- Nút "Xóa" sân dùng lại đúng pattern đã duyệt cho xóa venue (`branches-design.md`): chặn nếu sân đã từng có booking.

## 2. Data model

**Sửa bảng `courts`:**
- Bỏ `is_active` (boolean) → thêm `status`: enum `active` \| `maintenance` \| `closed`, default `active`. Migration backfill: `is_active = true → active`, `false → closed`, sau đó drop cột `is_active`.
- Thêm `description`: text, nullable.
- Thêm `capacity`: int, nullable (không có default ở DB; form gợi ý giá trị 10 khi tạo mới).
- Thêm `display_order`: int, default 0 — quyết định thứ tự hiển thị trong danh sách của 1 venue (sắp xếp tăng dần, `id` làm tie-breaker).

**Bảng mới `court_images`:**

| Trường | Mô tả |
|---|---|
| id | PK, uuid |
| court_id | FK → courts, `ON DELETE CASCADE` |
| url | text, đường dẫn tương đối, vd `/uploads/courts/<courtId>/<uuid>.<ext>` |
| created_at | timestamp |

Sắp xếp hiển thị theo `created_at` tăng dần (thứ tự upload).

**Ảnh hưởng tới API công khai:** `GET /venues/:id` (danh sách court active của venue) và `GET /courts/:id/slots` — điều kiện lọc đổi từ `court.is_active = true` sang `court.status = 'active'`. Sân `maintenance` hoặc `closed` đều không hiển thị công khai (giữ đúng tinh thần quyết định cũ, chỉ đổi kiểu dữ liệu).

## 3. API endpoints

**Ảnh sân** (multipart/form-data, field `file`; JPG/PNG/WEBP; tối đa 5MB — validate bằng multer `fileFilter` + `limits.fileSize`; lưu vào `UPLOADS_DIR/courts/<courtId>/<uuid>.<ext>` trên đĩa server API, `UPLOADS_DIR` cấu hình qua env, mặc định `./uploads`; serve qua `app.useStaticAssets()` ở prefix `/uploads`):

```
POST   /venues/mine/:venueId/courts/:courtId/images        thêm ảnh (upload file, trả về bản ghi court_images)
DELETE /venues/mine/:venueId/courts/:courtId/images/:imageId   xóa ảnh (xóa file trên đĩa + row DB)
```

**Danh sách sân gộp nhiều chi nhánh** (phục vụ chế độ "Tất cả chi nhánh"):

```
GET /venues/mine/courts     tất cả sân thuộc mọi venue của owner hiện tại; mỗi item kèm venueId + venueName
```

Endpoint hiện có `GET /venues/mine/:venueId/courts` giữ nguyên, dùng khi đã chọn 1 chi nhánh cụ thể.

**CRUD sân — mở rộng field, thêm xóa:**

```
POST   /venues/mine/:venueId/courts         thêm field: description?, capacity?, displayOrder?
PATCH  /venues/mine/:venueId/courts/:id     thêm field: description?, capacity?, displayOrder?, status? (thay isActive)
DELETE /venues/mine/:venueId/courts/:id     mới
```

**Quyết định xóa sân:** áp dụng đúng pattern đã duyệt cho xóa venue ở `branches-design.md` §5. Sân **chưa từng có booking nào** (kể cả đã hủy/hoàn thành) → xóa cứng thật (cascade `court_images`). Sân **đã từng có booking** → chặn `409`, thông báo gợi ý dùng trạng thái "Tạm đóng" (`status = closed`) thay thế. Lý do: `bookings`/`booking_slots` đã có FK `court_id` (module Bookings đã tồn tại), xóa cứng sẽ làm mất lịch sử tài chính — nới lỏng có kiểm soát quyết định "không xóa cứng court/venue" đã ghi ở `courts-module-design.md` §7, chỉ cho phép khi sân chưa từng được đặt.

## 4. Frontend — routing & state

**State chi nhánh đang chọn, dùng chung trong `/owner`:** thêm `BranchProvider` (React Context, đọc/ghi `localStorage` key riêng, giá trị `venueId | "all"`, mặc định `"all"`), bọc trong `apps/web/src/app/owner/layout.tsx`. `BranchSwitcher` (`apps/web/src/components/branch-switcher.tsx`) ghi lựa chọn vào context này thay vì `useState` cục bộ hiện tại.

Chỉ trang `/owner` (Danh sách sân) đọc context này ở phạm vi spec này. Các trang khác (dashboard, bookings, customers, revenue, page-views...) **chưa** đổi để lọc theo chi nhánh đang chọn — đó là phạm vi của các spec riêng sau này, không phải thiếu sót của spec này.

**Di chuyển route quản lý chi nhánh** (không mất nội dung, chỉ đổi vị trí):
- Nội dung `/owner` hiện tại (danh sách venue dạng card + nút "Thêm sân mới" tạo venue mới, file `apps/web/src/app/owner/page.tsx`) → chuyển nguyên logic sang `/owner/branches` (đang là `ComingSoon` placeholder, thay bằng nội dung này).
- `/owner/venues/new` → `/owner/branches/new`.
- `/owner/venues/[id]` → `/owner/branches/[id]`; **bỏ `<CourtsSection>`** khỏi trang này — trang chỉ còn sửa thông tin venue + ảnh venue (`venue_images`), không còn quản lý court lồng bên trong.
- Xóa file `apps/web/src/app/owner/venues/[id]/courts-section.tsx` (thay thế hoàn toàn bởi trang `/owner` mới).

## 5. Frontend — trang `/owner` (Danh sách sân)

- **4 thẻ số liệu** (Tổng sân / Hoạt động / Bảo trì / Tạm đóng): tính client-side từ danh sách sân đã fetch, không cần endpoint riêng.
- **Tìm kiếm:** ô input lọc theo tên/mô tả, thuần client-side (số sân của 1 owner nhỏ, MVP không cần query server).
- **Chuyển đổi lưới/bảng:** state cục bộ của trang, lưu lựa chọn vào `localStorage` để giữ khi quay lại trang.
- **Nguồn dữ liệu:** đã chọn 1 chi nhánh cụ thể → `GET /api/venues/mine/[venueId]/courts`; chọn "Tất cả chi nhánh" → `GET /api/venues/mine/courts` (route handler mới, proxy 1-1 sang `GET /venues/mine/courts`), bảng/lưới hiển thị thêm cột/nhãn "Chi nhánh" lấy từ `venueName`.
- **Bảng:** cột Sân, Sức chứa, Trạng thái (badge 3 màu: xanh=Hoạt động, vàng=Bảo trì, xám=Tạm đóng), Thao tác (icon mắt → `/owner/pricing?courtId=<id>`, Sửa, Xóa). *(Không có cột "Loại" — đã bỏ đa môn thể thao.)*
- **Lưới (thẻ):** icon môn thể thao cố định (pickleball, không đổi theo dữ liệu), tên sân, badge trạng thái, sức chứa, mô tả rút gọn (line-clamp), 3 nút thao tác như bảng.
- **Icon mắt → `/owner/pricing?courtId=<id>`:** trang `/owner/pricing` hiện là `ComingSoon` placeholder, chưa đọc query param này. Thêm link ngay bây giờ là vô hại; việc lọc theo `courtId` thuộc phạm vi implementation của trang Pricing (spec `2026-08-26-pricing-and-recurring-schedules-design.md`), không phải spec này.
- **Thêm/sửa sân — dùng `Dialog`** (component đã có sẵn trong UI kit, dùng bởi `BranchSwitcher`; bỏ ràng buộc "không dùng Dialog" ở `courts-frontend-design.md` §8 cho riêng form sân — ràng buộc đó dựa trên tiền đề "UI kit chưa có Dialog", nay không còn đúng). Trường trong form: Chi nhánh\* (select tất cả venue của owner, mặc định = chi nhánh đang chọn nếu không phải "Tất cả chi nhánh", bắt buộc chọn thủ công nếu đang ở "Tất cả"), Tên\*, Sức chứa (số, gợi ý mặc định 10 khi tạo mới), Thứ tự (số), Trạng thái (dropdown 3 giá trị — **chỉ hiện ở form Sửa**; sân mới luôn tạo với `status = active`), Mô tả (textarea), cộng các trường giá/giờ đã có (`pricePerHour`, `openTime`, `closeTime`, `slotDurationMinutes`, giữ nguyên validate cũ).
- **Ảnh sân:** chỉ hiển thị/thao tác được ở form **Sửa** (endpoint upload cần `courtId` đã tồn tại — form Thêm không có mục ảnh, đây là khác biệt có chủ đích so với bản khảo sát gốc). Input file (`multiple`), preview thumbnail ảnh đã có, nút xóa từng ảnh gọi `DELETE .../images/:imageId` ngay lập tức (không cần nút "Lưu" riêng cho phần ảnh).
- **Xóa sân:** `Dialog` xác nhận trước khi gọi `DELETE`; nếu API trả `409` → hiển thị toast "Sân đã có lịch sử đặt sân, hãy chuyển sang trạng thái Tạm đóng thay vì xóa."

## 6. Schema & validation (client)

Mở rộng trong `apps/web/src/lib/schemas.ts`:
- `createCourtSchema`: thêm `description?` (string, tối đa hợp lý vd 1000 ký tự), `capacity?` (số nguyên dương, coerce từ input text), `displayOrder?` (số nguyên, coerce, mặc định 0 nếu để trống).
- `updateCourtSchema`: thêm cùng 3 trường trên, cộng `status` (enum `active`\|`maintenance`\|`closed`, thay cho `isActive` boolean).

Giới hạn khớp chính xác với backend (mục 2). Thêm test case biên vào `schemas.test.ts`: `capacity` âm/0, `displayOrder` không phải số nguyên, `status` giá trị ngoài enum.

Không viết test file mới cho page component — giữ đúng quy ước hiện tại của codebase (không có `*.test.tsx`), chỉ test logic thuần ở `lib/*.test.ts`.

## 7. Ngoài phạm vi

- Đa môn thể thao (tab lọc/field "loại môn thể thao" trong bản khảo sát gốc) — nền tảng chỉ phục vụ pickleball, quyết định có chủ đích.
- Các trang khác (dashboard, bookings, customers, revenue, page-views) đọc theo chi nhánh đang chọn từ `BranchProvider` — để dành cho spec riêng.
- Trang `/owner/pricing` đọc và lọc theo `courtId` từ query string — thuộc phạm vi implementation của Pricing module.
- Giới hạn số lượng ảnh tối đa trên 1 sân — không giới hạn trong MVP, chỉ giới hạn định dạng/kích thước từng file.
- Sắp xếp lại ảnh (kéo-thả đổi thứ tự) — chỉ hiển thị theo thứ tự upload.
- Di chuyển ảnh sang object storage (S3-compatible) — hiện dùng đĩa cục bộ; sẽ xử lý khi có quyết định hạ tầng deploy.
- Các tính năng đầy đủ của `branches-design.md` (slug, is_default, is_hidden, giới hạn đổi slug...) cho trang `/owner/branches` — spec này chỉ di chuyển nội dung venue-list/create hiện có sang route mới, không triển khai các field/luồng mới của `branches-design.md` (đó là phạm vi implementation riêng của spec đó).
