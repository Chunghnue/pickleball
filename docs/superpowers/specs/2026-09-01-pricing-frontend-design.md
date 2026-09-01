# Module: Pricing Frontend ("Bảng giá" page) — Thiết kế chi tiết

**Ngày:** 2026-09-01
**Trạng thái:** Chờ review
**Thuộc kiến trúc tổng thể:** [2026-08-23-pickleball-platform-architecture-design.md](./2026-08-23-pickleball-platform-architecture-design.md)
**Backend đã triển khai:** [2026-08-26-pricing-and-recurring-schedules-design.md](./2026-08-26-pricing-and-recurring-schedules-design.md) (đã merge đầy đủ §2, §3, §4)
**Nguồn tham khảo UI:** [docs/spec/05-bang-gia.md](../../spec/05-bang-gia.md) (khảo sát UI sanbong.vn thực tế) — **chỉ lấy phần khớp với backend hiện có**, xem §0 bên dưới.

## 0. Phạm vi so với docs/spec/05-bang-gia.md

`docs/spec/05-bang-gia.md` là khảo sát UI thực tế của sanbong.vn, mô tả nhiều trường mà backend hiện tại **không hỗ trợ**. Trang này chỉ build đúng những gì gọi được API thật, bỏ hẳn (không hiện dưới dạng disabled) các trường sau:

- **"Loại sân"** trong form bảng giá — nền tảng đơn môn (pickleball), không có khái niệm sport-type.
- **"Đơn vị"** tính giá khác "Giờ" — `pricing_rules.price` luôn là giá/giờ.
- **"Phút/buổi"** như một trường riêng của lịch cố định — thời lượng buổi suy ra từ `startTime`/`endTime`, không lưu riêng.
- **"ID Khách hàng"** nhập tay — dùng lại UI chọn khách hàng có sẵn (tìm theo tên/SĐT) đã có ở luồng đặt sân, không có ô ID riêng.

Mọi trường còn lại trong tài liệu khảo sát đều có API tương ứng và được build đầy đủ.

## 1. Mục tiêu

Thay `apps/web/src/app/owner/pricing/page.tsx` (hiện là `<ComingSoon title="Bảng giá" />`) bằng trang thật, gồm 2 tab ("Bảng giá", "Đặt cố định") và 3 thẻ số liệu tổng hợp, dùng đúng các endpoint đã có:

- `GET /venues/mine/:venueId/pricing-summary?courtId=`
- `POST|GET /venues/mine/:venueId/courts/:courtId/pricing-rules`, `PATCH|DELETE .../pricing-rules/:id`, `POST .../pricing-rules/copy-from/:sourceCourtId`
- `POST /venues/mine/:venueId/recurring-schedules`, `GET .../recurring-schedules`, `GET .../recurring-schedules/:id`, `POST .../recurring-schedules/:id/cancel`

Điểm vào trang: từ sidebar ("Bảng giá", đã có sẵn link `/owner/pricing`) hoặc từ nút "xem" (icon mắt) trên trang Danh sách sân — `CourtActions` đã link sẵn tới `/owner/pricing?courtId={court.id}`.

## 2. Venue/court scoping

Mọi endpoint pricing-rules/recurring-schedules đều cần đúng 1 `venueId` cụ thể trên path; pricing-rules còn cần thêm `courtId` cụ thể. Trong khi đó, branch switcher toàn cục (`useBranch()`) có thể đang ở trạng thái `ALL_BRANCHES_ID` ("Tất cả chi nhánh").

**Khi trang load:**
1. Nếu URL có `?courtId=`: gọi API lấy toàn bộ sân của owner (`/api/venues/mine/courts`), tìm sân có id khớp để suy ra `venueId` + tên sân, rồi gọi `setSelectedVenueId(venueId)` để đồng bộ branch switcher toàn cục với trang này.
2. Nếu URL không có `courtId`: dùng `selectedVenueId` từ `useBranch()` trực tiếp.
3. Nếu `venueId` suy ra được vẫn là `ALL_BRANCHES_ID` (chưa chọn courtId và chưa chọn chi nhánh cụ thể): hiện empty state "Chọn chi nhánh để xem bảng giá", không đoán.
4. Khi đã có `venueId` cụ thể: gọi `/api/venues/mine/{venueId}/courts` để lấy danh sách sân, lưu `selectedCourtId` trong state — mặc định là `courtId` từ URL nếu có, nếu không thì sân đầu tiên (theo `displayOrder`). Có dropdown cạnh tiêu đề trang để đổi sân.

