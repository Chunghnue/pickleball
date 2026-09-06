# Trang chủ (`sanbong.vn/`)

## Mục đích
Điểm vào chính của website, giúp người dùng tìm và đặt sân thể thao nhanh chóng, đồng thời giới thiệu về quy mô nền tảng và phần mềm quản lý dành cho chủ sân.

## Các chức năng/khối nội dung

### 1. Banner tìm kiếm nhanh (Hero search)
- Ô tìm kiếm nổi bật với 3 trường: **Địa điểm** (nhập quận/phường/khu vực), **Loại sân** (dropdown: Tất cả, Bóng đá, Bóng chuyền, Bóng rổ, Bóng bàn, Tennis, Cầu lông, Pickleball, Khác), **Ngày & giờ** (chọn ngày giờ muốn đặt).
- Nút "Tìm ngay" điều hướng sang trang kết quả tìm kiếm (`/san-bong`) kèm tham số lọc.
- Hai nút CTA phụ: "Tìm sân ngay" và "Xem bản đồ" (điều hướng `/ban-do`).
- Hiển thị số liệu tổng quan nền tảng: số cơ sở, số sân thể thao, số loại sân (ví dụ: 623 cơ sở, 857 sân, 8 loại sân).

### 2. Danh mục loại sân (Chọn loại sân)
- Lưới các icon môn thể thao (Bóng đá, Bóng chuyền, Bóng rổ, Bóng bàn, Tennis, Cầu lông, Pickleball, Khác).
- Click vào 1 loại sân → điều hướng tới trang tìm kiếm đã lọc theo `sportTypeId`.
- Nút "Xem tất cả" dẫn tới trang tìm kiếm đầy đủ.

### 3. Cơ sở thể thao nổi bật
- Danh sách card cơ sở được đề xuất (ảnh/icon, tên, địa chỉ, số sân).
- Nút "Xem chi tiết" trên từng card dẫn tới trang chi tiết cơ sở.
- Nút "Xem tất cả" dẫn tới trang tìm kiếm.

### 4. Quy trình đặt sân 3 bước
- Giới thiệu quy trình: (1) Tìm sân gần bạn, (2) Chọn ngày & giờ, (3) Xác nhận & đến sân — mang tính minh hoạ/hướng dẫn sử dụng, không phải chức năng tương tác.

### 5. Bản đồ rút gọn "Sân gần bạn nhất"
- Bản đồ nhúng (nền Leaflet/OpenStreetMap) hiển thị cụm ghim các cơ sở theo icon môn thể thao.
- Nút "Vị trí của tôi" để định vị GPS và tìm sân gần nhất.
- Danh sách rút gọn 5 cơ sở gần nhất kèm nút "Mở bản đồ đầy đủ" (điều hướng `/ban-do`).

### 6. Đặt sân theo tỉnh thành (toàn quốc)
- Bộ lọc nhanh theo môn thể thao (Bóng đá, Tennis, Cầu lông, Pickleball, Bóng rổ, Bóng chuyền, Bóng bàn).
- Danh sách 34 tỉnh/thành kèm số lượng cơ sở mỗi tỉnh (ví dụ: Hà Nội (155), Hồ Chí Minh (194)...).
- Mỗi mục là liên kết tới trang landing SEO riêng theo tỉnh + môn thể thao.

### 7. Khối giới thiệu phần mềm quản lý (marketing)
- Giới thiệu ngắn gọn về phần mềm quản lý sân bóng đá/cầu lông/tennis/pickleball dành cho chủ sân.
- Liệt kê lợi ích: quản lý lịch đặt sân realtime, báo cáo doanh thu, quản lý khách hàng/VIP tự động, thông báo Zalo/Telegram, app quản lý trên điện thoại.
- CTA "Đăng ký dùng thử miễn phí" và số hotline (081 22 88 111).

### 8. Đánh giá khách hàng (Testimonials)
- Hiển thị các đánh giá 5 sao từ người chơi (theo từng môn thể thao: bóng đá, tennis, pickleball) kèm tên và mô tả ngắn.

## Thành phần điều hướng chung xuất hiện trên mọi trang
Xem chi tiết trong `10-footer-va-thanh-phan-chung.md` (header, menu "Phần mềm quản lý", menu "Loại sân", menu tài khoản, footer).
