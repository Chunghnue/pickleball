# Dashboard — Visual Refresh (bar chart, donut chart, bảng lịch đặt) — Thiết kế chi tiết

**Ngày:** 2026-08-30
**Trạng thái:** Đã duyệt
**Thuộc kiến trúc tổng thể:** [2026-08-23-pickleball-platform-architecture-design.md](./2026-08-23-pickleball-platform-architecture-design.md)
**Nguồn tham khảo:** Ảnh chụp màn hình Dashboard sanbong.vn do người dùng cung cấp (khớp `docs/spec/01-dashboard.md`).
**Sửa đổi/đảo ngược quyết định trước đó:**
- [2026-08-30-dashboard-frontend-design.md](./2026-08-30-dashboard-frontend-design.md) §6.4 — trước đây chọn `LineChart` cho biểu đồ doanh thu; spec này đổi sang `BarChart`.
- [2026-08-30-dashboard-frontend-design.md](./2026-08-30-dashboard-frontend-design.md) §6.5 — trước đây chọn horizontal `BarChart` cho doanh thu theo sân; spec này đổi sang donut (`PieChart` với `innerRadius`).
- [2026-08-30-dashboard-frontend-design.md](./2026-08-30-dashboard-frontend-design.md) §6.6 và §8 — trước đây quyết định **không** thêm component `Table` (dùng card-list); spec này đảo ngược, thêm `Table` primitive dùng riêng cho danh sách đặt lịch gần nhất.

Các phần không nhắc tới bên dưới (API, data fetching, loading/401, quick-actions targets, testing convention) giữ nguyên như đã duyệt ở spec gốc.

## 1. Mục tiêu

Đổi giao diện trang `/owner/dashboard` cho giống ảnh mẫu: card số liệu có icon màu, biểu đồ doanh thu dạng cột, biểu đồ doanh thu theo sân dạng donut, danh sách đặt lịch gần nhất hiển thị dạng bảng thật — trong khi vẫn giữ nguyên toàn bộ nguồn dữ liệu (`GET /dashboard/summary`), không đổi API.

## 2. Nền trang & bố cục

`<main>` trong `apps/web/src/app/owner/dashboard/page.tsx` thêm class `bg-muted/30` (token Tailwind có sẵn, không hardcode màu mới) để nền trang tách biệt khỏi các card trắng, đúng tinh thần ảnh.

Hai biểu đồ (doanh thu, doanh thu theo sân) hiện đang xếp chồng dọc full-width — đổi sang lưới 2 cột `grid gap-4 lg:grid-cols-2` (giống ảnh, xếp dọc lại ở màn hình nhỏ hơn `lg`).

## 3. Header & quick actions

- Lời chào thêm emoji 👋 sau dấu `!` — `{getGreeting(new Date())} 👋`.
- Nút "Đặt sân mới" thêm icon `Plus` (`lucide-react`, đã có sẵn trong deps) trước label.
- 5 quick-action link (`page.tsx`, mảng `QUICK_ACTIONS`) đổi từ text-only sang có icon: `MapPin` (Quản lý sân), `CalendarPlus` (Tạo lịch đặt), `UserPlus` (Thêm khách), `BarChart3` (Báo cáo), `Settings` (Cài đặt). Giữ nguyên `href`, chỉ thêm icon.

## 4. Stat cards (`stat-cards.tsx`)

Mỗi card thêm icon badge hình vuông bo góc (`size-10 rounded-lg`) bên trái label/value, dùng cặp màu nền nhạt/chữ đậm + biến thể `dark:` theo đúng pattern đã dùng ở trạng thái active của `owner-sidebar.tsx` (`bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400`):

| Card | Icon | Màu (light / dark) |
|---|---|---|
| Đơn đặt hôm nay | `CalendarCheck` | `bg-blue-50 text-blue-600` / `dark:bg-blue-950/40 dark:text-blue-400` |
| Doanh thu hôm nay | `Wallet` | `bg-green-50 text-green-600` / `dark:bg-green-950/40 dark:text-green-400` |
| Sân hoạt động | `MapPin` | `bg-amber-50 text-amber-600` / `dark:bg-amber-950/40 dark:text-amber-400` |
| Khách mới tháng này | `Users` | `bg-pink-50 text-pink-600` / `dark:bg-pink-950/40 dark:text-pink-400` |

Layout mỗi card đổi từ `CardHeader`+`CardContent` xếp dọc sang `CardContent` một hàng ngang: icon badge bên trái, label nhỏ + value lớn xếp dọc bên phải.

## 5. Biểu đồ Doanh thu (`revenue-chart.tsx`)

Đổi `LineChart`/`Line` (recharts) sang `BarChart`/`Bar`: mỗi ngày trong `revenueByDay` là 1 cột màu `#2563eb`, `radius={[4, 4, 0, 0]}` (bo góc trên). Trục X/Y, tooltip, và logic empty-state "Chưa có dữ liệu" khi toàn bộ 30 ngày đều 0 giữ nguyên như bản đã duyệt trước — chỉ đổi loại mark từ đường sang cột.

`CardTitle` thêm icon `BarChart3` (`lucide-react`) trước label, khớp ảnh mẫu (mọi tiêu đề card trong ảnh đều có icon nhỏ đứng trước — xem thêm §6, §7.2).

