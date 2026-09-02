# Module: Quản lý chi nhánh

**Đường dẫn:** Hệ thống → Chi nhánh

Quản lý danh sách các chi nhánh/cơ sở kinh doanh của chủ sân (mô hình đa chi nhánh).

## 1. Thẻ số liệu tổng hợp

- **Chi nhánh** – tổng số chi nhánh.
- **Tổng sân** – tổng số sân trên toàn bộ chi nhánh.
- **Booking tháng này** – tổng lượt đặt sân trong tháng của toàn hệ thống.
- **Doanh thu tháng** – tổng doanh thu tháng của toàn hệ thống.

## 2. Bộ lọc & hiển thị

- Tab lọc: **Hoạt động**, **Đã ẩn**, **Tất cả** (kèm số lượng).
- Ô tìm kiếm theo tên, địa chỉ, thành phố.
- Dropdown sắp xếp (mặc định "Mặc định trước").
- Chuyển đổi hiển thị dạng **lưới (thẻ)** hoặc **danh sách**.

## 3. Thẻ thông tin từng chi nhánh

Mỗi chi nhánh hiển thị dưới dạng thẻ gồm:

- Tên chi nhánh, nhãn **"MẶC ĐỊNH"** nếu là chi nhánh chính.
- Đường dẫn (slug) riêng của chi nhánh trên trang đặt sân công khai (ví dụ `/dinh-van-chung-6999`).
- Số liệu nhanh: **Sân**, **Booking tháng**, **DT tháng** (doanh thu tháng), **Lượt xem 7D**.
- Địa chỉ, số điện thoại, email liên hệ (hoặc "Chưa có địa chỉ/SĐT" nếu chưa cập nhật).
- Thao tác: **Mặc định** (đặt làm chi nhánh mặc định), **Sửa**, **Ảnh** (quản lý ảnh chi nhánh), **Xóa**.

## 4. Thêm chi nhánh mới

Nút **"+ Thêm chi nhánh"** mở form nhiều trường:

| Trường | Mô tả |
|---|---|
| Logo chi nhánh | Tải ảnh logo, PNG/JPG/WEBP, tối đa 5MB, khuyến nghị ảnh vuông 1:1 |
| Tên chi nhánh * | Ví dụ "Sân Quận 1, Chi nhánh Hà Đông…" |
| Đường dẫn (slug) | URL công khai dạng `sanbong.vn/<môn-thể-thao>/<slug>`; nếu để trống hệ thống tự sinh từ tên. Có cảnh báo giới hạn đổi slug tối đa 3 lần/180 ngày, cooldown 60 ngày để giữ SEO |
| Số điện thoại | Số liên hệ chi nhánh |
| Email | Email liên hệ chi nhánh |
| Địa chỉ | Địa chỉ chi tiết |
| Tỉnh/Thành phố, Quận/Huyện | Thông tin hành chính |
| Vị trí trên bản đồ | Bản đồ tương tác để chọn tọa độ, kèm nút "Vị trí của tôi" |
| Latitude / Longitude | Tọa độ (tự điền khi chọn trên bản đồ) |
| Mô tả | Ghi chú về chi nhánh, dịch vụ đặc biệt |

Xác nhận bằng nút **"Lưu chi nhánh"**.
