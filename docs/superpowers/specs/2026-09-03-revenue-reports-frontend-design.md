# Module: Revenue Reports Frontend (Báo cáo doanh thu) — Thiết kế chi tiết

**Ngày:** 2026-09-03
**Trạng thái:** Chờ review
**Thuộc kiến trúc tổng thể:** [2026-08-23-pickleball-platform-architecture-design.md](./2026-08-23-pickleball-platform-architecture-design.md)
**Backend liên quan:** [2026-08-26-revenue-reports-design.md](./2026-08-26-revenue-reports-design.md) (spec đã viết, **chưa hiện thực** — cần 1 plan backend chạy trước plan frontend của spec này, đúng trình tự đã dùng cho Courts/Bookings/Branches/Settings)
**Nguồn tham khảo UI:** [docs/spec/06-bao-cao-doanh-thu.md](../../spec/06-bao-cao-doanh-thu.md)

## 1. Mục tiêu & phạm vi

Trang "Doanh thu" cho owner tại `/owner/revenue` (thay `ComingSoon` hiện tại), hiện thực toàn bộ `06-bao-cao-doanh-thu.md` trên API mô tả trong backend spec: bộ lọc khoảng ngày, 4 thẻ số liệu tổng hợp, biểu đồ doanh thu theo ngày, bảng danh sách giao dịch, và xuất báo cáo ra file CSV.

Module này **chỉ đọc** — không có form tạo/sửa/xoá nào ở frontend.

## 2. Khác biệt so với tài liệu khảo sát gốc

- **Cột "Thanh toán" và "Trạng thái" gộp thành một cột "Trạng thái"** — tài liệu gốc liệt kê 2 cột riêng cho bảng giao dịch, nhưng theo định nghĩa nhất quán với Dashboard (backend spec §2), một "giao dịch" luôn là payment có `status='paid'` — API không bao giờ trả về giao dịch với trạng thái khác. Một cột "Trạng thái" duy nhất, badge xanh lá "Đã thanh toán", là đủ và tránh 2 cột trùng lặp thông tin.
- **Biểu đồ dùng loại đường (`LineChart`)**, khác với biểu đồ cột (`BarChart`) hiện có ở Dashboard (`revenue-chart.tsx`) — đúng chữ "biểu đồ đường" trong tài liệu gốc §3, đồng thời tách biệt trực quan giữa 2 trang.
- **Không có ô chọn chi nhánh riêng trong bộ lọc** (tài liệu gốc chỉ khảo sát 1 sân) — dùng chung bộ chuyển đổi chi nhánh toàn cục (`useBranch()`) ở sidebar, giống Dashboard/Bookings/Customers/Pricing.

## 3. Kiến trúc trang (`apps/web/src/app/owner/revenue/`)

Trang client component (`"use client"`), fetch qua route proxy `/api/*` (`fetchApi` → `toNextResponse`, cookie auth gắn phía server) — theo đúng mẫu `apps/web/src/app/api/dashboard/summary/route.ts`. Không gọi thẳng backend từ client.

**Next.js đã bị chỉnh sửa** trong repo này: trước khi viết route handler/trang, đọc hướng dẫn liên quan trong `apps/web/node_modules/next/dist/docs/` (theo cảnh báo `apps/web/AGENTS.md`).

### 3.1. `types.ts`

```ts
export interface RevenueSummary {
  currentPeriod: {
    revenue: number;
    transactionCount: number;
    avgPerTransaction: number;
  };
  previousPeriod: { revenue: number };
  changeAmount: number;
  changePercent: number | null;
  revenueByDay: { date: string; revenue: number }[];
  transactions: RevenueTransaction[];
}

export interface RevenueTransaction {
  id: string;
  transactionCode: string;
  customerName: string;
  customerPhone: string;
  paidAt: string;
  amount: number;
  status: "paid";
}
```

### 3.2. `revenue-format.ts`

Helper thuần, **có unit test** (mẫu `customer-format.test.ts`):

