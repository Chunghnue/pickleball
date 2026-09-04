# Dashboard Frontend — Thiết kế chi tiết

**Ngày:** 2026-08-30
**Trạng thái:** Đã duyệt
**Thuộc kiến trúc tổng thể:** [2026-08-23-pickleball-platform-architecture-design.md](./2026-08-23-pickleball-platform-architecture-design.md)
**Xây trên API đã có:** [2026-08-25-dashboard-design.md](./2026-08-25-dashboard-design.md)
**Nguồn tham khảo:** [docs/spec/01-dashboard.md](../../spec/01-dashboard.md) (khảo sát UI sanbong.vn thực tế)

## 1. Mục tiêu

Thay trang stub `ComingSoon` tại `/owner/dashboard` (link đã có sẵn ở `OwnerSidebar`) bằng trang Dashboard thật, hiển thị dữ liệu từ `GET /dashboard/summary` đã build ở backend: lời chào + quick actions, 4 stat card, biểu đồ doanh thu 30 ngày, biểu đồ doanh thu theo sân, danh sách đặt lịch gần nhất.

## 2. Kiến trúc: BFF qua Next.js Route Handlers

Giữ nguyên mô hình đã có (xem [2026-08-24-auth-users-frontend-design.md](./2026-08-24-auth-users-frontend-design.md) mục 2): trình duyệt không gọi thẳng NestJS. Thêm 1 route handler proxy 1-1:

```
GET /api/dashboard/summary -> GET /dashboard/summary
```

`apps/web/src/app/api/dashboard/summary/route.ts` — cùng pattern 1-liner với `apps/web/src/app/api/admin/stats/route.ts`: gọi `fetchApi('/dashboard/summary')` rồi `toNextResponse(upstream)`. Không truyền `venueId` — xem mục 3.

`/owner/*` đã được bảo vệ theo role `owner` qua `route-protection.ts` hiện có — không cần sửa `PROTECTED_PREFIXES`.

## 3. Phạm vi venue: luôn tổng hợp tất cả

~~API hỗ trợ `?venueId=` để lọc theo 1 venue, nhưng `BranchSwitcher` hiện tại... không lưu vào URL/context/localStorage nào để trang khác đọc lại. Vì vậy Dashboard không wiring theo `BranchSwitcher`...~~

**Cập nhật 2026-09-04:** Đảo lại — module Chi nhánh (từ 2026-09-02) đã thay `BranchSwitcher` cục bộ bằng `useBranch()`/`BranchProvider` toàn cục (`apps/web/src/lib/branch-context.tsx`), dùng chung ở Bookings/Customers/Pricing/Revenue Reports. Dashboard được build **trước** khi wiring này tồn tại và chưa từng được cập nhật theo — đây là lỗi bỏ sót, không phải quyết định có chủ đích còn hiệu lực. Dashboard giờ **có** dùng `useBranch()` giống các trang khác: `venueId` gắn vào query khi `selectedVenueId !== ALL_BRANCHES_ID`, refetch khi đổi chi nhánh. `apps/web/src/app/api/dashboard/summary/route.ts` cũng sửa để forward query string (trước đây bỏ qua hoàn toàn, nên dù trang có gửi `venueId` thì route proxy vẫn không chuyển tiếp).

## 4. Cấu trúc file

Theo pattern colocated-section đã dùng ở `owner/venues/[id]/`, nhưng đơn giản hơn vì chỉ có **một** lần fetch (không có form/mutation nào ở trang này):

- `apps/web/src/app/owner/dashboard/page.tsx` — page shell: fetch 1 lần khi mount, lời chào theo giờ, quick-actions bar, xử lý loading/401, render các component con bằng props từ response.
- `apps/web/src/app/owner/dashboard/stat-cards.tsx` — 4 card số liệu, thuần presentational.
- `apps/web/src/app/owner/dashboard/revenue-chart.tsx` — line chart 30 ngày bằng `recharts`, có empty-state.
- `apps/web/src/app/owner/dashboard/court-revenue-chart.tsx` — horizontal bar chart doanh thu theo sân bằng `recharts`.
- `apps/web/src/app/owner/dashboard/recent-bookings.tsx` — danh sách card đặt lịch gần nhất.
- `apps/web/src/app/api/dashboard/summary/route.ts` — proxy route (mục 2).
- `apps/web/src/lib/greeting.ts` + `greeting.test.ts` — hàm thuần `getGreeting(now: Date): string` (mục 6).
- Thêm dependency `recharts` (bản mới nhất hỗ trợ React 19) vào `apps/web/package.json` — lần đầu tiên dự án có chart library thật (trước giờ chỉ có bar chart tự vẽ bằng CSS ở `/admin/stats`).

## 5. Data fetching, loading & lỗi

`page.tsx` là client component, fetch một lần khi mount — cùng pattern `apps/web/src/app/admin/stats/page.tsx`:

```tsx
useEffect(() => {
  async function load() {
    const response = await fetch("/api/dashboard/summary");
    if (response.status === 401) {
      router.push("/login?returnTo=%2Fowner%2Fdashboard");
      return;
    }
    const data = await response.json().catch(() => null);
    setSummary(data);
  }
  load();
}, [router]);
```

