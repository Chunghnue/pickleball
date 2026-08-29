# Module: Sidebar Collapse/Expand (Admin/Owner) — Thiết kế chi tiết

**Ngày:** 2026-08-29
**Trạng thái:** Chờ review
**Thuộc kiến trúc tổng thể:** [2026-08-23-pickleball-platform-architecture-design.md](./2026-08-23-pickleball-platform-architecture-design.md)
**Nguồn tham khảo:** Ảnh chụp màn hình sanbong.vn do người dùng cung cấp (icon `≡` ở header, bấm để ẩn/hiện thanh điều hướng bên trái).
**Sửa đổi/đảo ngược quyết định trước đó:** [2026-08-29-admin-sidebar-layout-design.md](./2026-08-29-admin-sidebar-layout-design.md) §5 và [2026-08-29-owner-sidebar-layout-design.md](./2026-08-29-owner-sidebar-layout-design.md) §6 đều ghi "không thu gọn/không responsive" — spec này đảo ngược riêng phần đó theo yêu cầu mới, các quyết định khác (không làm responsive theo breakpoint mobile, sidebar full-height khi hiện) vẫn giữ nguyên.
**Một phần của loạt 3 việc tách từ ảnh header sanbong.vn:** (1) **sidebar collapse — spec này**, (2) thời tiết (API thật), (3) icon thông báo trong app (chấm đỏ) — 2 việc sau có spec riêng, không thuộc phạm vi spec này.

## 1. Mục tiêu

Thêm nút `≡` vào `AppHeader` (bên trái, trước cụm đồng hồ) để ẩn/hiện hoàn toàn `AdminSidebar`/`OwnerSidebar`; nội dung chính chiếm toàn bộ chiều rộng khi sidebar đang ẩn. Trạng thái ẩn/hiện được nhớ qua `localStorage`, áp dụng cho cả `/admin/*` và `/owner/*`. Nhân tiện đang sửa `AppHeader`, đổi luôn layout đồng hồ từ 1 dòng sang 2 dòng (ngày ở trên, giờ ở dưới) theo đúng ảnh mẫu.

## 2. Vấn đề hiện tại

- `admin/layout.tsx`/`owner/layout.tsx` render sidebar và `AppHeader` như 2 phần tử cố định, không có cách nào ẩn sidebar.
- Sidebar và nút bấm (sẽ nằm trong header) là 2 component anh em (siblings) trong layout — không có nơi nào đang giữ state dùng chung giữa chúng.
- `AppHeader` hiện hiển thị đồng hồ 1 dòng (`formatHeaderClock`), khác với ảnh mẫu (2 dòng, giờ tô màu xanh).
- App hiện là theme xám/đen-trắng thuần (không có màu xanh nào trong `globals.css`) — ảnh mẫu dùng xanh cho giờ và avatar. Quyết định: dùng xanh Tailwind cục bộ (`blue-600`/`blue-400`) chỉ cho các phần tử này, **không** đổi theme toàn app.

## 3. Phạm vi

1. Component `AppShell` mới, giữ state `collapsed` (ẩn hẳn sidebar khi `true`), đọc/ghi `localStorage`.
2. `AppHeader` nhận thêm nút `≡` (props `onToggleSidebar`), đổi đồng hồ sang 2 dòng + màu xanh cho giờ, avatar đổi sang nền xanh (thay `bg-primary` xám).
3. Áp dụng `AppShell` vào `admin/layout.tsx` và `owner/layout.tsx`.

**Không làm** (xem thêm ở §6): responsive theo breakpoint mobile, animation trượt (chỉ ẩn/hiện tức thời — xem ảnh preview đã chọn ở bước brainstorm: "ẩn hẳn", không phải "thu nhỏ còn dải icon"), thời tiết, icon thông báo, đổi theme màu toàn app.

## 4. Component

### 4.1 `apps/web/src/lib/format-datetime.ts` — tách `formatHeaderClock` thành 2 hàm

Thay hàm `formatHeaderClock(date)` hiện có bằng 2 hàm:

```ts
export function formatHeaderDate(date: Date): string {
  const weekday = WEEKDAYS[date.getDay()];
  const day = pad2(date.getDate());
  const month = pad2(date.getMonth() + 1);
  const year = date.getFullYear();
  return `${weekday}, ${day}/${month}/${year}`;
}

export function formatHeaderTime(date: Date): string {
  const hours = pad2(date.getHours());
  const minutes = pad2(date.getMinutes());
  const seconds = pad2(date.getSeconds());
  return `${hours}:${minutes}:${seconds}`;
}
```

(`WEEKDAYS`, `pad2` giữ nguyên từ file hiện có.) Test hiện có cho `formatHeaderClock` được thay bằng test cho 2 hàm mới.

### 4.2 `apps/web/src/components/app-shell.tsx` (mới)

`"use client"`, sở hữu state `collapsed`:

```tsx
interface AppShellProps {
  sidebar: React.ReactNode;
  accountLabel: string;
  accountHref?: string;
  children: React.ReactNode;
}
```

