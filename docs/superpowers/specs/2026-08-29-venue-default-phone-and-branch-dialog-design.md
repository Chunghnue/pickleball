# Module: Venue is_default/phone + Branch Dialog Restyle — Thiết kế chi tiết

**Ngày:** 2026-08-29
**Trạng thái:** Chờ review
**Thuộc kiến trúc tổng thể:** [2026-08-23-pickleball-platform-architecture-design.md](./2026-08-23-pickleball-platform-architecture-design.md)
**Nguồn tham khảo:** Ảnh chụp màn hình dialog "Chọn chi nhánh" sanbong.vn do người dùng cung cấp.
**Sửa đổi:** [2026-08-29-owner-sidebar-visual-refresh-design.md](./2026-08-29-owner-sidebar-visual-refresh-design.md) §3/§5 — trước đây `BranchSwitcher` không có nhãn "Mặc định"/số điện thoại vì `venues` chưa có các trường này; spec này thêm 2 trường thật đó và thiết kế lại dialog cho đúng ảnh.
**Liên quan:** [2026-08-26-branches-design.md](./2026-08-26-branches-design.md) — spec đó định nghĩa đầy đủ module "Branches" (slug, is_hidden, district, toạ độ, endpoint `set-default`, xoá chi nhánh mặc định tự chuyển...). **Spec này KHÔNG triển khai toàn bộ Branches module** — chỉ lấy đúng 2 trường (`is_default`, `phone`) cần cho dialog, với quy tắc gán mặc định đơn giản hơn nhiều (xem §5 Ngoài phạm vi).

## 1. Mục tiêu

Thêm 2 cột thật vào `venues`: `is_default` (tự động gán, không có UI để đổi) và `phone` (owner tự nhập ở form sửa chi nhánh). Thiết kế lại `BranchSwitcher` dialog cho đúng ảnh: header gradient xanh có icon + nút đóng, mỗi chi nhánh có icon trong ô màu, chi nhánh mặc định có badge xanh lá + có thể hiện SĐT, mục đang chọn có dấu tích xanh.

## 2. Backend — `venues`

### 2.1 Migration

Thêm cột `is_default boolean NOT NULL DEFAULT false` và `phone varchar NULL`. Backfill: với mỗi owner đang có sẵn venue, đặt `is_default = true` cho venue **cũ nhất** (`created_at` nhỏ nhất) — để dữ liệu hiện có không bị "không ai mặc định" sau migration.

```sql
ALTER TABLE "venues" ADD "is_default" boolean NOT NULL DEFAULT false;
ALTER TABLE "venues" ADD "phone" character varying;

UPDATE "venues" SET "is_default" = true
WHERE "id" IN (
  SELECT DISTINCT ON ("owner_id") "id"
  FROM "venues"
  ORDER BY "owner_id", "created_at" ASC
);
```

### 2.2 Entity (`apps/api/src/courts/entities/venue.entity.ts`)

Thêm:
```ts
@Column({ name: 'is_default', default: false })
isDefault: boolean;

@Column({ nullable: true, type: 'varchar' })
phone: string | null;
```

### 2.3 Gán `is_default` khi tạo venue (`VenuesService.create`)

Trước khi `create`, đếm số venue hiện có của owner (`venuesRepository.count({ where: { ownerId } })`). Nếu `0` → `isDefault: true`, ngược lại `false`. **Không có** endpoint `set-default`, không xử lý "xoá venue mặc định → tự chuyển venue khác" — venue đầu tiên luôn là mặc định vĩnh viễn trừ khi có module Branches đầy đủ sau này.

### 2.4 Cập nhật `phone` (`VenuesService.update`, `UpdateVenueDto`)

Thêm `phone?: string` (optional, `@IsString()`) vào `UpdateVenueDto`. `update()` gán `venue.phone = dto.phone` khi `dto.phone !== undefined`. **Không thêm** `phone` vào `CreateVenueDto` — chỉ sửa được ở form sửa chi nhánh (`/owner/venues/[id]`), không có ở form tạo mới (theo đúng phạm vi người dùng yêu cầu).

## 3. Frontend

### 3.1 Form sửa chi nhánh

