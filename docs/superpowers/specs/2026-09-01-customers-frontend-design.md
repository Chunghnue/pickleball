# Module: Customers Frontend (Khách hàng) — Thiết kế chi tiết

**Ngày:** 2026-09-01
**Trạng thái:** Chờ review
**Thuộc kiến trúc tổng thể:** [2026-08-23-pickleball-platform-architecture-design.md](./2026-08-23-pickleball-platform-architecture-design.md)
**Backend liên quan:** [2026-08-26-customers-module-design.md](./2026-08-26-customers-module-design.md) (API đã hiện thực), plan [2026-09-01-customers-module-backend.md](../plans/2026-09-01-customers-module-backend.md)
**Nguồn tham khảo UI:** [docs/spec/04-khach-hang.md](../../spec/04-khach-hang.md)

## 1. Mục tiêu

Màn "Khách hàng" cho owner tại `/owner/customers` (thay `ComingSoon` hiện tại), hiện thực toàn bộ `04-khach-hang.md` trên API Customers đã có: 4 thẻ số liệu, tab lọc nhanh theo tier, ô tìm kiếm, bảng danh sách phân trang, dialog "Thêm khách", và modal chi tiết có nút "Đặt sân cho khách này" hoạt động thật (mở dialog đặt nhanh đã prefill khách).

Phạm vi venue dùng bộ chọn chi nhánh toàn cục (`useBranch()`), giống Dashboard/Bookings: chọn một chi nhánh → truyền `venueId`; chọn "Tất cả chi nhánh" (`ALL_BRANCHES_ID`) → không truyền `venueId` (tổng hợp mọi venue).

## 2. Kiến trúc & quy ước (theo codebase hiện có)

- Trang là **client component** (`"use client"`), fetch từ các route proxy `/api/*` (Next route handler dùng `fetchApi` → `toNextResponse`, đã gắn cookie auth phía server). KHÔNG gọi thẳng backend từ client.
- UI: component shadcn có sẵn (`Card`, `Button`, `Input`, `Label`, `Dialog`, `Table`), icon `lucide-react`, toast `sonner`, tiền tệ `Intl.NumberFormat("vi-VN")`, nhãn tiếng Việt.
- **Next.js đã bị chỉnh sửa** trong repo này: trước khi viết route handler / trang, ĐỌC hướng dẫn liên quan trong `apps/web/node_modules/next/dist/docs/` (theo cảnh báo `apps/web/AGENTS.md`).

## 3. Route proxy mới (`apps/web/src/app/api/`)

Đều là forwarder mỏng theo đúng mẫu `app/api/dashboard/summary/route.ts`:

| File | Method | Chuyển tiếp tới backend |
|---|---|---|
| `customers/route.ts` | GET | `/customers` + nguyên query string (`venueId,tier,search,page,pageSize`) |
| `customers/summary/route.ts` | GET | `/customers/summary` + `venueId` |
| `customers/[kind]/[id]/route.ts` | GET | `/customers/:kind/:id` |
| `customer-contacts/route.ts` | POST | `/customer-contacts` (body JSON), 401 → `clearAuthCookies()` như mẫu `bookings/route.ts` |

GET list/summary phải đọc query từ `request.nextUrl.searchParams` và gắn lại vào URL backend. Với `[kind]/[id]`, lấy param từ context params (theo cú pháp Next hiện hành — kiểm tra docs local vì params có thể là Promise).

## 4. Component (`apps/web/src/app/owner/customers/`)

### 4.1. `types.ts`
```ts
export type CustomerKind = "registered" | "walkin";
export type CustomerTier = "new" | "regular" | "vip";

export interface CustomerListItem {
  kind: CustomerKind;
  id: string;
  fullName: string;
  phone: string | null;
  totalBookings: number;
  totalSpent: number;
  lastBookingAt: string | null; // 'YYYY-MM-DD'
  tier: CustomerTier;
  customerCode: string;
}
export interface CustomerListResponse {
  items: CustomerListItem[];
  total: number;
  page: number;
  pageSize: number;
}
export interface CustomerSummary {
  totalCustomers: number;
  vipCustomers: number;
  totalBookings: number;
  totalSpent: number;
}
export interface CustomerDetail extends CustomerListItem {
  email?: string;
  address?: string;
  note?: string;
  joinedAt: string;
}
```

