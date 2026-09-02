# Module: Branches Frontend (Chi nhánh) — Thiết kế chi tiết

**Ngày:** 2026-09-02
**Trạng thái:** Chờ review
**Thuộc kiến trúc tổng thể:** [2026-08-23-pickleball-platform-architecture-design.md](./2026-08-23-pickleball-platform-architecture-design.md)
**Backend liên quan:** [2026-08-26-branches-design.md](./2026-08-26-branches-design.md) (spec đã viết, **chưa hiện thực** — xem §1 điều kiện tiên quyết và gap cần vá ở §2)
**Nguồn tham khảo UI:** [docs/spec/08-chi-nhanh.md](../../spec/08-chi-nhanh.md)

## 1. Mục tiêu & phạm vi

Thay thế 3 trang sơ khai hiện tại (`/owner/branches`, `/owner/branches/new`, `/owner/branches/[id]` — list đơn giản, form 4 trường, không thẻ số liệu/bộ lọc/dạng lưới) bằng **một trang duy nhất** `/owner/branches` hiện thực đầy đủ `08-chi-nhanh.md`: 4 thẻ số liệu tổng hợp, tab lọc Hoạt động/Đã ẩn/Tất cả, tìm kiếm, sắp xếp, chuyển đổi lưới/danh sách, thẻ chi nhánh với 4 thao tác, và form thêm/sửa đầy đủ trường (gồm bản đồ chọn toạ độ thật).

**Điều kiện tiên quyết:** spec backend [2026-08-26-branches-design.md](./2026-08-26-branches-design.md) phải được hiện thực trước (slug, district, latitude/longitude, is_hidden, set-default, xoá có điều kiện). Hiện `venues` mới chỉ có `is_default`/`phone` (từ [2026-08-29-venue-default-phone-and-branch-dialog-design.md](./2026-08-29-venue-default-phone-and-branch-dialog-design.md)). Frontend spec này viết đúng theo API mô tả trong backend spec, xem như hợp đồng đã chốt — cần 1 plan backend chạy trước plan frontend của spec này (đúng trình tự đã dùng cho Courts/Bookings/Staff Accounts).

## 2. Khác biệt so với tài liệu khảo sát gốc + gap cần vá ở backend spec

- **Bản đồ chọn toạ độ là bản đồ tương tác thật** (Leaflet + OpenStreetMap tiles — không cần API key, dependency mới: `react-leaflet`, `leaflet`), không phải 2 ô nhập số đơn thuần như phương án tối giản đã cân nhắc.
- **Kiến trúc chuyển từ trang riêng sang dialog**, nhất quán với Courts/Staff Accounts/Customers: bỏ hẳn `/branches/new` và `/branches/[id]`. "Thêm chi nhánh mới" và "Sửa" đều mở cùng 1 dialog form trên trang danh sách `/owner/branches`. "Ảnh" mở dialog ảnh riêng (tái dùng logic từ `venue-images-section.tsx` hiện có).
- **Ẩn/hiện chi nhánh** (`isHidden`) không có nút riêng trên thẻ trong tài liệu gốc (§3 chỉ liệt kê Mặc định/Sửa/Ảnh/Xóa) — vì đây là field mới do backend spec quyết định sau khi tài liệu khảo sát UI được viết. Đặt làm 1 checkbox trong dialog Sửa: "Ẩn chi nhánh này khỏi trang đặt sân công khai".
- **Gap trong backend spec cần bổ sung khi viết plan backend:** [branches-design.md §3](./2026-08-26-branches-design.md) chỉ mô tả `PATCH .../:id` nhận thêm `slug/district/latitude/longitude/isHidden`, không nhắc `POST /venues` (tạo mới) — nhưng form "Thêm chi nhánh mới" theo `08-chi-nhanh.md` §4 cần nhập các trường này ngay lúc tạo. `CreateVenueDto` cần mở rộng tương tự `PATCH`.
- **Response `GET /venues/mine` cần trả kèm số liệu nhanh mỗi venue** (`courtsCount`, `bookingsThisMonth`, `revenueThisMonth`) để tính thẻ tổng hợp + số liệu trên từng thẻ ở client mà không cần gọi API riêng cho từng venue — backend spec §7 mô tả định nghĩa số liệu nhưng không nói rõ field này nằm trong response nào. Plan backend cần chốt: mở rộng response của `GET /venues/mine` để trả kèm 3 field này.
- **`venues` chưa có cột `email`** — `08-chi-nhanh.md` §4 liệt kê "Email" là 1 trường của form, nhưng cả entity `Venue` hiện tại lẫn backend spec §2 đều không nhắc tới cột này (chỉ có `phone`). Plan backend cần thêm cột `email` (nullable text) vào `venues`, nhận qua cả `POST /venues` và `PATCH .../:id`, cùng đợt với gap `CreateVenueDto` ở trên.

