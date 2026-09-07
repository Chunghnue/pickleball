# Footer & thành phần dùng chung Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Làm giàu footer công khai với liên kết mạng xã hội, cột "Hỗ trợ", form "Đăng ký nhận ưu đãi" (lưu email vào DB) và hotline — theo khảo sát `10-footer-va-thanh-phan-chung.md`.

**Architecture:** Backend thêm thực thể `NewsletterSubscriber` vào module `contact` sẵn có (migration + entity + DTO + endpoint idempotent), mirror pattern `support-messages`. Frontend viết lại `public-footer.tsx` thành client component có form đăng ký gọi BFF proxy. Header không đổi (đã khớp khảo sát).

**Tech Stack:** NestJS + TypeORM + Postgres (api); Next.js 16 App Router + React 19 + react-hook-form + zod + sonner (web).

**Spec:** [docs/superpowers/specs/2026-09-07-footer-thanh-phan-chung-design.md](../specs/2026-09-07-footer-thanh-phan-chung-design.md)

## Global Constraints

- Migration mới dùng timestamp `1788050000000` (lớn hơn mọi migration hiện có: cao nhất là `1788040000000-CreateContactTables`).
- Backend endpoint mới **không auth** (form công khai) — cùng module `contact` với `support-messages`/`partner-applications`.
- Endpoint newsletter **idempotent**: đăng ký cùng email nhiều lần luôn trả 201, không ném lỗi unique, DB chỉ giữ 1 dòng cho mỗi email (đã chuẩn hoá `trim().toLowerCase()`).
- Header (`public-header.tsx`) **không thay đổi** trong plan này.
- Giá trị hotline + URL social do chủ dự án cấp; mục nào rỗng thì **ẩn**, không render placeholder giả. lucide-react không có icon TikTok — dùng `Music2` thay thế.
- Chạy từ thư mục tương ứng: lệnh `npm run ...` của api chạy trong `apps/api`, của web trong `apps/web`.

---

### Task 1: Backend — newsletter subscription trong module `contact`

**Files:**
- Create: `apps/api/src/migrations/1788050000000-CreateNewsletterSubscribers.ts`
- Create: `apps/api/src/contact/entities/newsletter-subscriber.entity.ts`
- Create: `apps/api/src/contact/dto/create-newsletter-subscriber.dto.ts`
- Create: `apps/api/src/contact/contact.service.spec.ts`
- Modify: `apps/api/src/contact/contact.service.ts`
- Modify: `apps/api/src/contact/contact.controller.ts`
- Modify: `apps/api/src/contact/contact.module.ts`

**Interfaces:**
- Produces: `POST /contact/newsletter-subscribers` nhận `{ email: string }`, trả 201 với `NewsletterSubscriber` `{ id, email, createdAt }`. Web BFF (Task 2) sẽ gọi endpoint này.
- Produces: `ContactService.subscribeNewsletter(dto: CreateNewsletterSubscriberDto): Promise<NewsletterSubscriber>`.

- [ ] **Step 1: Tạo entity**

Create `apps/api/src/contact/entities/newsletter-subscriber.entity.ts`:

```ts
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

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

- [ ] **Step 2: Tạo DTO**

Create `apps/api/src/contact/dto/create-newsletter-subscriber.dto.ts`:

```ts
import { IsEmail, MaxLength } from 'class-validator';

export class CreateNewsletterSubscriberDto {
  @IsEmail()
  @MaxLength(254)
  email: string;
}
```

- [ ] **Step 3: Viết failing test cho service**

Create `apps/api/src/contact/contact.service.spec.ts`:

```ts
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { QueryFailedError } from 'typeorm';
import { ContactService } from './contact.service';
import { SupportMessage } from './entities/support-message.entity';
import { PartnerApplication } from './entities/partner-application.entity';
import { NewsletterSubscriber } from './entities/newsletter-subscriber.entity';

const passThroughRepo = () => ({
  findOne: jest.fn(),
  create: jest.fn((data: unknown) => data),
  save: jest.fn((data: unknown) =>
    Promise.resolve({ id: 'n1', createdAt: new Date(), ...(data as object) }),
  ),
});