- `formatDateTime(value: string): string` — `paidAt` (ISO) → `dd/MM/yyyy HH:mm`.
- `formatMoney(value: number): string` — `Intl.NumberFormat("vi-VN")` + hậu tố ` đ`.
- `formatChangePercent(value: number | null): string` — `null` → `"N/A"`; ngược lại `"+25.0%"`/`"-10.0%"` (dấu `+` cho số dương, `%` với 1 chữ số thập phân).
- `defaultDateRange(): { from: string; to: string }` — trả về `{from, to}` dạng `YYYY-MM-DD` cho 30 ngày gần nhất tính đến hôm nay (`to` = hôm nay).

### 3.3. `revenue-filter-bar.tsx`

- 2 ô `<input type="date">` (Từ ngày / Đến ngày, mẫu `pricing-rule-form-dialog.tsx`), state cục bộ (draft) không tự áp dụng.
- Nút **"Lọc"** → gọi `onApply({from, to})` (page cập nhật state đã-áp-dụng, trigger fetch). Disable nếu thiếu 1 trong 2 ô hoặc `from > to` (hiện lỗi inline "Từ ngày phải trước Đến ngày").
- Nút **"Xuất báo cáo"** (góc phải) — xem §3.7, dùng khoảng ngày **đã áp dụng** (không phải draft).

### 3.4. `revenue-metrics.tsx`

4 thẻ theo mẫu `dashboard/stat-cards.tsx`:

- **Doanh thu kỳ này** (`currentPeriod.revenue`, `formatMoney`) — icon `Wallet`, kèm badge nhỏ `changePercent` (`formatChangePercent`, xanh lá nếu `changeAmount >= 0`, đỏ nếu âm).
- **Số giao dịch** (`currentPeriod.transactionCount`) — icon `Receipt`.
- **Trung bình/giao dịch** (`currentPeriod.avgPerTransaction`, `formatMoney`) — icon `TrendingUp`.
- **So kỳ trước** (`changeAmount`, `formatMoney` với dấu `+`/`-`) — icon `ArrowLeftRight`.

### 3.5. `revenue-line-chart.tsx`

`recharts` `LineChart` trên `revenueByDay` (mẫu cấu trúc `dashboard/revenue-chart.tsx` nhưng đổi `Bar`/`BarChart` → `Line`/`LineChart`, giữ nguyên trục X rút gọn `dd/MM`, trục Y + tooltip format tiền `vi-VN`). Trạng thái rỗng "Chưa có dữ liệu" khi mọi ngày `revenue = 0`.

### 3.6. `revenue-transactions-table.tsx`

Bảng (`components/ui/table`) với cột đúng `06-bao-cao-doanh-thu.md` (đã gộp theo §2):

| Cột | Nội dung |
|---|---|
| Mã GD | `transactionCode` |
| Khách hàng | `customerName` + `customerPhone` bên dưới (nhỏ, xám — mẫu `customer-table.tsx`) |
| Thời gian | `formatDateTime(paidAt)` |
| Số tiền | `formatMoney(amount)` |
| Trạng thái | badge xanh lá "Đã thanh toán" |

Header hiển thị tổng số giao dịch: "Danh sách giao dịch (N)". Không phân trang (backend trả toàn bộ theo kỳ — backend spec §6). Trạng thái rỗng: "Chưa có giao dịch nào".

### 3.7. Xuất báo cáo (CSV)

Nút "Xuất báo cáo" là thẻ `<a>` trỏ tới `/api/reports/revenue/export?venueId=&from=&to=` (query dựng từ cùng helper `buildRevenueQuery` dùng cho fetch chính), có `download` attribute không cần set (server đã gắn `Content-Disposition: attachment` qua route proxy §4). Không dùng `fetch` + `Blob` — điều hướng trình duyệt trực tiếp tới route proxy, cookie auth tự gửi kèm vì cùng origin.

### 3.8. `page.tsx`

State: `appliedRange: {from, to}` (khởi tạo bằng `defaultDateRange()`), `data: RevenueSummary | null`, `loading`, `error`.