## 3. Kiến trúc trang (`apps/web/src/app/owner/branches/`)

Trang client component (`"use client"`), fetch qua route proxy `/api/*` (dùng `fetchApi` → `toNextResponse`, cookie auth gắn phía server) — theo đúng mẫu `apps/web/src/app/api/customers/route.ts`. Trang fetch **toàn bộ danh sách 1 lần** (`GET /api/venues/mine`, không query), lọc/tìm/sắp xếp hoàn toàn ở client — cùng lý do như Staff Accounts ([2026-09-02-staff-accounts-frontend-design.md §4.1](./2026-09-02-staff-accounts-frontend-design.md)): số chi nhánh của 1 chủ luôn nhỏ, tránh round-trip mỗi lần gõ tìm kiếm/đổi tab. Tham số `status/search/sort` mà backend spec định nghĩa ở `GET /venues/mine` vẫn giữ nguyên ở API (không hại gì) nhưng frontend không dùng.

**Next.js đã bị chỉnh sửa** trong repo này: trước khi viết route handler/trang, đọc hướng dẫn liên quan trong `apps/web/node_modules/next/dist/docs/` (theo cảnh báo `apps/web/AGENTS.md`).

### 3.1. `types.ts`

Mở rộng `Venue` trong file dùng chung `apps/web/src/app/owner/types.ts` (đã dùng bởi Dashboard, Bookings, Pricing, trang này — thêm field là thay đổi cộng dồn, không phá các nơi dùng hiện có):

```ts
export interface Venue {
  id: string;
  name: string;
  address: string;
  city: string;
  district: string | null;
  slug: string;
  latitude: number | null;
  longitude: number | null;
  description: string | null;
  phone: string | null;
  email: string | null;
  isDefault: boolean;
  isHidden: boolean;
  status: "pending_approval" | "active" | "rejected";
  courtsCount: number;
  bookingsThisMonth: number;
  revenueThisMonth: number;
  images: VenueImage[];
}
```

### 3.2. `branch-format.ts` (+ `branch-format.test.ts`)

Hàm thuần, có unit test (mẫu `customer-format.ts`/`staff-format.ts`):

```ts
export type BranchTab = "active" | "hidden" | "all";
export type BranchSort = "default" | "name" | "newest";

export function filterBranches(
  items: Venue[],
  opts: { tab: BranchTab; search: string },
): Venue[] {
  let result = items;
  if (opts.tab === "active") result = result.filter((v) => !v.isHidden);
  else if (opts.tab === "hidden") result = result.filter((v) => v.isHidden);
  const search = opts.search.trim().toLowerCase();
  if (search) {
    result = result.filter(
      (v) =>
        v.name.toLowerCase().includes(search) ||
        v.address.toLowerCase().includes(search) ||
        v.city.toLowerCase().includes(search),
    );
  }
  return result;
}

export function sortBranches(items: Venue[], sort: BranchSort): Venue[] {
  const copy = [...items];
  if (sort === "name") return copy.sort((a, b) => a.name.localeCompare(b.name));
  if (sort === "newest") return copy; // API đã trả theo created_at desc (mặc định)
  // "default": venue mặc định lên đầu, còn lại giữ thứ tự API trả
  return copy.sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
}

export function countByTab(items: Venue[]): Record<BranchTab, number> {
  const hidden = items.filter((v) => v.isHidden).length;
  return { active: items.length - hidden, hidden, all: items.length };
}

export function formatMoney(amount: number): string {
  return amount.toLocaleString("vi-VN") + "₫";
}

export function publicUrl(slug: string): string {
  return `sanbong.vn/${slug}`; // hiển thị, không phải link bấm được
}
```

