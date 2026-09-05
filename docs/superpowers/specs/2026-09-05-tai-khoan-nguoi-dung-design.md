# Tài khoản người dùng (`/tai-khoan/...`) — đổi tên route, thêm chỉ số hồ sơ + địa chỉ

**Ngày:** 2026-09-05
**Trạng thái:** Đã duyệt
**Thuộc kiến trúc tổng thể:** [2026-08-23-pickleball-platform-architecture-design.md](./2026-08-23-pickleball-platform-architecture-design.md)
**Xây trên:** [2026-08-23-auth-users-module-design.md](./2026-08-23-auth-users-module-design.md), [2026-08-24-auth-users-frontend-design.md](./2026-08-24-auth-users-frontend-design.md), [2026-08-24-bookings-frontend-design.md](./2026-08-24-bookings-frontend-design.md)
**Nguồn tham khảo:** [docs/01-website-khach-hang/06-tai-khoan-nguoi-dung.md](../../01-website-khach-hang/06-tai-khoan-nguoi-dung.md) (khảo sát UI sanbong.vn thực tế, route `sanbong.vn/tai-khoan/...`)
**Đảo ngược quyết định trước:**
- [2026-08-24-auth-users-frontend-design.md](./2026-08-24-auth-users-frontend-design.md) §3 — quyết định route khách hàng là `/me` (và sau đó `/me/bookings` thêm ở bookings-frontend-design.md). Spec này đổi thành `/tai-khoan/ho-so` và `/tai-khoan/lich-su` cho khớp URL khảo sát gốc. Các spec khác nhắc `/me`/`/me/bookings` trong văn xuôi (bookings-frontend, payments-module, dat-san-online, trang-chu, header-layout, settings, staff-accounts...) là hồ sơ lịch sử, **không sửa lại** — chỉ mục này là nguồn quyết định route hiện hành.

## 1. Mục tiêu

Đưa khảo sát "Tài khoản người dùng" vào thiết kế: đổi tên route hồ sơ/lịch sử đặt sân cho khớp URL khảo sát, bổ sung 3 chỉ số tổng quan (tính toàn nền tảng, không giới hạn theo owner) + trường Địa chỉ trên hồ sơ, thêm mục "Hồ sơ" vào dropdown tài khoản ở header, chỉnh copy trạng thái rỗng ở trang lịch sử đặt sân.

## 2. Đổi route `/me` → `/tai-khoan/ho-so`, `/me/bookings` → `/tai-khoan/lich-su`

- Di chuyển `apps/web/src/app/me/page.tsx` → `apps/web/src/app/tai-khoan/ho-so/page.tsx`.
- Di chuyển `apps/web/src/app/me/bookings/page.tsx` → `apps/web/src/app/tai-khoan/lich-su/page.tsx`.
- `apps/web/src/lib/route-protection.ts:6` — `ROLE_HOME.customer: '/me'` → `'/tai-khoan/ho-so'`; dòng 15 — prefix `/me` → `/tai-khoan` (giữ nguyên roles `['customer']`).
- `apps/web/src/lib/route-protection.test.ts` — cập nhật các path kỳ vọng (`/me` → `/tai-khoan/ho-so`, `returnTo=%2Fme` → `returnTo=%2Ftai-khoan%2Fho-so`, v.v., dòng 20/28/36/46).
- `apps/web/src/proxy.ts:16` — matcher `'/me/:path*'` → `'/tai-khoan/:path*'`.
- `apps/web/src/app/login/page.tsx:16-17` — `ROLE_HOME.customer: "/me"` → `"/tai-khoan/ho-so"` (map riêng, độc lập với `route-protection.ts`, không tái cấu trúc gộp 2 map trong spec này — ngoài phạm vi).
- `apps/web/src/components/public-header.tsx:96-104` — đổi `Link href="/me/bookings"` → `/tai-khoan/lich-su`; thêm 1 `DropdownMenuItem` mới phía trên, `Link href="/tai-khoan/ho-so"` label "Hồ sơ" (icon `User` đã import sẵn, dùng icon khác cho mục Lịch sử — ví dụ `History` từ lucide-react). Thứ tự: Hồ sơ → Lịch sử đặt sân → divider → Đăng xuất.
- Trong `me/page.tsx` (di chuyển sang `tai-khoan/ho-so/page.tsx`): `returnTo=%2Fme` → `%2Ftai-khoan%2Fho-so`; `Link href="/me/bookings"` → `/tai-khoan/lich-su`.
- Trong `me/bookings/page.tsx` (di chuyển sang `tai-khoan/lich-su/page.tsx`): `returnTo=%2Fme%2Fbookings` → `%2Ftai-khoan%2Flich-su`.
- API endpoint `GET`/`PATCH /users/me` (backend `apps/api/src/users/users.controller.ts` và BFF proxy `apps/web/src/app/api/users/me/route.ts`) **giữ nguyên tên** — đây là tên API nội bộ, không phải route trang, không thuộc phạm vi đổi tên theo khảo sát.

