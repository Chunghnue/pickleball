# Module: Staff Accounts (Quản lý tài khoản nhân viên) — Thiết kế chi tiết

**Ngày:** 2026-08-26
**Trạng thái:** Chờ review
**Thuộc kiến trúc tổng thể:** [2026-08-23-pickleball-platform-architecture-design.md](./2026-08-23-pickleball-platform-architecture-design.md)
**Nguồn tham khảo:** [docs/spec/09-tai-khoan.md](../../spec/09-tai-khoan.md) (khảo sát UI sanbong.vn thực tế)
**Sửa đổi:** [2026-08-23-auth-users-module-design.md](./2026-08-23-auth-users-module-design.md) (login theo SĐT, schema `users`, luồng tạo tài khoản không qua verify). Áp dụng **guard mới lên mọi module owner-facing đã duyệt** — xem §4 (không sửa từng file spec riêng lẻ, xem lý do ở đầu §4).

## 1. Mục tiêu

Cho phép owner tạo tài khoản nhân viên (Quản lý/Thu ngân/Nhân viên) truy cập hệ thống với quyền hạn hẹp hơn owner. Đây là module đầu tiên đưa hệ thống từ "1 role = 1 người = toàn quyền trên venue của mình" sang có nhiều người dùng chung một "doanh nghiệp" (owner) với quyền khác nhau.

**Hai quyết định vượt phạm vi đã chốt trước đó, được đảo ngược/mở rộng có chủ đích ở đây:**

1. Kiến trúc tổng thể liệt "đăng nhập qua SĐT/OTP" vào *Ngoài phạm vi MVP* — ở đây **mở rộng** thành đăng nhập bằng SĐT **+ password** (không phải OTP) làm định danh thay thế cho email, áp dụng cho mọi loại tài khoản.
2. Từ 3 role phẳng (`customer`/`owner`/`admin`, mỗi role = 1 tập quyền cố định) sang có khái niệm **nhân viên thuộc về một owner cụ thể**, với 2 tầng quyền hạn khác nhau trong phạm vi venue của owner đó.

## 2. Data model — sửa `users`

| Trường | Thay đổi |
|---|---|
| `role` | thêm giá trị `staff` vào enum hiện có (`customer`\|`owner`\|`admin`\|`staff`) |
| `owner_id` | **mới**, nullable, tự tham chiếu → `users.id`. Chỉ có giá trị khi `role = 'staff'` — trỏ tới tài khoản owner mà nhân viên này thuộc về. Null với `customer`/`owner`/`admin`. |
| `staff_role` | **mới**, nullable enum `manager`\|`cashier`\|`staff`. Chỉ có giá trị khi `role = 'staff'`. |
| `email` | đổi thành **nullable** (trước đây bắt buộc) — nhân viên có thể không có email theo doc gốc. Unique index đổi thành partial: `UNIQUE (email) WHERE email IS NOT NULL`. |
| `phone` | thêm unique index dạng partial: `UNIQUE (phone) WHERE phone IS NOT NULL` — cần dùng được làm định danh đăng nhập. **Rủi ro migration:** nếu dữ liệu `customer`/`owner` hiện có đã tồn tại số điện thoại trùng nhau (trước đây `phone` chỉ là thông tin liên hệ, không unique), migration phải kiểm tra và xử lý trùng trước khi thêm constraint. |

**CHECK constraint mới:** `email IS NOT NULL OR phone IS NOT NULL` — mọi tài khoản phải có ít nhất một định danh để đăng nhập.

Tài khoản nhân viên **bỏ qua luồng xác thực email** (không có `pending_verification`, tạo trực tiếp `status = 'active'` — owner là người tạo và chịu trách nhiệm, khác với customer/owner tự đăng ký công khai).

## 3. Sửa module Auth — đăng nhập theo email hoặc SĐT

```
POST /auth/login
  body: { identifier, password }   // trước đây { email, password } — đổi tên field, breaking change có chủ đích
```

Server tra `users` theo `email = identifier` trước, không thấy thì tra `phone = identifier`. Còn lại logic không đổi (so bcrypt, check `status = active`, phát access/refresh token). **Kéo theo sửa nhỏ ở frontend** (`/login` form đổi field gửi đi từ `email` sang `identifier`, theo [2026-08-24-auth-users-frontend-design.md](./2026-08-24-auth-users-frontend-design.md)).

## 4. Phân quyền 2 tầng — áp dụng lên toàn hệ thống

**Vì sao không sửa từng file spec cũ:** thay đổi là **cơ học và đồng nhất** — mọi endpoint hiện có gắn guard `role === 'owner'` chuyển sang dùng guard mới `OwnerScopeGuard` bên dưới, không đổi logic nghiệp vụ bên trong. Ghi nhận toàn bộ ở đây một lần, thay vì thêm ghi chú lặp lại ở 9 file spec khác.

**Guard mới:** `@OwnerScope('full' | 'operational')` thay cho `@Roles('owner')`.

