# Module: Đặt lịch (lưới lịch đặt sân cho owner) — Thiết kế chi tiết

**Ngày:** 2026-08-31
**Trạng thái:** Chờ review
**Thuộc kiến trúc tổng thể:** [2026-08-23-pickleball-platform-architecture-design.md](./2026-08-23-pickleball-platform-architecture-design.md)
**Nguồn tham khảo:** [docs/spec/03-dat-lich.md](../../spec/03-dat-lich.md) (khảo sát UI sanbong.vn thực tế)
**Sửa đổi:**
- [2026-08-24-bookings-frontend-design.md](./2026-08-24-bookings-frontend-design.md) — thay thế hoàn toàn §5 (section booking dạng list trong `/owner/venues/[id]`) bằng trang lưới mới; đảo ngược nhận định ở §7 "Owner không có calendar/lịch dạng lưới thời gian".
- [2026-08-24-bookings-module-design.md](./2026-08-24-bookings-module-design.md) — tách phần validate/transaction của `BookingsService.create` khỏi khái niệm "khách phải có `customerId`" để dùng chung cho owner tạo hộ khách walk-in.
- [2026-08-26-customers-module-design.md](./2026-08-26-customers-module-design.md) — hiện thực hoá phần tối thiểu của thiết kế này: bảng `customer_contacts`, `bookings.customer_id` nullable + `customer_contact_id`, endpoint `POST /venues/mine/:venueId/bookings`. Các phần còn lại của spec đó (trang Khách hàng/CRM, phân loại tier, `POST /customer-contacts` độc lập) **chưa** làm ở đây.
- [2026-08-26-pricing-and-recurring-schedules-design.md](./2026-08-26-pricing-and-recurring-schedules-design.md) — hiện thực hoá phần tối thiểu của module Recurring Schedules (bảng, tạo, huỷ) để lưới có dữ liệu tô màu "Cố định". Module Pricing và phần còn lại của Recurring Schedules (cron gia hạn, trang "Bảng giá") **chưa** làm ở đây.

## 1. Mục tiêu

Xây trang `/owner/bookings` ("Đặt lịch", hiện là `ComingSoon`) thành lưới lịch đặt sân trực quan (giờ × sân) cho một chi nhánh, theo đúng khảo sát UI ở `docs/spec/03-dat-lich.md`: owner xem toàn bộ booking trong ngày dưới dạng lưới, đặt sân nhanh (kể cả cho khách vãng lai chưa có tài khoản), xem chi tiết/huỷ booking. Trang này **thay thế hoàn toàn** khu vực danh sách booking dạng list hiện có ở `/owner/branches/[id]` (`bookings-section.tsx`).

Vì lưới cần khách vãng lai (đặt hộ không cần tài khoản) và cần phân biệt slot thuộc lịch cố định, phạm vi gộp thêm phần backend tối thiểu của hai module vốn đang ở trạng thái "Chờ review" chưa code (Customers, Recurring Schedules), thay vì chờ chúng được brainstorm/duyệt riêng:

- **Customers (tối thiểu):** bảng `customer_contacts`, sửa `bookings` (`customer_id` nullable, thêm `customer_contact_id`), endpoint `POST /venues/mine/:venueId/bookings`.
- **Recurring Schedules (tối thiểu, đủ test end-to-end):** bảng `recurring_schedules`, cột `bookings.recurring_schedule_id`, endpoint tạo lịch cố định (sinh occurrence) + huỷ lịch cố định. Không làm cron tự gia hạn, không đụng tới module Pricing (giá vẫn dùng `court.pricePerHour` phẳng).

Ngoài phạm vi ngay từ đầu: bộ lọc theo môn thể thao (nền tảng đơn môn), UI tạo lịch cố định (thuộc trang "Bảng giá", brainstorm sau), cron tự gia hạn, module Pricing. Xem đầy đủ ở §8.

## 2. Data model

**`customer_contacts`** (khách vãng lai owner tự quản, không có tài khoản đăng nhập)

| Trường | Mô tả |
|---|---|
| id | UUID |
| owner_id | → users |
| full_name, phone | bắt buộc |
| email, address, note | tuỳ chọn |
| created_at, updated_at | |

Unique index `(owner_id, phone)` — mỗi owner không có 2 contact trùng SĐT.