- `summary === null` → hiện "Đang tải..." — không phân biệt "đang tải" vs "lỗi" riêng (khớp mức độ đơn giản của `/admin/stats`, endpoint này read-only nên hiếm khi lỗi ngoài 401).
- Owner chưa có venue nào → backend đã trả về summary toàn số 0/mảng rỗng (không lỗi, xem spec backend mục 6) — trang hiển thị bình thường với số liệu 0, không cần empty-state riêng ở cấp trang (biểu đồ doanh thu có empty-state riêng, xem mục 6).

## 6. Bố cục & các phần hiển thị

1. **Header:** lời chào theo giờ hệ thống, qua `getGreeting(now)`:
   - `< 11h`: "Chào buổi sáng!"
   - `11h–13h`: "Chào buổi trưa!"
   - `13h–18h`: "Chào buổi chiều!"
   - `≥ 18h`: "Chào buổi tối!"

   Kèm nút **"Đặt sân mới"** góc phải → `/owner/bookings`.

2. **Thanh quick-actions** (5 nút, thuần tĩnh, không gọi API): Quản lý sân → `/owner`, Tạo lịch đặt → `/owner/bookings`, Thêm khách → `/owner/customers`, Báo cáo → `/owner/revenue`, Cài đặt → `/owner/settings`. Các trang đích này hiện vẫn là `ComingSoon` — giống hệt trải nghiệm hiện tại khi bấm menu `OwnerSidebar`, không phải hạn chế mới do Dashboard gây ra.

3. **4 stat card** (`stat-cards.tsx`, dùng `Card`/`CardHeader`/`CardTitle`/`CardContent` có sẵn):
   - Đơn đặt hôm nay: `todayBookingsCount`.
   - Doanh thu hôm nay: `todayRevenue`, format `Intl.NumberFormat("vi-VN")` + "đ".
   - Sân hoạt động: `courts.active/courts.total` (ví dụ "1/2").
   - Khách mới tháng này: `newCustomersThisMonth`.

4. **Biểu đồ doanh thu** (`revenue-chart.tsx`, `recharts` `LineChart`): trục X = `revenueByDay[].date` rút gọn `DD/MM` (đảo thứ tự từ chuỗi `YYYY-MM-DD`, ví dụ `` `${d.slice(8, 10)}/${d.slice(5, 7)}` ``, không cần hàm dùng chung), trục Y = revenue. Nếu **toàn bộ** 30 điểm đều = 0 → hiện "Chưa có dữ liệu" thay vì vẽ đường phẳng (khớp mục 3 của tài liệu khảo sát gốc).

5. **Biểu đồ doanh thu theo sân** (`court-revenue-chart.tsx`, `recharts` `BarChart layout="vertical"`): mỗi sân 1 thanh ngang, tên sân bên trái, thứ tự giảm dần theo revenue (backend đã trả sẵn thứ tự này — không sort lại ở frontend). `revenueByCourt` rỗng (owner chưa có sân nào) → ẩn cả card, không hiện biểu đồ trống.

6. **Đặt lịch gần nhất** (`recent-bookings.tsx`): danh sách card theo đúng style `bookings-section.tsx` (không dùng `<table>` — UI kit hiện tại chưa có component Table). Mỗi card: `customerName` · `customerPhone`, `courtName`, `date` · `startTime`–`endTime`, `totalPrice` (format tiền), trạng thái (map `confirmed`/`cancelled`/`completed` sang nhãn tiếng Việt, tái dùng đúng `STATUS_LABEL` đã định nghĩa trong `bookings-section.tsx`). Rỗng → "Chưa có lịch đặt nào." Nút **"Xem tất cả"** ở cuối → `/owner/bookings`.

Màu biểu đồ: `recharts` vẽ SVG, không nhận class `dark:` trực tiếp — dùng mã màu cố định `#2563eb` (cùng tông blue-600 đang dùng ở sidebar/trạng thái active) cho cả line chart và bar chart, đọc được ở cả 2 theme mà không cần logic đổi màu riêng.

## 7. Testing

Codebase hiện tại không có test cho page/component (`*.test.tsx`), chỉ test logic thuần ở `lib/*.test.ts`. Giữ nguyên quy ước:
- `apps/web/src/lib/greeting.ts` + `greeting.test.ts`: test 4 nhánh giờ ở mục 6, gồm cả biên giờ (10:59 vs 11:00, 12:59 vs 13:00, 17:59 vs 18:00).
- Format tiền và rút gọn ngày cho trục biểu đồ: quá đơn giản (1 dòng), viết inline trong component, không tách file/test riêng.
- Không viết test file cho `page.tsx` hay các component hiển thị — verify bằng tay qua trình duyệt sau khi implement (dùng skill `run`), khớp với cách `/admin/stats` đã triển khai.

## 8. Ngoài phạm vi

- ~~Bộ chọn chi nhánh (venue switcher) cho Dashboard~~ — **đã wiring, xem mục 3 (cập nhật 2026-09-04)**.
- Component UI kit `Table` mới — dùng card-list cho danh sách đặt lịch, đúng pattern đã có.
- Tuỳ chỉnh khoảng thời gian biểu đồ doanh thu (7 ngày/90 ngày/tuỳ chọn) — khớp phạm vi cố định 30 ngày của backend.
- State lỗi riêng biệt với state loading (ví dụ banner lỗi khi fetch thất bại ngoài 401) — khớp mức độ đơn giản hiện có ở `/admin/stats`.
- Trang đích của quick-actions/`"Xem tất cả"` hiện còn là `ComingSoon` (Bookings, Customers, Revenue, Settings) — không thuộc phạm vi thiết kế này, sẽ tự hết khi các module đó lần lượt được build.
