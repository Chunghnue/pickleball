# Module: Owner Sidebar — Visual Refresh (logo, branch switcher, menu match) — Thiết kế chi tiết

**Ngày:** 2026-08-29
**Trạng thái:** Chờ review
**Thuộc kiến trúc tổng thể:** [2026-08-23-pickleball-platform-architecture-design.md](./2026-08-23-pickleball-platform-architecture-design.md)
**Nguồn tham khảo:** Ảnh chụp màn hình sidebar sanbong.vn do người dùng cung cấp.
**Sửa đổi/đảo ngược quyết định trước đó:**
- [2026-08-29-owner-sidebar-layout-design.md](./2026-08-29-owner-sidebar-layout-design.md) §3 — trước đây **loại bỏ** bộ chọn chi nhánh và gộp "Tổng quan" vào "Sân của tôi"; spec này đưa cả 2 trở lại theo yêu cầu mới (xem §3, §4 bên dưới về giới hạn phạm vi).
- [2026-08-29-sidebar-collapse-design.md](./2026-08-29-sidebar-collapse-design.md) §6 — trước đây để dành khối logo thương hiệu cho "một đợt chỉnh sửa hình ảnh/branding sau"; **spec này chính là đợt đó**.
**Chỉ áp dụng cho `OwnerSidebar`** — `AdminSidebar` không đổi (ảnh mẫu là sidebar owner, admin có menu khác hẳn).

## 1. Mục tiêu

Đổi giao diện `OwnerSidebar` cho giống ảnh mẫu: thêm khối logo thương hiệu ở đầu, thêm bộ chọn chi nhánh thật (mở dialog chọn giữa "Tất cả chi nhánh" và các venue của owner), sắp xếp lại menu đúng thứ tự/nhãn/icon trong ảnh (thêm "Dashboard" và "Chi nhánh" mới), và đổi màu mục đang active sang tông xanh.

## 2. Vấn đề hiện tại

- `OwnerSidebar` hiện không có khối logo, không có bộ chọn chi nhánh, và không có 2 mục "Dashboard"/"Chi nhánh".
- Mục đầu tiên hiện tên "Sân của tôi" (icon `Building2`) — ảnh mẫu tách thành 2 khái niệm riêng: "Dashboard" (nhóm Tổng quan) và "Danh sách sân" (nhóm Quản lý sân, icon ghim vị trí).
- App chưa có Dialog primitive (`ui/dialog.tsx`) — chỉ có `ui/dropdown-menu.tsx` (Base UI Menu). Base UI Dialog (`@base-ui/react/dialog`) đã có sẵn trong `package.json`, cùng cấu trúc Root/Trigger/Portal/Backdrop/Popup/Title/Close như Menu.
- `Venue` (bảng `venues`, module Courts) hiện chỉ có `name`, `address`, `city` — **chưa có** `phone`, `is_default` (những trường đó thuộc [2026-08-26-branches-design.md](./2026-08-26-branches-design.md), chưa triển khai). Modal chọn chi nhánh vì vậy **chưa thể** hiện số điện thoại hay nhãn "Mặc định" như doc khảo sát gốc.
- Chọn chi nhánh trong modal **chưa có** cơ chế lọc dữ liệu ở bất kỳ trang nào khác (Dashboard, Đặt lịch, Khách hàng, Báo cáo...) — đây là quyết định phạm vi có chủ đích của người dùng cho đợt này.

## 3. Phạm vi

1. Khối logo (`Pickleball` + tagline) ở đầu `OwnerSidebar`.
2. Bộ chọn chi nhánh: nút hiển thị "Tất cả chi nhánh" (hoặc tên venue đã chọn) → mở dialog liệt kê "Tất cả chi nhánh" + venue của owner (tên + thành phố, lấy từ `GET /api/venues/mine` đã có sẵn). Chọn 1 mục → đóng dialog, đổi label trên nút. **Chỉ đổi label hiển thị, không lọc dữ liệu trang nào khác.**
3. Cấu trúc lại menu theo đúng ảnh: thêm nhóm "Tổng quan" (Dashboard, trang "Sắp ra mắt" mới), đổi tên "Sân của tôi" → "Danh sách sân" (giữ nguyên route `/owner`, chỉ đổi tên+icon), thêm "Chi nhánh" vào nhóm "Hệ thống" (trang "Sắp ra mắt" mới), đổi icon "Doanh thu" và "Tài khoản".
4. Đổi style mục đang active: nền xanh nhạt + chữ xanh đậm + icon xanh (đơn giản hoá so với ảnh — ảnh có thêm khung tròn xanh quanh icon, bản này bỏ chi tiết đó, chỉ đổi màu).

## 4. Component

### 4.1 `apps/web/src/components/ui/dialog.tsx` (mới)

