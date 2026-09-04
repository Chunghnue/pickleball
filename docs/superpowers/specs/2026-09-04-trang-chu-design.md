# Trang chủ (khách hàng) — Thiết kế chi tiết

**Ngày:** 2026-09-04
**Trạng thái:** Đã duyệt
**Thuộc kiến trúc tổng thể:** [2026-08-23-pickleball-platform-architecture-design.md](./2026-08-23-pickleball-platform-architecture-design.md)
**Nguồn tham khảo:** [docs/01-website-khach-hang/01-trang-chu.md](../../01-website-khach-hang/01-trang-chu.md) (khảo sát UI sanbong.vn thực tế), [docs/01-website-khach-hang/10-footer-va-thanh-phan-chung.md](../../01-website-khach-hang/10-footer-va-thanh-phan-chung.md) (header/footer dùng chung)

## 1. Mục tiêu

Thay trang chủ placeholder hiện tại (`apps/web/src/app/page.tsx`) bằng trang chủ marketplace thật: giúp khách hàng tìm và đặt sân nhanh, đồng thời giới thiệu tính năng quản lý dành cho chủ sân.

## 2. Khác biệt so với tài liệu khảo sát gốc

Tài liệu `01-trang-chu.md` mô tả sanbong.vn — marketplace đa môn thể thao, quy mô toàn quốc. Nền tảng hiện tại chỉ phục vụ pickleball đơn môn, là dự án MVP cá nhân (xem kiến trúc tổng thể mục 1-2), nên:

- **Bỏ hẳn khái niệm loại sân/môn thể thao** — schema `courts`/`venues` không có `sportType` (đã xác nhận ở `dashboard-design.md` mục 2). Bỏ dropdown môn thể thao ở Hero search và toàn bộ khối "Danh mục loại sân" (mục 2 tài liệu gốc).
- **Bỏ bản đồ** (mục 5 tài liệu gốc) và **bỏ đánh giá khách hàng/testimonials** (mục 8) — kiến trúc tổng thể đã liệt kê "tìm kiếm nâng cao theo bản đồ" và "đánh giá/review sân" là ngoài phạm vi MVP; hiện chưa có bảng review nào trong schema.
- **Bỏ 34 trang landing SEO theo tỉnh** (mục 6) — thay bằng chip lọc nhanh theo thành phố, chỉ hiện thành phố thực sự có venue (dữ liệu thật còn rất ít, không đủ để làm trang SEO riêng từng tỉnh).
- **Viết lại khối giới thiệu phần mềm quản lý** (mục 7) — mô tả đúng tính năng thật đã có ở `/owner` (quản lý lịch đặt sân, báo cáo doanh thu, quản lý khách hàng), bỏ các tính năng chưa tồn tại (đa môn, thông báo Zalo/Telegram, app điện thoại riêng).
- **Không lọc theo ngày/giờ ở Hero search** — chỉ giữ ô tìm theo tên/địa điểm, điều hướng sang `/venues?query=...`; việc chọn ngày/giờ và xem khung giờ trống vẫn ở trang chi tiết venue như hiện tại. Lọc venue theo khung giờ trống toàn hệ thống là việc lớn, để dành cho spec riêng nếu cần.
- **Header/Footer công khai** (mục 10 tài liệu gốc, file `10-footer-va-thanh-phan-chung.md`) hiện chưa tồn tại ở bất kỳ trang public nào (`/`, `/venues`, `/venues/[id]` đều là trang trần). Spec này thêm `PublicHeader`/`PublicFooter` tối giản nhưng **chỉ gắn vào route `/`** — áp dụng cho các trang public khác là việc tương lai, ngoài phạm vi.
- **Không dùng thông tin liên hệ/social của sanbong.vn** (hotline, Facebook/TikTok/YouTube, form đăng ký nhận khuyến mãi) — đây là doanh nghiệp khác. Footer chỉ hiển thị email liên hệ thật của dự án.

## 3. Backend — mở rộng `GET /venues`

`apps/api/src/courts/venues.service.ts`, hàm `searchPublic(query?: string): Promise<Venue[]>`:

- Thêm `order: { createdAt: 'DESC' }` vào cả 2 nhánh `find()` hiện có (không có query / có query).
- Sau khi lấy `venues`, query thêm số sân đang hoạt động của từng venue: `courtsRepository.find({ where: { venueId: In(venueIds), status: CourtStatus.ACTIVE } })`, gộp thành `Map<venueId, count>` — mirror đúng pattern đã dùng ở `findMineWithMetrics` (cùng file, mục "courtsCountByVenue"). Venue không có court active nào → `courtCount: 0`.
- Trả về kiểu mới `VenueWithCourtCount` (= `Venue` + `courtCount: number`). Không đổi signature `searchPublic(query?)`, không thêm endpoint mới, không thêm query param mới ở `venues.controller.ts` (`GET /venues` giữ nguyên `@Query('query')`).

