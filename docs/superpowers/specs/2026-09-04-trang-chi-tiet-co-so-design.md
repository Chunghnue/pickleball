# Trang chi tiết cơ sở (`/venues/[id]`) — Thiết kế chi tiết

**Ngày:** 2026-09-04
**Trạng thái:** Đã duyệt
**Thuộc kiến trúc tổng thể:** [2026-08-23-pickleball-platform-architecture-design.md](./2026-08-23-pickleball-platform-architecture-design.md)
**Nguồn tham khảo:** [docs/01-website-khach-hang/04-trang-chi-tiet-co-so.md](../../01-website-khach-hang/04-trang-chi-tiet-co-so.md) (khảo sát UI sanbong.vn thực tế)
**Liên quan:**
- [2026-09-04-tim-kiem-va-loc-san-design.md](./2026-09-04-tim-kiem-va-loc-san-design.md) — đã quyết định trang `/venues/[id]` là điểm đặt sân duy nhất (chọn sân + khung giờ inline), không có luồng đặt nhanh riêng biệt; spec này kế thừa quyết định đó.
- [2026-09-04-ban-do-design.md](./2026-09-04-ban-do-design.md) — nút "Chi tiết" ở `/ban-do` trỏ tới `/venues/[id]`; spec này mở rộng `/ban-do` để nhận `?venueId=` (mục 3.3).

## 1. Mục tiêu

Nâng cấp trang chi tiết cơ sở hiện có (`apps/web/src/app/venues/[id]/page.tsx`) — hiện rất sơ khai: chỉ hiện tên/địa chỉ/mô tả dạng text, ảnh cơ sở render thành link `<a>` thay vì `<img>` (chưa từng hiển thị ảnh thật), không có bản đồ, không hiện sức chứa sân hay giờ hoạt động, mỗi sân có 1 date-picker + dãy nút giờ riêng xếp chồng dọc — thành trang đầy đủ theo tài liệu khảo sát `04-trang-chi-tiet-co-so.md`, giữ nguyên URL `/venues/[id]` (UUID).

## 2. Khác biệt so với tài liệu khảo sát gốc

Tài liệu `04-trang-chi-tiet-co-so.md` mô tả sanbong.vn — marketplace đa môn thể thao với nhiều tính năng phụ trợ (chat realtime, lưu/yêu thích, trang liên hệ riêng) đã tồn tại sẵn trên nền tảng đó. Nền tảng hiện tại (pickleball đơn môn) chưa có hạ tầng cho các tính năng này, nên:

- **Bỏ nút "Lưu" (yêu thích/bookmark)** (mục 1 tài liệu gốc) — không có bảng/API nào cho khái niệm này trong schema hiện tại; net-new feature, cần spec riêng nếu làm sau.
- **Bỏ nút "Chia sẻ"** (mục 1 tài liệu gốc) — không có hạ tầng (`navigator.share`) ở bất kỳ trang nào hiện tại, net-new.
- **Bỏ nút nổi "Mở chat với chủ sân"** (mục 7 tài liệu gốc) — `docs/superpowers/specs/2026-08-26-chat-inbox-design.md` mô tả tính năng này nhưng đang ở trạng thái "Chờ review", chưa có code/gateway realtime nào tồn tại (không có bảng `conversations`/`messages`, không có WebSocket gateway).
- **Bỏ nút "Liên hệ chủ sân"** (mục 7 tài liệu gốc, link tới trang Liên hệ) — route `/lien-he` chưa tồn tại trong `apps/web/src/app`, tài liệu `09-lien-he-va-dang-ky-chu-san.md` cũng mới chỉ là khảo sát, chưa có spec/code.
- **Bỏ "Widget đặt sân nhanh" dạng sidebar dẫn sang `/dat-san?venueId=...`** (mục 5 tài liệu gốc) — route `/dat-san` không tồn tại. Trang chi tiết hiện tại (và quyết định ở `tim-kiem-va-loc-san-design.md` mục 2) đã xác định `/venues/[id]` là điểm đặt sân duy nhất — chọn sân + khung giờ ngay tại trang, không tách luồng riêng để tránh 2 điểm đặt sân trùng chức năng.
- **Bỏ "Bảng giá thuê sân" dạng bảng tóm tắt riêng** (mục 3 tài liệu gốc) — giá thực tế được tính theo `PricingRule` (linh hoạt hơn nhiều so với 2 cột "ngày thường/cuối tuần": `daysOfWeek` tuỳ ý, khoảng ngày hiệu lực, ưu tiên chồng lấn), không thể gom gọn chính xác thành bảng tĩnh. Giá đã hiển thị đúng trên từng ô của lưới lịch trống (mục 4 tài liệu gốc) — dùng chung 1 nguồn dữ liệu, tránh 2 nơi hiển thị giá có thể lệch nhau.
- **Gộp "Danh sách sân trong cơ sở"** (mục 2 tài liệu gốc, tên sân + sức chứa) **vào làm nhãn hàng của lưới lịch trống** thay vì làm section tĩnh riêng — liệt kê sân 2 lần (danh sách tĩnh + lưới) không mang thêm thông tin.
- **"Lịch trống hôm nay" đổi từ mỗi sân 1 date-picker riêng (code hiện tại) sang 1 lưới thống nhất, 1 ngày dùng chung** — đúng tinh thần "lưới: hàng = sân, cột = khung giờ" của tài liệu gốc, cho phép so sánh nhanh giữa các sân.
- **Không đổi URL sang `/venues/[slug]`** dù backend đã có sẵn `GET /venues/by-slug/:slug` và slug unique cho mỗi venue — đổi routing là thay đổi riêng biệt (ảnh hưởng mọi nơi đang link bằng `id`), không thuộc phạm vi spec nội dung trang này.
- **"Xem bản đồ"** (mục 6 tài liệu gốc) không mở bản đồ toàn trang độc lập mà **mở `/ban-do?venueId=...`** — tái dùng route bản đồ đã có ở `2026-09-04-ban-do-design.md` thay vì xây thêm 1 bản đồ toàn trang riêng.

