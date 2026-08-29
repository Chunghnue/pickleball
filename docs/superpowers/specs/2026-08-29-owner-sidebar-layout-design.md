# Module: Owner — Sidebar Layout — Thiết kế chi tiết

**Ngày:** 2026-08-29
**Trạng thái:** Đã duyệt
**Thuộc kiến trúc tổng thể:** [2026-08-23-pickleball-platform-architecture-design.md](./2026-08-23-pickleball-platform-architecture-design.md)
**Cùng mẫu với:** [2026-08-29-admin-sidebar-layout-design.md](./2026-08-29-admin-sidebar-layout-design.md) (sidebar admin đã triển khai — component/layout structure giống hệt, chỉ khác nội dung menu).
**Nguồn tham khảo nội dung menu:** [docs/spec/00-tong-quan.md](../../spec/00-tong-quan.md) (khảo sát sidebar sanbong.vn thực tế) — dùng để chọn tên/nhóm mục menu cho các trang chưa xây, không suy diễn logic nghiệp vụ của các trang đó.

## 1. Mục tiêu

Đổi layout khu vực `/owner/*` sang 2 cột giống `/admin/*`: sidebar trái (điều hướng + đăng xuất), nội dung bên phải. Khác với admin (3 trang cấp cao đã tồn tại song song), `/owner` hiện chỉ có **1 trang thật** ("Sân của tôi") — sidebar sẽ **thêm sẵn các mục menu cho tính năng tương lai** theo đúng nhóm/tên trong tài liệu khảo sát sanbong.vn, mỗi mục dẫn tới một trang **"Sắp ra mắt"** (không phải trang chức năng thật) để tránh 404 mà không hứa hẹn tính năng chưa xây.

## 2. Vấn đề hiện tại (lý do đổi)

- Không có layout/sidebar dùng chung cho `/owner/*`.
- `owner/page.tsx` và `owner/venues/[id]/page.tsx` mỗi trang tự viết riêng hàm `handleLogout` + nút "Đăng xuất" — cùng kiểu trùng lặp mà sidebar admin đã khắc phục.

## 3. Danh sách menu

| Nhóm | Mục | Route | Trạng thái |
|---|---|---|---|
| Quản lý sân | Sân của tôi | `/owner` | **Thật** (trang hiện có, không đổi nội dung) |
| Quản lý sân | Đặt lịch | `/owner/bookings` | Sắp ra mắt |
| Quản lý sân | Khách hàng | `/owner/customers` | Sắp ra mắt |
| Quản lý sân | Bảng giá | `/owner/pricing` | Sắp ra mắt |
| Báo cáo | Doanh thu | `/owner/revenue` | Sắp ra mắt |
| Báo cáo | Lượt xem trang | `/owner/page-views` | Sắp ra mắt |
| Hệ thống | Tài khoản | `/owner/accounts` | Sắp ra mắt |
| Hệ thống | Cài đặt | `/owner/settings` | Sắp ra mắt |

**Không đưa vào:** mục "Chi nhánh" (bộ chọn chi nhánh) trong tài liệu gốc — đó là dropdown chuyển đổi ngữ cảnh, không phải mục điều hướng sang trang khác; trang "Sân của tôi" hiện có đã đóng vai trò danh sách chi nhánh/venue. Mục "Tổng quan" gốc được gộp vào "Sân của tôi" vì app chưa có dashboard số liệu riêng — không tạo thêm trang trùng lặp.

## 4. Component

**`apps/web/src/components/owner-sidebar.tsx`** (`"use client"`, cùng khung với `AdminSidebar` đã có ở [admin-sidebar-layout-design.md](./2026-08-29-admin-sidebar-layout-design.md) §3):

- Cột dọc, width cố định (`w-56`), border phải, không thu gọn/responsive (nhất quán quyết định đã chốt ở sidebar admin).
- **Đầu:** nhãn "Quản trị chủ sân".
- **Giữa:** danh sách menu ở §3, chia 3 nhóm có label nhóm riêng (khác `AdminSidebar` — sidebar admin là danh sách phẳng vì chỉ có 3 mục không cần nhóm). Active route tô nền, dùng `usePathname` như `AdminSidebar`.
- **Cuối:** nút "Đăng xuất", logic giống hệt `AdminSidebar` (`POST /api/auth/logout` rồi `window.location.href = "/login"`).

**`apps/web/src/app/owner/layout.tsx`** — cấu trúc giống hệt `apps/web/src/app/admin/layout.tsx`, chỉ đổi sang dùng `OwnerSidebar`.

**`apps/web/src/components/coming-soon.tsx`** (component dùng chung cho mọi trang "Sắp ra mắt", tránh lặp code 7 lần):

```tsx
export function ComingSoon({ title }: { title: string }) {
  return (
    <main className="mx-auto flex max-w-2xl flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="text-muted-foreground">Tính năng đang được phát triển, sẽ sớm ra mắt.</p>
    </main>
  );
}
```

7 trang stub ở §3 (mỗi route 1 file `page.tsx`) chỉ import và render `<ComingSoon title="..." />` với tiêu đề tương ứng.

## 5. Sửa 2 trang thật hiện có

`owner/page.tsx`, `owner/venues/[id]/page.tsx`: bỏ hàm `handleLogout` và nút "Đăng xuất" riêng trong phần header của từng trang (đã chuyển vào sidebar). Giữ nguyên toàn bộ nội dung/logic khác. `owner/venues/new/page.tsx` không cần sửa — trang này chưa từng có nút đăng xuất riêng.

## 6. Ngoài phạm vi

- Xây dựng thật bất kỳ tính năng nào trong 7 mục "Sắp ra mắt" (Đặt lịch dạng lưới, Khách hàng, Bảng giá, Báo cáo doanh thu, Lượt xem trang, Tài khoản nhân viên, Cài đặt) — mỗi mục là một module riêng, cần spec riêng nếu triển khai thật (một số đã có spec nháp: [Pricing](../superpowers/specs/2026-08-26-pricing-and-recurring-schedules-design.md), [Revenue Reports](../superpowers/specs/2026-08-26-revenue-reports-design.md), [Page View Analytics](../superpowers/specs/2026-08-26-page-view-analytics-design.md), [Customers](../superpowers/specs/2026-08-26-customers-module-design.md), [Settings](../superpowers/specs/2026-08-26-settings-design.md), [Staff Accounts](../superpowers/specs/2026-08-26-staff-accounts-design.md) — chưa có code).
- Sidebar responsive/thu gọn — giữ nguyên quyết định đã chốt ở sidebar admin (YAGNI).
- Bộ chọn chi nhánh (venue switcher) dạng dropdown trong sidebar — chưa cần vì trang "Sân của tôi" đã liệt kê đủ venue.

## 7. Testing

- **Manual/browser:** đăng nhập chủ sân, xác nhận sidebar hiển thị ở mọi trang `/owner/*` (kể cả 7 trang stub và trang chi tiết venue), mục active tô nền đúng, "Đăng xuất" có mặt và hoạt động ở mọi trang, click từng mục "Sắp ra mắt" không bị 404.
- Không cần unit/e2e test mới — thay đổi thuần UI/layout, nhất quán với cách sidebar admin đã làm.