### 4.2. `tier-badge.tsx`
Ánh xạ tier → nhãn + màu (badge nhỏ). Đây là helper thuần, **có unit test**:
- `new` → "Mới", xám/xanh dương (`bg-blue-50 text-blue-600 ...`)
- `regular` → "Thường xuyên", xanh lá (`bg-green-50 text-green-600 ...`)
- `vip` → "VIP", hổ phách (`bg-amber-50 text-amber-600 ...`)

Tách hàm thuần `tierLabel(tier)` và `tierClasses(tier)` để test.

### 4.3. `customer-metrics.tsx`
4 thẻ theo mẫu `dashboard/stat-cards.tsx` (icon trong ô bo góc + label + value). Nguồn: `CustomerSummary`.
- Tổng khách (`totalCustomers`) — icon `Users`
- Khách VIP (`vipCustomers`) — icon `Crown`/`Star`
- Tổng lượt đặt (`totalBookings`) — icon `CalendarCheck`
- Tổng doanh thu (`totalSpent`, format `… đ`) — icon `Wallet`

Vì lấy từ `/customers/summary` (chỉ phụ thuộc `venueId`), 4 thẻ **không đổi** khi người dùng đổi tab/tìm kiếm/phân trang.

### 4.4. `customer-filters.tsx`
- Hàng tab: **Tất cả / VIP / Thường xuyên / Mới** (map sang `tier=all|vip|regular|new`), tab đang chọn tô đậm.
- Ô tìm kiếm (icon kính lúp) — bind vào state search ở page (page tự debounce ~300ms trước khi fetch).

### 4.5. `customer-table.tsx`
Bảng (dùng `components/ui/table`) với cột đúng `04-khach-hang.md`:

| Cột | Nội dung |
|---|---|
| # | STT theo trang: `(page-1)*pageSize + index + 1` |
| Khách hàng | avatar chữ cái đầu (`avatarInitials(fullName)`, helper thuần có test) + họ tên |
| SĐT | `phone` (— nếu null) |
| Lượt đặt | `totalBookings` |
| Tổng tiền | `totalSpent` → `… đ` |
| Lần cuối | `lastBookingAt` format `dd/MM/yyyy`, "—" nếu null |
| Loại | `<TierBadge tier=… />` |
| Thao tác | nút icon con mắt → mở modal chi tiết |

Footer phân trang: "Hiển thị X–Y / total" + nút Trước/Sau (disable ở biên). Trạng thái rỗng: "Chưa có khách hàng nào".

### 4.6. `add-customer-dialog.tsx`
Nút "+ Thêm khách" ở page mở dialog form:

| Trường | Bắt buộc | Field body |
|---|---|---|
| Họ và tên | ✓ | `fullName` |
| Số điện thoại | ✓ | `phone` |
| Email | | `email` |
| Địa chỉ | | `address` |
| Ghi chú | | `note` |

Submit → `POST /api/customer-contacts`. Thành công → toast "Đã thêm khách hàng", đóng dialog, gọi `onCreated()` để page tải lại list + summary. Lỗi 409 → hiển thị inline "Số điện thoại đã tồn tại" (dùng `getSubmitErrorMessage`). Thiếu trường bắt buộc → toast lỗi (giống QuickBookDialog).

### 4.7. `customer-detail-dialog.tsx`
Mở khi bấm con mắt: fetch `GET /api/customers/{kind}/{id}` (hiển thị "Đang tải..." trong lúc chờ). Nội dung:
- Header: avatar, tên, `<TierBadge>`, SĐT.
- Số liệu: **Lượt đặt** (`totalBookings`), **Tổng chi tiêu** (`totalSpent`).
- **Lần đặt cuối** (`lastBookingAt`), **Mã KH** (`customerCode`), **Ngày tham gia** (`joinedAt` → `dd/MM/yyyy`).
- Ghi chú (`note`) nếu có.
- Nút **"Đặt sân cho khách này"** → gọi `onBookForCustomer(customer)` (page xử lý, xem §5), rồi đóng modal chi tiết.
- Nút **"Đóng"**.

### 4.8. `page.tsx`
State: `tier` (mặc định `all`), `search` (+ debounce), `page` (mặc định 1), `summary`, `list`, `detailTarget: {kind,id} | null`, `addOpen`, và state cho luồng đặt sân (§5).
- `useBranch()` → `selectedVenueId`; helper `buildQuery()` gắn `venueId` khi `!== ALL_BRANCHES_ID`, cộng `tier` (bỏ khi `all`), `search`, `page`, `pageSize=20`.
- `useEffect` tải summary khi `venueId` đổi; tải list khi `venueId|tier|search|page` đổi. Đổi tier/search → reset `page=1`.
- 401 từ fetch → `router.push("/login?returnTo=%2Fowner%2Fcustomers")` (giống dashboard).
- Bố cục `<main>` theo mẫu owner: tiêu đề "Khách hàng" + nút "+ Thêm khách" (phải), rồi metrics, filters, table.

