# Module: Staff Accounts Frontend (Tài khoản) — Thiết kế chi tiết

**Ngày:** 2026-09-02
**Trạng thái:** Chờ review
**Thuộc kiến trúc tổng thể:** [2026-08-23-pickleball-platform-architecture-design.md](./2026-08-23-pickleball-platform-architecture-design.md)
**Backend liên quan:** [2026-08-26-staff-accounts-design.md](./2026-08-26-staff-accounts-design.md) (API đã hiện thực + đã duyệt), plan [2026-09-02-staff-accounts-module-backend.md](../plans/2026-09-02-staff-accounts-module-backend.md)
**Nguồn tham khảo UI:** [docs/spec/09-tai-khoan.md](../../spec/09-tai-khoan.md)

## 1. Mục tiêu

Màn "Tài khoản" cho owner tại `/owner/accounts` (thay `ComingSoon` hiện tại ở `apps/web/src/app/owner/accounts/page.tsx` — route này đã được đặt sẵn trong sidebar, xem [owner-sidebar-layout-design.md](./2026-08-29-owner-sidebar-layout-design.md)), hiện thực `09-tai-khoan.md` trên API Staff đã có: 4 thẻ số liệu theo vai trò, tab lọc, ô tìm kiếm, bảng danh sách, dialog thêm/sửa nhân viên, và 2 hành động theo hàng (đặt lại mật khẩu, vô hiệu hoá).

Trang **không** dùng bộ chọn chi nhánh toàn cục (`useBranch()`) — nhân viên thuộc về owner, không thuộc về venue cụ thể nào (khác Dashboard/Bookings/Customers).

## 2. Khác biệt so với tài liệu khảo sát gốc

`09-tai-khoan.md` cho chọn cả 4 vai trò khi thêm nhân viên (kể cả "Chủ sân"). Backend đã quyết định (spec §5-6) chỉ tạo được 3 vai trò staff (`manager`/`cashier`/`staff`) qua `POST /staff` — không tạo thêm "Chủ sân" qua module này. Vì vậy:

- Dropdown vai trò trong form Thêm/Sửa chỉ có 3 lựa chọn: **Nhân viên / Thu ngân / Quản lý** (không có "Chủ sân").
- Tab lọc **"Chủ sân"** vẫn hiện đúng 1 dòng (chính owner — API luôn trả kèm dòng này, xem §4.1) nhưng đây là filter **thuần phía client** trên `role === 'owner'`, không gửi lên backend (`ListStaffDto.staffRole` chỉ nhận enum `manager|cashier|staff`, gửi `staffRole=owner` sẽ bị 400).
- Dòng "Chủ sân" trong bảng **không có nút hành động** nào (Sửa/Đặt lại mật khẩu/Vô hiệu hoá) — backend luôn 404 nếu owner tự thao tác lên chính mình qua các endpoint này (spec backend §6), nên frontend không hiện nút thay vì để bấm rồi báo lỗi.
- Không có nút "Kích hoạt lại" cho nhân viên đã vô hiệu hoá — backend chưa có endpoint này (spec backend §8, ngoài phạm vi). Sau khi vô hiệu hoá, dòng chỉ còn hiển thị badge trạng thái, không có hành động nào khác.

## 3. Kiến trúc & quy ước (theo codebase hiện có)

- Trang là **client component** (`"use client"`), fetch qua route proxy `/api/*` (dùng `fetchApi` → `toNextResponse`, đã gắn cookie auth phía server). KHÔNG gọi thẳng backend từ client — theo đúng mẫu `apps/web/src/app/api/customers/route.ts`.
- UI: component shadcn có sẵn (`Card`, `Button`, `Input`, `Label`, `Dialog`, `Table`), dropdown vai trò dùng thẻ `<select>` gốc + `SELECT_CLASS` (mẫu `court-form-dialog.tsx` — **chưa có** `components/ui/select` trong repo), icon `lucide-react`, toast `sonner`, nhãn tiếng Việt.
- Form Thêm/Sửa dùng `useState` thuần (không `react-hook-form`/`zod`) — theo đúng mẫu nhẹ của `add-customer-dialog.tsx`, vì form chỉ 5 trường đơn giản.
- **Next.js đã bị chỉnh sửa** trong repo này: trước khi viết route handler/trang, ĐỌC hướng dẫn liên quan trong `apps/web/node_modules/next/dist/docs/` (theo cảnh báo `apps/web/AGENTS.md`).

