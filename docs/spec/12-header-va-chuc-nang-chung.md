# Header và các chức năng dùng chung toàn hệ thống

Các thành phần sau xuất hiện cố định trên mọi trang của hệ thống quản trị (không thuộc riêng module nào).

## 1. Thanh điều hướng bên trái (Sidebar) – Bộ chọn chi nhánh

Ở đầu sidebar là khối **"Chi nhánh"**, hiển thị tên chi nhánh đang được chọn để xem dữ liệu (ví dụ "Chi nhánh chính"). Bấm vào mở modal **"Chọn chi nhánh"** gồm:

- **"Tất cả chi nhánh"** – xem dữ liệu tổng hợp từ toàn bộ chi nhánh.
- Danh sách từng chi nhánh cụ thể (kèm nhãn "Mặc định" cho chi nhánh chính, số điện thoại liên hệ).

Việc chọn chi nhánh ở đây sẽ quyết định phạm vi dữ liệu hiển thị trên toàn bộ các trang khác (Dashboard, Danh sách sân, Đặt lịch, Khách hàng, Bảng giá, Báo cáo…).

## 2. Thanh header trên cùng

Từ trái sang phải:

- **Ngày giờ hiện tại & thời tiết** – hiển thị thứ/ngày/tháng/năm, giờ:phút:giây theo thời gian thực, icon thời tiết và nhiệt độ (nếu có dữ liệu).
- **Icon menu (≡)** – thu gọn/mở rộng thanh điều hướng bên trái.
- **Nút chuyển giao diện Sáng/Tối** (icon mặt trời/mặt trăng) – bật/tắt chế độ hiển thị tối (dark mode) cho toàn bộ giao diện.
- **Icon Thông báo (chuông)** – hiển thị chấm đỏ khi có thông báo mới (ví dụ đơn đặt mới, hủy lịch… theo cấu hình tại Cài đặt → Thông báo).
- **Avatar tài khoản** – bấm vào mở menu nhanh gồm:
  - Tên và vai trò tài khoản đang đăng nhập (ví dụ "OWNER").
  - Liên kết **"Thông tin tài khoản"** → điều hướng tới Cài đặt → tab Tài khoản.
  - **"Đăng xuất"** – thoát khỏi phiên đăng nhập hiện tại.

## 3. Nút "Tin nhắn" (nổi, góc dưới bên phải)

Luôn hiển thị trên mọi trang, mở **Hộp thư chat với khách hàng** (xem chi tiết tại `11-hop-thu-chat.md`).

## 4. Quy ước hiển thị chung

- Các trang danh sách (sân, khách hàng, chi nhánh, bảng giá, tài khoản…) đều có mẫu chung: **thẻ số liệu tổng hợp** ở đầu trang → **bộ lọc/tìm kiếm** → **bảng hoặc lưới dữ liệu** → **nút thêm mới** ở góc trên bên phải.
- Các form thêm/sửa đều mở dưới dạng **modal (hộp thoại nổi)**, có nút xác nhận (Lưu/Tạo/Xác nhận…) và nút Hủy/Đóng.
- Trường bắt buộc được đánh dấu bằng dấu **(*)** màu đỏ.
