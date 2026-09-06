# Tài khoản người dùng (`sanbong.vn/tai-khoan/...`)

## Mục đích
Quản lý danh tính người dùng cuối (người đặt sân) và lịch sử giao dịch của họ trên nền tảng.

## Các chức năng

### 1. Menu tài khoản (trên header)
- Khi đã đăng nhập: hiển thị tên người dùng, dropdown gồm **Hồ sơ**, **Lịch sử đặt sân**, **Đăng xuất**.
- Khi chưa đăng nhập: (không khảo sát được giao diện đăng nhập/đăng ký vì phiên đã đăng nhập sẵn) — hệ thống cho đăng nhập bằng số điện thoại.

### 2. Hồ sơ cá nhân (`/tai-khoan/ho-so`)
- Hiển thị 3 chỉ số tổng quan: **Lần đặt sân**, **Hạng thành viên** (ví dụ: NEW), **Tổng chi tiêu (VNĐ)**.
- Form chỉnh sửa thông tin cá nhân: Họ và tên, Số điện thoại, Email, Địa chỉ.
- Nút **"Lưu thay đổi"**.

### 3. Lịch sử đặt sân (`/tai-khoan/lich-su`)
- Danh sách các lượt đặt sân đã thực hiện (trạng thái mẫu khi chưa có dữ liệu: "Bạn chưa có lượt đặt sân nào" kèm nút "Tìm sân ngay").

### 4. Đăng xuất
- Liên kết `/dang-xuat` để kết thúc phiên đăng nhập.