## 4. Route proxy mới (`apps/web/src/app/api/staff/`)

Forwarder mỏng theo đúng mẫu `app/api/customers/route.ts` (GET) và `app/api/customer-contacts/route.ts` (POST/mutating, clear cookie khi 401):

| File | Method | Chuyển tiếp tới backend |
|---|---|---|
| `staff/route.ts` | GET | `/staff` (không kèm query — xem §4.1 lý do lọc client-side) |
| `staff/route.ts` | POST | `/staff` (body JSON), 401 → `clearAuthCookies()` |
| `staff/[id]/route.ts` | PATCH | `/staff/:id` (body JSON), 401 → `clearAuthCookies()` |
| `staff/[id]/deactivate/route.ts` | POST | `/staff/:id/deactivate`, 401 → `clearAuthCookies()` |
| `staff/[id]/reset-password/route.ts` | POST | `/staff/:id/reset-password` (body JSON), 401 → `clearAuthCookies()` |

`[id]` lấy từ `context.params` (Next.js hiện hành — params có thể là `Promise`, xem cú pháp thật ở `app/api/customers/[kind]/[id]/route.ts` trước khi viết).

### 4.1. Vì sao GET không truyền query

Backend `GET /staff?staffRole=&search=` có hỗ trợ lọc, nhưng nó **không** hỗ trợ giá trị `staffRole=owner` (spec backend, `ListStaffDto.staffRole` chỉ nhận enum thật). Vì tab "Chủ sân" cần lọc theo `role`, không phải `staffRole`, và số lượng nhân viên của một chủ sân thực tế luôn nhỏ (vài chục là nhiều), trang này **fetch toàn bộ danh sách một lần** (`GET /staff` không tham số) rồi lọc/tìm kiếm hoàn toàn ở client — vừa xử lý được tab "Chủ sân" nhất quán, vừa tránh round-trip mỗi lần đổi tab/gõ tìm kiếm.

## 5. Component (`apps/web/src/app/owner/accounts/`)

### 5.1. `types.ts`
```ts
export type StaffRole = "manager" | "cashier" | "staff";
export type AccountRole = "owner" | StaffRole; // "owner" chỉ xuất hiện ở dòng chủ sân
export type AccountStatus = "pending_verification" | "pending_approval" | "active" | "rejected" | "suspended";

export interface StaffListItem {
  id: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  role: "owner" | "staff";
  staffRole: StaffRole | null; // null khi role === "owner"
  status: AccountStatus;
}

export type RoleTab = "all" | "owner" | StaffRole;
```

### 5.2. `staff-format.ts` (+ `staff-format.test.ts`)
Các hàm thuần, có unit test (mẫu `customer-format.ts`):

```ts
export function avatarInitials(fullName: string): string { /* giống customer-format.ts */ }
export function avatarColor(name: string): string { /* giống customer-format.ts */ }

const ROLE_LABELS: Record<AccountRole, string> = {
  owner: "Chủ sân",
  manager: "Quản lý",
  cashier: "Thu ngân",
  staff: "Nhân viên",
};
export function roleLabel(item: Pick<StaffListItem, "role" | "staffRole">): string {
  return item.role === "owner" ? ROLE_LABELS.owner : ROLE_LABELS[item.staffRole!];
}

const ROLE_BADGE_CLASSES: Record<AccountRole, string> = {
  owner: "bg-purple-50 text-purple-600 dark:bg-purple-950/40 dark:text-purple-400",
  manager: "bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400",
  cashier: "bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400",
  staff: "bg-green-50 text-green-600 dark:bg-green-950/40 dark:text-green-400",
}; // dùng cùng key với roleLabel qua hàm roleKey() bên dưới
export function roleKey(item: Pick<StaffListItem, "role" | "staffRole">): AccountRole {
  return item.role === "owner" ? "owner" : item.staffRole!;
}
export function roleBadgeClasses(item: Pick<StaffListItem, "role" | "staffRole">): string {
  return ROLE_BADGE_CLASSES[roleKey(item)];
}

export function filterStaff(
  items: StaffListItem[],
  opts: { roleTab: RoleTab; search: string },
): StaffListItem[] {
  let result = items;
  if (opts.roleTab === "owner") {
    result = result.filter((i) => i.role === "owner");
  } else if (opts.roleTab !== "all") {
    result = result.filter((i) => i.staffRole === opts.roleTab);
  }
  const search = opts.search.trim().toLowerCase();
  if (search) {
    result = result.filter(
      (i) =>
        i.fullName.toLowerCase().includes(search) ||
        (i.phone ?? "").toLowerCase().includes(search) ||
        (i.email ?? "").toLowerCase().includes(search),
    );
  }
  return result;
}

export function countByRole(items: StaffListItem[]): Record<AccountRole, number> {
  const counts: Record<AccountRole, number> = { owner: 0, manager: 0, cashier: 0, staff: 0 };
  for (const item of items) counts[roleKey(item)] += 1;
  return counts;
}
```