`apps/web/src/app/api/venues/route.ts` (Next.js proxy) — không đổi, đã forward transparent JSON nên `courtCount` tự động có mặt ở response.

## 4. Frontend

### 4.1 `apps/web/src/components/public-header.tsx` (mới, client component)

- Logo/tên nền tảng → link `/`.
- Link "Tìm sân" → `/venues`.
- `fetch("/api/users/me")` khi mount (cùng cách `AppHeader` đang làm) để biết trạng thái đăng nhập:
  - Chưa đăng nhập: nút "Đăng nhập" (`/login`) và "Đăng ký" (`/register`).
  - Đã đăng nhập: dropdown avatar hiển thị tên, link "Lịch sử đặt sân" (`/me/bookings`), "Đăng xuất" (`POST /api/auth/logout` rồi reload — cùng cách `AppHeader.handleLogout`).
- Nút "Đăng ký chủ sân" → `/register/owner`, luôn hiển thị bất kể trạng thái đăng nhập.

### 4.2 `apps/web/src/components/public-footer.tsx` (mới, static)

- Cột "Khám phá": link "Tìm sân" → `/venues`.
- Liên hệ: email `chungdv84@gmail.com`. Không hotline, không social links, không form đăng ký nhận khuyến mãi.

### 4.3 `apps/web/src/app/page.tsx` (viết lại hoàn toàn, client component)

`fetch("/api/venues")` một lần khi mount, lưu `venues: VenueWithCourtCount[] | null`. Từ dữ liệu này tính (không gọi API nào khác):

| Giá trị | Cách tính |
|---|---|
| `venueCount` | `venues.length` |
| `courtCount` | tổng `courtCount` của mọi venue |
| `featured` | `venues.slice(0, 6)` (đã sắp `createdAt DESC` từ backend, nên đây là 6 venue mới nhất) |
| `cities` | `[...new Set(venues.map(v => v.city))]`, chỉ thành phố có venue thật |

Bố cục trang, theo thứ tự:

1. `PublicHeader`
2. **Hero search** — input tên/địa điểm, nút "Tìm ngay" (`router.push('/venues?query=' + encodeURIComponent(input))`); hiển thị `venueCount` cơ sở / `courtCount` sân.
3. **Cơ sở nổi bật** — grid Card (tái dùng style `Card`/`CardHeader`/`CardTitle` như `venues/page.tsx`), mỗi card thêm dòng "N sân" từ `courtCount`; trạng thái rỗng khi `venues !== null && venues.length === 0`. Trạng thái loading khi `venues === null`.
4. **Quy trình 3 bước** — JSX tĩnh, không gọi API: (1) Tìm sân gần bạn, (2) Chọn ngày & giờ, (3) Xác nhận & đến sân.
5. **Chip thành phố** — mỗi `city` trong `cities` là 1 chip, bấm → `router.push('/venues?query=' + encodeURIComponent(city))`; ẩn cả khối nếu `cities.length === 0`.
6. **Khối giới thiệu quản lý** — tĩnh: liệt kê tính năng thật đã có ở `/owner` (quản lý lịch đặt sân realtime, báo cáo doanh thu, quản lý khách hàng). CTA "Đăng ký chủ sân" → `/register/owner`.
7. `PublicFooter`

## 5. Ngoài phạm vi

- Danh mục/lọc theo loại sân, bản đồ, testimonials, 34 trang SEO tỉnh (xem mục 2 — lý do).
- Lọc venue theo ngày/giờ trống ngay ở trang chủ.
- Hotline, social links thật (chưa có).
- Áp `PublicHeader`/`PublicFooter` cho `/venues`, `/venues/[id]`, `/me` và các trang public khác — spec riêng khi có nhu cầu.
- Cache/giới hạn số lượng venue fetch ở trang chủ — chấp nhận fetch toàn bộ venue active mỗi lần tải trang (quy mô nhỏ, nhất quán với cách Dashboard không cache).

## 6. Testing

- **Backend (unit/e2e `venues.service.spec.ts` / `venues.controller` e2e):** `searchPublic` trả đúng `courtCount` (chỉ đếm court `status = ACTIVE`, venue không có court active nào → `courtCount: 0`); kết quả sắp `createdAt DESC`; hành vi lọc theo `query` (name/address/city ILIKE) giữ nguyên như cũ.
- **Frontend (manual/browser):** mở `/`, xác nhận số liệu tổng quan đúng với dữ liệu thật; card "Cơ sở nổi bật" đúng thứ tự mới nhất, đúng số sân; nhập tên/địa điểm rồi bấm "Tìm ngay" → điều hướng đúng `/venues?query=`; bấm chip thành phố → điều hướng đúng; `PublicHeader` đổi đúng giữa trạng thái chưa đăng nhập/đã đăng nhập, đăng xuất hoạt động; trang rỗng dữ liệu (chưa có venue nào) hiển thị đúng trạng thái rỗng, không lỗi.