async function buildService() {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      ContactService,
      { provide: getRepositoryToken(SupportMessage), useFactory: passThroughRepo },
      { provide: getRepositoryToken(PartnerApplication), useFactory: passThroughRepo },
      { provide: getRepositoryToken(NewsletterSubscriber), useFactory: passThroughRepo },
    ],
  }).compile();

  return {
    service: module.get(ContactService),
    newsletterRepo: module.get(getRepositoryToken(NewsletterSubscriber)),
  };
}

describe('ContactService.subscribeNewsletter', () => {
  it('normalizes the email and saves a new subscriber', async () => {
    const { service, newsletterRepo } = await buildService();
    newsletterRepo.findOne.mockResolvedValue(null);

    await service.subscribeNewsletter({ email: '  User@Example.COM ' });

    expect(newsletterRepo.create).toHaveBeenCalledWith({ email: 'user@example.com' });
    expect(newsletterRepo.save).toHaveBeenCalled();
  });

  it('returns the existing subscriber without saving when the email already exists', async () => {
    const { service, newsletterRepo } = await buildService();
    const existing = { id: 'n1', email: 'user@example.com', createdAt: new Date() };
    newsletterRepo.findOne.mockResolvedValue(existing);

    const result = await service.subscribeNewsletter({ email: 'USER@example.com' });

    expect(result).toBe(existing);
    expect(newsletterRepo.save).not.toHaveBeenCalled();
  });

  it('recovers by re-fetching when a concurrent insert wins the race', async () => {
    const { service, newsletterRepo } = await buildService();
    const winner = { id: 'n2', email: 'race@example.com', createdAt: new Date() };
    newsletterRepo.findOne
      .mockResolvedValueOnce(null) // initial lookup: not found
      .mockResolvedValueOnce(winner); // after unique violation: found
    newsletterRepo.save.mockRejectedValueOnce(
      new QueryFailedError('insert', [], new Error('duplicate key')),
    );

    const result = await service.subscribeNewsletter({ email: 'race@example.com' });

    expect(result).toBe(winner);
  });
});
```

- [ ] **Step 4: Chạy test để xác nhận FAIL**

Run: `cd apps/api && npx jest contact.service`
Expected: FAIL — `subscribeNewsletter` chưa tồn tại trên `ContactService` (TS error / method undefined).

- [ ] **Step 5: Cài đặt service method**

Modify `apps/api/src/contact/contact.service.ts` — thêm import, inject repo thứ ba, thêm method. Sau các import hiện có thêm:

```ts
import { QueryFailedError, Repository } from 'typeorm';
import { NewsletterSubscriber } from './entities/newsletter-subscriber.entity';
import { CreateNewsletterSubscriberDto } from './dto/create-newsletter-subscriber.dto';
```
(gộp `QueryFailedError` vào dòng import `Repository` from 'typeorm' đang có — không thêm dòng `import { Repository }` trùng.)

Thêm vào constructor (tham số thứ ba):
```ts
@InjectRepository(NewsletterSubscriber)
private readonly newsletterSubscribersRepository: Repository<NewsletterSubscriber>,
```

Thêm method vào class:
```ts
async subscribeNewsletter(
  dto: CreateNewsletterSubscriberDto,
): Promise<NewsletterSubscriber> {
  const email = dto.email.trim().toLowerCase();
  const existing = await this.newsletterSubscribersRepository.findOne({
    where: { email },
  });
  if (existing) return existing;
  try {
    return await this.newsletterSubscribersRepository.save(
      this.newsletterSubscribersRepository.create({ email }),
    );
  } catch (err) {
    if (err instanceof QueryFailedError) {
      const found = await this.newsletterSubscribersRepository.findOne({
        where: { email },
      });
      if (found) return found;
    }
    throw err;
  }
}
```

- [ ] **Step 6: Chạy test để xác nhận PASS**

Run: `cd apps/api && npx jest contact.service`
Expected: PASS (3 tests).

- [ ] **Step 7: Thêm endpoint vào controller**

Modify `apps/api/src/contact/contact.controller.ts` — thêm import DTO và method:

```ts
import { CreateNewsletterSubscriberDto } from './dto/create-newsletter-subscriber.dto';
```
Thêm method trong class (sau `createPartnerApplication`):
```ts
@Post('newsletter-subscribers')
@HttpCode(HttpStatus.CREATED)
subscribeNewsletter(@Body() dto: CreateNewsletterSubscriberDto) {
  return this.contactService.subscribeNewsletter(dto);
}
```

- [ ] **Step 8: Đăng ký entity trong module**

Modify `apps/api/src/contact/contact.module.ts`:
- Thêm import: `import { NewsletterSubscriber } from './entities/newsletter-subscriber.entity';`
- Đổi `TypeOrmModule.forFeature([SupportMessage, PartnerApplication])` → `TypeOrmModule.forFeature([SupportMessage, PartnerApplication, NewsletterSubscriber])`.

- [ ] **Step 9: Tạo migration**

Create `apps/api/src/migrations/1788050000000-CreateNewsletterSubscribers.ts`:

```ts
import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateNewsletterSubscribers1788050000000
  implements MigrationInterface
{
  name = 'CreateNewsletterSubscribers1788050000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "newsletter_subscribers" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "email" character varying NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_newsletter_subscribers_id" PRIMARY KEY ("id"), CONSTRAINT "UQ_newsletter_subscribers_email" UNIQUE ("email"))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "newsletter_subscribers"`);
  }
}
```

- [ ] **Step 10: Chạy migration + full build/lint để xác nhận không hỏng**

Run: `cd apps/api && npm run migration:run && npm run build`
Expected: migration `CreateNewsletterSubscribers1788050000000` chạy thành công; build không lỗi TS.

- [ ] **Step 11: Commit**

```bash
git add apps/api/src/contact apps/api/src/migrations/1788050000000-CreateNewsletterSubscribers.ts
git commit -m "feat(contact): add idempotent newsletter subscription endpoint"
```

---

### Task 2: Frontend — viết lại footer (BFF proxy + schema + component)

**Files:**
- Create: `apps/web/src/app/api/contact/newsletter-subscribers/route.ts`
- Modify: `apps/web/src/lib/schemas.ts` (thêm `newsletterSchema` + `NewsletterInput`)
- Modify: `apps/web/src/components/public-footer.tsx` (viết lại thành client component)

**Interfaces:**
- Consumes: `POST /contact/newsletter-subscribers` (Task 1) qua BFF `POST /api/contact/newsletter-subscribers`.
- Consumes: `getSubmitErrorMessage(response, data)` từ `@/lib/error-message`, `toast` từ `sonner` (đã dùng ở `support-tab.tsx`).

- [ ] **Step 1: Tạo BFF proxy route**

Create `apps/web/src/app/api/contact/newsletter-subscribers/route.ts` (mirror `support-messages/route.ts`):

```ts
import { NextRequest } from "next/server";
import { API_BASE_URL } from "@/lib/api-config";
import { toNextResponse } from "@/lib/proxy-response";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const upstream = await fetch(`${API_BASE_URL}/contact/newsletter-subscribers`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return toNextResponse(upstream);
}
```

- [ ] **Step 2: Thêm zod schema cho newsletter**

Modify `apps/web/src/lib/schemas.ts` — thêm ngay sau `supportMessageSchema`/`SupportMessageInput` (dòng ~204):

```ts
export const newsletterSchema = z.object({
  email: z
    .string()
    .min(1, 'Vui lòng nhập email')
    .email('Email không hợp lệ')
    .max(254, 'Tối đa 254 ký tự'),
});
export type NewsletterInput = z.infer<typeof newsletterSchema>;
```

- [ ] **Step 3: Viết lại `public-footer.tsx` thành client component**

Modify `apps/web/src/components/public-footer.tsx` — thay toàn bộ file:

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Facebook, Mail, Music2, Phone, Youtube } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { newsletterSchema, type NewsletterInput } from "@/lib/schemas";
import { getSubmitErrorMessage } from "@/lib/error-message";

// Giá trị do chủ dự án cấp; để "" nếu chưa có → mục tương ứng tự ẩn.
const HOTLINE = "";
const SOCIAL: { label: string; href: string; icon: typeof Facebook }[] = [
  { label: "Facebook", href: "", icon: Facebook },
  { label: "TikTok", href: "", icon: Music2 },
  { label: "YouTube", href: "", icon: Youtube },
];

export function PublicFooter() {
  const year = new Date().getFullYear();
  const [subscribed, setSubscribed] = useState(false);
  const socials = SOCIAL.filter((s) => s.href);

  const form = useForm<NewsletterInput>({
    resolver: zodResolver(newsletterSchema),
    defaultValues: { email: "" },
  });
  const { errors } = form.formState;

  async function onSubmit(values: NewsletterInput) {
    const response = await fetch("/api/contact/newsletter-subscribers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      toast.error(getSubmitErrorMessage(response, data));
      return;
    }
    setSubscribed(true);
    form.reset();
  }

  return (
    <footer className="bg-slate-900 px-4 pt-12 pb-6 text-sm text-slate-400">
      <div className="mx-auto grid w-full max-w-7xl gap-10 sm:grid-cols-2 lg:grid-cols-4">
        {/* Thương hiệu + mạng xã hội */}
        <div className="max-w-xs">
          <p className="text-lg font-bold text-white">
            Pickle<span className="text-green-400">ball</span>
          </p>
          <p className="mt-3">
            Nền tảng đặt sân pickleball trực tuyến. Tìm và đặt sân trống gần
            bạn chỉ trong vài giây.
          </p>
          {socials.length > 0 && (
            <div className="mt-4 flex gap-3">
              {socials.map((s) => (
                <a
                  key={s.label}
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={s.label}
                  className="flex size-9 items-center justify-center rounded-full bg-slate-800 text-slate-300 hover:bg-green-600 hover:text-white"
                >
                  <s.icon className="size-4" />
                </a>
              ))}
            </div>
          )}
        </div>

        {/* Khám phá */}
        <div>
          <p className="text-xs font-semibold tracking-wide text-slate-300 uppercase">
            Khám phá
          </p>
          <div className="mt-3 flex flex-col gap-2">
            <Link href="/venues" className="hover:text-green-400">
              Tìm sân
            </Link>
            <Link href="/ban-do" className="hover:text-green-400">
              Bản đồ
            </Link>
            <Link href="/blog" className="hover:text-green-400">
              Blog
            </Link>
          </div>
        </div>

        {/* Hỗ trợ */}
        <div>
          <p className="text-xs font-semibold tracking-wide text-slate-300 uppercase">
            Hỗ trợ
          </p>
          <div className="mt-3 flex flex-col gap-2">
            <Link href="/lien-he" className="hover:text-green-400">
              Câu hỏi thường gặp
            </Link>
            <Link href="/lien-he" className="hover:text-green-400">
              Hướng dẫn đặt sân
            </Link>
            <Link href="/lien-he" className="hover:text-green-400">
              Liên hệ
            </Link>
            <span className="flex items-center gap-1.5 text-slate-600">
              Chính sách hoàn tiền
              <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px]">
                Sắp có
              </span>
            </span>
            <span className="flex items-center gap-1.5 text-slate-600">
              Điều khoản sử dụng
              <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px]">
                Sắp có
              </span>
            </span>
          </div>
        </div>

        {/* Đăng ký nhận ưu đãi + liên hệ */}
        <div>
          <p className="text-xs font-semibold tracking-wide text-slate-300 uppercase">
            Đăng ký nhận ưu đãi
          </p>
          <p className="mt-3">
            Nhận ngay voucher giảm 20% cho lần đặt sân đầu tiên.
          </p>
          {subscribed ? (
            <p className="mt-3 flex items-center gap-2 text-green-400">
              <Mail className="size-4" />
              Đã đăng ký! Bạn sẽ nhận ưu đãi qua email.
            </p>
          ) : (
            <form
              onSubmit={form.handleSubmit(onSubmit)}
              className="mt-3 flex flex-col gap-2"
              noValidate
            >
              <div className="flex gap-2">
                <Input
                  type="email"
                  placeholder="Email của bạn"
                  aria-invalid={!!errors.email}
                  className="bg-slate-800 text-white placeholder:text-slate-500"
                  {...form.register("email")}
                />
                <Button
                  type="submit"
                  className="bg-green-600 hover:bg-green-700"
                  disabled={form.formState.isSubmitting}
                >
                  Đăng ký
                </Button>
              </div>
              {errors.email && (
                <p className="text-sm text-red-400">{errors.email.message}</p>
              )}
            </form>
          )}

          <div className="mt-5 flex flex-col gap-2">
            {HOTLINE && (
              <a
                href={`tel:${HOTLINE.replace(/\s/g, "")}`}
                className="flex items-center gap-2 font-semibold text-white hover:text-green-400"
              >
                <Phone className="size-4" />
                {HOTLINE}
              </a>
            )}
            <Link
              href="/lien-he"
              className="w-fit rounded-full bg-slate-800 px-4 py-1.5 font-medium text-white hover:bg-green-600"
            >
              Liên hệ ngay
            </Link>
          </div>
        </div>
      </div>

      <div className="mx-auto mt-10 flex w-full max-w-7xl flex-col gap-2 border-t border-slate-800 pt-6 text-xs sm:flex-row sm:items-center sm:justify-between">
        <p>© {year} Pickleball. All rights reserved.</p>
        <p>
          Đăng ký chủ sân?{" "}
          <Link
            href="/lien-he?tab=dang-ky-chu-san"
            className="font-medium text-green-400 hover:underline"
          >
            Liên hệ ngay
          </Link>
        </p>
      </div>
    </footer>
  );
}
```