### 5.3. `staff-metrics.tsx`
4 thẻ theo mẫu `customer-metrics.tsx`/`dashboard/stat-cards.tsx`, nguồn `countByRole(allItems)` (không đổi khi lọc tab/tìm kiếm, giống Customers):
- Chủ sân (`counts.owner`, luôn = 1) — icon `Crown`
- Quản lý (`counts.manager`) — icon `ShieldCheck`
- Thu ngân (`counts.cashier`) — icon `Wallet`
- Nhân viên (`counts.staff`) — icon `Users`

### 5.4. `staff-filters.tsx`
- Hàng tab: **Tất cả / Chủ sân / Quản lý / Thu ngân / Nhân viên** → `RoleTab` (`"all"|"owner"|"manager"|"cashier"|"staff"`), tab đang chọn tô đậm (mẫu `customer-filters.tsx`).
- Ô tìm kiếm (icon kính lúp), placeholder "Tìm theo tên, SĐT, email...".

### 5.5. `staff-table.tsx`
Bảng (`components/ui/table`), **không phân trang** (API trả toàn bộ danh sách, không có `page`/`pageSize`):

| Cột | Nội dung |
|---|---|
| Tài khoản | avatar chữ cái đầu + họ tên |
| SĐT | `phone` (— nếu null) |
| Email | `email` (— nếu null) |
| Vai trò | badge `roleLabel`/`roleBadgeClasses` |
| Trạng thái | badge: `active` → "Hoạt động" (xanh), `suspended` → "Đã khoá" (xám), khác → nhãn tương ứng (nhân viên luôn tạo `active`, `suspended` là trạng thái thực tế duy nhất khác sẽ gặp) |
| Thao tác | **chỉ với `role === "staff"`**: nút Sửa (`Pencil`), Đặt lại mật khẩu (`KeyRound`), Vô hiệu hoá (`Ban`, ẩn nếu đã `suspended`) — mẫu icon-button của `pricing-rules-tab.tsx` |

Trạng thái rỗng: "Chưa có tài khoản nào." (thực tế không bao giờ rỗng vì luôn có dòng owner).

### 5.6. `staff-form-dialog.tsx`
Một component dùng chung cho Thêm và Sửa, theo đúng mẫu union-props của `CourtFormDialog`/`CourtFormDialogEditProps` (`court-form-dialog.tsx`):

```ts
interface StaffFormDialogCreateProps {
  trigger: React.ReactElement;
  onSaved: () => void;
  mode: "create";
}
interface StaffFormDialogEditProps {
  trigger: React.ReactElement;
  onSaved: () => void;
  mode: "edit";
  staff: StaffListItem;
}
```

Trường (theo `09-tai-khoan.md` §4, đã bỏ lựa chọn "Chủ sân" — xem §2):

| Trường | Bắt buộc | Ghi chú |
|---|---|---|
| Họ và tên | ✓ | |
| Số điện thoại | ✓ | dùng để đăng nhập |
| Email | | |
| Vai trò | ✓ | `<select>`: Nhân viên / Thu ngân / Quản lý |
| Mật khẩu | ✓ khi tạo, **ẩn hẳn khi sửa** | tối thiểu 6 ký tự — PATCH backend không nhận field này (spec backend §5) |

