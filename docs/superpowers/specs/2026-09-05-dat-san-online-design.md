# Đặt sân online (`/dat-san`) — Tách trang riêng, thêm đặt sân khách vãng lai

**Ngày:** 2026-09-05
**Trạng thái:** Đã duyệt
**Thuộc kiến trúc tổng thể:** [2026-08-23-pickleball-platform-architecture-design.md](./2026-08-23-pickleball-platform-architecture-design.md)
**Nguồn tham khảo:** [docs/01-website-khach-hang/05-dat-san-online.md](../../01-website-khach-hang/05-dat-san-online.md) (khảo sát UI sanbong.vn thực tế, route `sanbong.vn/dat-san?venueId=...`)
**Đảo ngược quyết định trước:**
- [2026-09-04-trang-chi-tiet-co-so-design.md](./2026-09-04-trang-chi-tiet-co-so-design.md) §2 — trước đó quyết định "không tách route `/dat-san` riêng, `/venues/[id]` là điểm đặt sân duy nhất". **Spec này đảo ngược quyết định đó**: tách hẳn phần chọn sân/giờ + xác nhận sang route `/dat-san` mới, `/venues/[id]` chỉ còn xem lịch trống (không thao tác được).
- Bản đầu tiên của chính file này (cùng ngày) chỉ đối chiếu tài liệu khảo sát với luồng inline cũ, kết luận "không cần tách trang" — nội dung đó đã lỗi thời, bị thay thế hoàn toàn bởi bản này.
- [2026-08-24-bookings-frontend-design.md](./2026-08-24-bookings-frontend-design.md) §3, §7 — luồng đặt sân inline trên `/venues/[id]` và quyết định "bắt buộc đăng nhập, không giữ lựa chọn qua redirect login" mô tả ở đây bị thay thế bởi mục 4/5 spec này.

## 1. Mục tiêu

Tách luồng đặt sân ra khỏi trang chi tiết cơ sở, đưa vào route riêng `/dat-san?venueId=...` đúng tinh thần tài liệu khảo sát gốc, đồng thời bổ sung khả năng **đặt sân không cần đăng nhập** (khách vãng lai nhập Họ tên/SĐT/Email/Ghi chú) — điều mà bản inline cũ không hỗ trợ (bắt buộc tài khoản `CUSTOMER`).

## 2. Routing & điều hướng

- Trang mới: `apps/web/src/app/dat-san/page.tsx`, URL `/dat-san?venueId=<uuid>&courtId=&date=&start=`.
  - `venueId` bắt buộc — thiếu hoặc venue không tồn tại/không public → hiện trạng thái lỗi "Không tìm thấy cơ sở" kèm link `/venues`.
  - `courtId`, `date`, `start` optional, dùng để **preselect** khi đến từ `/venues/[id]` (mục 3). Giá trị không hợp lệ (sân không thuộc venue, slot đã đặt...) → bỏ qua preselect, về trạng thái mặc định (chưa chọn), không lỗi.
- Bước 1 "Cơ sở đã chọn": thẻ tóm tắt venue (ảnh, tên, địa chỉ, số sân — dữ liệu từ `GET /api/venues/:id`, tái dùng response đã có). Nút **"Đổi"** → `router.push('/venues')` (không có bước chọn-nhiều-venue trung gian nào để quay lại, `/venues` là danh sách tìm kiếm đã có).

## 3. `/venues/[id]` — lưới chuyển thành chỉ xem (read-only)

Giữ nguyên toàn bộ phần còn lại của `trang-chi-tiet-co-so-design.md` (gallery, bản đồ, giờ hoạt động, thông tin liên hệ). Chỉ đổi §4.5 (lưới lịch trống):

- Lưới vẫn hiển thị đúng như thiết kế cũ (1 date-picker chung, hàng = sân, cột = khung giờ hợp nhất, giá từng ô, 3 trạng thái màu Trống/Đã đặt/…) nhưng **ô không còn click-to-select** — bỏ hẳn state `selectedStart`/`durationSlots`, panel tóm tắt inline, và lời gọi `POST /bookings` khỏi trang này.
- Click 1 ô **Trống** → điều hướng `router.push(\`/dat-san?venueId=${venue.id}&courtId=${courtId}&date=${date}&start=${slot.start}\`)`.
- Click 1 ô **Đã đặt** → không làm gì (giữ nguyên, chỉ để xem).
- Thêm nút nổi bật "Đặt sân" phía trên lưới (không phụ thuộc đã chọn ô nào) → `router.push(\`/dat-san?venueId=${venue.id}\`)`, cho khách muốn qua thẳng trang đặt sân tự chọn từ đầu.