1. Xác định **effective owner id** của request: `role = 'owner'` → chính `user.id`; `role = 'staff'` → `user.ownerId`.
2. Kiểm tra tầng: `full` yêu cầu `role = 'owner'` hoặc (`role = 'staff'` và `staffRole = 'manager'`); `operational` yêu cầu `full` **hoặc** (`role = 'staff'` và `staffRole` là `cashier`/`staff`). Không đạt → 403.
3. Gắn `request.effectiveOwnerId` — **mọi query đang lọc theo `user.id` làm `ownerId`** (vd `getOwnedVenueOrThrow`, `findMineByOwner`, mọi endpoint `venues/mine/*`) đổi sang dùng `effectiveOwnerId`. Đây là điểm chạm thật sự tới các module cũ — cơ học (đổi 1 biến), không đổi logic.

**Bảng phân tầng cho các endpoint đã duyệt:**

| Module | Tầng `full` (owner, quản lý) | Tầng `operational` (thu ngân, nhân viên) |
|---|---|---|
| Courts | Toàn bộ (tạo/sửa venue/court, ảnh, pricing rules, copy) | Không truy cập |
| Bookings (owner-facing) | Toàn bộ | Xem/tạo/huỷ booking (nghiệp vụ hàng ngày) |
| Payments | Toàn bộ | mark-paid / mark-refunded |
| Customers | Toàn bộ | Xem/tìm/thêm khách walk-in, đặt hộ |
| Pricing & Recurring Schedules | Toàn bộ | Không truy cập |
| Dashboard | Toàn bộ | Xem (không nhạy cảm hơn số liệu thu ngân đã thấy qua Payments) |
| Revenue Reports | Toàn bộ | Không truy cập |
| Page View Analytics | Toàn bộ | Không truy cập |
| Chat Inbox | Toàn bộ (kể cả assign/close/reopen) | Xem/trả lời hội thoại (không assign/close) |
| Settings | Toàn bộ | Không truy cập |
| Staff Accounts (module này) | Toàn bộ | Không truy cập |

Đây là phân loại mặc định theo mức độ nhạy cảm nghiệp vụ (cấu hình/tài chính tổng quan = `full`; vận hành hàng ngày = `operational`) — có thể điều chỉnh khi review.

## 5. API endpoints (module Staff Accounts, tầng `full` — chỉ owner/quản lý)

```
POST   /staff
  body: { fullName, phone, email?, staffRole, password }
GET    /staff?staffRole=&search=
  → gồm cả chính owner (1 dòng "Chủ sân") để khớp UI 4 thẻ đếm ở doc gốc
PATCH  /staff/:id
  body: { fullName?, phone?, email?, staffRole? }   // không đổi password ở đây
POST   /staff/:id/deactivate                        set status='suspended' (enum đã có sẵn ở Auth module)
POST   /staff/:id/reset-password
  body: { newPassword }                             owner đặt lại mật khẩu hộ (nhân viên có thể không có email để tự forgot-password)
```

**Thẻ số liệu:** đếm theo `staffRole` (+ 1 cho chính owner ở nhãn "Chủ sân"), scope theo `effectiveOwnerId`.

## 6. Validation

- `phone` bắt buộc khi tạo staff, unique toàn hệ thống (kể cả với customer/owner); `email` tuỳ chọn, unique nếu có.
- `staffRole` ∈ {`manager`,`cashier`,`staff`}.
- `password` tối thiểu 6 ký tự (theo đúng doc gốc — owner tạo hộ, không cần rule mạnh như đăng ký customer/owner tự phục vụ).
- `:id` trong `PATCH`/`deactivate`/`reset-password` phải có `owner_id = effectiveOwnerId` đang gọi → 404 nếu không (owner A không thao tác được lên nhân viên của owner B).
- Owner không tự deactivate chính mình qua endpoint này (chỉ áp dụng cho `role = 'staff'`).

## 7. Testing

- **Unit:** `OwnerScopeGuard` — đúng tầng cho từng tổ hợp role/staffRole; resolve `effectiveOwnerId` đúng cho cả owner và staff.
- **Integration:** đăng nhập bằng `phone` thành công với tài khoản staff; đăng nhập bằng `email` vẫn hoạt động bình thường cho customer/owner hiện có (không breaking).
- **E2E:** owner tạo nhân viên `cashier` → nhân viên đăng nhập bằng SĐT → gọi `POST /bookings` (venues/mine) thành công, gọi `POST /venues/mine/:id` (sửa venue) → 403; owner deactivate nhân viên → nhân viên đăng nhập lại → bị từ chối (status không phải `active`).

## 8. Ngoài phạm vi

- Ma trận quyền chi tiết theo từng endpoint/thao tác cho từng `staffRole` (chỉ 2 tầng thô — xem lý do ở §4 preview đã chọn).
- Nhân viên thuộc về nhiều owner cùng lúc (1 nhân viên chỉ gắn với đúng 1 owner).
- Tự phục vụ (nhân viên tự đổi thông tin/mật khẩu) — dùng chung `/me`/`change-password` đã có ở Settings, không cần endpoint riêng.
- OTP/SMS xác thực khi đăng nhập bằng SĐT (chỉ là định danh thay thế + password, không phải OTP).
- Audit log ai-làm-gì (không lưu vết thao tác của từng nhân viên riêng biệt với owner).
- Frontend (spec riêng, sau khi spec API này được duyệt).