### 3.3. `branch-metrics.tsx`

4 thẻ theo mẫu `customer-metrics.tsx`/`staff-metrics.tsx`, tính bằng cách **cộng dồn** field có sẵn trong `allItems` (không gọi API riêng), nguồn không đổi khi lọc tab/tìm kiếm:

- **Chi nhánh** = `allItems.length` — icon `Building2`
- **Tổng sân** = Σ `courtsCount` — icon `LayoutGrid`
- **Booking tháng này** = Σ `bookingsThisMonth` — icon `CalendarCheck`
- **Doanh thu tháng** = Σ `revenueThisMonth` (`formatMoney`) — icon `Wallet`

### 3.4. `branch-filters.tsx`

- Tab **Hoạt động / Đã ẩn / Tất cả** (kèm số lượng từ `countByTab`, tab đang chọn tô đậm — mẫu `customer-filters.tsx`).
- Ô tìm kiếm (icon kính lúp, debounce 300ms, placeholder "Tìm theo tên, địa chỉ, thành phố...").
- Dropdown sắp xếp: **Mặc định trước** (mặc định) / **Tên** / **Mới nhất** → `BranchSort`.
- Nút chuyển đổi **lưới⇄danh sách** (icon `LayoutGrid`/`List`), trạng thái lưu `localStorage` key `"branches-view-mode"` — theo mẫu khởi tạo từ `localStorage` trong `useEffect` + ghi lại khi đổi của `app-shell.tsx` (sidebar collapse).

### 3.5. `branch-card.tsx` / `branch-row.tsx`

Cùng 1 tập dữ liệu, 2 layout khác nhau (`branch-card.tsx` cho dạng lưới, `branch-row.tsx` cho dạng danh sách — hàng ngang gọn hơn). Cả hai nhận `venue: Venue` + callbacks `onSetDefault(id)` / `onEdit(venue)` / `onManageImages(venue)` / `onDelete(venue)`.

Nội dung mỗi thẻ:
- Tên chi nhánh + badge **"MẶC ĐỊNH"** nếu `isDefault`.
- `publicUrl(venue.slug)` hiển thị dạng text nhỏ, không phải link bấm được.
- Số liệu nhanh theo hàng: **Sân** `courtsCount` · **Booking tháng** `bookingsThisMonth` · **DT tháng** `formatMoney(revenueThisMonth)` · **Lượt xem 7D** (field client tự thêm sau khi gọi `/api/analytics/page-views/summary`, xem §4).
- Địa chỉ, số điện thoại, email — hoặc "Chưa có địa chỉ/SĐT" nếu `null`.
- Hàng thao tác: nút **Mặc định** (ẩn nếu `isDefault` đã `true`), **Sửa**, **Ảnh**, **Xóa** (icon-button, mẫu `pricing-rules-tab.tsx`).

### 3.6. `branch-form-dialog.tsx`

Dialog dùng chung Thêm/Sửa, union props theo mẫu `CourtFormDialog`:

```ts
interface BranchFormDialogCreateProps {
  trigger: React.ReactElement;
  onSaved: () => void;
  mode: "create";
}
interface BranchFormDialogEditProps {
  trigger: React.ReactElement;
  onSaved: () => void;
  mode: "edit";
  venue: Venue;
}
```

