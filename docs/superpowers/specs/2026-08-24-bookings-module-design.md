# Module: Bookings — Thiết kế chi tiết

**Ngày:** 2026-08-24
**Trạng thái:** Đã duyệt
**Thuộc kiến trúc tổng thể:** [2026-08-23-pickleball-platform-architecture-design.md](./2026-08-23-pickleball-platform-architecture-design.md)

## 1. Mục tiêu

Module thứ ba cần triển khai, sau Auth+Users và Courts. Là lõi của hệ thống: khách hàng (customer) chọn sân + khung giờ trống và đặt sân, hệ thống đảm bảo không xảy ra double-booking (hai người cùng đặt trùng một slot). Đây là nền tảng dữ liệu cho module Payments (tracking thanh toán thủ công) triển khai sau.

Phạm vi: customer tạo/xem/huỷ booking, owner xem/huỷ booking thuộc venue của mình, endpoint public tra cứu slot còn trống có đánh dấu slot đã bị đặt. **Chỉ thiết kế API (NestJS)** — spec frontend sẽ được brainstorm riêng sau.

Phụ thuộc: **Courts** (court, venue, slot generation), **Users** (customer/owner identity).

## 2. Data model

**bookings** (record cha)

| Trường | Mô tả |
|---|---|
| id | UUID |
| court_id | → courts |
| customer_id | → users (bắt buộc, luôn là role `customer`) |
| date | DATE |
| start_time, end_time | TIME — khoảng thời gian tổng của booking (bao phủ N slot liên tiếp cùng court) |
| total_price | NUMERIC — snapshot tổng giá tại thời điểm đặt (tổng giá từng slot theo `court.pricePerHour` lúc đặt; không tính lại nếu owner đổi giá sau) |
| status | `confirmed` \| `cancelled` \| `completed` |
| cancelled_at | nullable — thời điểm huỷ |
| cancelled_by | nullable, → users — ai huỷ (customer hoặc owner) |
| created_at, updated_at | |

**booking_slots** (bảng con — mỗi dòng là một đơn vị slot bị chiếm bởi một booking)

| Trường | Mô tả |
|---|---|
| id | UUID |
| booking_id | → bookings, `ON DELETE CASCADE` |
| court_id | denormalized từ booking, phục vụ unique index |
| date | denormalized từ booking |
| slot_start | TIME — giờ bắt đầu của slot đơn vị (theo `slot_duration_minutes` của court) |

**Unique index:** `UNIQUE (court_id, date, slot_start)` trên `booking_slots`. Đảm bảo mỗi slot đơn vị chỉ thuộc về đúng một booking đang active tại một thời điểm — Postgres tự xử lý tranh chấp ở tầng insert khi hai request chạy đồng thời, không cần lock thủ công (xem mục 5).

**Thay đổi ở module Courts:** thêm cột `cancellation_cutoff_hours` (INT, default `2`) vào bảng `venues`, sửa được qua `PATCH /venues/mine/:id` hiện có. Cần thiết vì Bookings phụ thuộc Courts chứ không sở hữu bảng `venues`.

## 3. State machine

- Tạo booking → `confirmed` ngay lập tức (slot giữ chỗ tức thì — không có bước owner duyệt trước, không có trạng thái `pending`/`requested`).
- **Huỷ** (`confirmed` → `cancelled`):
  - Customer: chỉ huỷ được booking của chính mình, và chỉ khi `now() < (date + start_time) - venue.cancellation_cutoff_hours`.
  - Owner: huỷ được bất kỳ booking nào thuộc sân của mình, bất kỳ lúc nào, không giới hạn cutoff.
  - Khi huỷ: set `status = cancelled`, `cancelled_at = now()`, `cancelled_by = user_id`, và **xoá toàn bộ `booking_slots` con** của booking đó — giải phóng slot ngay lập tức cho người khác đặt. Record `bookings` cha vẫn giữ lại làm lịch sử.
- **Hoàn thành** (`confirmed` → `completed`): tính **lazy** khi đọc — trước khi trả kết quả cho bất kỳ query danh sách/chi tiết booking nào, service chạy:
  ```sql
  UPDATE bookings SET status = 'completed'
  WHERE status = 'confirmed' AND (date + end_time) < now()
  ```
  Không cần cron/scheduler.
- Huỷ booking đã `cancelled` hoặc `completed` → lỗi (400).

## 4. API endpoints

**Phía customer** (JWT, role `customer`):
```
POST   /bookings                      tạo booking mới { courtId, date, startTime, endTime }
GET    /bookings/mine                 danh sách booking của tôi (mới nhất trước)
GET    /bookings/mine/:id             chi tiết 1 booking của tôi
POST   /bookings/:id/cancel           huỷ booking (chỉ nếu còn ngoài cutoff của venue)
```

**Phía owner** (JWT, role `owner`, chỉ venue/court thuộc chính mình):
```
GET    /venues/mine/:venueId/bookings              danh sách booking thuộc venue (lọc theo ?date=, ?courtId= tuỳ chọn)
POST   /venues/mine/:venueId/bookings/:id/cancel   owner huỷ booking (không giới hạn cutoff)
```