- [ ] **Step 4: Build web để xác nhận không lỗi type/lint**

Run: `cd apps/web && npm run build`
Expected: build thành công, không lỗi TS/ESLint (kiểm tra `Music2`, `Facebook`, `Youtube` tồn tại trong lucide-react — nếu ESLint báo import thừa khi `socials` rỗng thì vẫn OK vì các icon được dùng trong hằng `SOCIAL`).

- [ ] **Step 5: Verify thủ công trên trình duyệt**

Khởi động api (`cd apps/api && npm run start:dev`) và web (`cd apps/web && npm run dev`). Mở `http://localhost:3000/` (hoặc bất kỳ trang public có footer):
- Footer hiện: brand, cột Khám phá, cột Hỗ trợ (Chính sách hoàn tiền / Điều khoản sử dụng là chữ mờ + nhãn "Sắp có", không click được), khối "Đăng ký nhận ưu đãi", nút "Liên hệ ngay".
- `HOTLINE=""` và `SOCIAL.href=""` → không có dòng hotline, không có icon social, layout không vỡ.
- Nhập email sai định dạng → bấm "Đăng ký" → hiện lỗi "Email không hợp lệ", **không** gọi API (kiểm tra Network tab).
- Nhập email hợp lệ → "Đăng ký" → form đổi sang "Đã đăng ký! Bạn sẽ nhận ưu đãi qua email."
- Kiểm tra DB: `docker compose exec -T db psql -U postgres -d pickleball -c 'select email from newsletter_subscribers;'` → thấy email vừa nhập (chữ thường).
- Nhập lại **cùng email** → vẫn thấy trạng thái cảm ơn (không toast lỗi); DB vẫn 1 dòng.
- Các link Khám phá/Hỗ trợ điều hướng đúng `/venues`, `/ban-do`, `/blog`, `/lien-he`.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/api/contact/newsletter-subscribers/route.ts apps/web/src/lib/schemas.ts apps/web/src/components/public-footer.tsx
git commit -m "feat(web): enrich public footer with social, support column, newsletter, hotline"
```

---

## Ghi chú khi thực thi

- Trước khi merge, thay `HOTLINE` và các `SOCIAL[].href` bằng giá trị thật khi chủ dự án cung cấp (số điện thoại + URL Facebook/TikTok/YouTube). Nếu bỏ TikTok, xoá phần tử TikTok khỏi mảng `SOCIAL` và import `Music2` nếu không còn dùng.
- Kiểm tra tên database/user Postgres thật trong `apps/api/.env` nếu lệnh psql ở Task 2 Step 5 khác cấu hình mặc định.
