# Footer & thành phần dùng chung — social, cột Hỗ trợ, form nhận ưu đãi, hotline

**Ngày:** 2026-09-07
**Trạng thái:** Đã duyệt
**Thuộc kiến trúc tổng thể:** [2026-08-23-pickleball-platform-architecture-design.md](./2026-08-23-pickleball-platform-architecture-design.md)
**Xây trên:** [2026-09-04-trang-chu-design.md](./2026-09-04-trang-chu-design.md) (đã tạo `PublicHeader`/`PublicFooter`), lien-he/contact module (`apps/api/src/contact`, `apps/web/src/app/lien-he`)
**Nguồn tham khảo:** [docs/01-website-khach-hang/10-footer-va-thanh-phan-chung.md](../../01-website-khach-hang/10-footer-va-thanh-phan-chung.md) (khảo sát UI sanbong.vn thực tế — Header/Footer dùng chung mọi trang)
**Đảo ngược quyết định trước:**
- [2026-09-04-trang-chu-design.md](./2026-09-04-trang-chu-design.md) §2 (cuối) và §5 — từng chốt "**không** dùng hotline/social/form đăng ký nhận khuyến mãi của sanbong.vn; footer chỉ hiển thị email liên hệ thật". Spec này **đảo ngược**: bổ sung link mạng xã hội, cột "Hỗ trợ", form "Đăng ký nhận ưu đãi" (có backend), và hotline vào footer. Các spec khác nếu nhắc "footer tối giản" là hồ sơ lịch sử, **không sửa lại** — mục này là nguồn quyết định footer hiện hành.

## 1. Mục tiêu

Đưa nốt khảo sát "Thành phần dùng chung (Header, Footer)" — file cuối của bộ `docs/01-website-khach-hang` — vào thiết kế. Header đã xây đủ và khớp khảo sát từ các spec trước, nên spec này tập trung làm giàu **Footer**: thêm liên kết mạng xã hội, cột "Hỗ trợ", khối "Đăng ký nhận ưu đãi" (lưu email vào DB) và hotline + nút liên hệ.

## 2. Khác biệt so với tài liệu khảo sát gốc

Khảo sát mô tả sanbong.vn — marketplace đa môn thể thao. Nền tảng hiện tại chỉ phục vụ pickleball đơn môn (xem kiến trúc tổng thể mục 1-2, `trang-chu-design.md` §2), nên:

- **Bỏ dropdown "Phần mềm quản lý"** (liên kết 7 trang giới thiệu theo môn) và **dropdown "Loại sân"** (link nhanh đặt sân theo môn tại khu vực) ở Header — schema không có `sportType`, không có landing theo môn/tỉnh (đã xác nhận `trang-chu-design.md` §2). Header hiện tại không có 2 dropdown này và **giữ nguyên** như vậy.
- **Cột "Khám phá"** ở footer: khảo sát ghi "Sân bóng đá, Sân tennis, Sân cầu lông" (lọc theo môn) → thay bằng liên kết thật của repo: Tìm sân (`/venues`), Bản đồ (`/ban-do`), Blog (`/blog`).
- **Các trang chính sách chưa tồn tại** (Chính sách hoàn tiền, Điều khoản sử dụng) — khảo sát ghi chú chính các mục này ở dạng placeholder tại thời điểm khảo sát. Render dạng chữ mờ "Sắp có", **không** làm link chết `href="#"` và **không** tạo trang mới (ngoài phạm vi).
- **Hotline & liên kết mạng xã hội** dùng giá trị do chủ dự án cung cấp; mục nào chưa có giá trị thì ẩn (không hiển thị placeholder giả).

## 3. Ghi nhận Header — đã khớp khảo sát, không sửa

`apps/web/src/components/public-header.tsx` hiện đã có, khớp khảo sát ở các điểm áp dụng cho nền tảng đơn môn:

| Khảo sát | Trạng thái repo |
|---|---|
| Logo → trang chủ | ✅ "Pickleball" → `/` |
| Tìm sân | ✅ → `/venues` (khảo sát ghi `/san-bong`; repo dùng `/venues`) |
| Bản đồ | ✅ → `/ban-do` |
| Blog | ✅ → `/blog` |
| Menu tài khoản (Hồ sơ, Lịch sử đặt sân, Đăng xuất) | ✅ dropdown avatar → `/tai-khoan/ho-so`, `/tai-khoan/lich-su`, logout (xem `tai-khoan-nguoi-dung-design.md`) |
| Nút "Chủ Sân" | ✅ → `/register/owner` (khảo sát ghi `app.sanbong.vn`; repo dùng route nội bộ) |
| Dropdown "Phần mềm quản lý" / "Loại sân" (đa môn) | ⛔ ngoài phạm vi (mục 2) |