## 4. Backend

### 4.1 Migration — thêm cột contact snapshot trên `bookings`

Bảng `bookings` thêm 3 cột nullable: `contact_name varchar`, `contact_phone varchar`, `contact_email varchar`. Áp dụng cho **mọi** booking tạo qua `POST /bookings` (khách vãng lai lẫn đã đăng nhập) — không đụng tới `customer_contact_id`/bảng `customer_contacts` (giữ nguyên, chỉ dùng cho công cụ đặt hộ của chủ sân).

### 4.2 `POST /bookings` — chuyển sang optional-auth, mở rộng DTO

`apps/api/src/bookings/bookings.controller.ts:27-35` — đổi từ bắt buộc `JwtAuthGuard`+`Roles(CUSTOMER)` sang guard mới `OptionalJwtAuthGuard` (extends `AuthGuard('jwt')`, override `handleRequest(err, user)` trả `user ?? null` thay vì throw khi thiếu/token không hợp lệ — không chặn request, chỉ gắn `request.user` nếu có). Role check cũ (`Roles(CUSTOMER)`) bỏ hẳn ở endpoint này — ai gọi cũng được, có JWT hợp lệ với role `CUSTOMER` thì gắn `customerId`, không có/role khác thì coi như khách vãng lai (không có JWT hợp lệ role `owner`/`staff` gọi endpoint này cũng rơi vào nhánh khách vãng lai — chấp nhận được, không phải luồng họ dùng).

`CreateBookingDto` (`apps/api/src/bookings/dto/create-booking.dto.ts`) thêm, cùng mức validate đơn giản đã dùng ở `NewCustomerDto` (`apps/api/src/customer-contacts/dto/customer-selector.dto.ts:10-17`, không có regex định dạng SĐT):
```ts
@IsString() @MinLength(1) contactName: string;
@IsString() @MinLength(1) contactPhone: string;
@IsOptional() @IsEmail() contactEmail?: string;
@IsOptional() @IsString() note?: string;
```

`BookingsService.create(customerId: string | null, dto: CreateBookingDto)` — bỏ bắt buộc `customerId` (đổi sang `string | null`), truyền `contactName/contactPhone/contactEmail/note` xuống `createBookingRecord` để lưu vào 3 cột mới bất kể `customerId` có giá trị hay không.

### 4.3 Email xác nhận cho khách vãng lai

Trong `create()`, sau khi tạo booking: nếu `customerId` null và `dto.contactEmail` có giá trị → gọi `notificationsService.notifyBookingConfirmed({ to: dto.contactEmail, customerName: dto.contactName, venueName, courtName, date, startTime, endTime, totalPrice })` (hàm đã có sẵn, không sửa `NotificationsService`). Nếu `customerId` có giá trị, giữ nguyên hành vi cũ (lấy email theo tài khoản).

### 4.4 Phía chủ sân — ưu tiên contact snapshot khi hiển thị

`BookingsService.findByVenueForOwner` (đang enrich `customerName`/`customerPhone` qua join `UsersService`/`CustomerContact`, `bookings-frontend-design.md` §5b) — đổi thứ tự ưu tiên: nếu booking có `contactName`/`contactPhone` (cột mới) → dùng trực tiếp, không cần join; chỉ fallback sang join `customerId`/`customerContactId` cho các booking cũ (tạo trước migration này) hoặc tạo qua `createForOwner` (không đi qua endpoint này nên không có 2 cột mới).

## 5. Frontend — `apps/web/src/app/dat-san/page.tsx`