Trường (theo `08-chi-nhanh.md` §4, đã bỏ "Logo chi nhánh" — dán URL qua Settings §2 như đã chốt ở backend spec §2, đã thêm checkbox Ẩn theo §2 tài liệu này):

| Trường | Bắt buộc | Ghi chú |
|---|---|---|
| Tên chi nhánh | ✓ | |
| Đường dẫn (slug) | | để trống → backend tự sinh; hiển thị cảnh báo tĩnh "Đổi tối đa 3 lần/180 ngày, cooldown 60 ngày" khi ở mode `edit` |
| Số điện thoại | | |
| Email | | |
| Địa chỉ | ✓ | |
| Tỉnh/Thành phố | ✓ | |
| Quận/Huyện | | |
| Bản đồ chọn vị trí | | xem §6 — điền `latitude`/`longitude` |
| Mô tả | | |
| Ẩn chi nhánh này khỏi trang công khai | | checkbox, map `isHidden`, chỉ có ý nghĩa ở mode `edit` (venue mới tạo luôn `isHidden=false`) |

Submit:
- Tạo: `POST /api/venues` body gồm mọi trường trên (trừ checkbox Ẩn). Thành công → toast "Đã tạo chi nhánh, đang chờ admin duyệt", đóng dialog, `onSaved()`.
- Sửa: `PATCH /api/venues/mine/{id}` body các trường đã đổi. Thành công → toast "Đã cập nhật chi nhánh", đóng dialog, `onSaved()`.
- Lỗi 409 (slug trùng) → inline lỗi trường slug, giữ dialog mở.
- Lỗi 400 (giới hạn đổi slug) → hiển thị đúng message backend trả (ví dụ "Đã đạt giới hạn đổi đường dẫn (3 lần/180 ngày)"), giữ dialog mở.

### 3.7. `branch-images-dialog.tsx`

Chuyển nguyên logic hiện có của `venue-images-section.tsx` (dán URL ảnh, thêm/xoá qua `POST`/`DELETE /api/venues/mine/{id}/images`) vào dialog thay vì section trên trang riêng. Mở từ nút "Ảnh" trên thẻ.

### 3.8. `delete-branch-dialog.tsx`

Confirm dialog mẫu `pricing-rules-tab.tsx` (icon `AlertTriangle` trong vòng tròn đỏ, tên chi nhánh in đậm, nút Huỷ/Xác nhận đỏ):
- Xác nhận → `DELETE /api/venues/mine/{id}`.
- Thành công → toast "Đã xoá chi nhánh", đóng dialog, `onSaved()`.
- 409 (venue có booking lịch sử) → đóng dialog xác nhận, hiển thị toast lỗi kèm gợi ý: "Chi nhánh đã có lịch sử đặt sân, không thể xoá. Dùng 'Sửa' → Ẩn để ẩn khỏi trang công khai thay thế."

### 3.9. `page.tsx`

State: `allItems: Venue[] | null`, `tab: BranchTab` (mặc định `"active"`), `search`, `debouncedSearch`, `sort: BranchSort` (mặc định `"default"`), `viewMode: "grid" | "list"`, `viewCounts: Record<string, number>` (Lượt xem 7D theo `venueId`, xem §4).

- `loadBranches()`: `fetch("/api/venues/mine")` → 401 → `router.push("/login?returnTo=%2Fowner%2Fbranches")`; OK → `setAllItems(data)`, sau đó gọi song song (`Promise.all`) `/api/analytics/page-views/summary?venueId=&from=&to=` (7 ngày gần nhất) cho từng venue → `setViewCounts(...)`.
- `displayItems = sortBranches(filterBranches(allItems ?? [], { tab, search: debouncedSearch }), sort)`.
- `counts = countByTab(allItems ?? [])`.
- Bố cục `<main>` mẫu owner: tiêu đề "Chi nhánh" + nút "+ Thêm chi nhánh" (mở `BranchFormDialog mode="create"`), rồi `BranchMetrics`, `BranchFilters`, danh sách (`BranchCard` lưới hoặc `BranchRow` danh sách theo `viewMode`).
- Mọi dialog con (form/ảnh/xoá/set-default) → `onSaved`/thành công gọi lại `loadBranches()` để đồng bộ số liệu thẻ tổng hợp và badge mặc định.
- Nút "Mặc định" trên thẻ → `POST /api/venues/mine/{id}/set-default` trực tiếp (không cần dialog xác nhận) → `loadBranches()`.