- `useState(false)` cho `collapsed`; `useEffect` (chạy 1 lần khi mount) đọc `localStorage.getItem("sidebar-collapsed")`, nếu `"1"` thì set `collapsed = true`. (Giống kỹ thuật "mounted gate" đã dùng cho đồng hồ/theme — có thể thấy sidebar hiện rồi ẩn ngay trong chớp nhoáng nếu trước đó người dùng đã ẩn; chấp nhận được cho công cụ quản trị nội bộ, không cần script chặn hydration như next-themes.)
- Hàm `toggleSidebar()`: đảo `collapsed`, ghi lại `localStorage.setItem("sidebar-collapsed", next ? "1" : "0")`.
- Render: `{!collapsed && sidebar}` bên trái; bên phải là cột dọc gồm `AppHeader` (nhận thêm `onToggleSidebar={toggleSidebar}`) rồi đến `children`.

### 4.3 `apps/web/src/components/app-header.tsx` — thêm nút `≡`, đổi đồng hồ 2 dòng, avatar xanh

- Props thêm `onToggleSidebar: () => void`.
- Đầu header (trước cụm đồng hồ): nút icon `Menu` (`lucide-react`), `aria-label="Ẩn/hiện thanh điều hướng"`, `onClick={onToggleSidebar}`, style giống nút theme toggle hiện có (`size-8`, `hover:bg-muted`).
- Cụm đồng hồ đổi từ 1 `<p>` sang 2 dòng xếp chồng (`flex flex-col leading-tight`): dòng ngày dùng `formatHeaderDate` (màu mặc định, `font-semibold`), dòng giờ dùng `formatHeaderTime` (`font-semibold text-blue-600 dark:text-blue-400`).
- Avatar trigger: đổi `bg-primary text-primary-foreground` thành `bg-blue-600 text-white hover:bg-blue-700` (giữ nguyên phần còn lại: chữ cái đầu tên, dropdown menu).

### 4.4 Áp dụng vào layout

`apps/web/src/app/admin/layout.tsx`:

```tsx
import { AdminSidebar } from "@/components/admin-sidebar";
import { AppShell } from "@/components/app-shell";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell sidebar={<AdminSidebar />} accountLabel="Quản trị viên">
      {children}
    </AppShell>
  );
}
```

`apps/web/src/app/owner/layout.tsx`: tương tự, `<AppShell sidebar={<OwnerSidebar />} accountLabel="Chủ sân" accountHref="/owner/settings">`.

## 5. Component nào KHÔNG đổi

`AdminSidebar`/`OwnerSidebar` giữ nguyên 100% — chúng chỉ bị ẩn/hiện từ bên ngoài (`AppShell`), không tự biết về trạng thái collapsed.

## 6. Ngoài phạm vi

- **Kiểu "thu nhỏ còn dải icon"** (sidebar co lại còn dải hẹp chỉ hiện icon, có tooltip) — đã cân nhắc ở bước brainstorm nhưng chọn "ẩn hẳn" đơn giản hơn; có thể làm sau nếu cần.
- **Animation trượt/transition khi ẩn/hiện** — chỉ ẩn/hiện tức thời (render có điều kiện), không thêm CSS transition.
- **Responsive tự động theo kích thước màn hình** (tự ẩn sidebar trên mobile) — vẫn ngoài phạm vi như đã chốt ở 2 spec sidebar gốc; nút `≡` là thao tác thủ công duy nhất.
- **Khối logo thương hiệu** ("SanBong.vn" + icon + tagline) nằm bên trái nút `≡` trong ảnh mẫu, nằm trên một thanh header full-width phía trên cả sidebar lẫn nội dung — đây là thay đổi kiến trúc layout khác (header full-width thay vì header chỉ nằm trên cột nội dung), không cần thiết để làm đúng chức năng ẩn/hiện. Để riêng cho một đợt chỉnh sửa hình ảnh/branding sau.
- **Thời tiết, icon thông báo** — 2 spec riêng theo quyết định đã chốt ở bước brainstorm.
- **Đổi theme màu toàn app sang xanh** — chỉ áp dụng xanh cục bộ cho giờ + avatar trong header.

## 7. Testing

- **Unit (Vitest, `apps/web/src/lib/format-datetime.test.ts`):** test cho `formatHeaderDate` và `formatHeaderTime` (thay test cũ của `formatHeaderClock`).
- **Manual/browser:** đăng nhập owner và admin; bấm `≡` → sidebar biến mất, nội dung giãn full-width; bấm lại → sidebar hiện lại; tải lại trang (F5) sau khi ẩn → sidebar vẫn ẩn (đọc từ `localStorage`); đồng hồ hiển thị đúng 2 dòng, dòng giờ màu xanh; avatar nền xanh.
- Không cần test cho `AppShell`/`AppHeader` (React UI, không có jsdom trong cấu hình Vitest hiện tại) — xác minh bằng build + manual/browser, giống các phần UI/layout trước đó.