- Mount: `fetch('/api/venues/{venueId}')` lấy venue+courts (kiểu `PublicVenueDetail` đã có), song song `fetch('/api/users/me')` để biết đăng nhập (theo mẫu `PublicHeader`).
- **Bước 2** — chọn sân (danh sách chip/radio từ `venue.courts`, mặc định `courtId` từ query nếu hợp lệ, không thì sân đầu tiên), 1 date-picker (mặc định `date` từ query hoặc hôm nay), lưới khung giờ của **riêng sân đang chọn** qua `GET /api/bookings/availability?courtId=&date=` (đơn sân, không cần lưới nhiều hàng như trang chi tiết). Chọn ô → dropdown số giờ chơi động (tái dùng `computeMaxConsecutiveDuration`, `@/lib/slot-selection`). Có `start` hợp lệ từ query → tự chọn sẵn ô đó.
- **Bước 3** — form liên hệ, luôn hiện: Họ tên*, SĐT*, Email (tuỳ chọn), Ghi chú (tuỳ chọn). Đã đăng nhập (`/api/users/me` trả user) → prefill `contactName`/`contactPhone` từ `user.fullName`/`user.phone` (`phone` có thể `null` nếu tài khoản chưa từng cập nhật SĐT — prefill rỗng, khách phải tự nhập trước khi xác nhận vì `contactPhone` bắt buộc), vẫn cho sửa tự do (state cục bộ độc lập, không ghi ngược vào tài khoản).
- **Panel tóm tắt** (dưới form, không phải sidebar cố định): venue, sân, ngày, giờ, thời lượng, tổng giá, ghi chú huỷ động `"Hủy trước {venue.cancellationCutoffHours}h miễn phí"`, nút **"Xác nhận đặt sân"**.
- Xác nhận → `POST /api/bookings` với `{ courtId, date, startTime, endTime, contactName, contactPhone, contactEmail?, note? }` (đăng nhập hay không đều gọi endpoint này, cookie JWT tự đính kèm nếu có — không cần logic rẽ nhánh 2 endpoint).
  - **201** → thay toàn bộ form bằng trạng thái xác nhận tại chỗ: "Đặt sân thành công" + tóm tắt (sân/ngày/giờ/tổng giá), không có link tra cứu lại (ngoài phạm vi, mục 6). Đã đăng nhập → thêm link "Xem trong Lịch sử đặt sân" (`/me/bookings`).
  - **409** (slot vừa bị đặt) → toast lỗi, refetch availability, reset lựa chọn giờ (giữ nguyên form liên hệ đã nhập).
  - Lỗi khác (400 validate...) → toast hiển thị message backend.
- Không có bắt buộc đăng nhập, không có redirect `/login` ở trang này.

## 6. Ngoài phạm vi

- Tra cứu/xem lại/huỷ booking cho khách vãng lai (không có tài khoản) — họ liên hệ trực tiếp chủ sân nếu cần huỷ. Có thể làm sau (tra cứu bằng mã booking + SĐT) nếu phát sinh nhu cầu thật.
- Đổi routing `/venues/[id]` sang slug — không thuộc phạm vi spec này.
- Cập nhật `/me/bookings` để hiển thị `contactName` thay tên tài khoản khi khách đã sửa form — `/me/bookings` tiếp tục hiển thị theo tài khoản như hiện tại, không đọc cột contact snapshot.
- Rate limit/CAPTCHA chống spam đặt sân ẩn danh — quy mô MVP cá nhân, chưa cần.
- Gộp `CustomerContact` (công cụ CRM của chủ sân) với contact snapshot mới trên `bookings` — 2 cơ chế tách biệt có chủ đích (mục 4.1).

## 7. Testing

**Backend:**
- `bookings.service.spec.ts`: `create()` với `customerId = null` + đủ `contactName`/`contactPhone` → tạo booking thành công, 2 cột contact lưu đúng, không throw dù thiếu `customerId`. `create()` với `customerId` hợp lệ → hành vi cũ giữ nguyên (booking vẫn gắn `customerId`), đồng thời vẫn lưu contact snapshot theo dto.
- Guest + có `contactEmail` → `notifyBookingConfirmed` được gọi đúng tham số; guest không có `contactEmail` → không gọi; có `customerId` → gọi theo email tài khoản như cũ (không đổi).
- `findByVenueForOwner`: booking có contact snapshot → trả đúng `contactName`/`contactPhone` không cần join; booking cũ không có snapshot → fallback join như cũ.
- `bookings.controller` e2e: gọi `POST /bookings` không kèm cookie JWT + đủ contact fields → 201; kèm JWT customer hợp lệ → 201 và booking có `customerId`; thiếu `contactName`/`contactPhone` → 400.

**Frontend (manual/browser):**
- Từ `/venues/[id]`, bấm 1 ô trống trên lưới → sang đúng `/dat-san` với sân/ngày/giờ preselect đúng; bấm ô đã đặt → không có phản ứng.
- Mở thẳng `/dat-san?venueId=...` (không preselect) → chọn sân, ngày, giờ, số giờ chơi, nhập liên hệ, xác nhận → 201, hiện đúng trạng thái thành công.
- Chưa đăng nhập → không bị redirect `/login`, đặt sân thành công với thông tin tự nhập.
- Đã đăng nhập → form liên hệ prefill đúng tên/SĐT tài khoản, sửa được, booking tạo ra vẫn thấy ở `/me/bookings` (gắn đúng `customerId`).
- Nhập Email khi đặt vãng lai → nhận được email xác nhận đúng nội dung; để trống Email → không có email nào được gửi, vẫn đặt thành công.
- `venueId` không tồn tại/không public → hiện đúng trạng thái lỗi, không crash trang.
