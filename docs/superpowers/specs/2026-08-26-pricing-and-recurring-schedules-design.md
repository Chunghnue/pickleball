# Module: Pricing & Recurring Schedules (Bảng giá & Đặt cố định) — Thiết kế chi tiết

**Ngày:** 2026-08-26
**Trạng thái:** Chờ review
**Thuộc kiến trúc tổng thể:** [2026-08-23-pickleball-platform-architecture-design.md](./2026-08-23-pickleball-platform-architecture-design.md)
**Nguồn tham khảo:** [docs/spec/05-bang-gia.md](../../spec/05-bang-gia.md) (khảo sát UI sanbong.vn thực tế)
**Sửa đổi:** [2026-08-24-courts-module-design.md](./2026-08-24-courts-module-design.md) §5 (sinh khung giờ dùng pricing rule thay vì `price_per_hour` trực tiếp), [2026-08-24-bookings-module-design.md](./2026-08-24-bookings-module-design.md) §2, §5 (tính giá booking dùng pricing rule), [2026-08-26-customers-module-design.md](./2026-08-26-customers-module-design.md) (khách walk-in cho lịch cố định)

## 1. Mục tiêu

Hai tính năng gộp trên cùng 1 trang UI "Bảng giá" nhưng là **hai module backend tách biệt** để tránh vòng phụ thuộc:

- **Pricing**: nhiều khung giá theo giờ/thứ trong tuần cho mỗi court, thay cho giá cố định `court.pricePerHour` duy nhất hiện tại.
- **Recurring Schedules**: lịch thuê sân cố định hàng tuần (khách thuê dài hạn), sinh booking thật cho từng buổi để dùng chung cơ chế chống double-booking đã có.

**Vì sao tách 2 module:** Bookings cần gọi Pricing để tính giá khi tạo booking thường. Recurring Schedules cần gọi Bookings để tạo booking thật cho từng occurrence. Nếu gộp chung một module "Pricing" sẽ tạo vòng lặp Bookings ↔ Pricing. Tách: `pricing` không phụ thuộc gì (Courts và Bookings cùng phụ thuộc một chiều vào nó); `recurring-schedules` phụ thuộc Bookings + Courts + Customers (một chiều, không ai phụ thuộc ngược lại nó).

## 2. Module Pricing

### 2.1. Data model

**pricing_rules**

| Trường | Mô tả |
|---|---|
| id | UUID |
| court_id | → courts |
| name | vd "Buổi tối (17h-22h)" |
| days_of_week | danh sách thứ áp dụng (0=T2..6=CN), lưu dạng `simple-array` (chuỗi số cách nhau bởi dấu phẩy) |
| start_time, end_time | TIME — khung giờ áp dụng |
| price | NUMERIC — giá/giờ trong khung này |
| priority | INT — số càng lớn càng ưu tiên khi nhiều rule cùng khớp một slot |
| advance_booking_hours | nullable INT — đặt trước tối thiểu N giờ so với giờ bắt đầu slot thì áp dụng `advance_price` |
| advance_price | nullable NUMERIC |
| valid_from, valid_to | nullable DATE — để trống = áp dụng vô thời hạn |
| created_at, updated_at | |

**Không có:** "loại sân"/sport-type (không áp dụng, nền tảng đơn môn — nhất quán với quyết định ở Dashboard §2), "áp dụng tất cả sân" (mỗi rule luôn gắn với đúng 1 `court_id`; muốn dùng chung cho nhiều sân thì dùng chức năng "Sao chép" ở §2.3), đơn vị tính giá khác "giờ" (chỉ hỗ trợ giá/giờ, giống `court.pricePerHour` hiện tại).

### 2.2. Thuật toán chọn giá (`PricingService.resolvePrice(courtId, date, slotStart)`)

1. Lấy toàn bộ `pricing_rules` của `courtId` có `days_of_week` chứa thứ của `date`, `start_time <= slotStart < end_time`, và (`valid_from` null hoặc `<= date`) và (`valid_to` null hoặc `>= date`).
2. Nếu không có rule nào khớp → **fallback** dùng `court.price_per_hour` (giá mặc định hiện có — không bắt buộc phải cấu hình đủ mọi khung giờ).
3. Nếu có ≥1 rule khớp → chọn `priority` cao nhất; trùng `priority` → rule tạo sau (`created_at` mới hơn) thắng.
4. Nếu rule được chọn có `advance_booking_hours` và thời điểm hiện tại cách giờ bắt đầu slot (`date + slotStart`) ít nhất `advance_booking_hours` giờ → dùng `advance_price` thay `price`. Nếu `advance_price` null thì vẫn dùng `price` thường (đặt sớm không có giảm giá cấu hình).
5. Giá trả về là giá/giờ; giá của một slot đơn vị = `resolvedPrice * (slot_duration_minutes / 60)` — công thức không đổi so với hiện tại, chỉ đổi nguồn `resolvedPrice`.