- `apps/web/src/lib/schemas.ts` — `updateVenueSchema` thêm `phone: z.string().optional()`.
- `apps/web/src/app/owner/venues/[id]/types.ts` — `Venue` thêm `phone: string | null`.
- `apps/web/src/app/owner/venues/[id]/venue-info-section.tsx` — thêm 1 ô `Input` "Số điện thoại" (giống pattern `description` hiện có), `defaultValues.phone: venue.phone ?? ""`.

### 3.2 `BranchSwitcher` — viết lại hoàn toàn

`Venue` interface trong file này đổi thành `{ id, name, city, phone: string | null, isDefault: boolean }`. State đổi từ `selectedLabel: string` sang `selectedId: string` (`"all"` hoặc `venue.id`), suy ra label hiển thị từ đó.

- **Nút trigger** (trong sidebar): đổi icon từ `Building2` sang `BarChart3` (khớp icon "chi nhánh" dùng lặp lại trong ảnh — xem §3.3).
- **Header dialog**: nền gradient xanh (`bg-gradient-to-r from-blue-600 to-blue-500`), icon `BarChart3` trắng + `DialogTitle` "Chọn chi nhánh" chữ trắng đậm + `DialogClose` icon `X` trắng ở góc phải (thay cho tiêu đề đen đơn giản hiện tại).
- **Hàng "Tất cả chi nhánh"**: icon `LayoutGrid` trắng trong ô vuông bo góc nền xanh đậm; tiêu đề đậm + dòng phụ "Xem dữ liệu tổng hợp"; viền xanh + nền xanh nhạt khi đang được chọn; dấu tích (`Check` trong vòng tròn xanh) ở cuối hàng khi đang chọn.
- **Mỗi hàng venue**: icon `MapPin` trong ô vuông bo góc — nền xanh lá nếu `venue.isDefault`, nền xám nếu không; tên venue đậm kèm badge tròn xanh lá "Mặc định" nếu `isDefault`; dòng phụ icon `Phone` + số điện thoại nếu `venue.phone` khác null; viền xanh + nền xanh nhạt + dấu tích khi đang chọn (so `selectedId === venue.id`).
- Bấm 1 hàng → `setSelectedId(...)`, dialog tự đóng (dùng `Dialog.Close` làm phần tử bấm, giữ nguyên cách đã dùng ở bản trước).

### 3.3 `OwnerSidebar` — đổi icon "Chi nhánh"

Đổi icon mục nav "Chi nhánh" từ `Building2` sang `BarChart3` (bỏ import `Building2`, đã có sẵn import `BarChart3` cho "Doanh thu" — dùng chung).

## 4. Testing

- **Backend unit (Jest, `venues.service.spec.ts`):**
  - `create`: venue đầu tiên của owner (`count` trả `0`) → `isDefault: true`; owner đã có venue khác (`count` trả `>0`) → `isDefault: false`.
  - `update`: `dto.phone` được gán vào venue khi có mặt trong payload.
- **Frontend:** không có logic thuần mới đáng test riêng (UI hiển thị theo dữ liệu đã fetch).
- **Manual/browser:** sửa 1 venue test, điền số điện thoại → lưu → mở dialog chọn chi nhánh, xác nhận venue đó hiện đúng SĐT; venue đầu tiên tạo ra có badge "Mặc định" (icon xanh lá); chọn "Tất cả chi nhánh" hoặc 1 venue → dấu tích hiện đúng chỗ, dialog đóng, label nút trigger đổi đúng; icon "Chi nhánh" ở sidebar và trên nút trigger đổi sang biểu đồ cột.

## 5. Ngoài phạm vi

- **Toàn bộ [Branches module](./2026-08-26-branches-design.md)** khác: `slug`, `is_hidden`, `district`, toạ độ, endpoint `POST /venues/mine/:id/set-default`, logic "xoá venue mặc định → venue khác tự thành mặc định", trang quản lý chi nhánh dạng lưới.
- **Đổi `is_default` sau khi tạo** — không có nút/endpoint nào để owner tự chọn lại chi nhánh mặc định; chỉ venue đầu tiên (hoặc venue cũ nhất sau backfill) giữ vai trò này.
- **Ô nhập số điện thoại ở form tạo venue mới** (`/owner/venues/new`) — chỉ có ở form sửa.
- **Lọc dữ liệu theo chi nhánh đã chọn** — giữ nguyên quyết định đã chốt ở spec trước, chọn chi nhánh chỉ đổi label, không lọc trang nào khác.
