# Owner Admin App — Tổng quan & bản đồ tài liệu

**Ngày:** 2026-09-02
**Trạng thái:** Chờ review
**Thuộc kiến trúc tổng thể:** [2026-08-23-pickleball-platform-architecture-design.md](./2026-08-23-pickleball-platform-architecture-design.md)
**Nguồn tham khảo:** [docs/spec/00-tong-quan.md](../../spec/00-tong-quan.md) (khảo sát UI sanbong.vn thực tế, vai trò Chủ sân/Owner, khảo sát ngày 25/08/2026)

## 1. Mục tiêu

Tài liệu này là bản đồ (index) nối nội dung khảo sát tổng quan `docs/spec/00-tong-quan.md` với các spec thiết kế thực tế đã/sẽ viết cho nền tảng pickleball hiện tại. Mỗi nhóm chức năng trong sidebar khảo sát được đối chiếu với module/spec tương ứng, kèm chú thích chỗ nào nền tảng hiện tại **khác** so với sanbong.vn (đa môn thể thao, đa chi nhánh phức tạp hơn) mà spec riêng của từng module đã quyết định.

Tài liệu gốc chỉ mô tả UI quan sát được dưới vai trò **Owner**, không suy diễn logic backend — các spec module dưới đây là nơi quyết định logic thật, tài liệu này chỉ tổng hợp lại để dễ tra cứu.

## 2. Khác biệt tổng thể so với tài liệu khảo sát gốc

`docs/spec/00-tong-quan.md` mô tả sanbong.vn — nền tảng SaaS đa môn thể thao (pickleball, bóng đá, cầu lông, tennis, bóng rổ), phục vụ owner đa chi nhánh với đầy đủ nhân sự phân quyền theo 4 vai trò. Nền tảng đang xây dựng ([kiến trúc tổng thể §1-2](./2026-08-23-pickleball-platform-architecture-design.md)) là MVP/cá nhân, chỉ phục vụ **pickleball**, nên:

- **Không có khái niệm "loại sân theo môn thể thao"** — mọi sân đều là sân pickleball (xem [Dashboard §2](./2026-08-25-dashboard-design.md#2-khác-biệt-so-với-tài-liệu-khảo-sát-gốc)).
- **"Chi nhánh" = `venue`** đã có sẵn từ Courts module, không phải module tách biệt — owner sở hữu nhiều venue là bản chất dữ liệu gốc, không phải tính năng mới (xem [Branches §1](./2026-08-26-branches-design.md)).
- **Phân quyền nhân sự MVP chỉ có vai trò `owner`** ở tầng platform (xem [kiến trúc tổng thể §3](./2026-08-23-pickleball-platform-architecture-design.md)); 4 vai trò Chủ sân/Quản lý/Thu ngân/Nhân viên trong tài liệu gốc là phạm vi của [Staff accounts](./2026-08-26-staff-accounts-design.md) — cần đọc spec đó để biết mức độ đã/chưa triển khai.
- Tài liệu gốc chỉ khảo sát **vai trò Owner**. Nền tảng hiện tại còn có vai trò `customer` (đặt sân công khai) và `admin` (backoffice duyệt owner/sân, xử lý tranh chấp) — các vai trò này **không** nằm trong phạm vi khảo sát `docs/spec/`, spec của chúng dựa hoàn toàn trên kiến trúc tổng thể (xem §4 bên dưới).
- Thanh toán trong tài liệu gốc không được mô tả chi tiết (ngoài phạm vi khảo sát UI Owner); nền tảng hiện tại dùng xác nhận thủ công, xem [Payments module](./2026-08-25-payments-module-design.md).

## 3. Cấu trúc điều hướng (Sidebar) — đối chiếu spec

| Nhóm | Mục | Spec chi tiết |
|---|---|---|
| Chi nhánh | Bộ chọn chi nhánh | [venue-default-phone-and-branch-dialog](./2026-08-29-venue-default-phone-and-branch-dialog-design.md), [branches](./2026-08-26-branches-design.md) |
| Tổng quan | Dashboard | [dashboard](./2026-08-25-dashboard-design.md), [dashboard-frontend](./2026-08-30-dashboard-frontend-design.md), [dashboard-visual-refresh](./2026-08-30-dashboard-visual-refresh-design.md) |
| Quản lý sân | Danh sách sân | [courts-module](./2026-08-24-courts-module-design.md), [courts-frontend](./2026-08-24-courts-frontend-design.md), [courts-list](./2026-08-30-courts-list-design.md) |
| Quản lý sân | Đặt lịch | [bookings-module](./2026-08-24-bookings-module-design.md), [bookings-frontend](./2026-08-24-bookings-frontend-design.md), [owner-booking-calendar](./2026-08-31-owner-booking-calendar-design.md) |
| Quản lý sân | Khách hàng | [customers-module](./2026-08-26-customers-module-design.md), [customers-frontend](./2026-09-01-customers-frontend-design.md) |
| Quản lý sân | Bảng giá | [pricing-and-recurring-schedules](./2026-08-26-pricing-and-recurring-schedules-design.md), [pricing-frontend](./2026-09-01-pricing-frontend-design.md) |
| Báo cáo | Doanh thu | [revenue-reports](./2026-08-26-revenue-reports-design.md) |
| Báo cáo | Lượt xem trang | [page-view-analytics](./2026-08-26-page-view-analytics-design.md) |
| Hệ thống | Chi nhánh | [branches](./2026-08-26-branches-design.md) |
| Hệ thống | Tài khoản | [staff-accounts](./2026-08-26-staff-accounts-design.md) |
| Hệ thống | Cài đặt | [settings](./2026-08-26-settings-design.md) |
| — (floating button) | Tin nhắn / Hộp thư chat | [chat-inbox](./2026-08-26-chat-inbox-design.md) |
| — (mọi trang) | Header dùng chung | [header-layout](./2026-08-29-header-layout-design.md), [header-weather-notifications-static](./2026-08-29-header-weather-notifications-static-design.md) |
| — (mọi trang) | Sidebar (khung, thu gọn) | [owner-sidebar-layout](./2026-08-29-owner-sidebar-layout-design.md), [owner-sidebar-visual-refresh](./2026-08-29-owner-sidebar-visual-refresh-design.md), [sidebar-collapse](./2026-08-29-sidebar-collapse-design.md) |

## 4. Danh sách file khảo sát gốc → spec thiết kế

| File khảo sát (`docs/spec/`) | Nội dung | Spec thiết kế tương ứng |
|---|---|---|
| `00-tong-quan.md` | Tổng quan hệ thống, sidebar | Tài liệu này; [owner-sidebar-layout](./2026-08-29-owner-sidebar-layout-design.md) (tên/nhóm menu) |
| `01-dashboard.md` | Trang Tổng quan | [dashboard](./2026-08-25-dashboard-design.md), [dashboard-frontend](./2026-08-30-dashboard-frontend-design.md), [dashboard-visual-refresh](./2026-08-30-dashboard-visual-refresh-design.md) |
| `02-quan-ly-san-danh-sach-san.md` | Quản lý sân – Danh sách sân | [courts-list](./2026-08-30-courts-list-design.md) (UI); nền backend: [courts-module](./2026-08-24-courts-module-design.md) |
| `03-dat-lich.md` | Đặt lịch (lưới giờ/sân) | [owner-booking-calendar](./2026-08-31-owner-booking-calendar-design.md) (UI); nền backend: [bookings-module](./2026-08-24-bookings-module-design.md) |
| `04-khach-hang.md` | Quản lý khách hàng | [customers-module](./2026-08-26-customers-module-design.md), [customers-frontend](./2026-09-01-customers-frontend-design.md) |
| `05-bang-gia.md` | Bảng giá & lịch đặt cố định | [pricing-and-recurring-schedules](./2026-08-26-pricing-and-recurring-schedules-design.md), [pricing-frontend](./2026-09-01-pricing-frontend-design.md) |
| `06-bao-cao-doanh-thu.md` | Báo cáo doanh thu | [revenue-reports](./2026-08-26-revenue-reports-design.md) |
| `07-luot-xem-trang.md` | Báo cáo lượt xem trang | [page-view-analytics](./2026-08-26-page-view-analytics-design.md) |
| `08-chi-nhanh.md` | Quản lý chi nhánh | [branches](./2026-08-26-branches-design.md) |
| `09-tai-khoan.md` | Quản lý tài khoản nhân viên | [staff-accounts](./2026-08-26-staff-accounts-design.md) |
| `10-cai-dat.md` | Cài đặt hệ thống | [settings](./2026-08-26-settings-design.md) |
| `11-hop-thu-chat.md` | Hộp thư chat khách hàng | [chat-inbox](./2026-08-26-chat-inbox-design.md) |
| `12-header-va-chuc-nang-chung.md` | Header & chức năng chung | [header-layout](./2026-08-29-header-layout-design.md), [header-weather-notifications-static](./2026-08-29-header-weather-notifications-static-design.md) |

## 5. Module không nằm trong phạm vi khảo sát owner

Tài liệu khảo sát gốc chỉ quan sát UI dưới vai trò Owner nên không đề cập các module sau — spec của chúng dựa trên [kiến trúc tổng thể](./2026-08-23-pickleball-platform-architecture-design.md), không có nguồn tham khảo UI đối chiếu:

| Module | Spec | Vai trò liên quan |
|---|---|---|
| Auth & Users | [auth-users-module](./2026-08-23-auth-users-module-design.md), [auth-users-frontend](./2026-08-24-auth-users-frontend-design.md) | customer / owner / admin |
| Payments (thủ công) | [payments-module](./2026-08-25-payments-module-design.md) | owner |
| Notifications (email) | [notifications-module](./2026-08-26-notifications-module-design.md) | customer / owner |
| Admin — duyệt owner/sân | [admin-approvals](./2026-08-26-admin-approvals-design.md) | admin |
| Admin — xử lý tranh chấp | [admin-dispute-handling](./2026-08-26-admin-dispute-handling-design.md) | admin |
| Admin — thống kê nền tảng | [admin-platform-stats](./2026-08-26-admin-platform-stats-design.md) | admin |
| Admin — khung sidebar | [admin-sidebar-layout](./2026-08-29-admin-sidebar-layout-design.md) | admin |

## 6. Tóm tắt nhanh các nhóm chức năng chính

**Quản lý sân** là lõi nghiệp vụ: courts-module quản lý danh mục sân/venue, pricing quản lý khung giá theo giờ (kèm lịch đặt cố định hàng tuần), bookings-module là lưới đặt sân giờ × sân tránh trùng lịch, customers-module theo dõi khách hàng (phân loại theo hành vi chi tiêu, lịch sử).

**Báo cáo** gồm hai mảng: doanh thu theo giao dịch/thời gian ([revenue-reports](./2026-08-26-revenue-reports-design.md)), và lượt xem trang đặt sân công khai ([page-view-analytics](./2026-08-26-page-view-analytics-design.md)).

**Hệ thống** vận hành đa chi nhánh (venue), phân quyền nhân sự ([staff-accounts](./2026-08-26-staff-accounts-design.md)), và cấu hình chung ([settings](./2026-08-26-settings-design.md)) — thông tin sân, giờ hoạt động, loại thông báo, tài khoản cá nhân.

**Hộp thư chat** ([chat-inbox](./2026-08-26-chat-inbox-design.md)) là kênh nhắn tin giữa owner/nhân viên và khách hàng nhắn đến từ trang đặt sân công khai.