**Sửa `bookings`:**
- `customer_id`: bắt buộc → **nullable**.
- Thêm `customer_contact_id` (nullable, FK → `customer_contacts`, `ON DELETE RESTRICT`).
- CHECK: `(customer_id IS NOT NULL) <> (customer_contact_id IS NOT NULL)` — đúng một trong hai loại khách.
- Thêm `recurring_schedule_id` (nullable, FK → `recurring_schedules`, `ON DELETE SET NULL`) — đánh dấu booking nào sinh ra từ lịch cố định.

**`recurring_schedules`** (bản tối giản — bỏ `auto_renew` vì không làm cron ở spec này)

| Trường | Mô tả |
|---|---|
| id | UUID |
| court_id | → courts |
| customer_id, customer_contact_id | nullable, đúng 1 trong 2 có giá trị (CHECK) |
| day_of_week | INT 0-6 — một thứ mỗi dòng (lịch "T3+T5" = 2 dòng, cùng `note`) |
| start_time, end_time | TIME |
| price_per_session | NUMERIC — giá/buổi nhập tay, không dùng pricing rule |
| discount_percent | nullable NUMERIC 0-100 |
| valid_from, valid_to | DATE bắt buộc cả hai, tối đa cách nhau 12 tháng |
| note | nullable text |
| status | `active` \| `cancelled` |
| created_at, updated_at | |

Giá mỗi occurrence = `price_per_session * (1 - discount_percent / 100)` (discount null = không giảm), snapshot vào `bookings.total_price` như booking thường.

## 3. Sửa `BookingsService` & API endpoints mới (owner-facing, JWT role `owner`)

**Tách logic tạo booking:** `BookingsService.create` hiện nhận `customerId: string` cố định. Tách phần validate (court/venue/slot-alignment) + transaction insert `bookings`+`booking_slots` (giữ nguyên cơ chế chống double-booking qua unique index) khỏi khái niệm "khách là ai" — hàm lõi nhận đúng một trong `{ customerId }` / `{ customerContactId }` / `{ newCustomer: { fullName, phone, email?, address?, note? } }`.

**Find-or-create khách vãng lai:** khi truyền `newCustomer`, tra `customer_contacts` theo `(ownerId, phone)` trước — nếu đã tồn tại thì dùng lại contact đó (cập nhật `fullName` theo giá trị mới nhất) thay vì insert mới; chỉ insert khi chưa có. Nếu 2 request cùng SĐT mới chạy đồng thời và cả hai đều insert (race) → bắt lỗi vi phạm unique index, tự động tìm lại contact vừa được request kia tạo và dùng luôn, không để lỗi lộ ra ngoài. Nhờ vậy, 409 trả về từ `POST /venues/mine/:venueId/bookings` chỉ còn đúng một nghĩa: slot đã bị đặt.

**Đọc booking — nguồn tên/SĐT khách:** mọi chỗ đang join `users` theo `booking.customerId` (`findByVenueForOwner`, `cancel` khi gửi notification) sửa thành COALESCE: có `customerId` → lấy từ `users`; có `customerContactId` → lấy từ `customer_contacts`. Gửi email xác nhận/huỷ cho khách (`notifyBookingConfirmed`, `notifyBookingCancelled`) chỉ thực hiện khi có `customerId` thật — khách vãng lai không có email/tài khoản.

**Mã booking:** tính động (không lưu cột riêng), `'DL-' + id.slice(0, 8).toUpperCase()` — cùng cách làm mã khách `KH-` ở Customers. Thêm field `bookingCode` vào mọi response đọc booking.

### Endpoint mới

```
POST /venues/mine/:venueId/bookings
  body: { courtId, date, startTime, endTime,
          customerId? | customerContactId? | newCustomer?{ fullName, phone, email?, address?, note? } }
  → 201 booking (đúng 1 trong 3 field khách, 400 nếu 0 hoặc ≥2)
  → 409 nếu slot đã bị chiếm (transaction/unique-index như booking thường)

POST /venues/mine/:venueId/recurring-schedules
  body: { courtId, dayOfWeek, startTime, endTime, pricePerSession, discountPercent?,
          validFrom, validTo, note?, customerId? | customerContactId? | newCustomer?{...} }
  → { schedule, generatedCount, conflictingDates: string[] }
```
Với mỗi ngày trong `[validFrom, validTo]` trùng `dayOfWeek`, thử tạo 1 booking (`recurringScheduleId` = schedule vừa tạo) trong transaction riêng, dùng lại đúng logic slot-alignment + unique index chống double-booking đã có. Occurrence bị 409 → bỏ qua, ghi vào `conflictingDates`, tiếp tục các occurrence còn lại (không rollback toàn bộ).

