# Auth + Users Frontend — Thiết kế chi tiết

**Ngày:** 2026-08-24
**Trạng thái:** Đã duyệt
**Thuộc kiến trúc tổng thể:** [2026-08-23-pickleball-platform-architecture-design.md](./2026-08-23-pickleball-platform-architecture-design.md)
**Xây trên API đã có:** [2026-08-23-auth-users-module-design.md](./2026-08-23-auth-users-module-design.md)

## 1. Mục tiêu

Xây giao diện Next.js (`apps/web`) cho toàn bộ luồng người dùng của module Auth + Users đã hoàn thành ở backend: đăng ký/đăng nhập khách hàng, đăng ký chủ sân (owner) và duyệt bởi admin.

## 2. Kiến trúc: BFF qua Next.js Route Handlers

Next.js server đứng giữa trình duyệt và NestJS API — trình duyệt không bao giờ gọi thẳng NestJS, và không bao giờ thấy raw token.

```
Browser ──(cookies, same-origin)──> Next.js Route Handlers (apps/web/src/app/api/*)
                                              │ (đính kèm Bearer token ở server)
                                              ▼
                                     NestJS API (apps/api)
```

- **Login:** `POST /app/api/auth/login` proxy sang NestJS, sau đó set `access_token` và `refresh_token` thành cookie **httpOnly, secure, sameSite=lax**. Chỉ trả `{ role }` về browser để redirect, không bao giờ trả raw token.
- **Gọi API cần xác thực:** route handler cho `/me`, `/admin/owners/*` đọc cookie `access_token`, đính kèm `Authorization: Bearer`, proxy sang NestJS.
- **Silent refresh:** helper dùng chung `fetchApi()` bắt lỗi `401` từ NestJS, gọi NestJS `/auth/refresh` bằng cookie `refresh_token`, xoay vòng cả hai cookie, thử lại request gốc một lần. Chỉ khi refresh cũng thất bại mới trả 401 về browser (browser redirect `/login`).
- **Bảo vệ route:** `middleware.ts` kiểm tra sự tồn tại của cookie `access_token` (và decode — không verify — claim `role` chỉ để redirect UX, ví dụ chặn customer vào `/admin`). Đây chỉ là tiện ích UX, ranh giới bảo mật thật sự vẫn là `JwtAuthGuard`/`RolesGuard` của NestJS đã có sẵn.
- **Email xác thực/reset:** `MailService` (backend) đổi để link trỏ về trang Next.js (`APP_URL` thay vì `API_BASE_URL`) để người dùng thấy giao diện đẹp thay vì JSON thô. Trang đó gọi route handler tương ứng để hoàn tất hành động.

## 3. Màn hình & route

**Công khai**

| Route | Mục đích |
|---|---|
| `/` | Landing tối giản — link tới login/register |
| `/register` | Form đăng ký khách hàng |
| `/register/owner` | Form đăng ký chủ sân (tách riêng vì kết quả sau xác thực khác nhau) |
| `/login` | Đăng nhập chung cho mọi vai trò; redirect theo role sau khi thành công (`customer→/me`, `owner→/owner`, `admin→/admin/owners`) |
| `/verify-email` | Đọc `?token=`, gọi API, hiển thị trạng thái thành công/hết hạn/không hợp lệ |
| `/forgot-password` | Yêu cầu gửi email reset |
| `/reset-password` | Đọc `?token=`, form mật khẩu mới |

**Bảo vệ — customer**

| Route | Mục đích |
|---|---|
| `/me` | Xem/sửa hồ sơ (fullName, phone, avatarUrl) |

**Bảo vệ — owner**

| Route | Mục đích |
|---|---|
| `/owner` | Dashboard placeholder ("Xin chào, bạn đã đăng nhập với vai trò chủ sân") — tính năng thật chờ module Courts |

**Bảo vệ — admin**

| Route | Mục đích |
|---|---|
| `/admin/owners` | Danh sách owner chờ duyệt, nút approve/reject |

Tổng cộng 11 trang. Route handler dưới `apps/web/src/app/api/*` map 1:1 với endpoint NestJS (register, register/owner, login, logout, refresh, verify-email, forgot-password, reset-password, users/me [GET+PATCH], admin/owners/pending, admin/owners/:id/approve, admin/owners/:id/reject) — mỗi route handler là wrapper mỏng gọi chung helper `proxyToApi()`.

## 4. Tech stack

| Thành phần | Công nghệ |
|---|---|
| UI component | shadcn/ui (Radix + Tailwind, code được copy vào repo) |
| Form/validate | react-hook-form + zod (schema soi theo DTO backend) |
| Token storage | httpOnly cookie qua Next.js Route Handlers (không dùng localStorage) |
| Test | Vitest + React Testing Library (chỉ logic quan trọng) |

## 5. Xử lý lỗi

- **Validate phía client** (zod schema soi theo DTO backend — email, password ≥ 8 ký tự...) chặn phần lớn input sai trước khi gọi API.
- **Lỗi từ API** hiển thị bằng field `message` NestJS đã trả: lỗi inline theo field khi có thể (vd: email trùng → lỗi dưới field email), còn lại hiển thị toast (sai mật khẩu, token hết hạn/không hợp lệ...).
- **401 sau khi silent refresh thất bại** → redirect `/login?returnTo=<path>`.
- **403 sai vai trò** (vd customer cố vào `/admin/owners`) → redirect về trang chủ của vai trò đó thay vì hiển thị lỗi thô.
- **429 bị giới hạn tần suất** → toast: "Bạn đã thử quá nhiều lần, vui lòng thử lại sau."

## 6. Testing

- **Vitest + React Testing Library**, chỉ tập trung vào logic dễ sai, không test render UI toàn bộ:
  - Logic refresh-retry (tách thành hàm thuần nhận fetch/cookie-get/cookie-set làm tham số, test được mà không cần Next.js request context thật): kiểm tra thử lại đúng 1 lần sau 401, xoay vòng cookie khi thành công, trả 401 nếu refresh cũng thất bại.
  - Zod schema cho từng form (register, login, reset-password, cập nhật hồ sơ): case hợp lệ/không hợp lệ khớp rule DTO backend.
- Không test render component, không dùng Playwright đợt này. Sau khi build xong, verify thủ công trực tiếp trên trình duyệt (đăng ký → xác thực → đăng nhập → hồ sơ; đăng ký owner → chờ duyệt → admin duyệt → đăng nhập) giống cách đã verify API.

## 7. Thay đổi backend đi kèm

- `apps/api/src/mail/mail.service.ts`: đổi link trong `sendVerificationEmail`/`sendPasswordResetEmail` từ `${API_BASE_URL}/auth/...` sang `${APP_URL}/verify-email?token=...` và `${APP_URL}/reset-password?token=...`.
- Thêm env var `APP_URL` (mặc định `http://localhost:3000`) vào `apps/api/.env.example`.

## 8. Ngoài phạm vi (để sau)

- Component/UI thật cho `/owner` dashboard (chờ module Courts)
- E2E browser test (Playwright)
- Đăng nhập qua số điện thoại/OTP, social login (đã ngoài phạm vi từ spec Auth+Users backend)
- Trang quản lý session/đăng xuất khỏi tất cả thiết bị
