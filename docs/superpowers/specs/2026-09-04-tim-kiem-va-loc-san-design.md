# Tìm kiếm và lọc sân (`/venues`) — Thiết kế chi tiết

**Ngày:** 2026-09-04
**Trạng thái:** Đã duyệt
**Thuộc kiến trúc tổng thể:** [2026-08-23-pickleball-platform-architecture-design.md](./2026-08-23-pickleball-platform-architecture-design.md)
**Nguồn tham khảo:** [docs/01-website-khach-hang/02-tim-kiem-va-loc-san.md](../../01-website-khach-hang/02-tim-kiem-va-loc-san.md) (khảo sát UI sanbong.vn thực tế)
**Liên quan:** [2026-09-04-trang-chu-design.md](./2026-09-04-trang-chu-design.md) — trang chủ gọi chung `GET /venues`, spec này đổi response shape của endpoint đó nên có ảnh hưởng ngược lại trang chủ (xem mục 5).

## 1. Mục tiêu

Nâng cấp trang tìm sân hiện có (`apps/web/src/app/venues/page.tsx`, `GET /venues`) với: lọc theo thành phố, sắp xếp kết quả, và phân trang thật (server-side) — thay cho việc chỉ có 1 ô tìm theo từ khoá và trả về toàn bộ kết quả không phân trang như hiện tại.

## 2. Khác biệt so với tài liệu khảo sát gốc

Tài liệu `02-tim-kiem-va-loc-san.md` mô tả sanbong.vn — marketplace đa môn thể thao. Nền tảng hiện tại chỉ phục vụ pickleball đơn môn (đã xác nhận nhiều lần ở các spec trước, ví dụ `trang-chu-design.md` mục 2), nên:

- **Bỏ hẳn dropdown + dải pill lọc theo loại sân** (mục 2 tài liệu gốc) — không có khái niệm `sportType` trong schema.
- **Bỏ UI phân trang dạng số trang** (`1, 2, 3 ... 23`, mục 4 tài liệu gốc) — thay bằng nút "Trước"/"Sau" + tổng số kết quả, đúng pattern phân trang đã dùng ở `owner/customers` (`customer-table.tsx`) và `owner/revenue` để nhất quán trong toàn app, không tự tạo kiểu UI mới.
- **Bỏ nút "Đặt sân" ở mỗi kết quả** (mục 4 tài liệu gốc) — trang chi tiết venue (`/venues/[id]`) hiện đã có sẵn phần chọn sân + khung giờ ngay trên trang, không có luồng đặt nhanh riêng biệt; thêm nút thứ 2 sẽ trùng chức năng với "Chi tiết". Chỉ giữ 1 hành động: bấm card → `/venues/[id]`.
- **Không có nút "Tìm ngay" riêng** — bộ lọc thành phố/sắp xếp áp dụng ngay khi chọn, cùng cơ chế debounce 300ms đang dùng cho ô từ khoá (xem mục 4.2).
- **Thêm 1 sort không có trong tài liệu gốc**: `"Mới nhất"` (mặc định) — giữ hành vi hiện tại của `searchPublic` (`ORDER BY created_at DESC`) làm trạng thái ban đầu, 3 sort còn lại (`Tên A-Z`, `Nhiều sân nhất`, `Theo tỉnh thành`) đúng như tài liệu gốc.
- **Giữ nguyên bộ lọc theo ngày/giờ trống** (`date`/`time` query param) — tính năng đã có sẵn ở `searchPublic`, không thuộc tài liệu khảo sát 02 nhưng vẫn phải hoạt động đúng sau khi thêm phân trang/sắp xếp.

## 3. Backend

### 3.1 `GET /venues/cities` (route mới)

`apps/api/src/courts/venues.controller.ts` — thêm `@Get('cities')`, đặt **trước** `@Get(':id')` (và trước `@Get('by-slug/:slug')` cũng được, thứ tự giữa 2 route tĩnh không quan trọng, chỉ cần cả hai đứng trước `:id` để Nest không nuốt nhầm route).

`venuesService.listActiveCities(): Promise<{ city: string; count: number }[]>` — 1 query group-by:

```sql
SELECT city, COUNT(*) AS count FROM venues
WHERE status = 'active' AND is_hidden = false
GROUP BY city ORDER BY city ASC
```