## 3. Backend

### 3.1 `GET /venues/:id` và `GET /venues/by-slug/:slug` — thêm `operatingHours`

`apps/api/src/courts/venues.controller.ts:207-221` — cả hai handler hiện đã spread nguyên `Venue` entity (`{ ...venue, courts, images }`), nên `phone`, `district`, `latitude`/`longitude`, `logoUrl`, `cancellationCutoffHours` **đã có sẵn trong response ngay bây giờ** — chỉ cần frontend khai báo thêm field trong interface (mục 4.1), không cần sửa backend cho các field này.

Riêng `operatingHours` chưa được đính kèm — thêm vào cả 2 handler:

```ts
const operatingHours = await this.venuesService.getOperatingHoursPublic(venue.id);
return { ...venue, courts, images, operatingHours };
```

`venues.service.ts` — thêm method mới `getOperatingHoursPublic(venueId: string): Promise<OperatingHourView[]>`, logic giống `getOperatingHours` (`venues.service.ts:825-843`) nhưng **bỏ** bước `getOwnedVenueOrThrow` (venue đã được xác nhận public/active bởi `findPublicById`/`findPublicBySlug` trước đó, không cần kiểm tra chủ sở hữu):

```ts
async getOperatingHoursPublic(venueId: string): Promise<OperatingHourView[]> {
  const rows = await this.operatingHoursRepository.find({
    where: { venueId },
    order: { dayOfWeek: 'ASC' },
  });
  if (rows.length === 0) return DEFAULT_OPERATING_HOURS;
  return rows.map((row) => ({
    dayOfWeek: row.dayOfWeek,
    isOpen: row.isOpen,
    openTime: toHhMm(row.openTime),
    closeTime: toHhMm(row.closeTime),
  }));
}
```

`getOperatingHours` (owner-scoped, dùng cho `GET /venues/mine/:id/operating-hours`) giữ nguyên không đổi — 2 method tách biệt, method mới không có kiểm tra quyền sở hữu.

### 3.2 Lịch trống — không thêm endpoint batch

Lưới thống nhất (hàng = sân, cột = khung giờ) vẫn dùng nguyên `GET /bookings/availability?courtId=&date=` hiện có (`bookings.controller.ts:98-104`), gọi song song 1 lần/sân từ frontend (`Promise.all`) khi đổi ngày, ghép kết quả thành lưới ở client. Không thêm endpoint batch mới vì số sân/cơ sở nhỏ (thường 1–4 sân), không đáng đổi backend cho việc này.

### 3.3 `GET /ban-do` — thêm hỗ trợ `venueId` để focus