Submit:
- Tạo: `POST /api/staff` body `{ fullName, phone, email?, staffRole, password }`. Thành công → toast "Đã thêm nhân viên", đóng dialog, `onSaved()`.
- Sửa: `PATCH /api/staff/{id}` body `{ fullName, phone, email?, staffRole }` (không gửi password). Thành công → toast "Đã cập nhật nhân viên", đóng dialog, `onSaved()`.
- Lỗi 409 (SĐT/email trùng) → `getSubmitErrorMessage` hiển thị inline/toast, giữ dialog mở để sửa lại.
- Thiếu Họ tên/SĐT/(Mật khẩu khi tạo) → chặn submit, toast lỗi (giống `AddCustomerDialog`).

### 5.7. `deactivate-staff-dialog.tsx`
Dialog xác nhận, theo đúng mẫu dialog xoá của `pricing-rules-tab.tsx` (icon `AlertTriangle` trong vòng tròn đỏ, tiêu đề, tên nhân viên in đậm, nút Huỷ/Xác nhận đỏ):
- Tiêu đề: "Vô hiệu hoá tài khoản?"
- Nội dung: "Vô hiệu hoá **{fullName}**? Nhân viên này sẽ không thể đăng nhập."
- Xác nhận → `POST /api/staff/{id}/deactivate`. Thành công → toast "Đã vô hiệu hoá tài khoản", đóng dialog, `onSaved()` (tải lại danh sách để badge cập nhật `suspended`).

### 5.8. `reset-password-dialog.tsx`
Dialog form đơn giản (không phải confirm-dialog vì cần nhập liệu):
- Tiêu đề: "Đặt lại mật khẩu cho {fullName}"
- 1 trường: **Mật khẩu mới** (`type="password"`, tối thiểu 6 ký tự)
- Submit → `POST /api/staff/{id}/reset-password` body `{ newPassword }`. Thành công → toast "Đã đặt lại mật khẩu", đóng dialog (không cần `onSaved()` — không đổi dữ liệu hiển thị trong bảng).
- Mật khẩu < 6 ký tự → chặn submit, toast lỗi.

### 5.9. `page.tsx`
State: `allItems: StaffListItem[] | null`, `roleTab: RoleTab` (mặc định `"all"`), `search`, `debouncedSearch`, `loadError: "forbidden" | "other" | null`.

- `loadStaff()`: `fetch("/api/staff")` →
  - 401 → `router.push("/login?returnTo=%2Fowner%2Faccounts")` (mẫu Customers/Dashboard).
  - 403 → `setLoadError("forbidden")` (nhân viên tầng `operational` lỡ vào trang này qua URL trực tiếp — trang chưa có route guard phía frontend, xem §6).
  - lỗi khác → `setLoadError("other")`.
  - OK → `setAllItems(data)`, `setLoadError(null)`.
- `useEffect` debounce `search` → `debouncedSearch` (300ms, mẫu Customers).
- `displayItems = filterStaff(allItems ?? [], { roleTab, search: debouncedSearch })`.
- `counts = countByRole(allItems ?? [])`.
- Bố cục `<main>` theo mẫu owner: tiêu đề "Tài khoản" + nút "+ Thêm nhân viên" (phải, mở `StaffFormDialog mode="create"`), rồi `StaffMetrics`, `StaffFilters`, `StaffTable` (hoặc thông báo lỗi nếu `loadError`).
- `onSaved` của mọi dialog con → gọi lại `loadStaff()`.

## 6. Quyền truy cập trang (frontend chưa có route guard theo staffRole)

Trang này gọi API tầng `full` (`@OwnerScope('full')` toàn bộ, backend spec §4-5) — chỉ owner/quản lý dùng được. Codebase hiện **chưa có** cơ chế đọc `staffRole` từ JWT ở phía client (không có hook `useCurrentUser()`), và `ROLE_HOME` trong `login/page.tsx` cũng chưa map route riêng cho `role: "staff"` (điều hướng về `/` sau đăng nhập — xem thảo luận trước). Vì vậy:

- Trang **không** tự ẩn/chặn truy cập bằng route guard — dựa hoàn toàn vào backend trả 403 (xử lý ở §5.9).
- Đây là hạn chế đã biết, để ngoài phạm vi spec này (thuộc về việc thêm `useCurrentUser()`/route guard chung cho toàn bộ owner section — vượt phạm vi riêng module Tài khoản).

## 7. Validation & lỗi (phía UI)

- Fetch danh sách lỗi không phải 401/403 → trạng thái lỗi nhẹ ("Không tải được dữ liệu"), không vỡ layout (mẫu Customers).
- `search` khoảng trắng → không lọc gì thêm (trim rỗng = bỏ qua).
- Form Thêm/Sửa: Họ tên/SĐT rỗng, hoặc Mật khẩu rỗng/< 6 ký tự khi tạo → chặn submit trước khi gọi API.
- 409 khi Thêm/Sửa (trùng SĐT hoặc email) → thông báo cụ thể qua `getSubmitErrorMessage` (backend trả `message: "Số điện thoại đã được sử dụng"`/`"Email đã được sử dụng"`).
- 404 khi Sửa/Vô hiệu hoá/Đặt lại mật khẩu (nhân viên thuộc owner khác — không thể xảy ra qua UI bình thường vì `id` lấy từ danh sách đã lọc theo owner hiện tại, nhưng vẫn xử lý phòng hờ) → toast lỗi chung, đóng dialog, tải lại danh sách.

## 8. Testing

- **Unit (vitest, mẫu `customer-format.test.ts`):**
  - `avatarInitials`/`avatarColor` — copy hành vi từ `customer-format.ts`.
  - `roleLabel`/`roleKey`/`roleBadgeClasses` — đúng nhãn/màu cho cả 4 giá trị (`owner`/`manager`/`cashier`/`staff`).
  - `filterStaff` — lọc đúng theo từng `roleTab` (đặc biệt `"owner"` lọc theo `role`, không phải `staffRole`), lọc theo `search` (tên/SĐT/email, không phân biệt hoa thường, trim), kết hợp cả hai.
  - `countByRole` — đếm đúng 4 nhóm, tổng = `items.length`.
- **UI (thủ công qua skill `run`/`verify`):** repo chưa có harness test component. Kịch bản kiểm chứng:
  1. Đăng nhập owner → vào `/owner/accounts` → thấy dòng "Chủ sân" + số liệu đúng.
  2. Thêm nhân viên (mỗi vai trò Quản lý/Thu ngân/Nhân viên) → thấy xuất hiện trong bảng, thẻ số liệu tăng.
  3. Lọc tab từng vai trò, tìm kiếm theo SĐT/email → đúng kết quả.
  4. Sửa một nhân viên (đổi tên/vai trò) → bảng cập nhật.
  5. Đặt lại mật khẩu → đăng xuất, đăng nhập lại bằng SĐT nhân viên + mật khẩu mới → thành công.
  6. Vô hiệu hoá nhân viên → badge chuyển "Đã khoá", nút hành động biến mất → đăng nhập bằng tài khoản đó → bị từ chối.
  7. Đăng nhập bằng tài khoản Thu ngân/Nhân viên (tầng `operational`) → truy cập thẳng URL `/owner/accounts` → thấy thông báo lỗi quyền truy cập (403), không crash trang.

## 9. Ngoài phạm vi

- Route guard chung theo `staffRole` cho toàn bộ owner section, `useCurrentUser()` hook, map `ROLE_HOME["staff"]` (xem §6) — cần một spec riêng vì ảnh hưởng nhiều trang, không chỉ module Tài khoản.
- Kích hoạt lại tài khoản đã vô hiệu hoá — backend chưa có endpoint (spec backend §8).
- Tự tạo thêm "Chủ sân" (đồng sở hữu) qua module này — backend không hỗ trợ (xem §2).
- Nhân viên tự đổi thông tin/mật khẩu — dùng `/users/me` sẵn có, không thuộc trang này.
- Audit log ai-làm-gì.