**Spec này không thay đổi file `public-header.tsx`.**

## 4. Backend — thêm newsletter vào module `contact` sẵn có

Không tạo module mới. Thêm thực thể thứ ba vào `apps/api/src/contact`, mirror đúng pattern `support-messages`/`partner-applications`.

### 4.1 Migration mới `1788050000000-CreateNewsletterSubscribers.ts`

```sql
CREATE TABLE "newsletter_subscribers" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "email" character varying NOT NULL,
  "created_at" TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT "PK_newsletter_subscribers_id" PRIMARY KEY ("id"),
  CONSTRAINT "UQ_newsletter_subscribers_email" UNIQUE ("email")
)
```
`down()`: `DROP TABLE "newsletter_subscribers"`. Timestamp `1788050000000` > `1788040000000` (CreateContactTables) để chạy sau.

### 4.2 Entity `apps/api/src/contact/entities/newsletter-subscriber.entity.ts`

Mirror `support-message.entity.ts`:
```ts
@Entity('newsletter_subscribers')
export class NewsletterSubscriber {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
```

### 4.3 DTO `apps/api/src/contact/dto/create-newsletter-subscriber.dto.ts`

```ts
export class CreateNewsletterSubscriberDto {
  @IsEmail()
  @MaxLength(254)
  email: string;
}
```
Chuẩn hoá về chữ thường trong service (không ở DTO) để tránh 2 bản ghi khác hoa/thường cho cùng email.

### 4.4 `ContactService.subscribeNewsletter()` — idempotent

Đăng ký cùng email 2 lần **không** được ném lỗi 500 (vi phạm unique). Chuẩn hoá `email.trim().toLowerCase()`, dùng insert bỏ qua trùng rồi trả bản ghi hiện có:

```ts
async subscribeNewsletter(
  dto: CreateNewsletterSubscriberDto,
): Promise<NewsletterSubscriber> {
  const email = dto.email.trim().toLowerCase();
  await this.newsletterSubscribersRepository
    .createQueryBuilder()
    .insert()
    .values({ email })
    .orIgnore() // ON CONFLICT DO NOTHING trên cột email unique
    .execute();
  return this.newsletterSubscribersRepository.findOneByOrFail({ email });
}
```
Trả 201 cho cả email mới lẫn email đã tồn tại — không tiết lộ ai đã đăng ký. Inject repo `NewsletterSubscriber` vào constructor `ContactService` (thêm dòng thứ ba, cùng pattern 2 repo hiện có).

### 4.5 Controller & module

`contact.controller.ts` — thêm:
```ts
@Post('newsletter-subscribers')
@HttpCode(HttpStatus.CREATED)
subscribeNewsletter(@Body() dto: CreateNewsletterSubscriberDto) {
  return this.contactService.subscribeNewsletter(dto);
}
```
`contact.module.ts` — thêm `NewsletterSubscriber` vào `TypeOrmModule.forFeature([...])`.

### 4.6 BFF proxy `apps/web/src/app/api/contact/newsletter-subscribers/route.ts`

Mirror y hệt `support-messages/route.ts` (POST forward JSON tới `${API_BASE_URL}/contact/newsletter-subscribers`, trả `toNextResponse(upstream)`).

## 5. Frontend — viết lại `apps/web/src/components/public-footer.tsx`

Đổi từ server component → **client component** (`"use client"`) vì có form đăng ký. Giữ nền `bg-slate-900`, khung `max-w-7xl`.

### 5.1 Cấu hình liên hệ (hằng số đầu file)

```ts
const HOTLINE = "..."; // số do chủ dự án cung cấp; để "" nếu chưa có
const SOCIAL = [
  { label: "Facebook", href: "", icon: Facebook },
  { label: "TikTok", href: "", icon: /* dùng icon phù hợp lucide */ },
  { label: "YouTube", href: "", icon: Youtube },
]; // href rỗng → ẩn icon đó
```
Lọc `SOCIAL.filter((s) => s.href)` trước khi render; nếu rỗng hết thì ẩn cả hàng icon. Nếu `HOTLINE === ""` thì ẩn dòng hotline (vẫn giữ nút "Liên hệ ngay"). *(Lưu ý: lucide-react không có icon TikTok — dùng một icon thay thế như `Music2`, hoặc bỏ TikTok nếu không cấp URL.)*

### 5.2 Bố cục (trên → dưới)

