# SanBong.vn – Tổng quan hệ thống "Quản lý sân"

**Phạm vi tài liệu:** Tài liệu này mô tả toàn bộ các chức năng của ứng dụng quản trị **SanBong.vn** (địa chỉ `app.sanbong.vn/app/...`), quan sát được tại thời điểm khảo sát ngày 25/08/2026, dưới vai trò tài khoản **Chủ sân (Owner)**. Tài liệu chỉ mô tả các màn hình và chức năng nhìn thấy được trên giao diện (UI), không suy diễn logic backend.

SanBong.vn là một phần mềm quản trị (SaaS) dành cho chủ sân thể thao (pickleball, bóng đá, cầu lông, tennis, bóng rổ…), giúp quản lý sân bãi, lịch đặt sân, khách hàng, bảng giá, đa chi nhánh, nhân sự, báo cáo doanh thu/lượt xem và hộp thư chat với khách hàng.

## Cấu trúc điều hướng (Sidebar)

Giao diện quản trị được chia thành các nhóm chức năng chính trên thanh điều hướng bên trái:

| Nhóm | Mục | Mô tả ngắn |
|---|---|---|
| Chi nhánh | Bộ chọn chi nhánh | Chuyển đổi xem dữ liệu theo từng chi nhánh hoặc "Tất cả chi nhánh" |
| Tổng quan | Dashboard | Trang tổng quan nhanh: số liệu hôm nay, doanh thu, lịch đặt gần nhất |
| Quản lý sân | Danh sách sân | Quản lý danh mục các sân thể thao |
| Quản lý sân | Đặt lịch | Lịch đặt sân dạng lưới giờ/ngày, tạo/hủy đặt sân |
| Quản lý sân | Khách hàng | Quản lý danh sách khách hàng và lịch sử |
| Quản lý sân | Bảng giá | Cấu hình khung giá theo giờ và lịch đặt cố định hàng tuần |
| Báo cáo | Doanh thu | Báo cáo tài chính chi tiết theo khoảng thời gian |
| Báo cáo | Lượt xem trang | Phân tích lưu lượng truy cập trang đặt sân công khai |
| Hệ thống | Chi nhánh | Quản lý danh sách các chi nhánh (cơ sở) |
| Hệ thống | Tài khoản | Quản lý tài khoản nhân viên và phân quyền |
| Hệ thống | Cài đặt | Cấu hình thông tin sân, giờ hoạt động, thông báo, tài khoản cá nhân |

Ngoài ra, phần **header** (thanh trên cùng) và nút **"Tin nhắn"** nổi (floating button) cung cấp các chức năng dùng chung xuất hiện trên mọi trang.

## Danh sách file tài liệu chi tiết

| File | Nội dung |
|---|---|
| `01-dashboard.md` | Trang Tổng quan (Dashboard) |
| `02-quan-ly-san-danh-sach-san.md` | Quản lý sân – Danh sách sân |
| `03-dat-lich.md` | Đặt lịch (lịch đặt sân dạng lưới) |
| `04-khach-hang.md` | Quản lý khách hàng |
| `05-bang-gia.md` | Bảng giá dịch vụ & Lịch đặt cố định |
| `06-bao-cao-doanh-thu.md` | Báo cáo doanh thu |
| `07-luot-xem-trang.md` | Báo cáo lượt xem trang (Analytics) |
| `08-chi-nhanh.md` | Quản lý chi nhánh (Hệ thống) |
| `09-tai-khoan.md` | Quản lý tài khoản nhân viên (Hệ thống) |
| `10-cai-dat.md` | Cài đặt hệ thống |
| `11-hop-thu-chat.md` | Hộp thư chat với khách hàng |
| `12-header-va-chuc-nang-chung.md` | Header và các chức năng dùng chung toàn hệ thống |

## Tóm tắt nhanh các nhóm chức năng chính

Nhóm **Quản lý sân** là lõi nghiệp vụ: chủ sân khai báo danh sách sân theo từng môn thể thao, thiết lập bảng giá theo khung giờ (kèm giá đặt trước/ưu tiên), quản lý lịch đặt theo dạng lưới trực quan (giờ × sân, theo tuần), hỗ trợ đặt nhanh, đặt cố định hàng tuần (cho khách thuê sân dài hạn) và quản lý thông tin khách hàng (phân loại VIP/Thường xuyên/Mới, lịch sử chi tiêu).

Nhóm **Báo cáo** cung cấp hai loại thống kê: doanh thu theo giao dịch/thời gian, và lượt xem trang công khai (phân tích hành vi truy cập, giờ cao điểm, tỷ lệ chuyển đổi từ lượt xem sang đặt sân).

Nhóm **Hệ thống** dùng để vận hành đa chi nhánh: thêm/sửa chi nhánh (kèm bản đồ, slug URL riêng cho trang đặt sân công khai), quản lý tài khoản nhân viên theo 4 vai trò (Chủ sân, Quản lý, Thu ngân, Nhân viên), và cấu hình chung (thông tin sân, giờ hoạt động theo từng thứ trong tuần, bật/tắt loại thông báo, đổi thông tin/mật khẩu cá nhân).

Cuối cùng, **Hộp thư chat với khách hàng** là kênh nhắn tin tích hợp sẵn để chủ sân/nhân viên trả lời khách hàng nhắn đến từ trang đặt sân công khai, có bộ lọc theo trạng thái hội thoại và người phụ trách.