Dùng TypeORM `createQueryBuilder`. Kết quả luôn phản ánh **toàn bộ** venue active/không ẩn, không phụ thuộc bộ lọc `query`/`city`/`date`/`time` đang áp dụng ở `GET /venues` — đây là nguồn dữ liệu cho dropdown thành phố (đếm đúng, không lệch khi user đang lọc dở).

### 3.2 `GET /venues` — mở rộng `searchPublic`

`apps/api/src/courts/venues.controller.ts`, method `search()` — thêm 4 query param mới, giữ nguyên `query`/`date`/`time`:

```ts
search(
  @Query('query') query?: string,
  @Query('date') date?: string,
  @Query('time') time?: string,
  @Query('city') city?: string,
  @Query('sort') sort?: string,
  @Query('page') page?: string,
  @Query('pageSize') pageSize?: string,
)
```

`venues.service.ts`, `searchPublic`:

- **Validate `sort`**: nếu truyền mà không phải 1 trong `'name' | 'courts' | 'city'` → `BadRequestException` (`"sort phải là 'name', 'courts' hoặc 'city'"`), cùng kiểu validate đang có cho `date`/`time`. Không truyền = dùng sort mặc định (created_at DESC).
- **Clamp `page`/`pageSize`**: copy nguyên pattern `clampPage`/`clampPageSize` của `customers.service.ts` (private, không import — module khác cũng tự copy riêng, xem `2026-09-04-revenue-reports-pagination.md`). `DEFAULT_PAGE_SIZE = 20`, `MAX_PAGE_SIZE = 100`, `page` mặc định `1`.
- **Đổi từ `repository.find()` sang `QueryBuilder`** — bắt buộc vì sort "Nhiều sân nhất" cần `ORDER BY` theo số sân *trước khi* cắt trang bằng SQL; cách cũ (fetch toàn bộ venue rồi query courts riêng, merge ở JS) không thể phân trang đúng theo tiêu chí này.

  Thuật toán:
  1. `baseQb` — filter cố định, chưa join courts: `status = 'active' AND is_hidden = false`, cộng `AND (name ILIKE :q OR address ILIKE :q OR city ILIKE :q)` nếu có `query`, cộng `AND city = :city` nếu có `city` (so khớp chính xác — giá trị đến từ dropdown `/venues/cities`, không phải free-text).
  2. Nếu có `date` + `time` (validate format như hiện tại): lấy danh sách venue id thoả `baseQb` (chỉ `select venue.id`, không phân trang) → lấy courts của các venue đó → tái dùng nguyên hàm `findVenueIdsWithAvailability` hiện có (không đổi) → được tập `availableVenueIds`. Nếu rỗng, trả `{ items: [], total: 0, page, pageSize }` ngay. Nếu không, cộng `AND venue.id IN (:...availableVenueIds)` vào `baseQb`.
  3. `total = await baseQb.clone().getCount()`.
  4. `itemsQb = baseQb.clone().leftJoin('courts', 'court', 'court.venue_id = venue.id AND court.status = :courtStatus', { courtStatus: 'active' }).addSelect('COUNT(DISTINCT court.id)', 'courtsCount').groupBy('venue.id')`, cộng `ORDER BY` theo `sort` (`name` → `venue.name ASC`; `courts` → `"courtsCount" DESC, venue.name ASC`; `city` → `venue.city ASC, venue.name ASC`; mặc định → `venue.created_at DESC`), rồi `.skip((page-1)*pageSize).take(pageSize)`.
  5. `const { entities, raw } = await itemsQb.getRawAndEntities()`, ghép `courtsCount` từ `raw[i].courtsCount` (ép `Number`) vào từng entity theo đúng index → `VenueWithCourtsCount[]`.
  6. Trả `{ items, total, page, pageSize }`.

- **Response contract đổi** từ `VenueWithCourtsCount[]` (mảng trần) sang:
  ```ts
  { items: VenueWithCourtsCount[]; total: number; page: number; pageSize: number }
  ```
  Đây là **breaking change** cho mọi caller hiện tại của `GET /venues` — chỉ có 2 caller: trang `/venues` (sửa trong spec này) và trang chủ `/` (xem mục 5).