## 6. Doanh thu theo sân (`court-revenue-chart.tsx`)

Đổi từ `BarChart layout="vertical"` sang `PieChart` với `Pie` (`innerRadius` để tạo donut, ví dụ `innerRadius={50} outerRadius={80}`). Mỗi sân trong `revenueByCourt` là 1 lát, màu lấy tuần tự từ palette cố định (lặp lại nếu nhiều hơn 5 sân):

```ts
const COURT_COLORS = ["#2563eb", "#16a34a", "#f59e0b", "#db2777", "#0891b2"];
```

Legend hiển thị bên dưới biểu đồ: chấm tròn màu tương ứng + tên sân (không dùng `<Legend>` tự động của recharts — tự render bằng `revenueByCourt.map()` để kiểm soát style khớp ảnh, giống cách `admin/stats` từng tự vẽ bar thay vì dùng component có sẵn). Giữ nguyên hành vi ẩn cả card khi `revenueByCourt` rỗng (đã duyệt trước đó).

`CardTitle` thêm icon `PieChart` từ `lucide-react` trước label (khác với component `PieChart` của recharts đã import trong cùng file — cần alias import để tránh trùng tên, ví dụ `import { PieChart as PieChartIcon } from "lucide-react"`).

## 7. Bảng "Lịch đặt gần nhất"

### 7.1 Component `Table` mới

Thêm `apps/web/src/components/ui/table.tsx` — primitive thuần Tailwind (không thêm thư viện ngoài), theo đúng phong cách các file khác trong `components/ui/` (function component + `cn()` + `data-slot`):

```tsx
Table, TableHeader, TableBody, TableRow, TableHead, TableCell
```

`Table` bọc ngoài bởi `<div className="overflow-x-auto">` (bảng có thể rộng hơn màn hình nhỏ). `TableHead` dùng style chữ hoa nhỏ màu `text-muted-foreground` (khớp "KHÁCH HÀNG", "SÂN"... trong ảnh). Component này **dùng chung được cho các module khác sau này** (Bookings, Customers...) — không giới hạn riêng cho Dashboard, nhưng phạm vi đợt này chỉ wiring nó vào `recent-bookings.tsx`.

### 7.2 `recent-bookings.tsx` viết lại dùng `Table`

`CardTitle` thêm icon `Clock` (`lucide-react`) trước label "Lịch đặt gần nhất", khớp ảnh mẫu.

5 cột: KHÁCH HÀNG (tên đậm + SĐT xám dưới), SÂN (chấm tròn nhỏ màu + tên sân — dùng chung `COURT_COLORS`/logic màu với biểu đồ donut ở §6 nếu cùng `courtId`, nhưng vì component này không có props `courts` đầy đủ như `court-revenue-chart.tsx`, dùng hash đơn giản từ `courtName` để chọn màu nhất quán trong danh sách, không cần khớp chính xác màu ở donut chart — 2 biểu đồ độc lập), THỜI GIAN (`startTime`–`endTime`), GIÁ (đậm, căn phải), TRẠNG THÁI (badge bo tròn, nền theo trạng thái).

Giữ nguyên nhãn trạng thái tiếng Việt đã có (`STATUS_LABEL` export từ `bookings-section.tsx`: "Đã xác nhận"/"Đã huỷ"/"Hoàn thành") — **không** đổi thành "Đã đặt" như trong ảnh, để nhất quán với thuật ngữ đã dùng ở màn hình quản lý booking thật (`bookings-section.tsx`). Badge màu: `confirmed` → xanh dương, `cancelled` → đỏ/destructive, `completed` → xanh lá (dùng token `bg-*-50 text-*-700 dark:bg-*-950/40 dark:text-*-400` nhất quán với §4).

Nút "Xem tất cả" giữ nguyên vị trí/hành vi (→ `/owner/bookings`), chỉ dời từ cuối danh sách card lên góc phải `CardHeader` (khớp ảnh — cùng hàng với tiêu đề "Lịch đặt gần nhất").

Rỗng (`recentBookings.length === 0`) → giữ nguyên thông báo "Chưa có lịch đặt nào." (hiện trong `<TableBody>` dạng 1 hàng `colSpan` thay vì đoạn text rời, để không vỡ layout bảng).

## 8. Không đổi (giữ nguyên từ spec gốc)

- API, data fetching, loading/401 handling (§2, §5 spec gốc).
- Phạm vi venue (luôn tổng hợp tất cả, không venue-switcher) (§3 spec gốc).
- Testing convention — không viết test cho component/page (§7 spec gốc); `greeting.ts` giữ nguyên, không đổi.
- Nút nổi "Tin nhắn" trong ảnh — **ngoài phạm vi**, thuộc module Chat Inbox riêng chưa xây ([2026-08-26-chat-inbox-design.md](./2026-08-26-chat-inbox-design.md)), không thêm ở đợt này.

## 9. Testing

Không có test tự động mới (đúng convention đã có — chỉ test logic thuần, phần này thuần UI/styling). Verify bằng tay qua trình duyệt sau khi implement, đối chiếu trực tiếp với ảnh mẫu, cả light/dark mode.