```
POST /venues/mine/:venueId/recurring-schedules/:id/cancel
```
Set `status = cancelled`; huỷ (theo đúng luồng huỷ booking đã có: set `cancelled`, giải phóng `booking_slots`) mọi occurrence `recurring_schedule_id = id`, `status = confirmed`, `date` trong tương lai. Occurrence đã qua (`completed`) hoặc đã tự huỷ trước đó giữ nguyên làm lịch sử.

### Endpoint sửa

`GET /venues/mine/:venueId/bookings?date=` (đã có) — bổ sung `recurringScheduleId` và `bookingCode` vào mỗi item; nguồn tên/SĐT khách đổi thành COALESCE như trên.

**Không làm** trong spec này: `POST /customer-contacts` độc lập (lưu khách trước, chưa đặt sân), `GET` danh sách/chi tiết recurring schedules, cron gia hạn.

## 4. Kiến trúc frontend & routing

**Route:** `apps/web/src/app/owner/bookings/page.tsx` — thay `ComingSoon` bằng trang lưới lịch thật. Xoá `apps/web/src/app/owner/branches/[id]/bookings-section.tsx` và bỏ import/sử dụng nó khỏi `branches/[id]/page.tsx`.

**Xử lý chi nhánh:** trang tự quản lý `venueId` đang xem, tách khỏi `useBranch()` (sidebar, dùng ở nơi khác). Khi mount: nếu `selectedVenueId` (từ `BranchProvider`) khác `ALL_BRANCHES_ID` → dùng làm mặc định; nếu là `ALL_BRANCHES_ID` → gọi `GET /api/venues/mine` lấy danh sách venue, mặc định chọn venue đầu tiên. Trang có 1 dropdown chọn chi nhánh riêng (cạnh tiêu đề tuần) để đổi qua lại mà không ảnh hưởng trang khác — không ghi state này vào `BranchProvider`/localStorage.

**Route handlers mới** (proxy 1-1, cùng khuôn mẫu `fetchApi()` + `toNextResponse()` đã dùng cho Bookings/Courts):
```
POST /api/venues/mine/[venueId]/bookings                              -> POST /venues/mine/:venueId/bookings
POST /api/venues/mine/[venueId]/recurring-schedules                   -> POST /venues/mine/:venueId/recurring-schedules
POST /api/venues/mine/[venueId]/recurring-schedules/[id]/cancel       -> POST .../recurring-schedules/:id/cancel
```
`GET /api/venues/mine/[venueId]/bookings` (đã có) giữ nguyên, chỉ nhận thêm field `recurringScheduleId`/`bookingCode` xuyên qua transparently. Không cần sửa `apps/web/src/proxy.ts` — `/owner/*` đã yêu cầu role `owner`.

**Component breakdown** (`apps/web/src/app/owner/bookings/`, theo khuôn mẫu tách nhỏ đã dùng ở `dashboard/`):
- `page.tsx` — sở hữu state `venueId`, `selectedDate`; fetch song song `GET /api/venues/mine/[venueId]/courts` (đã có) + `GET /api/venues/mine/[venueId]/bookings?date=`; poll booking mỗi 60s (`setInterval`); nút "làm mới" gọi lại fetch ngay.
- `status-bar.tsx` — 4 số liệu (đã đặt/trống/đang chơi/lấp đầy) tính từ dữ liệu `page.tsx` đã có sẵn (không gọi API riêng) + nút làm mới + nút "⚡ Đặt nhanh".
- `week-day-nav.tsx` — điều hướng tuần, 7 nút ngày, nút "Hôm nay".
- `booking-grid.tsx` — dựng trục giờ (hợp nhất `openTime`→`closeTime` mọi sân **active** của venue, bước 1 giờ) × cột sân (thứ tự `displayOrder`); sân không `active` (`maintenance`/`closed`) vẫn hiện cột nhưng khoá toàn bộ ô kèm nhãn trạng thái, không thao tác được.
- `quick-book-dialog.tsx` — form tạo booking, dùng chung cho cả 2 lối vào (click ô trống → prefill `courtId`+`startTime`; nút "Đặt nhanh" → để trống, tự chọn trong form).
- `booking-detail-dialog.tsx` — xem chi tiết + huỷ booking khi click ô đã đặt/đang chơi/cố định.

