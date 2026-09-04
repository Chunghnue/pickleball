# Bản đồ tìm sân (`/ban-do`) — Thiết kế chi tiết

**Ngày:** 2026-09-04
**Trạng thái:** Đã duyệt
**Thuộc kiến trúc tổng thể:** [2026-08-23-pickleball-platform-architecture-design.md](./2026-08-23-pickleball-platform-architecture-design.md)
**Nguồn tham khảo:** [docs/01-website-khach-hang/03-ban-do.md](../../01-website-khach-hang/03-ban-do.md) (khảo sát UI sanbong.vn thực tế)
**Liên quan:** [2026-09-04-tim-kiem-va-loc-san-design.md](./2026-09-04-tim-kiem-va-loc-san-design.md) — tái dùng `GET /venues/cities` và cùng pattern lọc/nút "Chi tiết" của trang `/venues`.

## Ghi chú phạm vi

Kiến trúc tổng thể (`pickleball-platform-architecture-design.md` mục 2) liệt kê "tìm kiếm nâng cao theo bản đồ" là **ngoài phạm vi MVP, để sau**. Spec này đưa tính năng vào phạm vi hiện tại vì hạ tầng liên quan đã có sẵn: cột `latitude`/`longitude` trên `venues`, `leaflet` + `react-leaflet` đã cài, component map (OpenStreetMap) đã dùng ở `owner/branches`, và route `/ban-do` đã tồn tại (hiện là stub "Coming Soon", đã được liên kết từ header/footer/trang chủ).

## 1. Mục tiêu

Thay route `/ban-do` hiện đang là stub "Coming Soon" bằng bản đồ tương tác thật, cho phép khách hàng tìm cơ sở pickleball theo vị trí địa lý — song song với trang `/venues` đã có (tìm bằng danh sách/lọc/phân trang).

## 2. Khác biệt so với tài liệu khảo sát gốc

Tài liệu `03-ban-do.md` mô tả sanbong.vn — marketplace đa môn thể thao (441 cơ sở tại thời điểm khảo sát). Nền tảng hiện tại chỉ phục vụ pickleball đơn môn, nên:

- **Bỏ icon/lọc theo môn thể thao** trên ghim và danh sách (mục 1, 2 tài liệu gốc) — không có khái niệm `sportType` trong schema.
- **"Về tổng quan" đổi nghĩa**: tài liệu gốc là "reset về góc nhìn **toàn quốc**"; spec này đổi thành "reset về khung nhìn **bao trọn tất cả kết quả hiện có**" (`fitBounds` theo các ghim đang hiển thị). Quy mô dữ liệu thực tế (vài chục cơ sở, có thể tập trung 1–2 tỉnh/thành) khiến khung nhìn toàn quốc cố định để lại phần lớn màn hình trống, không hữu ích bằng luôn thấy hết kết quả.
- **Bỏ nút "Đặt sân" ở mỗi mục danh sách** (mục 3 tài liệu gốc), chỉ giữ "Chi tiết" — cùng lý do đã áp dụng ở `tim-kiem-va-loc-san-design.md` mục 2: trang `/venues/[id]` đã có sẵn luồng chọn sân/khung giờ inline, thêm nút thứ 2 trùng chức năng.
- **Thêm dropdown lọc theo thành phố** (không có trong tài liệu gốc mục 2, tài liệu gốc chỉ có ô tìm từ khoá) — tái dùng `GET /venues/cities` đã có sẵn, đồng bộ trải nghiệm với `/venues`.
- **Venue chưa nhập toạ độ** (`latitude`/`longitude` NULL — trường hợp thực tế khi chủ sân chưa chọn vị trí lúc tạo chi nhánh ở `owner/branches`) vẫn xuất hiện ở panel danh sách nhưng không có ghim trên bản đồ.
- **Danh sách không đồng bộ theo vùng đang xem (bounds) trên bản đồ** — khác tài liệu gốc mục 3 ("đồng bộ với vùng đang xem"). Vì venue thiếu toạ độ không thể xác định có nằm trong khung nhìn hay không, danh sách luôn hiển thị toàn bộ venue khớp bộ lọc `query`/`city`, không phụ thuộc pan/zoom bản đồ.

## 3. Backend

### 3.1 `GET /venues/map` (route mới, public)

`apps/api/src/courts/venues.controller.ts` — thêm `@Get('map')`, đặt trước `@Get(':id')` (cùng nhóm route tĩnh với `cities` và `by-slug/:slug`, thứ tự giữa các route tĩnh không quan trọng, chỉ cần đứng trước `:id`).

```ts
map(
  @Query('query') query?: string,
  @Query('city') city?: string,
)
```

`venues.service.ts`:

- **Tách filter dùng chung**: thêm private method `buildActiveVenueBaseQuery(query?, city?)` chứa đúng logic filter hiện có trong `searchPublic` (`status = 'active' AND is_hidden = false`, cộng `(name ILIKE :q OR address ILIKE :q OR city ILIKE :q)` nếu có `query`, cộng `city = :city` exact match nếu có `city`). `searchPublic` và `listForMap` cùng gọi method này thay vì lặp code.
- Method mới `listForMap(query?, city?): Promise<VenueMapItem[]>`:
  1. `baseQb = buildActiveVenueBaseQuery(query, city)`.
  2. `leftJoin('courts', 'court', 'court.venue_id = venue.id AND court.status = :courtStatus', { courtStatus: 'active' }).addSelect('COUNT(DISTINCT court.id)', 'courtsCount').groupBy('venue.id')` — giống cách `searchPublic` tính `courtsCount`.
  3. **Không phân trang** — không có `skip`/`take`, không trả `total`/`page`.
  4. **Không lọc theo `latitude`/`longitude` ở SQL** — trả cả venue thiếu toạ độ để dùng cho panel danh sách; frontend tự lọc tập có toạ độ khi vẽ ghim.
  5. `getRawAndEntities()`, ghép `courtsCount` (ép `Number`) + `latitude`/`longitude` vào từng phần tử.
- **Không hỗ trợ `date`/`time`** (lọc sân trống) — không có trong tài liệu khảo sát gốc mục bản đồ, xem mục 6 (Ngoài phạm vi).
- Response — **mảng trần**, cố tình khác shape `{items, total, page, pageSize}` của `GET /venues` vì đây không phải endpoint phân trang, tránh gây hiểu nhầm là có `total`/`page` dùng được:
  ```ts
  interface VenueMapItem {
    id: string;
    name: string;
    address: string;
    city: string;
    district: string | null;
    courtsCount: number;
    latitude: number | null;
    longitude: number | null;
  }
  // response: VenueMapItem[]
  ```

### 3.2 Route proxy Next.js

`apps/web/src/app/api/venues/map/route.ts` (file mới) — forward `query`, `city` sang `${API_BASE_URL}/venues/map`, cấu trúc giống `apps/web/src/app/api/venues/cities/route.ts` đã có, chỉ thêm build query string cho 2 param.

### 3.3 Env / hạ tầng

`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` — biến môi trường mới cho frontend (Google Maps JavaScript API; cần bật billing trên Google Cloud project và enable "Maps JavaScript API"). Không có biến này thì layer Google Maps/Vệ tinh disable, chỉ còn OpenStreetMap khả dụng — graceful fallback, không crash trang.

## 4. Frontend

### 4.1 Package mới

- `react-leaflet-cluster` — wrapper cluster tương thích `react-leaflet@5` + React 19 (peer deps khớp stack hiện tại), kéo theo `leaflet.markercluster`. Import CSS thủ công (`leaflet.markercluster/dist/MarkerCluster.css`, `MarkerCluster.Default.css`) — bản phát hành mới của package không tự import CSS nữa để tránh vấn đề build Next.js.
- `leaflet.gridlayer.googlemutant` — plugin JS thuần, **không** có binding React chính thức tương thích `react-leaflet@5`. Tự viết component nhỏ bọc nó bằng `useMap()` + `useEffect`, đúng idiom đang dùng cho `ClickHandler`/`RecenterOnChange` trong `apps/web/src/app/owner/branches/branch-location-map.tsx` — không kéo thêm React wrapper bên thứ 3 chưa kiểm chứng tương thích.

### 4.2 Cấu trúc file (`apps/web/src/app/ban-do/`)

- `page.tsx` — `"use client"` (thay nội dung `ComingSoon` hiện tại). Giữ state `query`, `city`, `venues: VenueMapItem[] | null`, `cities: CityOption[] | null`, `listOpen` (mặc định `true`). Fetch debounce 300ms `/api/venues/map?query=&city=` khi `query`/`city` đổi (copy cơ chế debounce từ `apps/web/src/app/venues/page.tsx`); fetch `/api/venues/cities` 1 lần khi mount. Layout: `PublicHeader` + thanh tìm kiếm & dropdown thành phố + khu vực bản đồ (chiếm phần lớn) + panel danh sách bên cạnh (nút "Ẩn" thu gọn/hiện) + `PublicFooter`.
- `venue-map.tsx` — component bản đồ, nạp bằng `dynamic(() => import("./venue-map"), { ssr: false })`, giống hệt cách `BranchLocationMap` được nạp ở `branch-form-dialog.tsx`.
- `google-mutant-layer.tsx` — component dùng `useMap()`, thêm/gỡ `L.gridLayer.googleMutant('roadmap' | 'satellite', {...})` khi prop `type`/`active` đổi. Chỉ được render nếu `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` tồn tại.

