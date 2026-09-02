# Module: Branches (Chi nhánh) — mở rộng Courts/Venues — Thiết kế chi tiết

**Ngày:** 2026-08-26
**Trạng thái:** Chờ review
**Thuộc kiến trúc tổng thể:** [2026-08-23-pickleball-platform-architecture-design.md](./2026-08-23-pickleball-platform-architecture-design.md)
**Nguồn tham khảo:** [docs/spec/08-chi-nhanh.md](../../spec/08-chi-nhanh.md) (khảo sát UI sanbong.vn thực tế)
**Sửa đổi:** [2026-08-24-courts-module-design.md](./2026-08-24-courts-module-design.md) (mở rộng `venues`, endpoint mới). Tái dùng: [2026-08-25-dashboard-design.md](./2026-08-25-dashboard-design.md) (định nghĩa booking/doanh thu), [2026-08-26-page-view-analytics-design.md](./2026-08-26-page-view-analytics-design.md) (lượt xem), [2026-08-26-settings-design.md](./2026-08-26-settings-design.md) (`logo_url`).

## 1. Mục tiêu

**"Chi nhánh" trong tài liệu khảo sát chính là `venue` đã có** — owner đã có thể sở hữu nhiều venue từ [2026-08-24-courts-module-design.md](./2026-08-24-courts-module-design.md) §2. Module này **không** tạo bảng/service mới, mà mở rộng `venues` (thêm slug công khai, chi nhánh mặc định, ẩn/hiện độc lập với trạng thái duyệt) và thêm 1 trang quản lý danh sách chi nhánh dạng lưới/danh sách với số liệu nhanh mỗi chi nhánh.

**Quyết định có chủ đích:** không tạo module "Branches" tách biệt — vì `venues` đã tồn tại và có chủ sở hữu logic rõ ràng ở Courts module; tách ra sẽ tạo tình trạng 2 module cùng ghi vào 1 bảng.

## 2. Sửa `venues`

| Trường | Mô tả |
|---|---|
| slug | unique, text — URL công khai dạng `/venues/by-slug/:slug`. Tự sinh từ `name` (slugify, bỏ dấu tiếng Việt) nếu owner để trống; trùng slug đã tồn tại → thêm hậu tố số ngẫu nhiên 4 chữ số cho tới khi unique. |
| is_default | BOOLEAN, default false — đúng 1 venue có giá trị `true` trên mỗi owner (xem §4). |
| is_hidden | BOOLEAN, default false — owner tự ẩn/hiện chi nhánh trên trang public, **độc lập** với `status` (`pending_approval`/`active`/`rejected` — quyết định duyệt của admin). Venue `is_hidden = true` không hiện ở `GET /venues` (tìm kiếm public) và `GET /venues/by-slug/:slug`/`GET /venues/:id` trả 404, kể cả khi `status = active`. |
| district | nullable text — tách khỏi `city` hiện có (doc gốc muốn Tỉnh/Thành phố **và** Quận/Huyện riêng). |
| latitude, longitude | nullable NUMERIC — toạ độ, chỉ lưu giá trị do frontend gửi lên (component bản đồ chọn tọa độ là việc của spec frontend, backend không xử lý bản đồ). |
| email | nullable text — email liên hệ chi nhánh, cột mới (bảng `venues` hiện chỉ có `phone`, thêm từ [venue-default-phone-and-branch-dialog-design.md](./2026-08-29-venue-default-phone-and-branch-dialog-design.md), chưa có `email`). |

`logo_url` **không** thêm ở đây — đã có sẵn từ [Settings §2](./2026-08-26-settings-design.md) (dán URL, không upload file). Bỏ yêu cầu "tải ảnh logo tối đa 5MB" của doc gốc để giữ nhất quán với quyết định đó.

**venue_slug_history** (bảng mới, chỉ để tính giới hạn đổi slug)

| Trường | Mô tả |
|---|---|
| id | UUID |
| venue_id | → venues |
| old_slug | text |
| changed_at | timestamp |

## 3. API endpoints (owner-facing, mở rộng endpoint đã có ở Courts)

```
POST   /venues                                      (đã có ở Courts module) — CreateVenueDto mở rộng nhận thêm slug?, district?, latitude?, longitude?, email? (cùng bộ trường mở rộng của PATCH bên dưới, trừ isHidden — venue mới tạo luôn is_hidden=false, không nhận qua create)
GET    /venues/mine?status=&search=&sort=          danh sách chi nhánh của owner (status: active|hidden|all — ánh xạ is_hidden, không phải venue.status duyệt). Mỗi phần tử trả kèm courtsCount, bookingsThisMonth, revenueThisMonth (xem §7) để frontend tính thẻ số liệu mà không cần gọi thêm API
PATCH  /venues/mine/:id                             mở rộng nhận thêm slug?, district?, latitude?, longitude?, email?, isHidden?
POST   /venues/mine/:id/set-default                 đặt venue này làm mặc định (bỏ is_default ở venue khác cùng owner trong cùng transaction)
DELETE /venues/mine/:id                             xem §5 (có điều kiện)
```

**Public:**
```
GET /venues/by-slug/:slug     tương đương GET /venues/:id đã có, tra theo slug thay vì UUID; venue.is_hidden=true hoặc status != active → 404
```

`sort` (tham số hiển thị, không phải nghiệp vụ mới): `default` (venue mặc định lên đầu, theo đúng "Mặc định trước" của doc) hoặc `name`/`newest`. Chuyển đổi hiển thị lưới/danh sách là việc thuần frontend, không có tham số backend riêng.