## 5. Hành vi chi tiết của lưới

**Tính trạng thái từng ô** (giao giữa 1 giờ × 1 sân), suy ra từ dữ liệu đã fetch (không gọi API riêng cho từng ô):
- Sân không `active` → ô khoá, hiển thị nhãn trạng thái sân, không click được.
- Lọc các booking có `courtId` khớp, `status ∈ {confirmed, completed}` (bỏ `cancelled`), có khoảng `[startTime, endTime)` giao với khung giờ đang xét (giao ≥1 slot con là tính cả giờ, kể cả khi sân cấu hình `slotDurationMinutes` < 60). Nếu có ≥1 booking giao:
  - Có `recurringScheduleId` → tím "Cố định".
  - Không có, và thời điểm hiện tại nằm trong `[startTime, endTime)` của chính booking đó → xanh dương "Đang chơi".
  - Còn lại → đỏ/hồng "Đã đặt", kèm badge số lượng booking giao với ô (thường 1, có thể >1 nếu sân slot 30 phút có 2 booking liền kề trong cùng giờ).
- Không có booking nào giao → xanh lá "Trống", có dấu "+", click được.

**Click ô trống / nút "⚡ Đặt nhanh"** → mở `quick-book-dialog`:
- Từ ô trống: prefill `courtId` + giờ bắt đầu; "Thời lượng" (dropdown) giới hạn tối đa = số giờ liên tiếp còn trống kể từ ô đó cho sân này (cùng cách tính đã dùng ở luồng khách hàng, `slot-selection.ts`), mặc định 2 giờ hoặc tối đa nếu ít hơn.
- Từ nút "Đặt nhanh": không prefill gì, owner tự chọn sân (dropdown) rồi giờ bắt đầu (dropdown theo giờ mở/đóng cửa sân đã chọn).
- Luôn có: Tên khách hàng*, SĐT*, Ghi chú (tuỳ chọn), Tổng tiền dự tính (`court.pricePerHour × số giờ`, tính realtime).
- Submit → `POST /api/venues/mine/[venueId]/bookings` với `newCustomer: { fullName, phone }`.
  - 201 → toast, đóng dialog, refetch bookings.
  - 409 → toast "Khung giờ vừa được đặt", refetch, giữ dialog mở để owner chọn giờ khác.

**Click ô đã đặt/đang chơi/cố định** → mở `booking-detail-dialog` (ô có >1 booking giao thì hiện booking đầu tiên theo giờ bắt đầu — trường hợp hiếm): tên sân, ngày, tên khách + SĐT, badge trạng thái, khung giờ, mã booking (`bookingCode`). Nút "Huỷ lịch" gọi `POST /api/venues/mine/[venueId]/bookings/[id]/cancel` (endpoint owner-cancel đã có, không đổi) — huỷ **đúng occurrence này**, không đụng tới lịch cố định nếu có; huỷ cả lịch cố định (mọi occurrence tương lai) là thao tác khác, thuộc trang Bảng giá sau này.

**Thẻ trạng thái tổng quan:** đếm trên toàn bộ ô (giờ × sân active) của ngày đang xem. "Đã đặt" gộp cả ô đỏ/hồng và ô tím "Cố định" (cùng bản chất là slot đã có khách, khác màu chỉ để phân biệt nguồn gốc); "Đang chơi", "Trống" đếm riêng theo đúng trạng thái ô. Lấp đầy % = (Đã đặt + Đang chơi) / tổng số ô.

**Tự động cập nhật:** poll `GET .../bookings?date=` mỗi 60s, không ảnh hưởng dialog đang mở (dialog dùng state cục bộ). Nút "làm mới" gọi refetch ngay lập tức.

## 6. Validation