**Phía public** (không cần đăng nhập):
```
GET    /bookings/availability?courtId=<id>&date=YYYY-MM-DD
       → [{ start, end, price, isBooked }]
```
Endpoint này gọi `CourtsService.getSlotsForDate()` (không sửa) để sinh lưới slot, sau đó query `booking_slots` theo `court_id + date` để đánh dấu `isBooked`. `/courts/:id/slots` (module Courts) giữ nguyên như cũ — không sửa endpoint đó, thêm endpoint riêng ở đây để giữ đúng hướng phụ thuộc Bookings → Courts.

Owner **không** có endpoint tạo booking (walk-in/chặn lịch bảo trì nằm ngoài phạm vi MVP — owner tạm ẩn cả sân qua `court.isActive` nếu cần chặn lịch).

## 5. Cơ chế chống double-booking

Vì mọi booking đều được ghép từ các slot đơn vị nằm trên cùng một lưới cố định của court (bội số của `slot_duration_minutes`), hai booking chồng lấn nhau chắc chắn tranh nhau ít nhất một dòng `booking_slots`. Do đó **unique index chuẩn của Postgres trên `(court_id, date, slot_start)` là đủ** để chặn double-booking, kể cả khi hai request chạy đồng thời — không cần advisory lock thủ công hay `EXCLUDE` constraint dạng range (cân nhắc nhưng không chọn, vì thêm độ phức tạp/extension `btree_gist` không cần thiết cho một bài toán vốn đã lượng tử hoá theo lưới cố định).

**Tạo booking (transaction):**
1. Validate court active, venue active, date không ở quá khứ, `start_time`/`end_time` thẳng hàng với lưới slot.
2. Tính tổng giá từ các slot đơn vị (snapshot theo giá hiện tại của court).
3. Insert 1 dòng `bookings` (status `confirmed`) + N dòng `booking_slots` (một dòng mỗi slot đơn vị) trong cùng transaction.
4. Nếu bất kỳ insert `booking_slots` nào vi phạm unique index (slot đã bị người khác giữ) → toàn bộ transaction rollback (atomic — không có booking "một phần") → trả **409 Conflict**.

## 6. Validation

- Court phải tồn tại, `is_active = true`, venue chứa nó phải `status = active`.
- `date` không được ở quá khứ.
- `start_time < end_time`; cả hai đều nằm trong `[open_time, close_time]` của court; `(start_time - open_time)` và `(end_time - start_time)` đều là bội số của `slot_duration_minutes`.
- Vi phạm unique index → 409 "một hoặc nhiều khung giờ đã được đặt".
- Huỷ: customer chỉ huỷ booking của chính mình và chỉ khi còn ngoài `cancellation_cutoff_hours` của venue (403 nếu vi phạm, kèm thông báo rõ ràng); owner chỉ huỷ booking thuộc venue mình sở hữu, không giới hạn thời gian; huỷ booking đã `cancelled`/`completed` → 400.

## 7. Testing

- **Unit:** validate slot-alignment (start/end khớp lưới), tính `total_price` snapshot, logic cutoff huỷ (boundary: đúng ngay ngưỡng, trước/sau ngưỡng), lazy-transition sang `completed`.
- **Integration (DB thật, không mock repository):** hai request tạo booking đồng thời cho cùng một slot → chỉ một thành công, request còn lại nhận 409. Bắt buộc chạy trên Postgres thật vì hành vi dựa vào unique index thật sự, không thể giả lập bằng mock.
- **E2E:** customer đặt sân → xuất hiện trong `/bookings/mine` → `/bookings/availability` đánh dấu đúng slot `isBooked` → customer huỷ trước cutoff (thành công) / sau cutoff (bị chặn 403) → owner huỷ bất kỳ lúc nào (thành công).

## 8. Ngoài phạm vi (module Bookings)

- Frontend (spec riêng, sau khi spec này được duyệt)
- ~~Owner tự tạo booking (walk-in khách vãng lai)~~ — **Đã đảo ngược**, xem [2026-08-26-customers-module-design.md](./2026-08-26-customers-module-design.md) §4 (thêm `customer_contacts`, `bookings.customer_id` nullable, endpoint `POST /venues/mine/:venueId/bookings`).
- Chặn slot bảo trì riêng lẻ — dùng tạm `court.isActive` để chặn cả ngày nếu cần (vẫn ngoài phạm vi)
- Trạng thái `pending`/`requested` chờ owner duyệt trước khi giữ chỗ
- Tích hợp thanh toán (thuộc module Payments, tham chiếu tới `bookings.id`)
- Đặt nhiều court trong 1 booking, đặt lặp lại định kỳ (recurring booking)
- No-show tracking, thống kê nâng cao
- Gửi lại yêu cầu sau khi bị huỷ/hoàn tiền (xử lý thủ công ngoài hệ thống trong MVP)