- `useBranch()` → `selectedVenueId`; helper `buildRevenueQuery({venueId, from, to})` gắn `venueId` khi `!== ALL_BRANCHES_ID`.
- `useEffect` tải dữ liệu khi `venueId` hoặc `appliedRange` đổi (gọi `GET /api/reports/revenue`).
- 401 từ fetch → `router.push("/login?returnTo=%2Fowner%2Frevenue")` (giống Dashboard/Customers).
- Lỗi khác (không phải 401) → hiện khối lỗi nhẹ "Không tải được dữ liệu", giữ nguyên bộ lọc.
- Bố cục `<main>` chuẩn owner: tiêu đề "Doanh thu", rồi `RevenueFilterBar`, `RevenueMetrics`, `RevenueLineChart`, `RevenueTransactionsTable`.

## 4. Route proxy mới (`apps/web/src/app/api/reports/revenue/`)

| File | Method | Chuyển tiếp tới backend |
|---|---|---|
| `route.ts` | GET | `/reports/revenue` + nguyên query string (`venueId,from,to`), forwarder mỏng theo mẫu `dashboard/summary/route.ts` (`toNextResponse`), 401 → `clearAuthCookies()` |
| `export/route.ts` | GET | `/reports/revenue/export` + nguyên query string — **không dùng `toNextResponse`** (giả định JSON). Đọc `upstream.arrayBuffer()`, trả `new NextResponse(buffer, { status, headers: { "Content-Type": upstream.headers.get("Content-Type") ?? "text/csv", "Content-Disposition": upstream.headers.get("Content-Disposition") ?? "attachment" } })`. 401 → `clearAuthCookies()` rồi trả lỗi JSON thường (không có file để trả) |

## 5. Validation & lỗi (phía UI)

- Thiếu `from`/`to` hoặc `from > to` → chặn nút "Lọc", không gọi API (validate trước khi gửi, khớp `400` phía backend).
- Fetch chính lỗi (không phải 401) → khối lỗi nhẹ, không vỡ layout, giữ nguyên số liệu cũ trên màn hình nếu có (không xoá về rỗng khi đang loading lại).
- `changePercent = null` → hiển thị "N/A", không `NaN`/`Infinity`.
- Owner chưa có venue/giao dịch nào trong kỳ → trang vẫn render bình thường với số liệu 0, biểu đồ rỗng, bảng "Chưa có giao dịch nào" (backend đã đảm bảo không lỗi — spec backend §5).

## 6. Testing

- **Unit (vitest, mẫu `*-format.test.ts` sẵn có):**
  - `formatDateTime` — ISO → `dd/MM/yyyy HH:mm`.
  - `formatMoney` — số → chuỗi `… đ` đúng định dạng `vi-VN`.
  - `formatChangePercent` — `null` → `"N/A"`; số dương/âm → có dấu, 1 chữ số thập phân.
  - `defaultDateRange` — trả đúng khoảng 30 ngày kết thúc hôm nay (mock `Date`).
  - `buildRevenueQuery` — bỏ `venueId` khi all-branches, luôn có `from`/`to`.
- **UI (thủ công qua skill `run`/`verify`):** repo chưa có harness test component. Kịch bản kiểm chứng: tải trang (mặc định 30 ngày) → đổi khoảng ngày, bấm Lọc → số liệu/biểu đồ/bảng cập nhật → đổi chi nhánh ở bộ chuyển đổi toàn cục → cập nhật lại → bấm "Xuất báo cáo" → file CSV tải về đúng dữ liệu đang hiển thị → thử khoảng ngày không có giao dịch → thấy trạng thái rỗng đúng.

## 7. Ngoài phạm vi

- Xuất PDF/Excel định dạng đẹp — chỉ CSV thô, đúng backend spec §6.
- Phân trang bảng giao dịch — backend trả toàn bộ ở MVP.
- Bộ lọc theo phương thức thanh toán — schema hiện tại không có khái niệm này (backend spec §6).
- Lưu/so sánh nhiều kỳ cùng lúc (chỉ kỳ hiện tại vs kỳ liền trước, theo đúng response backend).
- Biểu đồ tương tác nâng cao (zoom, export ảnh biểu đồ).