## 4. Chi nhánh mặc định (`is_default`)

Owner mới tạo venue đầu tiên → tự động `is_default = true` (không cần gọi `set-default`). `POST /venues/mine/:id/set-default`: trong 1 transaction, set `is_default = false` cho mọi venue khác của owner, rồi `true` cho venue được chọn. Xoá venue đang là mặc định → venue còn lại **cũ nhất** (theo `created_at`) tự động trở thành mặc định (nếu còn venue nào); không còn venue nào → không có mặc định (bình thường, owner mới đăng ký).

`is_default` hiện tại **chỉ mang tính hiển thị** (nhãn "MẶC ĐỊNH" trên UI) — không có logic nghiệp vụ nào phụ thuộc vào nó (không có "venue mặc định" ảnh hưởng tới Dashboard/Reports, các module đó vẫn tổng hợp trên **mọi** venue owner sở hữu như đã chốt).

## 5. Xoá chi nhánh

```
DELETE /venues/mine/:id
```

Chặn (409) nếu venue có **bất kỳ booking nào từng tồn tại** (kể cả đã huỷ/hoàn thành — lịch sử tài chính không được xoá theo cascade). Thông báo lỗi gợi ý dùng "Ẩn" (`isHidden=true`) thay thế. Venue chưa từng có booking nào → xoá thật (cascade `courts`, `venue_images`, `pricing_rules`, `venue_operating_hours` — không có bảng nào trong số này mang dữ liệu lịch sử tài chính).

## 6. Giới hạn đổi slug

Khi `PATCH .../:id` có `slug` khác giá trị hiện tại:

1. Đếm số dòng `venue_slug_history` của venue này có `changed_at >= now() - 180 ngày`. `>= 3` → 400 "Đã đạt giới hạn đổi đường dẫn (3 lần/180 ngày)".
2. Lần đổi gần nhất (`MAX(changed_at)` hoặc `venues.updated_at` nếu chưa từng đổi) cách hiện tại `< 60 ngày` → 400 "Cần đợi đủ 60 ngày kể từ lần đổi trước".
3. Hợp lệ → insert `venue_slug_history` (lưu `old_slug`), rồi update `venues.slug`.

Không áp dụng giới hạn này cho lần **tự sinh slug đầu tiên** khi tạo venue (không tính là "đổi").

## 7. Thẻ số liệu

- **Chi nhánh** = tổng số venue của owner (không phân biệt ẩn/hiện).
- **Tổng sân** = tổng `courts` trên mọi venue của owner.
- **Booking tháng này** = số `bookings` có `created_at` trong tháng hiện tại, thuộc mọi venue owner sở hữu (cùng định nghĩa "phát sinh trong kỳ" như Dashboard, chỉ đổi cửa sổ thời gian từ "hôm nay" thành "tháng này").
- **Doanh thu tháng** = tổng `payments.amount` (`status='paid'`, `paidAt` trong tháng hiện tại) — cùng định nghĩa Revenue Report.
- **Mỗi thẻ chi nhánh riêng** thêm: Sân/Booking tháng/DT tháng (lọc theo đúng venue đó) + **Lượt xem 7D** = `totalViews` 7 ngày gần nhất của venue đó, tái dùng [Page View Analytics](./2026-08-26-page-view-analytics-design.md) `GET /analytics/page-views/summary?venueId=&from=&to=`.
- Sân/Booking tháng/DT tháng của từng venue được trả trực tiếp trong response `GET /venues/mine` dưới tên `courtsCount`/`bookingsThisMonth`/`revenueThisMonth` (xem §3) — "Lượt xem 7D" vẫn phải gọi riêng vì thuộc service Page View Analytics khác.

## 8. Validation

- `slug`: chỉ chữ thường/số/dấu gạch ngang, unique toàn hệ thống (public URL) → 409 nếu trùng venue khác.
- `latitude` ∈ [-90, 90], `longitude` ∈ [-180, 180] nếu có.
- Owner chỉ thao tác venue của chính mình (403/404, tái dùng `getOwnedVenueOrThrow`).
- `DELETE`: xem điều kiện ở §5.

## 9. Testing

- **Unit:** sinh slug tự động khi để trống (kèm xử lý trùng); tính cửa sổ trượt 180 ngày + cooldown 60 ngày cho đổi slug.
- **Integration:** xoá venue đang là mặc định → venue cũ nhất còn lại tự thành mặc định; xoá venue có booking lịch sử → 409.
- **E2E:** tạo venue mới → tự động `is_default=true`; đổi slug → `GET /venues/by-slug/:slug-mới` trả đúng venue, slug cũ trả 404; ẩn venue (`isHidden=true`) → `GET /venues/:id` public trả 404 dù `status=active`; đổi slug lần thứ 4 trong 180 ngày → 400.

## 10. Ngoài phạm vi

- Upload file logo/ảnh (chỉ dán URL, theo quyết định đã chốt ở Settings/Courts).
- Component bản đồ chọn toạ độ, nút "Vị trí của tôi" — thuần frontend, backend chỉ lưu lat/lng nhận được.
- Tiền tố `/<môn-thể-thao>/` trong URL công khai (không áp dụng, nền tảng đơn môn — nhất quán với quyết định ở Dashboard).
- Khôi phục venue đã xoá (hard delete là vĩnh viễn với venue chưa có booking).
- Frontend — xem [2026-09-02-branches-frontend-design.md](./2026-09-02-branches-frontend-design.md).