1. **Cột thương hiệu**: logo "Pickle**ball**" + slogan (giữ nguyên copy hiện có), bên dưới là hàng **icon mạng xã hội** (chỉ những mục có `href`, mở tab mới `target="_blank" rel="noopener noreferrer"`).
2. **Cột "Khám phá"**: Tìm sân → `/venues`, Bản đồ → `/ban-do`, Blog → `/blog`.
3. **Cột "Hỗ trợ"**:
   - Câu hỏi thường gặp → `/lien-he` (tab hỗ trợ đã có FAQ).
   - Hướng dẫn đặt sân → `/lien-he`.
   - Liên hệ → `/lien-he`.
   - Chính sách hoàn tiền — `<span>` chữ mờ (`text-slate-600`) kèm nhãn nhỏ "Sắp có", **không** phải link.
   - Điều khoản sử dụng — tương tự, chữ mờ "Sắp có".
4. **Khối "Đăng ký nhận ưu đãi"**: tiêu đề + mô tả ngắn (ví dụ "Nhận ngay voucher giảm 20% cho lần đặt sân đầu tiên"), form email + nút "Đăng ký" (mục 5.3).
5. Dưới cùng bên trong khối liên hệ: **hotline** (icon `Phone` + số, `<a href="tel:...">`) + nút "Liên hệ ngay" → `/lien-he`.
6. **Thanh copyright** (giữ nguyên): `© {year} Pickleball. All rights reserved.` + dòng "Đăng ký chủ sân? Liên hệ ngay" → `/lien-he?tab=dang-ky-chu-san` (giữ như hiện tại).

### 5.3 Form "Đăng ký nhận ưu đãi"

Mirror pattern `support-tab.tsx` (react-hook-form + zod + `sonner` toast), nhưng gọn 1 trường:
- Schema mới trong `apps/web/src/lib/schemas.ts`: `newsletterSchema = z.object({ email: z.string().email("Email không hợp lệ") })` + `type NewsletterInput`.
- Submit → `POST /api/contact/newsletter-subscribers`. Thành công → đổi sang trạng thái cảm ơn inline ("Đã đăng ký! Bạn sẽ nhận ưu đãi qua email.") thay cho form, `form.reset()`. Lỗi → `toast.error(getSubmitErrorMessage(response, data))`.
- Nút disable khi `form.formState.isSubmitting`.
- Vì email trùng vẫn trả 201 (idempotent, mục 4.4) → người dùng luôn thấy trạng thái cảm ơn, không lộ việc đã đăng ký trước đó.

### 5.4 Không đổi nơi gắn footer

`PublicFooter` hiện được dùng ở các trang public (`/`, `/venues`, `/venues/[id]`, `/blog`, `/lien-he`, `/dat-san`, `/tai-khoan/*` — xem kết quả grep). Chỉ sửa nội dung component; **không** thêm/bớt nơi gắn.

## 6. Ngoài phạm vi

- Trang Chính sách hoàn tiền / Điều khoản sử dụng thật (hiện chỉ hiển thị "Sắp có").
- Gửi email xác nhận/chào mừng sau khi đăng ký nhận ưu đãi (chỉ lưu email vào DB).
- Trang admin/owner để xem & xuất danh sách `newsletter_subscribers` — spec riêng khi có nhu cầu vận hành.
- Huỷ đăng ký nhận ưu đãi (unsubscribe) — chưa cần khi chưa có luồng gửi mail.
- Dropdown "Phần mềm quản lý" / "Loại sân" theo môn ở Header (mục 2 — nền tảng đơn môn).

## 7. Testing

**Backend (`apps/api/src/contact/contact.service.spec.ts` — tạo mới hoặc bổ sung nếu đã có):**
- `subscribeNewsletter` lần đầu → tạo bản ghi, email đã `trim().toLowerCase()`.
- Đăng ký lại **cùng email** (kể cả khác hoa/thường, có khoảng trắng) → không ném lỗi, trả về đúng bản ghi cũ, bảng chỉ có 1 dòng.
- (e2e nếu có) `POST /contact/newsletter-subscribers` email hợp lệ → 201; email sai định dạng → 400 (ValidationPipe); gọi 2 lần cùng email → cả 2 đều 201.

**Frontend (manual/browser):**
- Mở bất kỳ trang public có footer → thấy đủ: brand + social (chỉ mục có URL), cột Khám phá, cột Hỗ trợ (Chính sách/Điều khoản hiện chữ mờ "Sắp có", không click được), khối đăng ký ưu đãi, hotline + nút "Liên hệ ngay".
- Nhập email hợp lệ → bấm "Đăng ký" → hiện trạng thái cảm ơn; kiểm tra DB có bản ghi.
- Nhập email sai định dạng → thấy lỗi client-side, không gọi API.
- Đăng ký lại cùng email → vẫn thấy trạng thái cảm ơn (không lỗi).
- Bỏ trống `HOTLINE`/tất cả `SOCIAL.href` → các mục tương ứng ẩn, không vỡ layout.
- Link cột Khám phá/Hỗ trợ điều hướng đúng (`/venues`, `/ban-do`, `/blog`, `/lien-he`).
