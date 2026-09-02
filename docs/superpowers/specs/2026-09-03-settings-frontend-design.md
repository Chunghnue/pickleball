# Module: Settings Frontend (Cài đặt) — Thiết kế chi tiết

**Ngày:** 2026-09-03
**Trạng thái:** Chờ review
**Thuộc kiến trúc tổng thể:** [2026-08-23-pickleball-platform-architecture-design.md](./2026-08-23-pickleball-platform-architecture-design.md)
**Backend liên quan:** [2026-08-26-settings-design.md](./2026-08-26-settings-design.md) (spec đã viết, **chưa hiện thực** — cần 1 plan backend chạy trước plan frontend của spec này, đúng trình tự đã dùng cho Courts/Bookings/Branches)
**Nguồn tham khảo UI:** [docs/spec/10-cai-dat.md](../../spec/10-cai-dat.md)

## 1. Mục tiêu & phạm vi

Trang "Cài đặt" cho owner tại `/owner/settings` (thay `ComingSoon` hiện tại), hiện thực toàn bộ `10-cai-dat.md`: 4 tab menu dọc bên trái — Thông tin sân, Giờ hoạt động, Thông báo, Tài khoản — trên API mô tả trong backend spec (§2-5 của spec đó).

## 2. Khác biệt so với tài liệu khảo sát gốc