Đây thay thế công thức `price = price_per_hour * (slot_duration_minutes / 60)` ở [Courts §5](./2026-08-24-courts-module-design.md) và bước tính giá ở [Bookings §2](./2026-08-24-bookings-module-design.md) — cả hai giờ gọi `PricingService.resolvePrice()` thay vì đọc thẳng `court.price_per_hour`. Hành vi snapshot giá tại thời điểm đặt (đã chốt ở Bookings §2) không đổi — chỉ đổi cách tính giá "hiện tại".

### 2.3. API endpoints (owner-facing, JWT role `owner`)

```
POST   /venues/mine/:venueId/courts/:courtId/pricing-rules
GET    /venues/mine/:venueId/courts/:courtId/pricing-rules
PATCH  /venues/mine/:venueId/courts/:courtId/pricing-rules/:id
DELETE /venues/mine/:venueId/courts/:courtId/pricing-rules/:id
POST   /venues/mine/:venueId/courts/:courtId/pricing-rules/copy-from/:sourceCourtId
```

`copy-from`: sao chép toàn bộ `pricing_rules` của `sourceCourtId` sang `courtId` (tạo bản ghi mới, không tham chiếu chung). `sourceCourtId` phải thuộc một venue bất kỳ do owner đang gọi sở hữu (không nhất thiết cùng `:venueId` trong path) — 404 nếu không.

### 2.4. Validation

- `start_time < end_time`; `days_of_week` chỉ chứa giá trị 0-6, không rỗng.
- `price > 0`; `advance_price` (nếu có) `> 0`; `advance_booking_hours` (nếu có) `> 0`.
- `valid_from <= valid_to` nếu cả hai có giá trị.
- Owner chỉ sửa/xoá rule thuộc court của venue mình (403 nếu không phải chủ sở hữu, tái dùng `getOwnedVenueOrThrow`).
- **Không** validate chồng lấn giữa các rule cùng ưu tiên tại tạo/sửa — xử lý bằng tie-break "tạo sau thắng" ở §2.2 bước 3, đơn giản hơn việc chặn chồng lấn.

## 3. Module Recurring Schedules

### 3.1. Data model

**recurring_schedules**

| Trường | Mô tả |
|---|---|
| id | UUID |
| court_id | → courts |
| customer_id | nullable → users |
| customer_contact_id | nullable → customer_contacts |
| day_of_week | INT 0-6 — **một** thứ mỗi dòng (lịch "T3+T5 hàng tuần" = 2 dòng `recurring_schedules`, cùng `note`) |
| start_time, end_time | TIME |
| price_per_session | NUMERIC — giá/buổi đã thoả thuận, **không** dùng `pricing_rules` (giá riêng cho khách thuê dài hạn) |
| discount_percent | nullable NUMERIC (0-100) |
| valid_from, valid_to | DATE, bắt buộc cả hai — tối đa cách nhau **12 tháng** (xem §3.4) |
| auto_renew | BOOLEAN, default false |
| note | nullable text |
| status | `active` \| `cancelled` |
| created_at, updated_at | |

CHECK constraint giống `bookings`: đúng một trong `customer_id`/`customer_contact_id` có giá trị.

**Sửa `bookings`:** thêm cột `recurring_schedule_id` (nullable, FK → `recurring_schedules`, `ON DELETE SET NULL`) để truy vết booking nào được sinh từ lịch cố định nào.

**Giá mỗi occurrence** = `price_per_session * (1 - discount_percent / 100)` (discount null = không giảm), snapshot vào `bookings.total_price` như booking thường.

### 3.2. Sinh occurrence khi tạo lịch cố định

```
POST /venues/mine/:venueId/recurring-schedules
  body: { courtId, dayOfWeek, startTime, endTime, pricePerSession, discountPercent?,
          validFrom, validTo, autoRenew?, note?,
          customerId? | customerContactId? | newCustomer?{...} }   // đúng 1 trong 3, giống Bookings §4.1
  → { schedule, generatedCount, conflictingDates: string[] }
```

Xử lý: với mỗi ngày trong `[validFrom, validTo]` trùng `dayOfWeek`, thử tạo 1 booking (status `confirmed`, `recurringScheduleId` = schedule vừa tạo) trong transaction riêng — dùng lại đúng logic slot-alignment + unique index chống double-booking đã có ở Bookings §5. Occurrence bị 409 (slot đã có người đặt) → **bỏ qua, ghi vào `conflictingDates`**, tiếp tục các occurrence còn lại — không rollback toàn bộ. Lý do: một lịch cố định kéo dài nhiều tháng gần như chắc chắn đụng ít nhất 1 ngày đã có người đặt trước (vd ngày lễ); yêu cầu tất-cả-hoặc-không sẽ khiến tính năng gần như không dùng được.

### 3.3. Huỷ lịch cố định

```
POST /venues/mine/:venueId/recurring-schedules/:id/cancel
```