**Phạm vi ảnh hưởng của dropdown chọn sân:** chỉ tác động tab "Bảng giá" (vì `pricing-rules` gắn chặt với 1 sân). Thẻ số liệu tổng hợp và tab "Đặt cố định" luôn tính theo toàn bộ chi nhánh (`venueId`), **không** đổi theo dropdown sân — đúng theo cách các endpoint tương ứng hoạt động (summary mặc định toàn chi nhánh, endpoint danh sách lịch cố định không có filter theo sân).

## 3. Thẻ số liệu tổng hợp

3 thẻ (không phải 4 như trang Khách hàng), lấy từ `GET /venues/mine/:venueId/pricing-summary` (không truyền `courtId` — luôn toàn chi nhánh theo §2), style giống `CustomerMetrics`:

| Thẻ | Giá trị | Icon/màu |
|---|---|---|
| Bảng giá | `pricingRulesCount` | Tag, xanh dương |
| Đặt cố định | `activeRecurringSchedulesCount` | Repeat, xanh lá |
| Doanh thu cố định/tháng | `estimatedMonthlyRecurringRevenue` (format VNĐ) | TrendingUp, vàng, kèm caption nhỏ "ước tính" bên dưới vì đây là số ước tính chứ không phải doanh thu đã thu thực tế |

## 4. Tab "Bảng giá"

- Header: dropdown chọn sân (§2) + ô tìm kiếm theo tên khung giá (lọc phía client — danh sách nhỏ, API không có tham số search) + nút **"+ Thêm bảng giá"** + nút **"Sao chép"**.
- Bảng: Tên khung giá · Thứ áp dụng (badge T2–CN) · Khung giờ · Giá · Đặt trước (giờ/giá nếu có) · Ưu tiên · Sửa/Xóa. Không phân trang (danh sách nhỏ, giống bảng Sân).
- Empty state: "Chưa có khung giá nào cho sân này — Tạo khung giá đầu tiên".
- **Dialog Thêm/Sửa** (react-hook-form + zod, mirror đúng `CreatePricingRuleDto`/`UpdatePricingRuleDto`):
  - Tên khung giá *
  - Thứ áp dụng * (nhóm checkbox T2–CN, ít nhất 1)
  - Giờ bắt đầu * / Giờ kết thúc *
  - Giá (đ) *
  - Ưu tiên (số, optional, mặc định 0)
  - Đặt trước (giờ) + Giá đặt trước (đ) — cặp optional, chỉ hiện ô giá khi đã nhập số giờ
  - Khoảng áp dụng: Từ ngày / Đến ngày — cặp optional, để trống = áp dụng vô thời hạn
- **Xóa**: dialog confirm giống `CourtActions` (icon + "Xóa khung giá X?" + Hủy/Xóa).
- **Sao chép**: dialog nhỏ liệt kê các sân khác của owner (trên mọi chi nhánh — đúng như `copy-from` cho phép), **loại trừ sân đang chọn hiện tại** khỏi danh sách nguồn, chọn sân nguồn rồi gọi `POST .../pricing-rules/copy-from/:sourceCourtId`, refresh danh sách.

## 5. Tab "Đặt cố định"

- Header: nút **"+ Thêm lịch cố định"**. Không có tìm kiếm/lọc (danh sách nhỏ, đúng theo docs/spec).
- Bảng: Khách hàng · Sân · Thứ + khung giờ · Giá/buổi (sau giảm nếu có) · Từ–Đến · Số buổi đã sinh (`occurrenceCount`) · Trạng thái (badge Đang áp dụng/Đã huỷ) · action xem chi tiết.
- Empty state (đúng copy docs/spec): "Chưa có lịch cố định – Khách đặt sân hàng tuần sẽ hiện ở đây".
- **Dialog Thêm** (react-hook-form + zod, mirror `CreateRecurringScheduleDto`):
  - Khách hàng * — **component mới** `CustomerSelector`: ô nhập tên/SĐT gọi `GET /api/customers?search=` (debounce, endpoint đã có sẵn cho trang Khách hàng) gợi ý khách đã có (registered hoặc walk-in); chọn 1 kết quả → `customerId`/`customerContactId` tương ứng theo `kind`; nếu không chọn kết quả nào và có nhập tên+SĐT → coi là khách mới, gửi `newCustomer`. (Không có UI tìm-kiếm-khách-hàng nào sẵn có trong app để tái dùng — `QuickBookDialog` chỉ prefill từ khách đã chọn sẵn trên trang Khách hàng, không tự tìm kiếm.)
  - Sân * — dropdown mọi sân trong chi nhánh, mặc định = sân đang chọn ở tab "Bảng giá" nhưng đổi được tự do
  - Thứ trong tuần * — single-select (1 lịch = 1 thứ, đúng data model backend)
  - Giờ bắt đầu * / Giờ kết thúc *
  - Giá/buổi (đ) *
  - Giảm % (optional, 0–100)
  - Từ ngày * / Đến ngày * (client-side gợi ý tối đa cách nhau 12 tháng, server enforce)
  - Ghi chú (optional)
  - Checkbox "Tự động gia hạn tháng sau" → `autoRenew`
  - Sau khi submit: toast tóm tắt `generatedCount` buổi đã sinh, và nếu có `conflictingDates` thì liệt kê số buổi bị bỏ qua do trùng lịch (vd: "Đã tạo lịch, 8 buổi được sinh, 1 buổi bị trùng lịch (25/12) đã bỏ qua").
