# Đặt sân online (`/venues/[id]`) — Đối chiếu tài liệu khảo sát

**Ngày:** 2026-09-05
**Trạng thái:** Đã duyệt
**Thuộc kiến trúc tổng thể:** [2026-08-23-pickleball-platform-architecture-design.md](./2026-08-23-pickleball-platform-architecture-design.md)
**Nguồn tham khảo:** [docs/01-website-khach-hang/05-dat-san-online.md](../../01-website-khach-hang/05-dat-san-online.md) (khảo sát UI sanbong.vn thực tế, route `sanbong.vn/dat-san?venueId=...`)
**Liên quan:**
- [2026-09-04-trang-chi-tiet-co-so-design.md](./2026-09-04-trang-chi-tiet-co-so-design.md) — đã quyết định `/venues/[id]` là điểm đặt sân duy nhất, không có route `/dat-san` riêng; spec này đối chiếu chi tiết từng bước của tài liệu khảo sát 05 với quyết định đó.
- [2026-08-24-bookings-frontend-design.md](./2026-08-24-bookings-frontend-design.md), [2026-08-24-bookings-module-design.md](./2026-08-24-bookings-module-design.md) — nơi luồng chọn slot + `POST /bookings` được thiết kế gốc.

## 1. Mục tiêu

Tài liệu `05-dat-san-online.md` khảo sát một trang **riêng biệt** `sanbong.vn/dat-san?venueId=...` tổng hợp toàn bộ lựa chọn đặt sân của khách rồi gửi yêu cầu. Route này **không tồn tại và sẽ không được xây** trên nền tảng hiện tại — quyết định đã chốt ở `trang-chi-tiet-co-so-design.md` §2. Spec này không thiết kế code mới; mục đích là đối chiếu từng phần của tài liệu khảo sát với luồng inline thực tế trên `/venues/[id]` để xác nhận không có khoảng trống chức năng nào bị bỏ sót, và ghi lại rõ những phần bị bỏ có chủ đích.

## 2. Đối chiếu từng bước

| Tài liệu khảo sát (05) | Thực trạng trên `/venues/[id]` |
|---|---|
| **Bước 1 — Cơ sở đã chọn**: thẻ tóm tắt cơ sở + nút "Đổi" quay lại chọn cơ sở khác | Không cần bước riêng — khách đã ở ngay trang `/venues/[id]` của đúng cơ sở đó (khối thông tin cơ sở đầu trang, `trang-chi-tiet-co-so-design.md` §4.3). Nút "Đổi" không có ý nghĩa vì không có bước trung gian để quay lại; khách dùng nút Back trình duyệt hoặc quay lại `/venues` (danh sách tìm kiếm). |
| **Bước 2 — Chọn sân & lịch** (chọn sân, ngày, thời lượng nhanh 1h/1.5h/2h, lưới khung giờ) | Lưới thống nhất "Lịch trống hôm nay": 1 date-picker chung, hàng = sân (kèm sức chứa), cột = khung giờ hợp nhất của mọi sân, ô disable đúng slot đã đặt — `apps/web/src/app/venues/[id]/page.tsx` (khối quanh dòng 457 "Lịch trống hôm nay"), thiết kế tại `trang-chi-tiet-co-so-design.md` §4.5. Thời lượng không phải nút bấm nhanh cố định 1h/1.5h/2h mà là dropdown số giờ chơi, giới hạn động theo số slot liên tiếp còn trống (`computeMaxConsecutiveDuration`, `apps/web/src/lib/slot-selection.ts`) — linh hoạt hơn 3 mốc cố định của bản khảo sát, không mất khả năng nào (khách vẫn chọn được 1h/1.5h/2h nếu còn trống, và cả các mốc khác nếu venue cho phép). |
| **Bước 3 — Thông tin liên hệ** (Họ tên*, SĐT*, Email, Ghi chú) | **Không có form nhập liệu.** Đặt sân online yêu cầu đăng nhập (`POST /bookings` gắn `JwtAuthGuard` + role `CUSTOMER`, `apps/api/src/bookings/bookings.controller.ts:27-28`); tên/SĐT lấy từ tài khoản đã đăng nhập, không nhập lại. Chưa đăng nhập → bấm "Xác nhận đặt sân" điều hướng `/login?returnTo=...` (`bookings-frontend-design.md` §3). Trường "Ghi chú" không tồn tại ở luồng khách hàng tự đặt — **có tồn tại** ở luồng riêng "chủ sân/nhân viên đặt hộ khách vãng lai" (`CreateOwnerBookingDto`, `customer_contacts`, xem `2026-08-26-customers-module-design.md` §4) nhưng đó là công cụ nội bộ của chủ sân, không phải trang public này. |
| **Tóm tắt & xác nhận (sidebar)**: Cơ sở, Sân, Ngày, Giờ, Thời lượng, Tổng thanh toán, nút "Xác nhận đặt sân", ghi chú "Hủy trước 2 giờ miễn phí" | Panel tóm tắt hiện ngay dưới lưới sau khi chọn ô (không phải sidebar cố định cạnh trang): sân + khung giờ + tổng giá tính từ `PricingRule` thực tế, nút "Xác nhận đặt sân" → `POST /bookings`, ghi chú huỷ **động theo venue** `"Hủy trước {venue.cancellationCutoffHours}h miễn phí"` (không hardcode 2h như bản khảo sát) — `trang-chi-tiet-co-so-design.md` §4.5, field `cancellationCutoffHours` mặc định `2` ở `apps/api/src/courts/entities/venue.entity.ts:42-43`. |

## 3. Vì sao không tách trang riêng

Lý do đã nêu ở `trang-chi-tiet-co-so-design.md` §2 (nhắc lại để spec này tự đủ nghĩa): tách luồng đặt sân sang route riêng tạo 2 điểm đặt sân trùng chức năng (trang chi tiết cũng có lưới slot), tăng rủi ro lệch dữ liệu (giá, trạng thái slot) giữa 2 nơi. Gộp làm 1 giúp khách thấy ngay tình trạng sân trống khi xem thông tin cơ sở, không cần điều hướng thêm bước.

## 4. Ngoài phạm vi

- Route `/dat-san?venueId=...` riêng biệt — quyết định không xây, xem mục 3.
- Form liên hệ (Họ tên/SĐT/Email/Ghi chú) cho khách chưa đăng nhập — nền tảng hiện tại không có đặt sân dạng khách vãng lai (guest checkout) ở phía public; mọi booking online gắn với tài khoản `CUSTOMER` đã xác thực. Guest booking chỉ tồn tại ở công cụ nội bộ chủ sân/nhân viên.
- Nút "Đổi cơ sở" — không cần thiết vì không có bước trung gian tách khỏi trang chi tiết cơ sở.
- Giữ lựa chọn slot qua vòng redirect đăng nhập — đã xác định ngoài phạm vi ở `bookings-frontend-design.md` §7.

## 5. Testing

Không có code mới nên không có test case mới. Test case bao phủ đầy đủ luồng này đã nằm ở `trang-chi-tiet-co-so-design.md` §5 (lưới lịch trống, chọn ô, đổi số giờ chơi, xác nhận đặt, chưa đăng nhập → redirect login) và `bookings-module-design.md`/`bookings-frontend-design.md` (tạo booking, xung đột 409, huỷ theo cutoff).