`apps/web/src/app/ban-do/page.tsx` — đọc thêm query param `venueId` từ URL lúc mount (`useSearchParams`). Nếu có: sau khi `venues` load xong, tìm venue khớp `id`, gọi `map.flyTo([lat, lng], 16)` (zoom cao hơn mặc định) thay vì `fitBounds` theo toàn bộ kết quả, và tự mở `Popup` của marker đó. Venue đó không có toạ độ (`latitude`/`longitude` null) → fallback về hành vi mặc định (`fitBounds` toàn bộ) + `toast` nhẹ "Cơ sở này chưa cập nhật vị trí". Không cần đổi backend — `GET /venues/map` đã trả đủ toạ độ cho mọi venue.

## 4. Frontend — `apps/web/src/app/venues/[id]/page.tsx`

### 4.1 Kiểu dữ liệu

```ts
interface OperatingHourItem {
  dayOfWeek: number; // 0 = Chủ nhật ... 6 = Thứ 7, đúng Date.getDay() của JS
  isOpen: boolean;
  openTime: string | null;
  closeTime: string | null;
}
interface PublicCourt {
  id: string;
  name: string;
  pricePerHour: number;
  openTime: string;
  closeTime: string;
  capacity: number | null;
}
interface PublicVenueDetail {
  id: string;
  name: string;
  address: string;
  city: string;
  district: string | null;
  phone: string;
  description: string | null;
  cancellationCutoffHours: number;
  logoUrl: string | null;
  latitude: number | null;
  longitude: number | null;
  images: { id: string; url: string }[];
  courts: PublicCourt[];
  operatingHours: OperatingHourItem[];
}
```

### 4.2 Bố cục trang

`PublicHeader` → khối thông tin cơ sở (4.3) → gallery ảnh (4.4) → lưới lịch trống + đặt sân inline (4.5) → bản đồ nhúng (4.6) → thông tin liên hệ đầy đủ (4.7) → `PublicFooter`. Container `max-w-4xl` (nới rộng hơn `max-w-2xl` hiện tại vì lưới lịch trống cần nhiều chiều ngang).

### 4.3 Khối thông tin cơ sở (đầu trang)

Tên, badge "Đang mở cửa" / "Đã đóng cửa" — tính từ `operatingHours` của hôm nay so với giờ hiện tại. `dayOfWeek` dùng đúng quy ước `Date.getDay()` của JS (0=Chủ nhật...6=Thứ 7 — xác nhận qua `DAY_LABELS`/`DISPLAY_ORDER` đang dùng ở `apps/web/src/app/owner/settings/operating-hours-format.ts:3-12`, cùng shape `OperatingHourView` với endpoint public mới), nên tra cứu hôm nay chỉ cần `operatingHours.find(h => h.dayOfWeek === new Date().getDay())`, không cần map lại. Địa chỉ đầy đủ (`address`, `district`, `city`), giờ mở cửa hôm nay dạng rút gọn (`{openTime}–{closeTime}` hoặc "Đóng cửa hôm nay"), số sân (`courts.length`), mô tả (`description`, ẩn cả block nếu `null`). Không có nút Lưu/Chia sẻ (mục 2, ngoài phạm vi).

### 4.4 Gallery ảnh

Lưới thumbnail (`grid grid-cols-3 sm:grid-cols-4 gap-2`, mỗi ảnh `aspect-square object-cover rounded-lg`) thay cho danh sách link `<a>{url}</a>` hiện tại (`page.tsx:86-100`) — sửa đúng gap đã biết (ảnh chưa từng hiển thị dạng `<img>` thật). Click ảnh mở tab mới (`target="_blank"`, giữ hành vi đơn giản hiện có, không xây lightbox modal — YAGNI). `images.length === 0` → ẩn hẳn section. `logoUrl` không hiển thị ở trang này (không có vị trí phù hợp trong layout, để dành cho nơi khác nếu cần — vd. card danh sách — ở spec riêng).

### 4.5 Lưới lịch trống (thay hoàn toàn component `CourtSlots` hiện tại)