### 4.3 `venue-map.tsx`

- `MapContainer` + `TileLayer` OpenStreetMap (luôn có, URL giống `branch-location-map.tsx`) + `GoogleMutantLayer` (roadmap/vệ tinh, có điều kiện theo API key).
- Bộ chuyển lớp nền: 3 nút dạng segmented control góc trên bản đồ. Thiếu API key → chỉ hiện 1 lựa chọn OpenStreetMap, ẩn hẳn 2 nút Google (không hiển thị nút disabled).
- `MarkerClusterGroup` (từ `react-leaflet-cluster`) bọc `Marker` cho từng venue **có** `latitude`/`longitude`. Icon teardrop CSS giống `branch-location-map.tsx` nhưng đổi màu xanh lá (khớp accent `hover:text-green-400` đang dùng ở header/footer) để phân biệt với pin xanh dương phía owner.
- Click marker → `Popup`: tên, `{district}, {city}`, `"{courtsCount} sân"`, link "Chi tiết" → `/venues/{id}`.
- Nút "Vị trí của tôi": `navigator.geolocation.getCurrentPosition` → center map + marker chấm xanh dương riêng (không nằm trong cluster). Lỗi/từ chối quyền → `toast.error(...)` (dùng `sonner`, đã có trong deps).
- Nút "Về tổng quan": `map.fitBounds()` theo toạ độ toàn bộ venue đang có pin. Không có venue nào có toạ độ → fallback hằng số `DEFAULT_CENTER` (Hà Nội `[21.0278, 105.8342]`, cùng giá trị đang dùng ở `branch-location-map.tsx`) zoom rộng. Tự chạy 1 lần khi `venues` load xong lần đầu — không cần bấm nút mới thấy hết kết quả.
- `ZoomControl position="topright"` hiển thị mặc định (không ẩn như bên owner-picker).

### 4.4 Panel danh sách

Mỗi dòng: tên, `{district}, {city}`, `"{courtsCount} sân"`, nút "Chi tiết" (link, không có "Đặt sân" — xem mục 2). Dòng thống kê `"Bản đồ hiển thị {n} cơ sở thể thao"` với `n = venues.filter(v => v.latitude != null && v.longitude != null).length`.

## 5. Testing

**Backend (`venues.service.spec.ts`):**
- `listForMap` trả đúng venue `status=active, isHidden=false` khớp `query`/`city`; trả cả venue thiếu `latitude`/`longitude` (không lọc ở SQL); `courtsCount` đúng.
- `buildActiveVenueBaseQuery` dùng chung không làm thay đổi hành vi `searchPublic` hiện có (regression test).

**Frontend (manual/browser — Leaflet không có unit test hữu ích cho render bản đồ):**
- Mở `/ban-do`: ghim chỉ xuất hiện với venue có toạ độ; panel danh sách hiển thị tất cả (kể cả venue thiếu toạ độ).
- Đổi `query`/thành phố → cả ghim và danh sách cập nhật đồng thời.
- Click ghim → popup đúng thông tin, link "Chi tiết" điều hướng đúng `/venues/{id}`.
- Zoom out ở khu vực nhiều venue gần nhau → thấy cluster kèm số đếm; click/zoom vào → tách ra từng ghim.
- Bấm "Vị trí của tôi" → map center về vị trí thật (hoặc toast lỗi khi từ chối quyền).
- Bấm "Về tổng quan" → fit về đúng bounds của toàn bộ ghim hiện tại.
- Có `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`: chuyển được cả 3 lớp nền. Không có key: chỉ thấy OpenStreetMap, không lỗi console.
- Bấm "Ẩn" → panel danh sách thu gọn/hiện lại đúng.

## 6. Ngoài phạm vi

- Lọc theo ngày/giờ sân trống trên bản đồ — không có trong tài liệu khảo sát gốc mục bản đồ (khác `/venues`).
- Đồng bộ danh sách theo viewport/bounds bản đồ — đã quyết định danh sách luôn hiển thị toàn bộ, không phụ thuộc vùng đang xem (xem mục 2).
- Lọc theo môn thể thao — nền tảng đơn môn.
- Cho khách hàng chỉnh toạ độ trên bản đồ — tính năng chỉnh toạ độ chỉ dành cho owner ở `owner/branches`, không lặp lại phía khách hàng.
- Đánh giá/review sân — ngoài phạm vi MVP tổng thể (`pickleball-platform-architecture-design.md`).
- Tối ưu style icon cluster theo brand — dùng style mặc định của `leaflet.markercluster`, chỉnh màu sau nếu cần.