Set `status = cancelled`. Huỷ (theo đúng luồng huỷ ở Bookings §3: set `cancelled`, giải phóng `booking_slots`) mọi booking occurrence có `recurring_schedule_id = id`, `status = confirmed`, và `date` trong tương lai. Occurrence đã qua (`completed`) hoặc đã tự huỷ trước đó giữ nguyên làm lịch sử.

### 3.4. Tự động gia hạn (scheduler)

Thêm `@nestjs/schedule` (thành phần scheduler đầu tiên trong hệ thống — trước đây mọi state chuyển đổi đều tính lazy khi đọc, xem Bookings §3). Một cron job chạy hàng ngày (`@Cron('0 1 * * *')`, 01:00 giờ server):

1. Tìm mọi `recurring_schedules` có `status = active`, `auto_renew = true`, `valid_to <= hôm nay + 7 ngày`.
2. Với mỗi lịch: sinh occurrence cho 30 ngày tiếp theo sau `valid_to` hiện tại (cùng logic bỏ-qua-conflict ở §3.2), rồi cập nhật `valid_to` = `valid_to cũ + 30 ngày`.
3. Việc gia hạn không bị chặn bởi giới hạn 12 tháng ở §3.1 (giới hạn đó chỉ áp dụng khi **tạo mới**) — gia hạn tăng dần từng 30 ngày một, không có trần tổng.

### 3.5. API endpoints còn lại

```
GET  /venues/mine/:venueId/recurring-schedules                 danh sách, kèm status + số occurrence đã sinh
GET  /venues/mine/:venueId/recurring-schedules/:id             chi tiết + danh sách occurrence (bookings có recurring_schedule_id = id)
```

### 3.6. Validation

- `dayOfWeek` 0-6; `startTime < endTime`, thẳng hàng lưới slot của court (giống Bookings §6).
- `validFrom <= validTo`; `validTo - validFrom` tối đa 12 tháng khi tạo mới (400 nếu vượt — giới hạn số occurrence sinh ngay lập tức trong 1 request).
- `pricePerSession > 0`; `discountPercent` (nếu có) trong khoảng 0-100.
- Đúng 1 trong 3 field khách (`customerId`/`customerContactId`/`newCustomer`), giống Bookings §4.1.
- Owner chỉ tạo/huỷ lịch thuộc court của venue mình.

## 4. Thẻ số liệu tổng hợp (trang "Bảng giá")

- **Bảng giá** = tổng số `pricing_rules` (trong phạm vi lọc theo court/venue nếu có).
- **Đặt cố định** = tổng số `recurring_schedules` có `status = active`.
- **Doanh thu cố định/tháng** (ước tính) = `Σ (price_per_session * (1 - discount_percent/100) * 4.33)` trên mọi lịch `active` — `4.33` = số lần trung bình 1 thứ trong tuần lặp lại mỗi tháng (52/12). Ghi rõ đây là số ước tính, không phải doanh thu thực đã thu (khác với Revenue Report §2 vốn dựa trên `payments.status='paid'`).

## 5. Testing

- **Unit:** `PricingService.resolvePrice` — không rule nào khớp (fallback), nhiều rule chồng lấn (chọn đúng priority cao nhất, tie-break đúng), advance price áp dụng đúng ranh giới giờ; tính `price_per_session` sau discount; ước tính doanh thu cố định/tháng.
- **Integration:** tạo lịch cố định với 1 occurrence cố tình trùng slot đã có booking khác → occurrence đó vào `conflictingDates`, các occurrence còn lại vẫn tạo thành công (chạy trên Postgres thật, giống cách test unique index ở Bookings).
- **E2E:** tạo pricing rule theo khung giờ tối → giá trả về ở `/courts/:id/slots` đúng theo khung giờ; tạo lịch cố định 3 tháng cho khách walk-in mới → occurrence xuất hiện trong `/venues/mine/:venueId/bookings`; huỷ lịch cố định → occurrence tương lai chuyển `cancelled`, occurrence đã qua giữ nguyên; cron gia hạn (test gọi trực tiếp hàm xử lý, không đợi thật 1 ngày) sinh thêm occurrence và cập nhật `valid_to`.

## 6. Ngoài phạm vi

- Đơn vị tính giá khác "giờ" (vd theo buổi cố định không tính giờ, theo tháng trọn gói).
- Validate/cảnh báo khi tạo pricing rule chồng lấn cùng ưu tiên (chỉ tie-break ngầm, không cảnh báo owner).
- Sửa/xoá từng occurrence riêng lẻ của lịch cố định (chỉ có huỷ toàn bộ lịch từ thời điểm hiện tại trở đi).
- Hoàn tiền khi huỷ lịch cố định (thuộc phạm vi module Payments, xử lý thủ công ngoài hệ thống).
- Thông báo cho khách khi lịch cố định được tự động gia hạn hoặc sắp hết hạn.
- Trần tổng thời lượng một lịch cố định (chỉ giới hạn 12 tháng mỗi lần tạo/gia hạn, không giới hạn số lần gia hạn liên tiếp).
- Frontend (spec riêng, sau khi spec API này được duyệt).