- **1 date-picker chung** cho cả trang (mặc định hôm nay, `min={today}`), đặt ngay trên lưới — thay cho mỗi sân 1 date-picker riêng như code hiện tại.
- Khi `date` đổi (hoặc lần đầu mount): `Promise.all(venue.courts.map(c => fetch(\`/api/bookings/availability?courtId=${c.id}&date=${date}\`)))`, ghép kết quả thành `Record<courtId, AvailabilitySlot[]>` (kiểu `AvailabilitySlot` tái dùng từ `@/lib/slot-selection`).
- **Bảng lưới**: cột đầu là tên sân (kèm `{capacity} người` nếu `capacity != null` — đây là nơi "Danh sách sân trong cơ sở" mục 2 tài liệu gốc được gộp vào, xem mục 2). Các cột sau là khung giờ — lấy **hợp (union)** tất cả khung giờ xuất hiện ở bất kỳ sân nào trong ngày đó (các sân có thể có `openTime`/`closeTime` khác nhau); ô không áp dụng cho 1 sân cụ thể (ngoài giờ mở cửa sân đó) hiển thị trống/disabled, không phải "Đã đặt".
- Mỗi ô còn lại: nút nhỏ hiển thị giá (`slot.price`), 3 trạng thái màu — **Trống** (viền, hover), **Đã đặt** (`opacity-50 cursor-not-allowed`, `slot.isBooked === true`), **Đang chọn** (`bg-primary text-primary-foreground`) — tái dùng nguyên class hiện có ở `page.tsx:229-235`.
- Click 1 ô trống → chọn (lưu `{courtId, index}`), hiện **panel tóm tắt bên dưới lưới** (thay cho block confirm nhúng trong từng card hiện tại): tên sân + khung giờ đang chọn, dropdown số giờ chơi (dùng `computeMaxConsecutiveDuration` từ `@/lib/slot-selection` — tái dùng nguyên hàm, áp trên mảng slot của đúng sân đang chọn), tổng giá (`reduce` trên các slot trong khoảng đã chọn), dòng ghi chú chính sách huỷ **động theo venue** — `"Hủy trước {venue.cancellationCutoffHours}h miễn phí"` (khác tài liệu gốc hardcode "2h" — giá trị này owner cấu hình được qua `UpdateVenueDto.cancellationCutoffHours`, đã có sẵn trong response `GET /venues/:id` nên không cần fetch thêm), nút "Xác nhận đặt sân" → giữ nguyên luồng hiện có: `POST /bookings` với `{courtId, date, startTime, endTime}`, `401` → `router.push(/login?returnTo=...)`, lỗi khác → `toast.error` + `loadSlots()` lại, thành công → `toast.success` + reset selection + reload lưới.
- Bảng cuộn ngang trên mobile (`overflow-x-auto`) khi nhiều khung giờ.

### 4.6 Bản đồ nhúng

`venue-location-map.tsx` (file mới, cùng thư mục `apps/web/src/app/venues/[id]/`) — bản rút gọn của `apps/web/src/app/owner/branches/branch-location-map.tsx`: bỏ hẳn `ClickHandler`, `RecenterOnChange` và prop `onChange`; chỉ nhận `{ latitude: number; longitude: number }` (component cha đã kiểm tra non-null trước khi render), luôn 1 `Marker` tĩnh, đổi màu icon sang xanh lá (khớp accent phía khách hàng, cùng style `venueMarkerIcon` đang dùng ở `apps/web/src/app/ban-do/venue-map.tsx`). Nạp bằng `dynamic(() => import("./venue-location-map"), { ssr: false })`, cùng idiom `BranchLocationMap` đang được nạp.

`venue.latitude === null || venue.longitude === null` → ẩn hẳn khối bản đồ (không hiện map rỗng ở toạ độ mặc định Hà Nội — gây hiểu nhầm vị trí thật).

2 nút cạnh bản đồ (chỉ hiện khi có toạ độ):
- **"Chỉ đường"** — `<a href="https://www.google.com/maps/dir/?api=1&destination={lat},{lng}" target="_blank" rel="noreferrer">`.
- **"Xem bản đồ"** — `<Link href={\`/ban-do?venueId=${venue.id}\`}>`.

### 4.7 Thông tin liên hệ (cuối trang, trước `PublicFooter`)

Số điện thoại (`<a href="tel:{phone}">{phone}</a>`), địa chỉ đầy đủ (nhắc lại ngắn gọn), **bảng giờ hoạt động 7 ngày** — sắp xếp Thứ 2 → Chủ nhật bằng cách tái dùng nguyên `DISPLAY_ORDER = [1,2,3,4,5,6,0]` từ `apps/web/src/app/owner/settings/operating-hours-format.ts` (áp `DISPLAY_ORDER.map(d => operatingHours.find(h => h.dayOfWeek === d))`, cùng nhãn `DAY_LABELS`), dòng nào `isOpen === false` hiện "Đóng cửa" thay vì giờ. Đây là nơi duy nhất hiện bảng giờ đầy đủ — khối đầu trang (4.3) chỉ hiện hôm nay, tránh lặp thông tin.