Wrapper mỏng quanh `@base-ui/react/dialog`, cùng cách bọc như `ui/dropdown-menu.tsx`: `Dialog` (`Dialog.Root`), `DialogTrigger` (`Dialog.Trigger`), `DialogContent` (gộp `Portal` + `Backdrop` + `Popup`, style thẻ trắng bo góc giữa màn hình), `DialogTitle` (`Dialog.Title`).

### 4.2 `apps/web/src/components/branch-switcher.tsx` (mới)

`"use client"`. State `venues` (fetch 1 lần từ `/api/venues/mine` khi mount), `selectedLabel` (mặc định `"Tất cả chi nhánh"`), `open` (điều khiển dialog). Nút trigger hiển thị icon + `selectedLabel` + chevron phải. Nội dung dialog: nút "Tất cả chi nhánh" ở đầu, sau đó danh sách venue (tên + thành phố); bấm 1 mục → `setSelectedLabel(...)`, đóng dialog.

### 4.3 `apps/web/src/components/owner-sidebar.tsx` (sửa)

- Thêm khối logo ở đầu (trước label "Quản trị chủ sân" hiện có — bỏ label chữ đó, thay bằng khối logo).
- Thêm nhãn "CHI NHÁNH" (uppercase, muted) + `<BranchSwitcher />` ngay dưới khối logo.
- Cập nhật mảng `GROUPS`:

| Nhóm | Mục | Route | Icon | Trạng thái |
|---|---|---|---|---|
| Tổng quan | Dashboard | `/owner/dashboard` | `LayoutDashboard` | **Mới, Sắp ra mắt** |
| Quản lý sân | Danh sách sân | `/owner` | `MapPin` (đổi từ `Building2`) | Đổi tên, giữ route |
| Quản lý sân | Đặt lịch | `/owner/bookings` | `CalendarDays` | Không đổi |
| Quản lý sân | Khách hàng | `/owner/customers` | `Users` | Không đổi |
| Quản lý sân | Bảng giá | `/owner/pricing` | `Tag` | Không đổi |
| Báo cáo | Doanh thu | `/owner/revenue` | `BarChart3` (đổi từ `DollarSign`) | Đổi icon |
| Báo cáo | Lượt xem trang | `/owner/page-views` | `Eye` | Không đổi |
| Hệ thống | Chi nhánh | `/owner/branches` | `Building2` | **Mới, Sắp ra mắt** |
| Hệ thống | Tài khoản | `/owner/accounts` | `IdCard` (đổi từ `UserCog`) | Đổi icon |
| Hệ thống | Cài đặt | `/owner/settings` | `Settings` | Không đổi |

- Style link active đổi từ `bg-muted text-foreground` sang `bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400`; icon kế thừa màu chữ (không cần class riêng).

### 4.4 2 trang stub mới

`apps/web/src/app/owner/dashboard/page.tsx` và `apps/web/src/app/owner/branches/page.tsx` — mỗi file chỉ render `<ComingSoon title="..." />` (component đã có từ owner-sidebar-layout-design.md), giống 7 trang stub hiện có.

## 5. Ngoài phạm vi

- **Lọc dữ liệu theo chi nhánh đã chọn** trên bất kỳ trang nào (Dashboard, Đặt lịch, Báo cáo...) — chỉ đổi label hiển thị trên nút, như đã chốt ở bước brainstorm.
- **Nhãn "Mặc định" và số điện thoại** trong dialog chọn chi nhánh — cần các trường `is_default`/`phone` từ [Branches module](./2026-08-26-branches-design.md), chưa triển khai.
- **Dashboard số liệu thật** — mục "Dashboard" chỉ là trang "Sắp ra mắt", không xây số liệu (booking hôm nay, doanh thu...) như [2026-08-25-dashboard-design.md](./2026-08-25-dashboard-design.md) mô tả.
- **Trang quản lý chi nhánh thật** (danh sách dạng lưới, đặt mặc định, ẩn/hiện, xoá) — mục "Chi nhánh" chỉ là trang "Sắp ra mắt", nội dung thật thuộc Branches module riêng.
- **Khung tròn xanh quanh icon khi active** (chi tiết nhỏ trong ảnh) — chỉ đổi màu nền/chữ/icon, không thêm khung riêng.
- **`AdminSidebar`** — không đổi.

## 6. Testing

- Không có logic thuần để unit test mới (routing/label là dữ liệu tĩnh; `BranchSwitcher` chỉ fetch + hiển thị, không có hàm biến đổi dữ liệu đáng test riêng).
- **Manual/browser:** đăng nhập owner, xác nhận: khối logo hiển thị đúng; bấm ô chi nhánh → dialog mở, liệt kê "Tất cả chi nhánh" + venue thật của tài khoản test; chọn 1 venue → dialog đóng, label nút đổi đúng tên venue; menu hiển thị đúng thứ tự/nhãn/icon theo bảng ở §4.3; mục đang active tô xanh; click "Dashboard" và "Chi nhánh" → vào đúng trang "Sắp ra mắt", không 404.