- **Tab "Thông tin sân" trùng lặp có chủ đích với trang Branches** (`/owner/branches`) — cả hai cùng sửa `venues` (xem [backend spec §0](./2026-08-26-settings-design.md#0-cập-nhật-2026-09-03--đối-chiếu-lại-với-những-gì-đã-build-từ-2026-08-26)). Quyết định giữ nguyên theo yêu cầu, không rẽ nhánh sang "chỉ xem + link".
- **Tab "Thông tin sân" không có ô chọn chi nhánh** (tài liệu gốc chỉ khảo sát 1 sân) — dùng chung bộ chuyển đổi chi nhánh toàn cục (`useBranch()`) ở sidebar, xem §4.1.
- **Tab "Thông báo" bớt 1 công tắc** — bỏ "Nhắc bảo trì sân" (không có tính năng bảo trì để gắn vào, đã chốt ở backend spec).
- Dự án **chưa có component `Switch`** (chỉ có `Dialog`/`Button`/`Input`/`Label`/`Card`/`Alert`/`Table`/`DropdownMenu` dựng trên `@base-ui/react`) — thêm mới `components/ui/switch.tsx` bọc `@base-ui/react/switch` (cùng pattern `Root`/export named components như `dialog.tsx` đã làm), dùng cho cả 7 công tắc ngày hoạt động và 4 công tắc thông báo.

## 3. Kiến trúc trang (`apps/web/src/app/owner/settings/`)

Trang client component (`"use client"`), fetch qua route proxy `/api/*` (`fetchApi` → `toNextResponse`, cookie auth gắn phía server) — theo đúng mẫu `apps/web/src/app/api/customers/route.ts`. Không có shadcn `Tabs` trong dự án — tự quản `activeTab` state + nút bấm tô đậm, đúng pattern trang Pricing (`activeTab: "pricing" | "recurring"`) đã dùng.

**Next.js đã bị chỉnh sửa** trong repo này: trước khi viết route handler/trang, đọc hướng dẫn liên quan trong `apps/web/node_modules/next/dist/docs/` (theo cảnh báo `apps/web/AGENTS.md`).

### 3.1. `types.ts`

```ts
export type SettingsTab = "venue" | "hours" | "notifications" | "account";

export interface OperatingHourRow {
  dayOfWeek: number; // 0-6, 0 = Chủ Nhật
  isOpen: boolean;
  openTime: string | null; // "HH:mm"
  closeTime: string | null;
}

export interface NotificationSettings {
  newBooking: boolean;
  cancellation: boolean;
  payment: boolean;
  dailyReport: boolean;
}
```

`Venue` (tab Thông tin sân) tái dùng nguyên type đã có ở `apps/web/src/app/owner/types.ts` — không định nghĩa lại.

`Profile` (tab Tài khoản) **không** tái dùng nguyên `Profile` cục bộ của `apps/web/src/app/me/page.tsx` — type đó chỉ có `{email, fullName, phone, avatarUrl}`, thiếu `role`/`staffRole` mà `10-cai-dat.md` §4 yêu cầu hiển thị. `GET /users/me` **đã** trả về đủ 2 field này (nguyên `User` entity, chỉ ẩn `passwordHash`), type ở `/me` chỉ đang thiếu khai báo. Khai báo riêng trong `account-tab.tsx`:

```ts
interface Profile {
  email: string;
  fullName: string;
  phone: string | null;
  avatarUrl: string | null;
  role: "owner" | "staff"; // luôn 1 trong 2 giá trị này ở /owner/settings
  staffRole: "manager" | "cashier" | "staff" | null;
}
```

### 3.2. `page.tsx`

- Layout: sidebar dọc bên trái (4 mục tab, mẫu menu dọc của tài liệu gốc — nút full-width, tab đang chọn nền xanh nhạt + chữ đậm) + khu vực nội dung bên phải, trong `<main>` chuẩn owner (tiêu đề "Cài đặt").
- State: `activeTab: SettingsTab` (mặc định `"venue"`, đọc từ query `?tab=` nếu có để cho phép deep-link).
- Mỗi tab là 1 component con tự quản state/fetch riêng (không load trước dữ liệu của tab chưa mở) — giữ `page.tsx` mỏng, đúng nguyên tắc đã dùng cho Pricing (`PricingRulesTab`/`RecurringSchedulesTab`).

### 3.3. Tab "Thông tin sân" (`venue-info-tab.tsx`)

Layout/field giống hệt phần thân `branch-form-dialog.tsx` (đã có, xem [Branches frontend §3.6](./2026-09-02-branches-frontend-design.md)) trừ 3 điểm khác:
1. Không có ô Slug/Quận-Huyện/bản đồ/checkbox Ẩn — `10-cai-dat.md` §1 chỉ liệt kê Logo, Tên sân, SĐT, Địa chỉ, Email, Website, Mô tả.
2. Thêm ô **Website** (field mới, xem backend spec §2).
3. Là 1 khối tĩnh trong trang (không phải dialog) với nút **"Lưu thay đổi"** riêng ở cuối, không tự đóng.

**Venue mục tiêu:** `useBranch().selectedVenueId`. Nếu `=== ALL_BRANCHES_ID` → gọi `GET /api/venues/mine`, tự chọn venue có `isDefault === true` (fallback venue đầu tiên nếu không có, chỉ xảy ra khi owner chưa từng tạo venue — trang lúc đó hiện thông báo "Chưa có chi nhánh nào, tạo chi nhánh trước ở mục Chi nhánh"). Đổi lựa chọn ở bộ chuyển đổi chi nhánh toàn cục trong lúc đang ở tab này → tự tải lại form theo venue mới (giống Pricing/Bookings/Customers).

Submit: `PATCH /api/venues/mine/{venueId}` (đã có, forward nguyên body — không cần sửa proxy) với `name`/`phone`/`address`/`email`/`website`/`description`; logo dùng lại đúng widget upload đã có ở `branch-form-dialog.tsx` (`POST /api/venues/mine/{venueId}/logo`, cùng validate JPG/PNG/WEBP ≤ 5MB). Thành công → toast "Đã lưu thay đổi".

### 3.4. Tab "Giờ hoạt động" (`operating-hours-tab.tsx`)

7 hàng cố định (Thứ 2 → Chủ Nhật, tài liệu gốc liệt kê theo thứ tự này dù `dayOfWeek` lưu 0=Chủ Nhật — hiển thị sắp lại `[1,2,3,4,5,6,0]`). Mỗi hàng: nhãn thứ + `<Switch>` bật/tắt + 2 ô giờ (`<input type="time">`, disabled khi `isOpen=false`, giá trị bị xoá khi tắt).

Venue mục tiêu: dùng chung logic §3.3 (cùng `selectedVenueId`/fallback).

- `GET /api/venues/mine/{venueId}/operating-hours` — **route proxy mới**. Chưa có dữ liệu (venue mới) → BE trả mặc định 7 ngày `isOpen=true, 06:00-22:00` (quyết định hiển thị hợp lý, ghi rõ trong plan backend vì spec BE hiện chưa chốt giá trị mặc định — xem việc cần làm ở plan).
- Submit: `PUT /api/venues/mine/{venueId}/operating-hours` — **route proxy mới**, body đúng 7 phần tử. Nút **"Lưu"** disable nếu có ngày `isOpen=true` mà `openTime >= closeTime` (validate client trước, hiện lỗi inline dưới hàng đó).

### 3.5. Tab "Thông báo" (`notifications-tab.tsx`)

4 hàng tĩnh (Đặt lịch mới / Hủy lịch / Thanh toán / Báo cáo ngày), mỗi hàng: tiêu đề + mô tả 1 dòng (lấy nguyên văn từ `10-cai-dat.md` §3) + `<Switch>` bên phải.

- `GET /api/notification-settings/mine` — **route proxy mới**.
- `PATCH /api/notification-settings/mine` — **route proxy mới**. Đổi 1 công tắc → gọi PATCH ngay (không cần nút "Lưu cài đặt" riêng — tối giản hơn tài liệu gốc vì mỗi công tắc độc lập, tránh mất thay đổi khi rời trang; toast "Đã lưu" mỗi lần bật/tắt) — **quyết định khác tài liệu gốc**, thay cho nút "Lưu cài đặt" tổng.

### 3.6. Tab "Tài khoản" (`account-tab.tsx`)

Không phải danh sách nhân viên (`/owner/accounts` — module Staff Accounts, khác hoàn toàn) — đây là hồ sơ của **người đang đăng nhập**.

- Khối hồ sơ: avatar (hiển thị `avatarUrl` hiện có, không thêm upload — giữ đúng cơ chế dán URL đã có ở `/me`, xem backend spec §5 "không đổi"), tên, vai trò hiển thị tĩnh — tái dùng `roleLabel()`/`roleKey()` đã có ở `apps/web/src/app/owner/accounts/staff-format.ts` (đúng nhãn "Chủ sân"/"Quản lý"/"Thu ngân"/"Nhân viên" đã dùng ở trang Tài khoản nhân viên, không định nghĩa map nhãn mới) — ô sửa **Họ và tên**/**Số điện thoại** (Email hiển thị **readonly**, đúng quyết định "ngoài phạm vi" đã chốt). Submit → `PATCH /api/users/me` (đã có, không đổi).
- Khối **"Đổi mật khẩu"**: 3 ô (Mật khẩu hiện tại/Mật khẩu mới/Xác nhận lại — xác nhận lại chỉ validate client, không gửi lên BE), nút **"Lưu"** riêng cho khối này → `POST /api/auth/change-password` — **route proxy mới** (không phải `/api/users/me/change-password` — backend spec §5 đặt endpoint ở `AuthController` để tránh circular dependency `UsersModule ↔ AuthModule`). Lỗi 400 (sai mật khẩu hiện tại) → inline lỗi dưới ô "Mật khẩu hiện tại" (`getSubmitErrorMessage`). Thành công → toast "Đã đổi mật khẩu", xoá 3 ô, **không** tự đăng xuất trình duyệt hiện tại (chỉ các thiết bị/phiên khác bị thu hồi, theo backend spec §5).
- Nút **"Đăng xuất"** cuối trang → `POST /api/auth/logout` (đã có) rồi điều hướng `/login`, đúng logic đã có ở `/me`.

## 4. Route proxy (`apps/web/src/app/api/`)

| File | Method | Chuyển tiếp tới backend |
|---|---|---|
| `venues/mine/[venueId]/operating-hours/route.ts` | GET, PUT | `/venues/mine/:id/operating-hours` — **file mới** |
| `notification-settings/mine/route.ts` | GET, PATCH | `/notification-settings/mine` — **file mới** |
| `auth/change-password/route.ts` | POST | `/auth/change-password` — **file mới**, 401 → `clearAuthCookies()` như mẫu các proxy mutating khác |

`venues/mine/[venueId]/route.ts` (PATCH), `venues/mine/[venueId]/logo/route.ts`, `venues/mine/route.ts` (GET), `users/me/route.ts` (GET/PATCH) — **không cần sửa**, đã có sẵn và forward nguyên body/response.

### 4.1. Bộ chuyển đổi chi nhánh toàn cục — tham chiếu, không đổi

`useBranch()` (`apps/web/src/lib/branch-context.tsx`) đã có, dùng nguyên như Pricing/Bookings/Customers. Không sửa file này.

## 5. Validation & lỗi (phía UI)

- Tab Thông tin sân: Tên sân rỗng → chặn submit (giống `BranchFormDialog`); logo sai định dạng/quá 5MB → toast lỗi trước khi upload (validate client y hệt `branch-form-dialog.tsx`).
- Tab Giờ hoạt động: `openTime >= closeTime` khi `isOpen=true` → chặn submit, lỗi inline đúng hàng.
- Tab Thông báo: không có validate (chỉ boolean); lỗi PATCH (không phải 401) → toast lỗi, tự phục hồi trạng thái công tắc về giá trị trước đó (optimistic update rollback).
- Tab Tài khoản: mật khẩu mới rỗng/dưới độ dài tối thiểu (đồng bộ rule đăng ký) hoặc "Xác nhận lại" không khớp → chặn submit trước khi gọi API; 400 từ BE (sai mật khẩu hiện tại) → inline lỗi, giữ nguyên 3 ô.
- Fetch tab lỗi (không phải 401) → trạng thái lỗi nhẹ trong khối nội dung tab đó ("Không tải được dữ liệu"), không vỡ layout/không ảnh hưởng các tab khác (mẫu Customers/Branches).
- 401 ở bất kỳ fetch nào (tab hoặc submit) → `router.push("/login?returnTo=%2Fowner%2Fsettings")`.

## 6. Testing

- **Unit (vitest):**
  - Sắp xếp hiển thị 7 ngày `[1,2,3,4,5,6,0]` từ dữ liệu `dayOfWeek` API trả về (hàm thuần, có test).
  - Validate `openTime < closeTime` khi `isOpen=true` cho từng hàng.
  - Validate mật khẩu mới đủ mạnh + khớp "Xác nhận lại" (hàm thuần tái dùng rule đăng ký nếu đã tách sẵn, nếu chưa thì viết mới có test riêng cho tab này).
- **UI (thủ công qua skill `run`/`verify`):**
  1. Vào `/owner/settings` → mặc định tab "Thông tin sân", đúng dữ liệu venue đang chọn ở bộ chuyển đổi chi nhánh; đổi chi nhánh ở sidebar → form tải lại đúng venue mới.
  2. Sửa tên/SĐT/địa chỉ/email/website/mô tả + đổi logo → Lưu → phản ánh đúng khi mở lại trang Chi nhánh (cùng venue).
  3. Tab Giờ hoạt động: bật/tắt từng ngày, đổi giờ → Lưu → tải lại trang, dữ liệu giữ nguyên.
  4. Tab Thông báo: tắt "Đặt lịch mới" → tạo booking test (vai khách) → xác nhận owner không nhận email (kiểm tra qua log/mailhog nếu có), customer vẫn nhận; bật lại → owner nhận.
  5. Tab Tài khoản: đổi tên/SĐT → Lưu → phản ánh ở header/sidebar owner; đổi mật khẩu đúng luồng (sai mật khẩu hiện tại → lỗi inline; đúng → toast thành công) → đăng xuất thiết bị khác test qua gọi `/auth/refresh` bằng refresh token cũ → 401; nút Đăng xuất hoạt động.

## 7. Ngoài phạm vi

- Hiện thực backend (`website` column, `venue_operating_hours`, `notification_settings`, 3 điểm gate/thêm notify-owner, `POST /auth/change-password`) — thuộc plan **backend**, chạy trước plan frontend của spec này.
- Hợp nhất UI với trang Branches (đã quyết định giữ trùng lặp, xem backend spec §0/§8).
- Upload avatar dạng file (giữ nguyên dán URL đã có ở `/me`).
- Sửa email tài khoản cá nhân.
- Đăng xuất khỏi 1 thiết bị cụ thể (danh sách phiên đăng nhập) — chỉ có "đăng xuất mọi thiết bị khác" ngầm định khi đổi mật khẩu.
