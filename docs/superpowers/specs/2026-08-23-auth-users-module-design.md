# Module: Auth + Users — Thiết kế chi tiết

**Ngày:** 2026-08-23
**Trạng thái:** Đã duyệt
**Thuộc kiến trúc tổng thể:** [2026-08-23-pickleball-platform-architecture-design.md](./2026-08-23-pickleball-platform-architecture-design.md)

## 1. Mục tiêu

Module đầu tiên cần triển khai — nền tảng cho mọi module khác (Courts, Bookings, Payments, Admin đều phụ thuộc vào Users/Auth để xác định danh tính và phân quyền).

Phạm vi: đăng ký/đăng nhập bằng email + mật khẩu, xác thực email bắt buộc, owner cần admin duyệt trước khi hoạt động, quản lý hồ sơ người dùng cơ bản.

## 2. Data model

| Bảng | Trường chính |
|---|---|
| **users** | id, email (unique), password_hash, full_name, phone, avatar_url, role (`customer`\|`owner`\|`admin`), email_verified (bool), status (`pending_verification`\|`pending_approval`\|`active`\|`rejected`\|`suspended`), created_at, updated_at |
| **email_verification_tokens** | id, user_id, token_hash, expires_at, created_at |
| **password_reset_tokens** | id, user_id, token_hash, expires_at, used_at, created_at |
| **refresh_tokens** | id, user_id, token_hash, expires_at, revoked_at, created_at |

Token (verification/reset/refresh) chỉ lưu **hash**, không lưu raw token, để tránh lộ nếu DB bị rò rỉ.

## 3. State machine của tài khoản

- **Customer:** `pending_verification` → (xác thực email) → `active`. Admin có thể chuyển sang `suspended`.
- **Owner:** `pending_verification` → (xác thực email) → `pending_approval` → (admin duyệt) → `active`, hoặc `rejected` nếu admin từ chối. Admin có thể `suspended` sau này.
- **Admin:** tạo trực tiếp trong DB (seed), không qua đăng ký công khai, mặc định `active`.

Login chặn nếu status khác `active`, trả lỗi rõ ràng theo từng trường hợp:
- `pending_verification` → "vui lòng xác thực email"
- `pending_approval` → "tài khoản đang chờ admin duyệt"
- `rejected` / `suspended` → "tài khoản bị khoá/từ chối"

## 4. API endpoints

```
POST   /auth/register            đăng ký customer
POST   /auth/register/owner      đăng ký owner
GET    /auth/verify-email        xác thực email qua token
POST   /auth/login               trả access + refresh token
POST   /auth/refresh             cấp access token mới từ refresh token
POST   /auth/logout              thu hồi refresh token
POST   /auth/forgot-password     gửi email reset password
POST   /auth/reset-password      đặt lại password bằng token

GET    /users/me                 xem hồ sơ
PATCH  /users/me                 sửa hồ sơ (tên, sđt, avatar)

GET    /admin/owners/pending     admin: danh sách owner chờ duyệt
POST   /admin/owners/:id/approve
POST   /admin/owners/:id/reject
```

## 5. Bảo mật

- Password hash bằng **bcrypt**
- Access token JWT sống ngắn (~15 phút), refresh token sống dài (~30 ngày), refresh token lưu hash trong DB nên **thu hồi được** (logout = revoke)
- Rate limit đăng nhập/đăng ký (NestJS Throttler) để chặn brute-force cơ bản
- Guard theo role (`customer`/`owner`/`admin`) cho từng route

## 6. Testing

- Unit test cho AuthService: đăng ký, hash password, verify token, login thành công/thất bại theo từng status
- E2E test: luồng đăng ký → xác thực email → login → (với owner) chờ duyệt → admin duyệt → login lại thành công

## 7. Ngoài phạm vi (để sau)

- Đăng nhập qua số điện thoại/OTP
- Social login (Google, Facebook)
- Đa thiết bị/quản lý session nâng cao