- **Dialog Chi tiết** (click 1 dòng): gọi `GET .../recurring-schedules/:id`, hiện thông tin lịch + danh sách occurrence cuộn được (ngày, giờ, badge trạng thái theo `BookingStatus`), và nút "Huỷ lịch cố định" (có bước confirm riêng) gọi endpoint cancel rồi refresh cả dialog chi tiết lẫn bảng ngoài.

## 6. Data fetching, types, proxy routes

Mirror đúng cấu trúc module Khách hàng — không dùng react-query/SWR, `fetch` + `useState`/`useEffect` thuần qua Next.js proxy route.

**Thư mục mới** `apps/web/src/app/owner/pricing/` (thay thế stub hiện tại):
`page.tsx`, `pricing-metrics.tsx`, `pricing-rules-tab.tsx`, `pricing-rule-form-dialog.tsx`, `copy-pricing-dialog.tsx`, `recurring-schedules-tab.tsx`, `recurring-schedule-form-dialog.tsx`, `recurring-schedule-detail-dialog.tsx`, `pricing-format.ts` (+ `.test.ts`), `types.ts`.

**Proxy routes mới** dưới `apps/web/src/app/api/`, thin passthrough qua `fetchApi`/`toNextResponse` (giống `api/customers/`):
- `venues/mine/[venueId]/pricing-summary/route.ts` (GET)
- `venues/mine/[venueId]/courts/[courtId]/pricing-rules/route.ts` (GET, POST)
- `venues/mine/[venueId]/courts/[courtId]/pricing-rules/[id]/route.ts` (PATCH, DELETE)
- `venues/mine/[venueId]/courts/[courtId]/pricing-rules/copy-from/[sourceCourtId]/route.ts` (POST)
- `venues/mine/[venueId]/recurring-schedules/route.ts` (GET, POST)
- `venues/mine/[venueId]/recurring-schedules/[id]/route.ts` (GET)
- `venues/mine/[venueId]/recurring-schedules/[id]/cancel/route.ts` (POST)

**Zod schemas** thêm vào `src/lib/schemas.ts`: `createPricingRuleSchema`/`updatePricingRuleSchema`, `createRecurringScheduleSchema` — mirror đúng field-for-field các DTO backend (cùng min/max, pattern giờ/ngày), theo đúng convention `createCourtSchema`.

## 7. Testing & verification

- Unit test (Vitest, giống `customer-format.test.ts`) cho các hàm thuần trong `pricing-format.ts` (format thứ trong tuần, format giá/giảm giá, query-string builder) — không viết component test, đúng convention hiện tại của repo.
- Sau khi implement: chạy dev server, thao tác thật trên trình duyệt — cả 2 tab, thêm/sửa/xóa 1 khung giá, sao chép khung giá, thêm 1 lịch cố định, xem chi tiết occurrence, huỷ lịch — thay vì chỉ dựa vào unit test để xác nhận UI đúng.

## 8. Ngoài phạm vi

- Các trường docs/spec liệt kê nhưng backend không hỗ trợ (§0).
- Lọc/tìm kiếm phía server cho danh sách khung giá hoặc lịch cố định (danh sách nhỏ, lọc client-side là đủ).
- Sửa/xóa từng occurrence riêng lẻ của lịch cố định (giữ đúng giới hạn đã có ở backend §3.6 "Ngoài phạm vi" — chỉ huỷ toàn bộ lịch).
- Thông báo cho khách khi lịch cố định tự động gia hạn/sắp hết hạn (đã loại khỏi phạm vi ở backend spec).
