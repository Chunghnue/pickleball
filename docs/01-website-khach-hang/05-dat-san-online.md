# Đặt sân online (`sanbong.vn/dat-san?venueId=...`)

## Mục đích
Luồng hoàn tất một lượt đặt sân, tổng hợp mọi lựa chọn của khách hàng và gửi yêu cầu đặt sân tới chủ cơ sở.

## Các bước / chức năng

### Bước 1 — Cơ sở đã chọn
- Hiển thị thẻ tóm tắt cơ sở đã chọn (ảnh, tên, địa chỉ, số sân).
- Nút **"Đổi"** cho phép quay lại chọn cơ sở khác.

### Bước 2 — Chọn sân & lịch
- **Chọn sân**: danh sách các sân con trong cơ sở (icon, tên sân, sức chứa) — chọn 1 sân cụ thể.
- **Ngày đặt sân**: bộ chọn ngày (mặc định là ngày hiện tại).
- **Thời lượng**: chọn nhanh 1h / 1.5h / 2h.
- **Chọn giờ bắt đầu**: lưới các khung giờ trong ngày (theo từng sân), disable khung giờ đã có người đặt.

### Bước 3 — Thông tin liên hệ
- Form nhập: **Họ tên*** , **Số điện thoại***, Email (tuỳ chọn), Ghi chú.

### Tóm tắt & xác nhận (sidebar)
- Hiển thị tóm tắt: Cơ sở, Sân đã chọn, Ngày, Giờ, Thời lượng, **Tổng thanh toán** (tự tính theo bảng giá).
- Nút **"Xác nhận đặt sân"** để hoàn tất.
- Ghi chú chính sách hủy: "Hủy trước 2 giờ miễn phí".