### 3.3 Route proxy Next.js

`apps/web/src/app/api/venues/route.ts` — hiện chỉ forward whitelist `['query', 'date', 'time']`. Thêm `'city'`, `'sort'`, `'page'`, `'pageSize'` vào mảng đó.

`apps/web/src/app/api/venues/cities/route.ts` (file mới) — `GET` forward transparent sang `${API_BASE_URL}/venues/cities`, không có query param, cấu trúc giống hệt handler `GET` hiện có trong `route.ts` (chỉ bỏ phần build query string).

## 4. Frontend — `apps/web/src/app/venues/page.tsx`

Không có component `Select` (shadcn) trong codebase — mọi dropdown dùng thẻ `<select>` native, class `"h-9 rounded-lg border px-2.5 text-sm"` (ví dụ `owner/bookings/page.tsx`). Theo đúng convention này.

### 4.1 State và kiểu dữ liệu

```ts
interface PublicVenue {
  id: string;
  name: string;
  address: string;
  city: string;
  district: string | null;
  courtsCount: number;
}
interface CityOption { city: string; count: number }
```

State thêm mới: `city` (mặc định `""` = tất cả), `sort: "" | "name" | "courts" | "city"` (mặc định `""` = Mới nhất), `page` (mặc định `1`), `total` (mặc định `0`), `cities: CityOption[] | null`.

### 4.2 Fetch

- **Cities** — 1 lần khi mount: `fetch("/api/venues/cities")` → `setCities`. Không phụ thuộc filter nào khác.
- **Venues** — gộp `query`/`city`/`sort`/`page`/`date`/`time` vào chung 1 `useEffect` debounce 300ms (giữ nguyên cơ chế debounce đang có, áp dụng luôn cho `city`/`sort`/`page` thay vì tách effect riêng — độ trễ 300ms không cảm nhận được khi chọn dropdown, và tránh 2 effect chạy song song gây race condition). Query string gửi kèm `pageSize=20` cố định.
- Response giờ là `{ items, total, page, pageSize }` — `setVenues(data.items)`, `setTotal(data.total)`.
- **Reset trang**: `useEffect(() => setPage(1), [query, city, sort])` — đổi bộ lọc thì luôn quay về trang 1, tránh hiển thị trang trống khi tổng số kết quả giảm.

### 4.3 UI thêm mới

- **Dropdown thành phố** cạnh ô tìm kiếm: option đầu `"Tất cả thành phố"` (value `""`), sau đó mỗi `cities` render `"{city} ({count})"`.
- **Dropdown sắp xếp**: 4 option — `""` "Mới nhất" (mặc định), `"name"` "Tên A-Z", `"courts"` "Nhiều sân nhất", `"city"` "Theo tỉnh thành".
- **Card kết quả** — đổi dòng phụ đề từ `{address}, {city}` thành `{district ? \`${district}, \` : ""}{city}` (bỏ `address`, khớp đúng tài liệu gốc: card chỉ hiển thị "khu vực/quận-huyện", không hiển thị địa chỉ đầy đủ), thêm dòng `"{courtsCount} sân"`. Không thêm nút "Đặt sân" (xem mục 2).
- **Pager** — copy nguyên mẫu `customer-table.tsx`: dòng `"{total} cơ sở"` bên trái, nút "Trước" (`disabled` khi `page <= 1`)/"Sau" (`disabled` khi `page * 20 >= total`) bên phải, cả khối chỉ hiện khi `total > 20`.
- Trạng thái loading/rỗng giữ nguyên logic đang có.

## 5. Ảnh hưởng tới trang chủ (`apps/web/src/app/page.tsx`)

Trang chủ hiện gọi `fetch("/api/venues")` không kèm param, kỳ vọng mảng trần và cần dữ liệu **toàn bộ** venue active (`computeHomeSummary` tính `venueCount`, `courtCount`, `cities` bằng cách reduce trên chính mảng nhận được — đúng vì trước đây `GET /venues` trả về tất cả, không phân trang).

Sau khi `GET /venues` đổi shape + mặc định phân trang `pageSize=20`, nếu không sửa gì trang chủ sẽ vỡ (đọc nhầm `data` thay vì `data.items`) và ngầm bị giới hạn 20 venue. Sửa:

- Gọi `fetch("/api/venues?pageSize=100")` thay vì không kèm param — đủ dùng ở quy mô hiện tại (`MAX_PAGE_SIZE=100`, không thể xin nhiều hơn).
- Gọi thêm `fetch("/api/venues/cities")` song song (`Promise.all`).
- `apps/web/src/lib/home-summary.ts` — đổi chữ ký `computeHomeSummary(venues: PublicVenueSummary[], venueCount: number, cities: CityCount[]): HomeSummary`. Bỏ hẳn logic tự đếm `city` từ `venues` (không còn chính xác khi venue bị cắt ở trang 100), dùng thẳng `cities` truyền vào (map `{name: c.city, count: c.count}` từ response `/venues/cities`, đã `ORDER BY city ASC` sẵn từ backend nên không cần sort lại). `venueCount` lấy từ tham số truyền vào (= `data.total` của `/venues`, luôn đúng tuyệt đối, không phụ thuộc `pageSize`). `courtCount` và `featured` giữ nguyên cách tính cũ (reduce/slice trên `venues` đã fetch) — `featured` luôn đúng vì chỉ lấy 6 phần tử đầu, `courtCount` **gần đúng**: chỉ đúng nếu tổng venue active ≤ 100, đủ tốt ở quy mô hiện tại (ghi rõ giới hạn này, xem mục 7).
- `page.tsx`: thêm state cho danh sách city fetch được, gọi `computeHomeSummary(venues ?? [], total, cities ?? [])` với `total`/`cities` là state mới lấy từ 2 response trên.

## 6. Testing

- **Backend (`venues.service.spec.ts` / e2e `venues.controller`):**
  - `listActiveCities` group đúng theo `city`, chỉ đếm venue `status=active, isHidden=false`, sort tên thành phố A-Z.
  - `searchPublic` mỗi `sort` trả đúng thứ tự (`name`, `courts`, `city`, và mặc định `created_at DESC` như cũ); `city` filter so khớp chính xác (không lẫn venue thành phố khác); `sort` không hợp lệ → 400.
  - Phân trang: `total` đúng tổng số venue thoả filter (không bị ảnh hưởng bởi `page`/`pageSize`); `page`/`pageSize` cắt đúng, không lặp/thiếu phần tử giữa 2 trang liên tiếp; `page`/`pageSize` ngoài khoảng hợp lệ được clamp đúng (giống test case đã có ở revenue-reports pagination).
  - Kết hợp `city`/`sort`/phân trang với `date`/`time` (lọc sân trống) vẫn cho kết quả đúng — venue không có sân trống bị loại trước khi tính `total`.
- **Frontend (manual/browser):**
  - Mở `/venues`, đổi thành phố → danh sách cập nhật đúng, đổi bộ lọc → quay về trang 1.
  - Đổi sort "Nhiều sân nhất" → thứ tự card giảm dần theo số sân hiển thị.
  - Bấm "Sau"/"Trước" → đúng trang, nút disabled đúng ở 2 biên.
  - Mở `/`, xác nhận `venueCount`/`courtCount`/chip thành phố vẫn đúng với dữ liệu thật sau khi đổi sang gọi `pageSize=100` + `/venues/cities`.

## 7. Ngoài phạm vi

- Icon/pill lọc theo loại sân, dropdown loại sân — không có khái niệm này trên nền tảng đơn môn (xem mục 2).
- Nút "Đặt sân" riêng ở mỗi kết quả (xem mục 2).
- UI phân trang dạng số trang — dùng "Trước"/"Sau" theo convention sẵn có.
- Đồng bộ `city`/`sort`/`page` lên URL (query string) — chỉ `query` ban đầu được seed từ URL như hiện tại, các filter mới là state client thuần, không cần thiết ở quy mô hiện tại (YAGNI).
- `courtCount` ở trang chủ chính xác tuyệt đối khi vượt quá 100 venue active — chấp nhận xấp xỉ (tính trên tối đa 100 venue mới nhất) cho tới khi có endpoint aggregate riêng, nếu cần thì làm ở spec khác.
- Bộ lọc theo bản đồ, đánh giá/review — đã ngoài phạm vi MVP từ kiến trúc tổng thể.