## 5. Testing

**Backend:**
- `venues.controller`/`venues.service` spec: `GET /venues/:id` và `GET /venues/by-slug/:slug` trả kèm `operatingHours` đúng — venue đã cấu hình riêng → trả đúng rows theo `dayOfWeek` ASC; venue chưa cấu hình (0 rows) → fallback `DEFAULT_OPERATING_HOURS`.
- `getOperatingHoursPublic` hoạt động không cần `ownerId`, không throw khi gọi với venue bất kỳ (khác `getOperatingHours` owner-scoped ném lỗi nếu không đúng chủ sở hữu) — test riêng để xác nhận 2 method tách biệt đúng, không lẫn logic.
- Regression: `findPublicById`/`findPublicBySlug` vẫn 404 đúng cho venue `pending_approval`/`rejected`/`isHidden=true` (hành vi hiện có, không đổi).

**Frontend (manual/browser — Leaflet và lưới ngày/giờ tương tác không có unit test hữu ích):**
- Mở `/venues/[id]` với venue nhiều sân có giờ mở cửa khác nhau → lưới hiển thị đúng hợp khung giờ; ô ngoài giờ mở cửa của 1 sân cụ thể bị disable đúng, không lẫn với "Đã đặt".
- Đổi ngày ở date-picker chung → toàn bộ lưới cập nhật lại cho tất cả sân cùng lúc.
- Click ô trống → panel tóm tắt hiện đúng sân/khung giờ; đổi số giờ chơi → tổng giá cập nhật đúng; xác nhận đặt thành công → ô tương ứng chuyển "Đã đặt" ngay sau khi reload.
- Chưa đăng nhập, xác nhận đặt sân → chuyển `/login?returnTo=/venues/[id]` đúng.
- Venue không có toạ độ → không hiện khối bản đồ/nút "Chỉ đường"/"Xem bản đồ"; venue có toạ độ → nhúng đúng vị trí, "Xem bản đồ" điều hướng `/ban-do?venueId=...` và bản đồ đích tự `flyTo` + mở đúng popup marker đó.
- Venue chưa có ảnh nào → ẩn gallery; có ảnh → hiển thị dạng `<img>` thumbnail thật (không còn text link), click mở tab mới đúng URL ảnh.
- Badge "Đang mở cửa"/"Đã đóng cửa" đúng theo giờ hiện tại so với `operatingHours` hôm nay, kể cả trường hợp `isOpen=false` hôm nay (badge phải hiện "Đã đóng cửa" dù giờ hiện tại nằm trong khoảng giờ thường).
- Bảng giờ hoạt động cuối trang hiển thị đủ 7 ngày, đúng thứ tự Thứ 2 → Chủ nhật.

## 6. Ngoài phạm vi

- Nút Lưu/yêu thích (bookmark) — chưa có bảng/API, cần spec riêng nếu làm.
- Nút Chia sẻ — chưa có hạ tầng, net-new, không thuộc trọng tâm trang chi tiết.
- Chat trực tiếp với chủ sân — phụ thuộc `chat-inbox-design.md` (đang "Chờ review", chưa có code/gateway realtime).
- Nút "Liên hệ chủ sân" dẫn tới trang `/lien-he` — trang đó chưa tồn tại.
- Bảng giá tóm tắt riêng theo ngày thường/cuối tuần — giá đã hiện đúng ở từng ô lưới lịch trống (dữ liệu thật từ `PricingRule`), không cần nguồn hiển thị giá thứ 2 (xem mục 2).
- Sidebar "đặt sân nhanh" / route `/dat-san` riêng — giữ 1 luồng đặt sân inline duy nhất (xem mục 2).
- Đổi URL sang `/venues/[slug]` — slug đã có sẵn ở backend nhưng đổi routing là thay đổi riêng biệt, không thuộc spec nội dung trang này.
- Lightbox xem ảnh phóng to — click ảnh mở tab mới, đủ dùng ở quy mô hiện tại.
- Đánh giá/review cơ sở — ngoài phạm vi MVP tổng thể (`pickleball-platform-architecture-design.md`).