## 4. Route proxy (`apps/web/src/app/api/`)

| File | Method | Chuyển tiếp tới backend |
|---|---|---|
| `venues/mine/[venueId]/set-default/route.ts` | POST | `/venues/mine/:id/set-default` — **file mới** |
| `venues/mine/[venueId]/route.ts` | DELETE | `/venues/mine/:id` — thêm handler vào file đã có (đã có GET/PATCH) |
| `analytics/page-views/summary/route.ts` | GET | `/analytics/page-views/summary?venueId=&from=&to=` — **file mới**, forward nguyên query string. Chỉ để lấy "Lượt xem 7D" trên thẻ chi nhánh, **không phải** dựng lại toàn bộ trang Page View Analytics (`/owner/page-views` vẫn "Coming Soon", xem §7) |

`401` ở mọi proxy mutating → `clearAuthCookies()`, theo đúng mẫu các proxy khác.

`POST /api/venues`, `PATCH /api/venues/mine/[venueId]/route.ts`, `GET /api/venues/mine/route.ts`, ảnh (`images/route.ts`) — **không cần sửa**, đã forward `body`/response nguyên vẹn nên nhận thêm field mới tự động hoạt động.

"Lượt xem 7D" gọi riêng 1 request/venue sau khi có danh sách — chấp nhận được vì số venue của 1 chủ luôn nhỏ (vài chục là nhiều, cùng giả định như Staff Accounts).

## 5. Bản đồ chọn toạ độ

Dependency mới: `react-leaflet`, `leaflet` (+ `@types/leaflet` cho dev) — dùng OpenStreetMap tile layer, miễn phí, không cần API key.

Trong `branch-form-dialog.tsx`: bản đồ nhỏ (~250px cao) nhúng trong form. Click vào bản đồ → đặt/di chuyển marker → điền `latitude`/`longitude` vào state form. Nút "Vị trí của tôi" dùng `navigator.geolocation.getCurrentPosition` (Geolocation API trình duyệt, không cần thư viện) → di chuyển marker + điền toạ độ, báo lỗi nhẹ (toast) nếu trình duyệt từ chối quyền truy cập vị trí. Không có toạ độ ban đầu (tạo mới, hoặc venue cũ chưa từng có lat/lng) → tâm bản đồ mặc định là Hà Nội (`21.0278, 105.8342`, hằng số trong code — chọn 1 điểm neo, không có ý nghĩa nghiệp vụ).

Leaflet cần import CSS riêng (`leaflet/dist/leaflet.css`) và cấu hình lại icon marker mặc định (nhược điểm phổ biến của Leaflet khi dùng chung bundler với Next.js) — chi tiết kỹ thuật này để plan implementation xử lý.

## 6. Validation & lỗi (phía UI)

- Form Thêm/Sửa: Tên/Địa chỉ/Tỉnh-Thành phố rỗng → chặn submit trước khi gọi API (giống `AddCustomerDialog`).
- `slug` (nếu nhập tay): chỉ chữ thường/số/dấu gạch ngang — validate client trước khi submit, backend vẫn là nguồn sự thật cuối cùng.
- `latitude`/`longitude` luôn hợp lệ vì chỉ được điền qua bản đồ/geolocation (không có ô nhập tay).
- 400 đổi slug quá giới hạn (3 lần/180 ngày hoặc chưa đủ 60 ngày cooldown) → hiển thị nguyên message backend trả, giữ dialog mở để sửa lại slug hoặc bỏ trường này.
- 409 tạo/sửa (slug trùng venue khác) → inline lỗi trường slug.
- 409 xoá (venue có booking lịch sử) → xem §3.8.
- Fetch danh sách lỗi không phải 401 → trạng thái lỗi nhẹ ("Không tải được dữ liệu"), không vỡ layout (mẫu Customers/Staff Accounts).
- Lỗi khi gọi `/api/analytics/page-views/summary` cho 1 venue → thẻ đó hiện "Lượt xem 7D: —" thay vì chặn toàn trang.