## 3. Backend

### 3.1 Migration — thêm cột `address` vào `users`

Migration mới `1788010000000-AddAddressToUsers.ts`: thêm cột `address varchar nullable` vào bảng `users`.

`apps/api/src/users/entities/user.entity.ts` — thêm field:
```ts
@Column({ nullable: true, type: 'varchar' })
address: string | null;
```

`apps/api/src/users/dto/update-profile.dto.ts` — thêm:
```ts
@IsOptional()
@IsString()
address?: string;
```

`apps/api/src/users/users.service.ts:133-145` (`updateProfile`) — thêm tham số `address?: string` vào type `updates`, thêm `if (updates.address !== undefined) user.address = updates.address;`.

### 3.2 Endpoint mới `GET /users/me/stats`

Trả `{ totalBookings: number, totalSpent: number, tier: CustomerTier }` tính **toàn nền tảng** (mọi venue, không giới hạn theo owner) — khác với `CustomersService.aggregateCustomers` (owner-scoped, dùng cho CRM chủ sân). Tách khỏi `GET /users/me` để tránh chạy aggregate query mỗi lần header/các trang khác gọi `/users/me` (chỉ cần fullName).

`apps/api/src/users/users.module.ts` — thêm `Booking` vào `TypeOrmModule.forFeature([User, Booking])`. Import entity `Booking` trực tiếp từ `../bookings/entities/booking.entity`, **không** import `CustomersModule` (tránh phụ thuộc chéo — `CustomersModule` đã phụ thuộc `UsersModule`).

`apps/api/src/users/users.service.ts` — thêm method:
```ts
async getStats(userId: string): Promise<{
  totalBookings: number;
  totalSpent: number;
  tier: CustomerTier;
}> {
  const row = await this.bookingsRepository
    .createQueryBuilder('booking')
    .leftJoin('payments', 'payment', 'payment.booking_id = booking.id::text')
    .select(
      "COUNT(*) FILTER (WHERE booking.status <> 'cancelled')",
      'totalBookings',
    )
    .addSelect(
      "COALESCE(SUM(booking.total_price) FILTER (WHERE payment.status = 'paid'), 0)",
      'totalSpent',
    )
    .where('booking.customer_id = :userId', { userId })
    .getRawOne<{ totalBookings: string; totalSpent: string }>();
  const totalBookings = Number(row?.totalBookings ?? 0);
  const totalSpent = Number(row?.totalSpent ?? 0);
  return { totalBookings, totalSpent, tier: classifyTier(totalBookings, totalSpent) };
}
```
(inject `@InjectRepository(Booking) private readonly bookingsRepository: Repository<Booking>` trong constructor; import `classifyTier` từ `../customers/customer-classification` — file thuần hàm/hằng số, không kéo theo module `CustomersModule`.)

`apps/api/src/users/users.controller.ts` — thêm:
```ts
@Get('me/stats')
@UseGuards(RolesGuard)
@Roles(UserRole.CUSTOMER)
stats(@CurrentUser() user: AuthenticatedUser) {
  return this.usersService.getStats(user.userId);
}
```
(import `RolesGuard`, `Roles`, `UserRole` theo đúng pattern đã dùng ở `bookings.controller.ts:10-19`; class đã có `@UseGuards(JwtAuthGuard)` nên chỉ cần thêm `RolesGuard` ở method.)

### 3.3 BFF route mới

`apps/web/src/app/api/users/me/stats/route.ts` — proxy mỏng, cùng pattern `users/me/route.ts`:
```ts
export async function GET() {
  const upstream = await fetchApi('/users/me/stats');
  if (upstream.status === 401) await clearAuthCookies();
  return toNextResponse(upstream);
}
```

## 4. Frontend

