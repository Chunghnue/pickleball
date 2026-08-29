# Module: Header — Thời tiết & Chuông thông báo (tĩnh) — Thiết kế chi tiết

**Ngày:** 2026-08-29
**Trạng thái:** Đã duyệt
**Thuộc kiến trúc tổng thể:** [2026-08-23-pickleball-platform-architecture-design.md](./2026-08-23-pickleball-platform-architecture-design.md)
**Sửa đổi:** [2026-08-29-header-layout-design.md](./2026-08-29-header-layout-design.md) §5 (trước đây gạt thời tiết và chuông thông báo ra ngoài phạm vi do cần API bên thứ 3 / backend chưa có) — spec này bổ sung 2 mục đó ở dạng **hiển thị tĩnh** (không gọi API thời tiết thật, không có dữ liệu thông báo thật), theo đúng ảnh khảo sát sanbong.vn người dùng cung cấp.
**Một phần của loạt 3 việc tách từ ảnh header sanbong.vn:** (1) [sidebar collapse](./2026-08-29-sidebar-collapse-design.md) — đã xong, (2) **thời tiết & chuông thông báo (tĩnh) — spec này**, (3) chuông thông báo với dữ liệu thật (module thông báo trong app) — vẫn ngoài phạm vi, để dành khi có backend.

## 1. Mục tiêu

Thêm 2 phần tử thuần hiển thị vào `AppHeader`, không có logic nghiệp vụ hay gọi API:

1. **Thời tiết** — icon mây/nắng + text `--°C` cố định, nằm ngay sau giờ ở dòng thứ 2 của cụm đồng hồ.
2. **Chuông thông báo** — nút icon chuông (cùng kiểu nút tròn với nút sáng/tối), có chấm đỏ cố định ở góc; **bấm được** — mở dropdown tĩnh hiển thị "Chưa có thông báo" (không có danh sách thật).

## 2. Component

Sửa `apps/web/src/components/app-header.tsx`:

- Import thêm `Bell, CloudSun` từ `lucide-react`.
- Cụm giờ (dòng 2 của đồng hồ) đổi từ 1 `<span>` thành 1 hàng ngang gồm giờ (xanh, giữ nguyên) + icon `CloudSun` (`text-muted-foreground`) + text `--°C` (`text-xs text-muted-foreground`).
- Thêm 1 `DropdownMenu` mới (dùng lại wrapper có sẵn ở `ui/dropdown-menu.tsx`) nằm giữa nút sáng/tối và avatar:
  - Trigger: nút tròn `size-8`, icon `Bell`, có 1 chấm đỏ tuyệt đối định vị góc trên-phải (`absolute right-1.5 top-1.5 size-2 rounded-full bg-red-500`), `aria-label="Thông báo"`.
  - Content: 1 `div` tĩnh, text-center, `"Chưa có thông báo"`.
- Không thêm props mới cho `AppHeader` — cả 2 phần tử không phụ thuộc dữ liệu bên ngoài.

## 3. Ngoài phạm vi

- Gọi API thời tiết thật, xác định vị trí theo chi nhánh/GPS.
- Dữ liệu thông báo thật (danh sách, đếm chưa đọc, đánh dấu đã đọc, cấu hình bật/tắt ở Cài đặt → Thông báo) — cần module backend riêng như đã ghi ở `2026-08-29-header-layout-design.md` §5.
- Ẩn/hiện chấm đỏ theo trạng thái thật — chấm đỏ ở đây là tĩnh, luôn hiển thị.

## 4. Testing

- Không có logic thuần để unit test (chỉ là JSX tĩnh).
- Manual/browser: mở `/admin/*` và `/owner/*`, xác nhận thấy icon mây + "--°C" cạnh giờ; bấm chuông → dropdown "Chưa có thông báo" hiện ra, bấm ra ngoài → đóng lại; chấm đỏ luôn hiển thị trên icon chuông.
