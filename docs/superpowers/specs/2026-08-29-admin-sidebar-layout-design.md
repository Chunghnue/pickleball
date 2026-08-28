# Module: Admin — Sidebar Layout — Thiết kế chi tiết

**Ngày:** 2026-08-29
**Trạng thái:** Đã duyệt
**Thuộc kiến trúc tổng thể:** [2026-08-23-pickleball-platform-architecture-design.md](./2026-08-23-pickleball-platform-architecture-design.md)
**Sửa đổi:** thay thế `apps/web/src/components/admin-nav.tsx` (top nav dùng chung cho `/admin/approvals`, `/admin/stats`, `/admin/disputes` — xem [2026-08-26-admin-approvals-design.md](./2026-08-26-admin-approvals-design.md) §7, [2026-08-26-admin-platform-stats-design.md](./2026-08-26-admin-platform-stats-design.md) §6, [2026-08-26-admin-dispute-handling-design.md](./2026-08-26-admin-dispute-handling-design.md) §7).

## 1. Mục tiêu

Đổi layout admin từ thanh nav ngang (3 link chữ ở đầu mỗi trang) sang layout 2 cột chuẩn: **sidebar trái** chứa menu điều hướng, **nội dung bên phải** hiển thị tương ứng với trang đang chọn. Áp dụng cho toàn bộ `/admin/*` (`approvals`, `stats`, `disputes`) qua Next.js nested layout — không cần từng trang tự import nav nữa.

**Phạm vi có chủ đích:** chỉ đổi phần điều hướng (nav → sidebar). Không đổi nội dung/bố cục riêng của từng trang, không thêm header ngang riêng, không làm sidebar responsive/thu gọn (xem §5 Ngoài phạm vi).

## 2. Vấn đề hiện tại (lý do đổi)

- `admin-nav.tsx` là top nav dùng chung, nhưng nút "Đăng xuất" lại được viết riêng lẻ ở từng trang — **chỉ trang `/admin/approvals` có nút này**, `/admin/stats` và `/admin/disputes` bị thiếu do triển khai độc lập ở các đợt trước.
- Không có `app/admin/layout.tsx` — mỗi trang tự render `<AdminNav />`, dễ quên/lệch khi thêm trang mới.

## 3. Component mới

**`apps/web/src/components/admin-sidebar.tsx`** (`"use client"`, thay thế hoàn toàn `admin-nav.tsx`):

- Cột dọc, full height, width cố định (`w-56`), border phải, không thu gọn/không responsive (§5).
- **Đầu:** nhãn "Quản trị".
- **Giữa:** 3 mục điều hướng, mỗi mục = icon (`lucide-react`, đã có sẵn trong `package.json`) + label, active route tô nền (dùng `usePathname`, cùng cách xác định active đã có ở `admin-nav.tsx`):
  | Route | Label | Icon |
  |---|---|---|
  | `/admin/approvals` | Chờ duyệt | `ClipboardCheck` |
  | `/admin/stats` | Thống kê | `BarChart3` |
  | `/admin/disputes` | Khiếu nại | `MessageSquareWarning` |
- **Cuối:** nút "Đăng xuất" — chuyển nguyên logic `handleLogout` hiện đang nằm ở `approvals/page.tsx` (`POST /api/auth/logout` rồi `window.location.href = "/login"`) vào đây, dùng chung cho cả 3 trang.

## 4. Layout mới

**`apps/web/src/app/admin/layout.tsx`** (Next.js nested layout, server component — không cần `"use client"` ở cấp này, giống cách `AdminNav`/`AdminSidebar` tự là client component còn nơi gọi thì không cần):

```tsx
import { AdminSidebar } from "@/components/admin-sidebar";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full">
      <AdminSidebar />
      <div className="flex-1">{children}</div>
    </div>
  );
}
```

**3 trang hiện có** (`approvals/page.tsx`, `stats/page.tsx`, `disputes/page.tsx`):

- Bỏ `import { AdminNav } from "@/components/admin-nav"` và dòng `<AdminNav />`.
- Riêng `approvals/page.tsx`: bỏ hàm `handleLogout` và nút "Đăng xuất" trong phần header của trang (đã chuyển vào sidebar) — phần header trang chỉ còn lại tiêu đề `<h1>`.
- Giữ nguyên `<main className="mx-auto flex max-w-{2xl|3xl} flex-1 flex-col gap-6 p-8">` và toàn bộ nội dung khác của từng trang — không đổi width/padding riêng của từng trang.

**Xoá** `apps/web/src/components/admin-nav.tsx` (không còn nơi nào import sau khi 3 trang trên được sửa).

## 5. Ngoài phạm vi

- Sidebar responsive/thu gọn (hamburger, drawer trên mobile) — đây là công cụ nội bộ cho một nhóm nhỏ admin, thêm phức tạp này bây giờ là suy đoán trước nhu cầu (YAGNI). Cân nhắc lại nếu có nhu cầu dùng trên mobile thực tế.
- Header ngang riêng (tên trang dùng chung, breadcrumb, avatar/tên admin đang đăng nhập) — mỗi trang tiếp tục tự quản lý tiêu đề `<h1>` của mình như hiện tại.
- Đổi màu sắc/theme tổng thể — chỉ đổi cấu trúc điều hướng, giữ nguyên bảng màu/component (`Button`, `Card`) đang dùng.

## 6. Testing

- **Manual/browser:** đăng nhập admin, xác nhận sidebar hiển thị ở cả 3 trang, mục đang active được tô nền đúng theo route, nút "Đăng xuất" hoạt động và có mặt ở cả 3 trang (khắc phục đúng vấn đề nêu ở §2).
- Không cần unit/e2e test mới — đây là thay đổi thuần UI/layout, không có logic nghiệp vụ hay API mới (nhất quán với cách các trang admin trước đó không có test riêng cho phần render, chỉ test nghiệp vụ backend).
