# Module: Header dùng chung (Admin/Owner) — Thiết kế chi tiết

**Ngày:** 2026-08-29
**Trạng thái:** Chờ review
**Thuộc kiến trúc tổng thể:** [2026-08-23-pickleball-platform-architecture-design.md](./2026-08-23-pickleball-platform-architecture-design.md)
**Nguồn tham khảo nội dung:** [docs/spec/12-header-va-chuc-nang-chung.md](../../spec/12-header-va-chuc-nang-chung.md) (khảo sát sanbong.vn thực tế) — dùng để chọn danh sách chức năng header, không suy diễn logic nghiệp vụ mà app này chưa có.
**Áp dụng lên layout của:** [2026-08-29-admin-sidebar-layout-design.md](./2026-08-29-admin-sidebar-layout-design.md), [2026-08-29-owner-sidebar-layout-design.md](./2026-08-29-owner-sidebar-layout-design.md) — sidebar giữ nguyên, chỉ thêm hàng header phía trên nội dung.

## 1. Mục tiêu

Thêm thanh header dùng chung phía trên nội dung của mọi trang `/admin/*` và `/owner/*`: đồng hồ ngày giờ thực, nút chuyển giao diện Sáng/Tối, menu tài khoản (tên/vai trò, link tài khoản nếu có, Đăng xuất). Đồng thời dời nút "Đăng xuất" hiện đang nằm ở cuối `AdminSidebar`/`OwnerSidebar` sang menu tài khoản trong header, để tránh có 2 nút đăng xuất trên cùng một trang.

## 2. Vấn đề hiện tại (lý do đổi)

- Layout `admin/layout.tsx` và `owner/layout.tsx` hiện chỉ là `sidebar | content` một hàng flex — chưa có header nào.
- `next-themes` đã có trong `package.json` nhưng chưa có `ThemeProvider` ở root layout, và chưa có nút bật/tắt dark mode ở đâu trong app (chỉ `components/ui/sonner.tsx` dùng `useTheme` để tô màu toast).
- Không có component/UI nào cho: đồng hồ, menu tài khoản (avatar), dropdown — `@base-ui/react` đã cài nhưng chưa có wrapper `ui/dropdown-menu.tsx` (mới chỉ bọc `button.tsx`, `input.tsx`).
- `AdminSidebar`/`OwnerSidebar` mỗi cái tự có nút "Đăng xuất" riêng ở cuối — nếu thêm avatar menu ở header theo đúng khảo sát gốc (mục đăng xuất nằm trong menu tài khoản) thì sẽ trùng 2 nơi trên cùng 1 trang.

## 3. Phạm vi

Khảo sát gốc (12-header-va-chuc-nang-chung.md) mô tả 3 khối dùng chung: (1) bộ chọn chi nhánh ở đầu sidebar — đã xử lý riêng, xem quyết định ở owner-sidebar-layout-design.md §3 ("Không đưa vào"); (2) thanh header ngang; (3) nút "Tin nhắn" nổi. Thiết kế này **chỉ làm khối (2)**, giới hạn ở 3 chức năng dựng được ngay với dữ liệu/hạ tầng đã có trong app:

1. Đồng hồ ngày giờ thực (không kèm thời tiết — xem §5).
2. Nút chuyển giao diện Sáng/Tối.
3. Menu tài khoản (avatar) — tên + vai trò, link "Thông tin tài khoản" (nếu trang đích đã tồn tại), Đăng xuất.

Không làm icon thu gọn sidebar, icon Thông báo (chuông), nút "Tin nhắn" nổi — xem §5 Ngoài phạm vi.

## 4. Component

### 4.1 ThemeProvider ở root layout

`apps/web/src/app/layout.tsx`: bọc `{children}` bằng `<ThemeProvider attribute="class" defaultTheme="system" enableSystem>` (từ `next-themes`, đã có trong `package.json`), thêm `suppressHydrationWarning` vào thẻ `<html>` (bắt buộc khi dùng next-themes với App Router, tránh cảnh báo hydration do class được set lại phía client).

### 4.2 `apps/web/src/components/ui/dropdown-menu.tsx`

Wrapper mỏng quanh `@base-ui/react/menu`, theo đúng cách `button.tsx`/`input.tsx` đã bọc primitive của `@base-ui/react` (dùng `data-slot`, `cn()`, style Tailwind nhất quán với `Card`/`Button` hiện có). Export tối thiểu: `DropdownMenu`, `DropdownMenuTrigger`, `DropdownMenuContent`, `DropdownMenuItem`.

### 4.3 `apps/web/src/components/app-header.tsx`

`"use client"`, dùng chung cho cả `/admin/*` và `/owner/*`:

```tsx
interface AppHeaderProps {
  accountLabel: string; // "Quản trị viên" | "Chủ sân"
  accountHref?: string; // "/owner/settings" — bỏ qua nếu trang đích chưa tồn tại (admin)
}
```