**Backend:**
- `POST /venues/mine/:venueId/bookings`: đúng 1 trong 3 field khách → 400 nếu 0 hoặc ≥2; `customerId`/`customerContactId` không tồn tại → 404; `customerContactId` không thuộc owner đang gọi → 404; `newCustomer.fullName`/`phone` bắt buộc. Court/venue/slot-alignment/409-conflict giữ nguyên logic đã có ở Bookings.
- `POST /venues/mine/:venueId/recurring-schedules`: `dayOfWeek` 0-6; `startTime<endTime` thẳng hàng lưới slot; `validFrom<=validTo`, tối đa cách nhau 12 tháng; `pricePerSession>0`; `discountPercent` (nếu có) 0-100; đúng 1 trong 3 field khách như trên.
- `POST .../recurring-schedules/:id/cancel`: chỉ owner sở hữu venue của schedule; schedule đã `cancelled` → 400.
- Owner chỉ thao tác trên venue/court mình sở hữu ở mọi endpoint trên (tái dùng `getOwnedVenueOrThrow`).

**Frontend:** `quick-book-dialog` validate tối thiểu bằng zod colocated (giống `court-form-dialog.tsx`) — `fullName`, `phone` bắt buộc không rỗng; không validate định dạng SĐT sâu.

## 7. Testing

**Backend — Unit:** refactor `BookingsService.create` nhận đúng 1 trong 3 nguồn khách (test cả 3 đường, và 0/2 field → lỗi); find-or-create contact theo SĐT trùng; sinh occurrence lịch cố định đúng ngày theo `dayOfWeek` trong khoảng; tính giá occurrence sau discount; format `bookingCode`.

**Backend — Integration (Postgres thật):** CHECK constraint chặn insert booking thiếu/thừa field khách; race-condition tạo `customer_contacts` trùng SĐT đồng thời → chỉ 1 contact tồn tại, cả 2 booking đều thành công; tạo lịch cố định có 1 occurrence cố tình trùng slot đã có booking khác → occurrence đó vào `conflictingDates`, các occurrence còn lại tạo thành công.

**Backend — E2E:** owner đặt sân nhanh cho khách vãng lai mới → xuất hiện đúng ở `GET /venues/mine/:venueId/bookings`; đặt lần 2 cùng SĐT → dùng lại đúng 1 contact; huỷ booking → slot giải phóng; tạo lịch cố định qua API → occurrence tương lai có `recurringScheduleId`, huỷ lịch → mọi occurrence tương lai chuyển `cancelled`, occurrence quá khứ giữ nguyên.

**Frontend — Unit:** hàm thuần derive trạng thái ô lưới (courts + bookings + thời điểm hiện tại → ma trận giờ×sân), đặt ở `lib/*.test.ts` (giống `slot-selection.test.ts`) — test đủ các nhánh: trống/đã đặt/đang chơi/cố định/sân không active/nhiều booking giao 1 ô.

**Manual/verify:** chạy trang thật, đặt nhanh từ ô trống và từ nút "Đặt nhanh", xem chi tiết + huỷ, kiểm tra thẻ trạng thái tổng quan cập nhật đúng.

## 8. Ngoài phạm vi

- Bộ lọc theo môn thể thao/loại sân (nền tảng đơn môn).
- UI tạo/sửa/xem danh sách lịch cố định và trang "Bảng giá" nói chung — spec riêng sau, dựng trên bảng `recurring_schedules` đã có ở đây.
- Cron tự động gia hạn lịch cố định; module Pricing (`pricing_rules`) — giá vẫn dùng `court.pricePerHour` phẳng.
- `POST /customer-contacts` độc lập và trang "Khách hàng" (CRM, phân loại tier) — spec Customers riêng.
- Huỷ toàn bộ lịch cố định (mọi occurrence tương lai) từ trang Đặt lịch — ở đây chỉ huỷ từng occurrence lẻ qua endpoint huỷ booking đã có.
- Thông báo email cho khách khi owner đặt hộ (khách vãng lai không có tài khoản/email).
- Đồng bộ realtime qua WebSocket (chỉ polling 60s + nút làm mới thủ công).
- Kéo-thả di chuyển booking giữa các ô; đổi giờ/sân của booking đã tạo (chỉ huỷ rồi tạo lại).
