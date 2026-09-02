# Module: Đặt lịch (Lịch đặt sân)

**Đường dẫn:** Quản lý sân → Đặt lịch

Màn hình trung tâm để xem và thao tác lịch đặt sân theo dạng lưới (giờ × sân), theo từng ngày trong tuần.

## 1. Thanh trạng thái tổng quan

- **Đã đặt** – số khung giờ đã có khách đặt trong ngày đang xem.
- **Trống** – số khung giờ còn trống.
- **Đang chơi** – số khung giờ đang diễn ra (khách đang sử dụng sân).
- **Lấp đầy** – thanh tiến trình % tỷ lệ lấp đầy sân trong ngày.
- Nút **làm mới** (reload) dữ liệu lịch.
- Nút **"⚡ Đặt nhanh"** – mở form đặt sân nhanh không cần chọn ô lưới trước (tự chọn sân/giờ trong form).

## 2. Điều hướng theo tuần/ngày

- Chuyển tuần bằng nút mũi tên trái/phải, hoặc nút **"Hôm nay"** để quay về ngày hiện tại.
- Hiển thị dải 7 ngày trong tuần (Thứ 2 → Chủ Nhật), mỗi ngày là một nút chọn (ngày đang chọn được tô đậm; ngày hiện tại có chấm xanh đánh dấu).
- Ghi chú tiêu đề "Tuần DD/M – DD/M".

## 3. Bộ lọc theo loại sân

Tab lọc nhanh theo môn thể thao (ví dụ "Tất cả", "Pickleball…") kèm số lượng sân tương ứng.

## 4. Lưới lịch đặt sân

- Trục dọc: **khung giờ** (theo từng giờ, từ giờ mở cửa đến giờ đóng cửa đã cấu hình).
- Trục ngang: **danh sách sân** (mỗi sân một cột).
- Chú thích màu trạng thái ô: **Trống** (xanh lá), **Đã đặt** (đỏ/hồng), **Đang chơi** (xanh dương), **Cố định** (tím – slot thuộc lịch đặt cố định hàng tuần).
- Ô trống hiển thị dấu "+", có thể bấm để tạo lịch đặt mới ngay tại khung giờ/sân đó.
- Ô đã đặt hiển thị icon khóa kèm số lượng đặt (ví dụ "🔒 1").
- Dữ liệu lưới **tự động cập nhật mỗi 60 giây**.
- Hướng dẫn thao tác hiển thị ngay trên lưới: "Click ô trống để đặt", phím tắt gợi ý (chuyển ngày, về hôm nay, đặt nhanh).

## 5. Tạo lịch đặt mới (từ ô trống hoặc nút "Đặt nhanh")

Form **"[Tên sân] – [Giờ]"** hoặc **"Đặt sân nhanh"** gồm:

| Trường | Mô tả |
|---|---|
| Tên khách hàng * | Nhập tên khách |
| Số điện thoại * | Số điện thoại liên hệ |
| Sân * | Chọn sân (dropdown, tự điền nếu bấm từ ô lưới) |
| Giờ bắt đầu | Chọn giờ bắt đầu (tự điền nếu bấm từ ô lưới) |
| Thời lượng | Số giờ thuê sân (mặc định 2 giờ) |
| Ghi chú | Ví dụ "Cần thuê áo đấu…" |
| Tổng tiền dự tính | Tự động tính theo bảng giá áp dụng, hiển thị realtime |

Xác nhận bằng nút **"Xác nhận đặt sân"**, hoặc **"Hủy"** để đóng form.

## 6. Xem & hủy lịch đặt đã có

Bấm vào một ô đã đặt (màu đỏ/hồng) mở modal **"Chi tiết lịch đặt"** gồm:

- Tên sân + ngày đặt.
- Khách hàng, số điện thoại.
- Trạng thái (ví dụ "Đã đặt").
- Giờ đặt.
- **Mã booking** (mã tham chiếu duy nhất, ví dụ "SB-2026-03325").
- Nút **"Hủy lịch"** để hủy lượt đặt, hoặc **"Đóng"** để thoát.