- Hàng ngang, `h-14 border-b px-4`, `flex items-center justify-between`.
- **Trái:** đồng hồ dạng text "Thứ Sáu, 29/08/2026 · 14:30:05", cập nhật mỗi giây bằng `setInterval` trong `useEffect`. Chỉ render sau khi `mounted` (state `useState(false)` set `true` trong `useEffect` đầu tiên) để tránh lệch giờ server/client lúc hydrate — cùng kỹ thuật next-themes dùng cho theme toggle.
- **Phải:**
  - Nút icon `Sun`/`Moon` (`lucide-react`, đã có sẵn) dùng `useTheme()` từ `next-themes`: hiện `Moon` khi đang sáng (bấm để chuyển tối) và ngược lại, `onClick` gọi `setTheme(theme === "dark" ? "light" : "dark")`.
  - Avatar (hình tròn chữ cái đầu `fullName`, không có ảnh — app chưa có UI hiển thị `avatarUrl`) làm trigger cho `DropdownMenu` (§4.2), nội dung:
    - Tên + `accountLabel` (text tĩnh, không click) — tên lấy từ `GET /api/users/me` (endpoint có sẵn ở `apps/api/src/users/users.controller.ts`, trả về `fullName`, `role`).
    - "Thông tin tài khoản" → `<Link href={accountHref}>`, chỉ render nếu `accountHref` được truyền.
    - "Đăng xuất" → giữ nguyên logic hiện có (`POST /api/auth/logout` rồi `window.location.href = "/login"`).
  - Component tự fetch `/api/users/me` bằng `useEffect`/`useState` (giống cách `apps/app/me/page.tsx` đang fetch), không thêm hook dùng chung mới — chỉ một component cần dữ liệu này.

### 4.4 Áp dụng vào layout

`apps/web/src/app/admin/layout.tsx`:

```tsx
import { AdminSidebar } from "@/components/admin-sidebar";
import { AppHeader } from "@/components/app-header";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full">
      <AdminSidebar />
      <div className="flex flex-1 flex-col">
        <AppHeader accountLabel="Quản trị viên" />
        <div className="flex-1">{children}</div>
      </div>
    </div>
  );
}
```

`apps/web/src/app/owner/layout.tsx`: tương tự, `<AppHeader accountLabel="Chủ sân" accountHref="/owner/settings" />` (`/owner/settings` đã tồn tại làm trang "Sắp ra mắt" theo owner-sidebar-layout-design.md §3).

### 4.5 Sửa `AdminSidebar` / `OwnerSidebar`

Bỏ nút "Đăng xuất" và hàm `handleLogout` ở cuối mỗi sidebar (đã chuyển vào menu tài khoản trong header) — sidebar chỉ còn nhãn đầu + danh sách menu điều hướng.

## 5. Ngoài phạm vi

- **Thời tiết** trong đồng hồ — cần tích hợp API thời tiết bên thứ ba (vd. OpenWeatherMap), chưa có key/license/chi phí được duyệt; giá trị thấp so với công sức cho một công cụ quản trị nội bộ. Chỉ làm phần ngày giờ.
- **Icon Thông báo (chuông)** — cần API "danh sách thông báo trong app", trong khi [2026-08-26-notifications-module-design.md](./2026-08-26-notifications-module-design.md) hiện chỉ là dịch vụ gửi email (`NotificationsService` + `MailModule`), không có bảng lưu hay endpoint đọc thông báo trong app. Cần thiết kế/API riêng trước khi làm UI chuông.
- **Nút "Tin nhắn" nổi** — phụ thuộc [2026-08-26-chat-inbox-design.md](./2026-08-26-chat-inbox-design.md), hiện **Chờ review** và chưa có backend (`@nestjs/websockets`/`socket.io` chưa được cài ở `apps/api`). Làm sau khi module chat có API thật.
- **Icon menu (≡) thu gọn/mở rộng sidebar** — cả hai sidebar hiện đã chốt quyết định không responsive/không thu gọn (admin-sidebar-layout-design.md §5, owner-sidebar-layout-design.md §6). Header sẽ không có nút này.
- **Trang "Thông tin tài khoản" cho admin** — admin chưa có bất kỳ trang cài đặt/tài khoản nào; menu tài khoản của admin sẽ chỉ hiển thị tên + vai trò + Đăng xuất, không có link, cho tới khi có spec riêng cho khu vực cài đặt admin.

## 6. Testing

- **Manual/browser:** đăng nhập lần lượt owner và admin, xác nhận header hiển thị ở mọi trang tương ứng (kể cả trang stub "Sắp ra mắt"); đồng hồ chạy đúng theo thời gian thực; nút Sáng/Tối đổi theme ngay và giữ nguyên sau khi tải lại trang (next-themes lưu ở `localStorage`); avatar menu hiện đúng tên/vai trò lấy từ tài khoản đang đăng nhập; owner thấy link "Thông tin tài khoản" trỏ `/owner/settings`, admin không thấy link đó; "Đăng xuất" từ menu tài khoản hoạt động đúng và không còn nút đăng xuất nào ở sidebar.
- Không cần unit/e2e mới — thay đổi thuần UI/layout, không có logic nghiệp vụ hay API mới ngoài việc dùng lại `GET /api/users/me` đã có sẵn.