## 5. Luồng "Đặt sân cho khách này" (prefill)

Mở rộng `apps/web/src/app/owner/bookings/quick-book-dialog.tsx` bằng props tùy chọn (dùng ở calendar **không đổi**):

- `prefillCustomer?: { kind: CustomerKind; id: string; fullName: string; phone: string }`
  - Khi có: ô Tên & SĐT hiển thị **read-only** (giá trị khách), KHÔNG cho sửa.
  - Khi submit: thay vì `newCustomer`, gửi `customerId: id` (nếu `kind==='registered'`) hoặc `customerContactId: id` (nếu `kind==='walkin'`).
- `editableDate?: boolean` (chế độ standalone, mở ngoài calendar)
  - Khi `true`: render `<input type="date">` (mặc định hôm nay) và dùng giá trị này làm `date` khi submit, thay cho prop `date` cố định.

**Xử lý ở `page.tsx` khách hàng** khi `onBookForCustomer(customer)`:
1. Resolve `venueId`: nếu đang chọn 1 chi nhánh → dùng nó; nếu "Tất cả chi nhánh" → mặc định venue đầu tiên (tải `/api/venues/mine` nếu chưa có).
2. Nếu owner có **>1 venue** ở chế độ standalone: hiển thị `<select>` venue trong dialog (thêm prop `venues?` + `onVenueChange?` cho QuickBookDialog, chỉ render khi `editableDate` và có nhiều venue). Khi đổi venue → tải lại courts.
3. Tải courts venue đó (`/api/venues/mine/{venueId}/courts`), truyền vào QuickBookDialog cùng `prefillCustomer`, `editableDate: true`, `date=hôm nay`.
4. `onCreated` → toast "Đã tạo lịch đặt sân" (dialog tự toast), đóng dialog, tải lại list/summary (số Lượt đặt/Tổng tiền của khách cập nhật).

Backend đã hỗ trợ đủ: `POST /venues/mine/:venueId/bookings` nhận `customerId | customerContactId | newCustomer`.

## 6. Validation & lỗi (phía UI)

- Fetch list/summary/detail lỗi (không phải 401) → hiển thị trạng thái lỗi nhẹ ("Không tải được dữ liệu") + không vỡ layout.
- `search` khoảng trắng → không gửi (trim); rỗng → bỏ param.
- `page` không vượt quá số trang (tính từ `total/pageSize`); nút Sau disable khi `page*pageSize >= total`.
- Thêm khách thiếu Họ tên/SĐT → chặn submit, báo lỗi; 409 → thông báo trùng SĐT.

## 7. Testing

- **Unit (vitest, theo mẫu `*.test.ts` sẵn có trong `apps/web/src/lib`):** các helper thuần:
  - `avatarInitials(fullName)` — lấy chữ cái đầu (1–2 ký tự), hoa.
  - `tierLabel`/`tierClasses` — ánh xạ tier đúng nhãn/màu.
  - `buildCustomersQuery({venueId,tier,search,page})` — bỏ `venueId` khi all-branches, bỏ `tier=all`, trim/bỏ search rỗng, luôn có `pageSize`.
  - format ngày `dd/MM/yyyy` cho `lastBookingAt`/`joinedAt` (nếu chưa có tiện ích tái dùng ở `lib/format-datetime`).
- **UI (thủ công qua skill `run`/`verify`):** repo chưa có harness test component. Kịch bản kiểm chứng: tải danh sách → lọc tab VIP/Mới → tìm theo SĐT → phân trang → thêm khách mới (thấy xuất hiện) → mở chi tiết → "Đặt sân cho khách này" tạo booking thành công → số liệu khách cập nhật.

## 8. Ngoài phạm vi

- Sửa/xoá khách (`customer_contacts`) — backend chưa có (spec backend §8); chỉ Thêm + Xem.
- Xuất danh sách, sắp xếp cột tùy chọn, lọc nâng cao.
- Hiển thị lịch sử từng booking trong modal chi tiết (chỉ số liệu tổng hợp + nút đặt sân).
- Gắn nhãn VIP thủ công (tier tự động từ backend).
- Test component tự động (chưa có harness); dựa vào unit test helper + kiểm chứng thủ công.