## 7. Testing

- **Unit (vitest, mẫu `customer-format.test.ts`/`staff-format.test.ts`):**
  - `filterBranches` — đúng theo từng `tab` (`active`/`hidden`/`all`), đúng theo `search` (tên/địa chỉ/thành phố, không phân biệt hoa thường, trim), kết hợp cả hai.
  - `sortBranches` — `"default"` đưa venue `isDefault=true` lên đầu; `"name"` sắp theo bảng chữ cái.
  - `countByTab` — tổng `active + hidden === all`.
  - `formatMoney`, `publicUrl` — định dạng đúng.
- **UI (thủ công qua skill `run`/`verify`):**
  1. Vào `/owner/branches` → thấy đúng 4 thẻ số liệu tổng hợp.
  2. Thêm chi nhánh mới (đủ trường, chọn 1 điểm trên bản đồ, dùng nút "Vị trí của tôi") → xuất hiện trong lưới, thẻ số liệu "Chi nhánh" tăng.
  3. Chuyển đổi lưới⇄danh sách → tải lại trang → giữ nguyên lựa chọn (đọc từ `localStorage`).
  4. Lọc tab Hoạt động/Đã ẩn/Tất cả, tìm kiếm theo tên/địa chỉ/thành phố → đúng kết quả.
  5. Đặt 1 chi nhánh khác làm mặc định → badge "MẶC ĐỊNH" chuyển đúng thẻ, chi nhánh cũ mất badge.
  6. Sửa 1 chi nhánh, tick "Ẩn chi nhánh này" → chuyển tab "Đã ẩn" thấy đúng chi nhánh; kiểm tra trang public (`/venues/by-slug/:slug`) trả 404.
  7. Đổi slug → hiển thị `publicUrl` mới trên thẻ; đổi slug lần thứ 4 trong 180 ngày → báo lỗi giới hạn.
  8. Quản lý ảnh qua nút "Ảnh" → thêm/xoá URL ảnh, đóng dialog không mất dữ liệu vừa sửa.
  9. Xoá chi nhánh chưa từng có booking → biến mất khỏi danh sách.
  10. Thử xoá chi nhánh đã có booking (kể cả đã huỷ) → báo lỗi gợi ý dùng Ẩn, chi nhánh vẫn còn trong danh sách.

## 8. Ngoài phạm vi

- Mở rộng `CreateVenueDto`/response `GET /venues/mine` (thêm `courtsCount`/`bookingsThisMonth`/`revenueThisMonth`) — thuộc plan **backend** (xem §1, §2), không phải plan frontend dựa trên spec này.
- Trang Page View Analytics đầy đủ tại `/owner/page-views` (vẫn "Coming Soon") — chỉ thêm 1 proxy hẹp cho endpoint summary dùng riêng cho thẻ "Lượt xem 7D".
- `BranchSwitcher` (dropdown chọn chi nhánh ở sidebar) — không đổi, đã có thiết kế riêng ở [2026-08-29-venue-default-phone-and-branch-dialog-design.md](./2026-08-29-venue-default-phone-and-branch-dialog-design.md).
- Khôi phục chi nhánh đã xoá — hard delete là vĩnh viễn (theo backend spec §5).
- Tiền tố `/<môn-thể-thao>/` trong URL công khai hiển thị trên thẻ — nền tảng đơn môn, không áp dụng (theo backend spec §10).
