# Tìm sân thể thao (`sanbong.vn/san-bong`)

## Mục đích
Cho phép người dùng tìm kiếm, lọc và duyệt toàn bộ danh sách cơ sở thể thao trên nền tảng (tại thời điểm khảo sát: 441 cơ sở phù hợp / tổng 623 cơ sở).

## Các chức năng

### 1. Tìm kiếm theo từ khoá
- Ô nhập "Tên sân, khu vực..." tìm theo tên cơ sở hoặc địa danh.

### 2. Bộ lọc
- **Loại sân**: dropdown chọn 1 trong 8 loại sân (Tất cả, Bóng đá, Bóng chuyền, Bóng rổ, Bóng bàn, Tennis, Cầu lông, Pickleball, Khác).
- **Tỉnh/thành**: dropdown liệt kê 34 tỉnh/thành kèm số lượng cơ sở mỗi tỉnh.
- Nút "Tìm ngay" áp dụng bộ lọc địa điểm + môn thể thao.
- Dải nút lọc nhanh theo loại sân dạng pill (🏟 Tất cả, ⚽ Bóng đá, 🏐 Bóng chuyền, 🏀 Bóng rổ, 🏓 Bóng bàn, 🎾 Tennis, 🏸 Cầu lông, 🏓 Pickleball, 🏅 Khác) và nút "Xóa lọc".

### 3. Sắp xếp kết quả
- Theo "Tên A-Z", "Nhiều sân nhất", "Theo tỉnh thành".

### 4. Danh sách kết quả & phân trang
- Hiển thị tổng số cơ sở phù hợp và số trang (ví dụ: 441 cơ sở · Trang 1/23).
- Mỗi kết quả hiển thị: icon môn thể thao, tên cơ sở, khu vực/quận-huyện, số sân.
- Mỗi kết quả có 2 hành động nhanh: **"Chi tiết"** (xem trang chi tiết cơ sở) và **"Đặt sân"** (đi thẳng tới luồng đặt sân nhanh cho cơ sở đó).
- Điều hướng phân trang dạng số trang (1, 2, 3 ... 23).