### 4.1 `/tai-khoan/ho-so`

- Mount: `fetch('/api/users/me')` (như cũ) song song `fetch('/api/users/me/stats')`.
- Thêm 3 thẻ chỉ số phía trên form, mỗi thẻ 1 con số + nhãn: **Lần đặt sân** (`totalBookings`), **Hạng thành viên** (`tier`, Việt hoá bằng map cục bộ ngay trong file `{ new: "Mới", regular: "Thường xuyên", vip: "VIP" }` — không import `owner/customers/customer-format.ts`, tránh phụ thuộc chéo giữa khu vực public và khu vực owner cho 3 dòng map không đáng tách chung), **Tổng chi tiêu** (`totalSpent.toLocaleString("vi-VN")` + "đ").
- Form thêm field **Địa chỉ** (`Input`, cùng pattern với `phone`), thêm `address` vào `updateProfileSchema` (zod, optional string) và payload PATCH.
- Email tiếp tục hiển thị read-only như hiện tại — không đổi.
- Trong lúc `/api/users/me/stats` chưa trả về (đang tải) — 3 thẻ hiện `—` thay vì số, không chặn hiển thị form (2 fetch độc lập, không phụ thuộc nhau).

### 4.2 `/tai-khoan/lich-su`

- Đổi copy trạng thái rỗng: "Bạn chưa có booking nào" → "Bạn chưa có lượt đặt sân nào", thêm nút **"Tìm sân ngay"** (`Link` → `/venues`) ngay dưới dòng copy đó.
- Phần còn lại (danh sách booking, huỷ, báo cáo vấn đề, badge trạng thái) giữ nguyên như hiện tại.

## 5. Ngoài phạm vi

- Đăng nhập bằng số điện thoại/OTP — đã quyết định ngoài phạm vi ở `auth-users-frontend-design.md` §8, khảo sát chỉ ghi nhận quan sát chứ không khảo sát được giao diện thật (phiên đã đăng nhập sẵn khi khảo sát).
- Cho sửa email — giữ read-only, lý do đã ghi ở `settings-design.md` §5 (đổi email kéo theo mở lại toàn bộ luồng xác thực).
- Hiển thị mã khách hàng (`customerCode`, dạng `KH-XXXXXXXX`) cho chính khách hàng — khái niệm này hiện chỉ phục vụ CRM nội bộ của chủ sân, khảo sát không yêu cầu.
- Gộp `ROLE_HOME` map trùng lặp giữa `route-protection.ts` và `login/page.tsx` thành một nguồn — bug nhỏ có sẵn từ trước, không thuộc phạm vi spec này.

## 6. Testing

**Backend:**
- `users.service.spec.ts`: `getStats()` — không có booking nào → `{0, 0, 'new'}`; có booking `cancelled` → không tính vào `totalBookings`; có payment `paid` → cộng đúng vào `totalSpent`; đủ điều kiện VIP (`totalSpent >= 5_000_000` hoặc `totalBookings >= 10`) → `tier: 'vip'`.
- `users.controller` (nếu có e2e sẵn) hoặc bổ sung test guard: gọi `GET /users/me/stats` với role `owner`/`staff` → 403.
- `route-protection.test.ts`: cập nhật toàn bộ path kỳ vọng theo route mới.

**Frontend (manual/browser):**
- Vào `/tai-khoan/ho-so` khi đã đăng nhập customer có booking → đúng 3 chỉ số, sửa được Địa chỉ, lưu thành công.
- Vào `/tai-khoan/ho-so` khi chưa có booking nào → 3 chỉ số hiện đúng giá trị mặc định (0 lần, Mới, 0đ).
- Chưa đăng nhập, gõ thẳng `/tai-khoan/ho-so` hoặc `/tai-khoan/lich-su` → redirect `/login?returnTo=...` đúng path mới.
- Dropdown header: đủ 3 mục Hồ sơ/Lịch sử đặt sân/Đăng xuất, click "Hồ sơ" đúng sang `/tai-khoan/ho-so`.
- `/tai-khoan/lich-su` chưa có booking → đúng copy mới + nút "Tìm sân ngay" dẫn tới `/venues`.
- Đăng nhập role `owner` gõ thẳng `/tai-khoan/ho-so` → bị redirect về `/owner/dashboard` (theo `resolveRedirect`/`ROLE_HOME`), không crash.
