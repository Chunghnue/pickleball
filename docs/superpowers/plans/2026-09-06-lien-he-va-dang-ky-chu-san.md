# Liên hệ & Đăng ký chủ sân (Public Website) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the public `/lien-he` page described in `docs/01-website-khach-hang/09-lien-he-va-dang-ky-chu-san.md` — two tabs on one page: a "Hỗ trợ" tab (contact channels, a support-message form, support hours, FAQ) and a "Đăng ký chủ sân" tab (partner-lead form with dependent tỉnh/phường dropdowns and multi-select sport types) — backed by two new public, unauthenticated API endpoints.

**Architecture:** New `ContactModule` in `apps/api` (NestJS + TypeORM) exposing `POST /contact/support-messages` and `POST /contact/partner-applications`, each backed by its own table (`support_messages`, `partner_applications`). `apps/web` gets proxy routes for both, plus two more proxy routes that forward to the public `provinces.open-api.vn` v2 API (post-2025 merger, 2-level tỉnh→phường data) for the province/ward dropdowns. The `/lien-he` page follows the same `PublicHeader`/`PublicFooter` + green-gradient-hero pattern as `/blog`, with the two tabs implemented as plain client-side state (no new UI-kit dependency), and both forms built with `react-hook-form` + `zod`, matching `/register/owner`.

**Tech Stack:** NestJS, TypeORM (Postgres), class-validator, Jest + Supertest (e2e), Next.js 16 App Router, React 19, react-hook-form, zod, Tailwind, lucide-react icons.

## Global Constraints

- The spec's two tabs ("Hỗ trợ" / "Đăng ký chủ sân") live on one page (`/lien-he`), switched with local component state — not two separate routes.
- The spec describes no admin UI for reviewing submitted support messages or partner applications — SanBong's team reviews leads manually/offline. Do not build a review UI; the API only needs to accept and persist submissions.
- Sport types are a fixed 7-value set, verbatim from the spec: Bóng đá, Tennis, Cầu lông, Pickleball, Bóng bàn, Bóng rổ, Khác.
- Tỉnh/Thành phố is required (spec marks it `*`); Phường/Xã is optional (spec does not mark it `*`) and depends on the selected tỉnh.
- Province/ward data comes live from the public `https://provinces.open-api.vn/api/v2/` API (2-level tỉnh→phường structure, post-July-2025 administrative merger) — confirmed shape: `GET /api/v2/?depth=1` returns `[{ name, code, division_type, codename, phone_code, wards: [] }]`; `GET /api/v2/p/{code}?depth=2` returns `{ name, code, division_type, codename, phone_code, wards: [{ name, code, division_type, codename, province_code }] }`. Do not hardcode a province/ward dataset — proxy this API through our own Next.js routes (avoids any client-side CORS risk).
- All new backend code follows existing conventions in `apps/api/src/blog` and `apps/api/src/customer-contacts` (entities under `entities/`, DTOs under `dto/`, raw-SQL migrations, global `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })` so DTOs must declare every accepted field). Both new endpoints are public (no guards) — the existing global `ThrottlerGuard` (20 req/min per `app.module.ts`) already rate-limits them; do not add extra spam protection.
- All new frontend code follows `/blog` and `/register/owner`: `PublicHeader`/`PublicFooter` wrapper, green gradient hero, Next.js API routes under `apps/web/src/app/api/**` proxying via `toNextResponse`, `react-hook-form` + `zodResolver` + `@/lib/schemas.ts` + `getSubmitErrorMessage` for real submission forms.
- Read `apps/web/AGENTS.md` before touching any Next.js file — this repo pins a Next.js version with breaking API changes (e.g. dynamic route `params` is a `Promise`).

---

### Task 1: `SupportMessage`/`PartnerApplication` entities + migration

**Files:**
- Create: `apps/api/src/contact/entities/support-message.entity.ts`
- Create: `apps/api/src/contact/entities/partner-application.entity.ts`
- Create: `apps/api/src/migrations/1788040000000-CreateContactTables.ts`

**Interfaces:**
- Produces: `SupportMessage` entity (`id, fullName, phone, email, message, createdAt`), `PartnerSportType` enum (`BONG_DA='bong-da', TENNIS='tennis', CAU_LONG='cau-long', PICKLEBALL='pickleball', BONG_BAN='bong-ban', BONG_RO='bong-ro', KHAC='khac'`), `PartnerApplication` entity (`id, ownerFullName, ownerPhone, ownerEmail, venueName, address, province, ward, sportTypes, courtCount, website, note, createdAt`).

- [ ] **Step 1: Create the `SupportMessage` entity**

```ts
// apps/api/src/contact/entities/support-message.entity.ts
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('support_messages')
export class SupportMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'full_name' })
  fullName: string;

  @Column()
  phone: string;

  @Column({ nullable: true, type: 'varchar' })
  email: string | null;

  @Column({ type: 'text' })
  message: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
```

- [ ] **Step 2: Create the `PartnerApplication` entity**

```ts
// apps/api/src/contact/entities/partner-application.entity.ts
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

export enum PartnerSportType {
  BONG_DA = 'bong-da',
  TENNIS = 'tennis',
  CAU_LONG = 'cau-long',
  PICKLEBALL = 'pickleball',
  BONG_BAN = 'bong-ban',
  BONG_RO = 'bong-ro',
  KHAC = 'khac',
}

@Entity('partner_applications')
export class PartnerApplication {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'owner_full_name' })
  ownerFullName: string;

  @Column({ name: 'owner_phone' })
  ownerPhone: string;

  @Column({ name: 'owner_email' })
  ownerEmail: string;

  @Column({ name: 'venue_name' })
  venueName: string;

  @Column()
  address: string;

  @Column()
  province: string;

  @Column({ nullable: true, type: 'varchar' })
  ward: string | null;

  @Column({
    name: 'sport_types',
    type: 'enum',
    enum: PartnerSportType,
    array: true,
  })
  sportTypes: PartnerSportType[];

  @Column({ name: 'court_count', type: 'int' })
  courtCount: number;

  @Column({ nullable: true, type: 'varchar' })
  website: string | null;

  @Column({ nullable: true, type: 'text' })
  note: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
```

- [ ] **Step 3: Write the migration**

```ts
// apps/api/src/migrations/1788040000000-CreateContactTables.ts
import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateContactTables1788040000000 implements MigrationInterface {
  name = 'CreateContactTables1788040000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "support_messages" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "full_name" character varying NOT NULL, "phone" character varying NOT NULL, "email" character varying, "message" text NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_support_messages_id" PRIMARY KEY ("id"))`,
    );

    await queryRunner.query(
      `CREATE TYPE "public"."partner_applications_sport_types_enum" AS ENUM('bong-da', 'tennis', 'cau-long', 'pickleball', 'bong-ban', 'bong-ro', 'khac')`,
    );
    await queryRunner.query(
      `CREATE TABLE "partner_applications" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "owner_full_name" character varying NOT NULL, "owner_phone" character varying NOT NULL, "owner_email" character varying NOT NULL, "venue_name" character varying NOT NULL, "address" character varying NOT NULL, "province" character varying NOT NULL, "ward" character varying, "sport_types" "public"."partner_applications_sport_types_enum"[] NOT NULL, "court_count" integer NOT NULL, "website" character varying, "note" text, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_partner_applications_id" PRIMARY KEY ("id"))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "partner_applications"`);
    await queryRunner.query(
      `DROP TYPE "public"."partner_applications_sport_types_enum"`,
    );
    await queryRunner.query(`DROP TABLE "support_messages"`);
  }
}
```

- [ ] **Step 4: Run the migration against the local dev database**

Run (from `apps/api`, with `docker compose up -d` running): `npm run migration:run`
Expected: output includes `CreateContactTables1788040000000` and exits 0.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/contact/entities/support-message.entity.ts apps/api/src/contact/entities/partner-application.entity.ts apps/api/src/migrations/1788040000000-CreateContactTables.ts
git commit -m "feat(api): add support_messages and partner_applications tables"
```

---

### Task 2: Contact API (DTOs, service, controller, module) + e2e tests

**Files:**
- Create: `apps/api/src/contact/dto/create-support-message.dto.ts`
- Create: `apps/api/src/contact/dto/create-partner-application.dto.ts`
- Create: `apps/api/src/contact/contact.service.ts`
- Create: `apps/api/src/contact/contact.controller.ts`
- Create: `apps/api/src/contact/contact.module.ts`
- Modify: `apps/api/src/app.module.ts`
- Test: `apps/api/test/contact.e2e-spec.ts`

**Interfaces:**
- Consumes: `SupportMessage`, `PartnerApplication`, `PartnerSportType` from Task 1 (`apps/api/src/contact/entities/*`).
- Produces: `ContactService.createSupportMessage(dto: CreateSupportMessageDto): Promise<SupportMessage>`, `ContactService.createPartnerApplication(dto: CreatePartnerApplicationDto): Promise<PartnerApplication>`, routes `POST /contact/support-messages` and `POST /contact/partner-applications` (both public, 201 on success).

- [ ] **Step 1: Write the failing e2e tests**

```ts
// apps/api/test/contact.e2e-spec.ts
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, clearDatabase } from './utils/test-app';

describe('Contact e2e', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(async () => {
    await clearDatabase(app);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /contact/support-messages', () => {
    it('creates a support message', async () => {
      const response = await request(app.getHttpServer())
        .post('/contact/support-messages')
        .send({
          fullName: 'Nguyễn Văn A',
          phone: '0901234567',
          email: 'a@example.com',
          message: 'Tôi cần hỗ trợ đặt sân',
        })
        .expect(201);

      expect(response.body.id).toBeDefined();
      expect(response.body.fullName).toBe('Nguyễn Văn A');
    });

    it('allows omitting the optional email', async () => {
      await request(app.getHttpServer())
        .post('/contact/support-messages')
        .send({ fullName: 'Trần B', phone: '0912345678', message: 'Hỏi giá' })
        .expect(201);
    });

    it('rejects a missing fullName with 400', async () => {
      await request(app.getHttpServer())
        .post('/contact/support-messages')
        .send({ phone: '0912345678', message: 'Hỏi giá' })
        .expect(400);
    });

    it('rejects an unknown field with 400', async () => {
      await request(app.getHttpServer())
        .post('/contact/support-messages')
        .send({
          fullName: 'Trần B',
          phone: '0912345678',
          message: 'Hỏi giá',
          extra: 'not allowed',
        })
        .expect(400);
    });
  });

  describe('POST /contact/partner-applications', () => {
    const validPayload = {
      ownerFullName: 'Lê Văn C',
      ownerPhone: '0987654321',
      ownerEmail: 'owner@example.com',
      venueName: 'Sân Pickleball ABC',
      address: '123 Đường XYZ',
      province: 'Thành phố Hà Nội',
      ward: 'Phường Ba Đình',
      sportTypes: ['pickleball', 'cau-long'],
      courtCount: 4,
    };

    it('creates a partner application', async () => {
      const response = await request(app.getHttpServer())
        .post('/contact/partner-applications')
        .send(validPayload)
        .expect(201);

      expect(response.body.id).toBeDefined();
      expect(response.body.sportTypes).toEqual(['pickleball', 'cau-long']);
    });

    it('allows omitting the optional ward, website, and note', async () => {
      const { ward, ...withoutWard } = validPayload;
      await request(app.getHttpServer())
        .post('/contact/partner-applications')
        .send(withoutWard)
        .expect(201);
    });

    it('rejects an invalid sport type with 400', async () => {
      await request(app.getHttpServer())
        .post('/contact/partner-applications')
        .send({ ...validPayload, sportTypes: ['bong-chuyen'] })
        .expect(400);
    });

    it('rejects a missing courtCount with 400', async () => {
      const { courtCount, ...withoutCourtCount } = validPayload;
      await request(app.getHttpServer())
        .post('/contact/partner-applications')
        .send(withoutCourtCount)
        .expect(400);
    });

    it('rejects an empty sportTypes array with 400', async () => {
      await request(app.getHttpServer())
        .post('/contact/partner-applications')
        .send({ ...validPayload, sportTypes: [] })
        .expect(400);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run (from `apps/api`): `npm run test:e2e -- contact.e2e-spec.ts`
Expected: FAIL — `Cannot GET/POST /contact/...` (404s) since no module is registered yet.

- [ ] **Step 3: Write the DTOs**

```ts
// apps/api/src/contact/dto/create-support-message.dto.ts
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateSupportMessageDto {
  @IsString()
  @MinLength(1)
  fullName: string;

  @IsString()
  @MinLength(1)
  phone: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsString()
  @MinLength(1)
  message: string;
}
```

```ts
// apps/api/src/contact/dto/create-partner-application.dto.ts
import {
  ArrayNotEmpty,
  IsArray,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';
import { PartnerSportType } from '../entities/partner-application.entity';

export class CreatePartnerApplicationDto {
  @IsString()
  @MinLength(1)
  ownerFullName: string;

  @IsString()
  @MinLength(1)
  ownerPhone: string;

  @IsEmail()
  ownerEmail: string;

  @IsString()
  @MinLength(1)
  venueName: string;

  @IsString()
  @MinLength(1)
  address: string;

  @IsString()
  @MinLength(1)
  province: string;

  @IsOptional()
  @IsString()
  ward?: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(PartnerSportType, { each: true })
  sportTypes: PartnerSportType[];

  @IsInt()
  @Min(1)
  courtCount: number;

  @IsOptional()
  @IsString()
  website?: string;

  @IsOptional()
  @IsString()
  note?: string;
}
```

- [ ] **Step 4: Write the service**

```ts
// apps/api/src/contact/contact.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SupportMessage } from './entities/support-message.entity';
import { PartnerApplication } from './entities/partner-application.entity';
import { CreateSupportMessageDto } from './dto/create-support-message.dto';
import { CreatePartnerApplicationDto } from './dto/create-partner-application.dto';

@Injectable()
export class ContactService {
  constructor(
    @InjectRepository(SupportMessage)
    private readonly supportMessagesRepository: Repository<SupportMessage>,
    @InjectRepository(PartnerApplication)
    private readonly partnerApplicationsRepository: Repository<PartnerApplication>,
  ) {}

  createSupportMessage(dto: CreateSupportMessageDto): Promise<SupportMessage> {
    return this.supportMessagesRepository.save(
      this.supportMessagesRepository.create({
        fullName: dto.fullName,
        phone: dto.phone,
        email: dto.email ?? null,
        message: dto.message,
      }),
    );
  }

  createPartnerApplication(
    dto: CreatePartnerApplicationDto,
  ): Promise<PartnerApplication> {
    return this.partnerApplicationsRepository.save(
      this.partnerApplicationsRepository.create({
        ownerFullName: dto.ownerFullName,
        ownerPhone: dto.ownerPhone,
        ownerEmail: dto.ownerEmail,
        venueName: dto.venueName,
        address: dto.address,
        province: dto.province,
        ward: dto.ward ?? null,
        sportTypes: dto.sportTypes,
        courtCount: dto.courtCount,
        website: dto.website ?? null,
        note: dto.note ?? null,
      }),
    );
  }
}
```

- [ ] **Step 5: Write the controller**

```ts
// apps/api/src/contact/contact.controller.ts
import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ContactService } from './contact.service';
import { CreateSupportMessageDto } from './dto/create-support-message.dto';
import { CreatePartnerApplicationDto } from './dto/create-partner-application.dto';

@Controller('contact')
export class ContactController {
  constructor(private readonly contactService: ContactService) {}

  @Post('support-messages')
  @HttpCode(HttpStatus.CREATED)
  createSupportMessage(@Body() dto: CreateSupportMessageDto) {
    return this.contactService.createSupportMessage(dto);
  }

  @Post('partner-applications')
  @HttpCode(HttpStatus.CREATED)
  createPartnerApplication(@Body() dto: CreatePartnerApplicationDto) {
    return this.contactService.createPartnerApplication(dto);
  }
}
```

- [ ] **Step 6: Write the module and register it**

```ts
// apps/api/src/contact/contact.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SupportMessage } from './entities/support-message.entity';
import { PartnerApplication } from './entities/partner-application.entity';
import { ContactController } from './contact.controller';
import { ContactService } from './contact.service';

@Module({
  imports: [TypeOrmModule.forFeature([SupportMessage, PartnerApplication])],
  controllers: [ContactController],
  providers: [ContactService],
})
export class ContactModule {}
```

In `apps/api/src/app.module.ts`, add the import and the entry in the `imports` array (alongside `BlogModule`):

```ts
import { ContactModule } from './contact/contact.module';
// ...
    BlogModule,
    ContactModule,
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npm run test:e2e -- contact.e2e-spec.ts`
Expected: PASS (9 tests)

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/contact/dto/create-support-message.dto.ts apps/api/src/contact/dto/create-partner-application.dto.ts apps/api/src/contact/contact.service.ts apps/api/src/contact/contact.controller.ts apps/api/src/contact/contact.module.ts apps/api/src/app.module.ts apps/api/test/contact.e2e-spec.ts
git commit -m "feat(api): add public contact support-message and partner-application endpoints"
```

---

### Task 3: Next.js proxy routes for contact submissions

**Files:**
- Create: `apps/web/src/app/api/contact/support-messages/route.ts`
- Create: `apps/web/src/app/api/contact/partner-applications/route.ts`

**Interfaces:**
- Consumes: `API_BASE_URL` from `@/lib/api-config`, `toNextResponse` from `@/lib/proxy-response` (same pattern as `apps/web/src/app/api/blog/route.ts`).
- Produces: `POST /api/contact/support-messages`, `POST /api/contact/partner-applications`, both proxying 1:1 to the backend endpoints from Task 2.

- [ ] **Step 1: Write the support-message proxy route**

```ts
// apps/web/src/app/api/contact/support-messages/route.ts
import { NextRequest } from "next/server";
import { API_BASE_URL } from "@/lib/api-config";
import { toNextResponse } from "@/lib/proxy-response";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const upstream = await fetch(`${API_BASE_URL}/contact/support-messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return toNextResponse(upstream);
}
```

- [ ] **Step 2: Write the partner-application proxy route**

```ts
// apps/web/src/app/api/contact/partner-applications/route.ts
import { NextRequest } from "next/server";
import { API_BASE_URL } from "@/lib/api-config";
import { toNextResponse } from "@/lib/proxy-response";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const upstream = await fetch(`${API_BASE_URL}/contact/partner-applications`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return toNextResponse(upstream);
}
```

- [ ] **Step 3: Verify manually against the running backend**

With `apps/api` running (`npm run start:dev`, migrated per Task 1) and `apps/web` running (`npm run dev`):

Run: `curl -i -X POST http://localhost:3000/api/contact/support-messages -H "Content-Type: application/json" -d "{\"fullName\":\"Test\",\"phone\":\"0900000000\",\"message\":\"Hello\"}"`
Expected: `HTTP/1.1 201` with a JSON body containing `id`.

Run: `curl -i -X POST http://localhost:3000/api/contact/partner-applications -H "Content-Type: application/json" -d "{\"ownerFullName\":\"Test\",\"ownerPhone\":\"0900000000\",\"ownerEmail\":\"test@example.com\",\"venueName\":\"San Test\",\"address\":\"1 Test St\",\"province\":\"Thanh pho Ha Noi\",\"sportTypes\":[\"pickleball\"],\"courtCount\":2}"`
Expected: `HTTP/1.1 201` with a JSON body containing `id`.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/api/contact/support-messages/route.ts apps/web/src/app/api/contact/partner-applications/route.ts
git commit -m "feat(web): add contact API proxy routes"
```

---

### Task 4: Next.js proxy routes for VN province/ward lookup

**Files:**
- Create: `apps/web/src/app/api/locations/provinces/route.ts`
- Create: `apps/web/src/app/api/locations/provinces/[code]/route.ts`

**Interfaces:**
- Produces: `GET /api/locations/provinces` → `[{ name, code, division_type, codename, phone_code }]`; `GET /api/locations/provinces/:code` → `{ name, code, division_type, codename, phone_code, wards: [{ name, code, division_type, codename, province_code }] }`. Both proxy 1:1 to `https://provinces.open-api.vn/api/v2/`.

- [ ] **Step 1: Write the provinces list proxy route**

```ts
// apps/web/src/app/api/locations/provinces/route.ts
import { toNextResponse } from "@/lib/proxy-response";

export async function GET() {
  const upstream = await fetch("https://provinces.open-api.vn/api/v2/?depth=1");
  return toNextResponse(upstream);
}
```

- [ ] **Step 2: Write the province detail (with wards) proxy route**

```ts
// apps/web/src/app/api/locations/provinces/[code]/route.ts
import { toNextResponse } from "@/lib/proxy-response";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const upstream = await fetch(
    `https://provinces.open-api.vn/api/v2/p/${code}?depth=2`,
  );
  return toNextResponse(upstream);
}
```

- [ ] **Step 3: Verify manually against the real external API**

With `apps/web` running (`npm run dev`):

Run: `curl http://localhost:3000/api/locations/provinces`
Expected: JSON array of 34 provinces, each with `name`, `code`, `division_type`, `codename`, `phone_code`.

Run: `curl http://localhost:3000/api/locations/provinces/1`
Expected: JSON object for "Thành phố Hà Nội" with a `wards` array (~99 entries), each with `name` and `code`.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/api/locations/provinces/route.ts "apps/web/src/app/api/locations/provinces/[code]/route.ts"
git commit -m "feat(web): add VN province/ward lookup proxy routes"
```

---

### Task 5: `/lien-he` page shell + "Hỗ trợ" tab

**Files:**
- Create: `apps/web/src/app/lien-he/page.tsx`
- Create: `apps/web/src/app/lien-he/support-tab.tsx`
- Modify: `apps/web/src/lib/schemas.ts`

**Interfaces:**
- Consumes: `PublicHeader` (`@/components/public-header`), `PublicFooter` (`@/components/public-footer`), `Button`/`Input`/`Label` (`@/components/ui/*`), `getSubmitErrorMessage` (`@/lib/error-message`), `cn` (`@/lib/utils`), `POST /api/contact/support-messages` (Task 3).
- Produces: `supportMessageSchema` / `SupportMessageInput` (in `@/lib/schemas`), `SupportTab` component, `/lien-he` route rendering a tab switcher (`ho-tro` default, `dang-ky-chu-san` placeholder until Task 6).

- [ ] **Step 1: Add the support-message schema**

Append to `apps/web/src/lib/schemas.ts`:

```ts
export const supportMessageSchema = z.object({
  fullName: z.string().min(1, 'Vui lòng nhập họ và tên'),
  phone: z.string().min(1, 'Vui lòng nhập số điện thoại'),
  email: z.string().email('Email không hợp lệ').optional().or(z.literal('')),
  message: z.string().min(1, 'Vui lòng nhập nội dung'),
});
export type SupportMessageInput = z.infer<typeof supportMessageSchema>;
```

- [ ] **Step 2: Write the "Hỗ trợ" tab component**

```tsx
// apps/web/src/app/lien-he/support-tab.tsx
"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Clock, Mail, MapPin, MessageCircle, Phone, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supportMessageSchema, type SupportMessageInput } from "@/lib/schemas";
import { getSubmitErrorMessage } from "@/lib/error-message";

const CHANNELS = [
  { icon: Phone, title: "Hotline", detail: "081 22 88 111 (miễn phí, 7:00–22:00)" },
  { icon: Mail, title: "Email", detail: "support@sanbong.vn (phản hồi trong 2 giờ)" },
  { icon: MessageCircle, title: "Chat", detail: "Qua Zalo/Messenger" },
  { icon: MapPin, title: "Văn phòng", detail: "Tầng 8, 123 Lê Văn Lương, Hà Nội" },
];

const SUPPORT_HOURS = [
  "Thứ 2",
  "Thứ 3",
  "Thứ 4",
  "Thứ 5",
  "Thứ 6",
  "Thứ 7",
  "Chủ nhật",
].map((day) => ({ day, hours: "7:00 – 22:00" }));

const FAQS = [
  {
    question: "Tôi có thể hủy đặt sân không?",
    answer:
      "Có. Vào mục Lịch sử đặt sân trong tài khoản của bạn để hủy lịch trước giờ nhận sân, theo chính sách hủy của từng cơ sở.",
  },
  {
    question: "Thanh toán có an toàn không?",
    answer:
      "Mọi giao dịch trên SanBong.vn được xử lý qua cổng thanh toán uy tín và mã hóa, đảm bảo an toàn cho khách hàng.",
  },
  {
    question: "Làm sao để đăng ký sân?",
    answer:
      'Chủ sân điền form ở tab "Đăng ký chủ sân" bên cạnh — đội ngũ SanBong.vn sẽ liên hệ và kích hoạt tài khoản quản lý.',
  },
];

export function SupportTab() {
  const [submitted, setSubmitted] = useState(false);
  const form = useForm<SupportMessageInput>({
    resolver: zodResolver(supportMessageSchema),
    defaultValues: { fullName: "", phone: "", email: "", message: "" },
  });
  const { errors } = form.formState;

  async function onSubmit(values: SupportMessageInput) {
    const response = await fetch("/api/contact/support-messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...values, email: values.email || undefined }),
    });
    const data = await response.json().catch(() => null);

    if (!response.ok) {
      toast.error(getSubmitErrorMessage(response, data));
      return;
    }

    setSubmitted(true);
    form.reset();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="flex flex-col gap-6">
        <div className="grid gap-3 sm:grid-cols-2">
          {CHANNELS.map((channel) => (
            <div
              key={channel.title}
              className="flex items-start gap-3 rounded-2xl border bg-card p-4"
            >
              <channel.icon className="mt-0.5 size-5 shrink-0 text-green-600 dark:text-green-400" />
              <div>
                <p className="font-semibold">{channel.title}</p>
                <p className="text-sm text-muted-foreground">{channel.detail}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-2xl border bg-card p-4">
          <p className="flex items-center gap-2 font-semibold">
            <Clock className="size-4 text-green-600 dark:text-green-400" />
            Giờ hỗ trợ
          </p>
          <table className="mt-3 w-full text-sm">
            <tbody>
              {SUPPORT_HOURS.map((row) => (
                <tr key={row.day} className="border-t first:border-t-0">
                  <td className="py-1.5 text-muted-foreground">{row.day}</td>
                  <td className="py-1.5 text-right font-medium">{row.hours}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="rounded-2xl border bg-card p-4">
          <p className="font-semibold">Câu hỏi thường gặp</p>
          <div className="mt-2 flex flex-col divide-y">
            {FAQS.map((faq) => (
              <details key={faq.question} className="py-2">
                <summary className="cursor-pointer list-none text-sm font-medium">
                  {faq.question}
                </summary>
                <p className="mt-1.5 text-sm text-muted-foreground">{faq.answer}</p>
              </details>
            ))}
          </div>
        </div>
      </div>

      <div className="h-fit rounded-2xl border bg-card p-5">
        {submitted ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <Send className="size-8 text-green-600 dark:text-green-400" />
            <p className="font-semibold">Đã gửi tin nhắn!</p>
            <p className="text-sm text-muted-foreground">
              Đội ngũ hỗ trợ sẽ phản hồi bạn trong thời gian sớm nhất.
            </p>
            <Button type="button" variant="outline" onClick={() => setSubmitted(false)}>
              Gửi tin nhắn khác
            </Button>
          </div>
        ) : (
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <p className="font-semibold">Gửi tin nhắn hỗ trợ</p>
            <div className="space-y-2">
              <Label htmlFor="fullName">Họ và tên</Label>
              <Input
                id="fullName"
                aria-invalid={!!errors.fullName}
                {...form.register("fullName")}
              />
              {errors.fullName && (
                <p className="text-sm text-destructive">{errors.fullName.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Số điện thoại</Label>
              <Input id="phone" aria-invalid={!!errors.phone} {...form.register("phone")} />
              {errors.phone && (
                <p className="text-sm text-destructive">{errors.phone.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                aria-invalid={!!errors.email}
                {...form.register("email")}
              />
              {errors.email && (
                <p className="text-sm text-destructive">{errors.email.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="message">Nội dung</Label>
              <textarea
                id="message"
                rows={4}
                className="w-full resize-y rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:border-neutral-700 dark:bg-neutral-800/50"
                aria-invalid={!!errors.message}
                {...form.register("message")}
              />
              {errors.message && (
                <p className="text-sm text-destructive">{errors.message.message}</p>
              )}
            </div>
            <Button
              type="submit"
              className="gap-2 bg-green-600 hover:bg-green-700"
              disabled={form.formState.isSubmitting}
            >
              <Send className="size-4" />
              Gửi tin nhắn
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Write the page shell with the tab switcher**

```tsx
// apps/web/src/app/lien-he/page.tsx
"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { LandPlot, LifeBuoy } from "lucide-react";
import { PublicHeader } from "@/components/public-header";
import { PublicFooter } from "@/components/public-footer";
import { cn } from "@/lib/utils";
import { SupportTab } from "./support-tab";

type TabKey = "ho-tro" | "dang-ky-chu-san";

export default function LienHePage() {
  return (
    <>
      <PublicHeader />
      <Suspense>
        <LienHeContent />
      </Suspense>
      <PublicFooter />
    </>
  );
}

function LienHeContent() {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<TabKey>(
    searchParams.get("tab") === "dang-ky-chu-san" ? "dang-ky-chu-san" : "ho-tro",
  );

  return (
    <main className="flex flex-1 flex-col">
      <section className="bg-gradient-to-br from-green-950 via-green-900 to-emerald-950 px-4 pt-10 pb-8 text-white">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-3">
          <h1 className="text-3xl font-extrabold sm:text-4xl">Liên hệ</h1>
          <p className="text-white/70">
            Hỗ trợ người chơi và đồng hành cùng chủ sân thể thao
          </p>
        </div>
      </section>

      <div className="relative z-10 mx-auto -mt-6 w-full max-w-4xl px-4">
        <div className="flex gap-2 rounded-2xl bg-card p-2 shadow-md ring-1 ring-foreground/10">
          <button
            type="button"
            onClick={() => setTab("ho-tro")}
            className={cn(
              "flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors",
              tab === "ho-tro"
                ? "bg-green-600 text-white"
                : "text-muted-foreground hover:bg-muted",
            )}
          >
            <LifeBuoy className="size-4" />
            Hỗ trợ
          </button>
          <button
            type="button"
            onClick={() => setTab("dang-ky-chu-san")}
            className={cn(
              "flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors",
              tab === "dang-ky-chu-san"
                ? "bg-green-600 text-white"
                : "text-muted-foreground hover:bg-muted",
            )}
          >
            <LandPlot className="size-4" />
            Đăng ký chủ sân
          </button>
        </div>
      </div>

      <div className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
        {tab === "ho-tro" ? (
          <SupportTab />
        ) : (
          <p className="text-muted-foreground">Đang tải...</p>
        )}
      </div>
    </main>
  );
}
```

- [ ] **Step 4: Verify manually in the browser**

Run (from `apps/web`): `npm run dev`, open `http://localhost:3000/lien-he`.
Expected: hero renders; "Hỗ trợ" tab active by default showing 4 contact channels, support hours table, 3 FAQ items (click to expand), and the support form; filling and submitting the form (with backend from Task 2/3 running) shows the "Đã gửi tin nhắn!" success state; clicking "Đăng ký chủ sân" switches to the placeholder text.

Open `http://localhost:3000/lien-he?tab=dang-ky-chu-san`.
Expected: "Đăng ký chủ sân" tab is active on load.

- [ ] **Step 5: Typecheck**

Run (from `apps/web`): `npm run build`
Expected: no type errors.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/lien-he/page.tsx apps/web/src/app/lien-he/support-tab.tsx apps/web/src/lib/schemas.ts
git commit -m "feat(web): build the lien-he page shell and support tab"
```

---

### Task 6: "Đăng ký chủ sân" tab with province/ward and sport-type selection

**Files:**
- Create: `apps/web/src/app/lien-he/partner-tab.tsx`
- Modify: `apps/web/src/app/lien-he/page.tsx`
- Modify: `apps/web/src/lib/schemas.ts`

**Interfaces:**
- Consumes: `GET /api/locations/provinces`, `GET /api/locations/provinces/:code` (Task 4), `POST /api/contact/partner-applications` (Task 3), same UI components as Task 5.
- Produces: `partnerSportTypeValues`, `partnerApplicationSchema` / `PartnerApplicationInput` (in `@/lib/schemas`), `PartnerTab` component.

- [ ] **Step 1: Add the partner-application schema**

Append to `apps/web/src/lib/schemas.ts`:

```ts
export const partnerSportTypeValues = [
  'bong-da',
  'tennis',
  'cau-long',
  'pickleball',
  'bong-ban',
  'bong-ro',
  'khac',
] as const;

export const partnerApplicationSchema = z.object({
  ownerFullName: z.string().min(1, 'Vui lòng nhập họ tên chủ sân'),
  ownerPhone: z.string().min(1, 'Vui lòng nhập số điện thoại'),
  ownerEmail: z.string().email('Email không hợp lệ'),
  venueName: z.string().min(1, 'Vui lòng nhập tên cơ sở'),
  address: z.string().min(1, 'Vui lòng nhập địa chỉ'),
  province: z.string().min(1, 'Vui lòng chọn tỉnh/thành phố'),
  ward: z.string().optional(),
  sportTypes: z
    .array(z.enum(partnerSportTypeValues))
    .min(1, 'Chọn ít nhất 1 loại sân'),
  courtCount: z.coerce.number().int('Phải là số nguyên').min(1, 'Phải lớn hơn 0'),
  website: z.string().optional(),
  note: z.string().optional(),
});
export type PartnerApplicationInput = z.infer<typeof partnerApplicationSchema>;
```

- [ ] **Step 2: Write the "Đăng ký chủ sân" tab component**

```tsx
// apps/web/src/app/lien-he/partner-tab.tsx
"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  BarChart3,
  CalendarClock,
  HeartHandshake,
  LayoutDashboard,
  Rocket,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  partnerApplicationSchema,
  partnerSportTypeValues,
  type PartnerApplicationInput,
} from "@/lib/schemas";
import { getSubmitErrorMessage } from "@/lib/error-message";

const BENEFITS = [
  { icon: TrendingUp, label: "Tiếp cận hàng ngàn khách hàng đặt sân mỗi ngày" },
  { icon: CalendarClock, label: "Quản lý lịch đặt sân, doanh thu trực tuyến 24/7" },
  { icon: BarChart3, label: "Giảm tình trạng sân trống, tăng doanh thu đến 40%" },
  { icon: HeartHandshake, label: "Hỗ trợ kỹ thuật và vận hành miễn phí" },
  { icon: LayoutDashboard, label: "Có Dashboard quản lý chuyên nghiệp trên SanBong App" },
];

const SPORT_TYPE_LABELS: Record<(typeof partnerSportTypeValues)[number], string> = {
  "bong-da": "Bóng đá",
  tennis: "Tennis",
  "cau-long": "Cầu lông",
  pickleball: "Pickleball",
  "bong-ban": "Bóng bàn",
  "bong-ro": "Bóng rổ",
  khac: "Khác",
};

interface Province {
  code: number;
  name: string;
}

interface Ward {
  code: number;
  name: string;
}

export function PartnerTab() {
  const [submitted, setSubmitted] = useState(false);
  const [provinces, setProvinces] = useState<Province[]>([]);
  const [wards, setWards] = useState<Ward[]>([]);
  const [provinceCode, setProvinceCode] = useState("");
  const [wardCode, setWardCode] = useState("");

  const form = useForm<PartnerApplicationInput>({
    resolver: zodResolver(partnerApplicationSchema),
    defaultValues: {
      ownerFullName: "",
      ownerPhone: "",
      ownerEmail: "",
      venueName: "",
      address: "",
      province: "",
      ward: "",
      sportTypes: [],
      courtCount: 1,
      website: "",
      note: "",
    },
  });
  const { errors } = form.formState;
  const sportTypes = form.watch("sportTypes");

  useEffect(() => {
    fetch("/api/locations/provinces")
      .then((res) => res.json())
      .then((data) => setProvinces(Array.isArray(data) ? data : []));
  }, []);

  async function handleProvinceChange(code: string) {
    setProvinceCode(code);
    setWardCode("");
    setWards([]);
    form.setValue("ward", "");
    const province = provinces.find((p) => String(p.code) === code);
    form.setValue("province", province?.name ?? "", { shouldValidate: true });
    if (!code) return;

    const response = await fetch(`/api/locations/provinces/${code}`);
    const data = await response.json();
    setWards(Array.isArray(data.wards) ? data.wards : []);
  }

  function handleWardChange(code: string) {
    setWardCode(code);
    const ward = wards.find((w) => String(w.code) === code);
    form.setValue("ward", ward?.name ?? "");
  }

  function toggleSportType(value: (typeof partnerSportTypeValues)[number]) {
    const next = sportTypes.includes(value)
      ? sportTypes.filter((v) => v !== value)
      : [...sportTypes, value];
    form.setValue("sportTypes", next, { shouldValidate: true });
  }

  async function onSubmit(values: PartnerApplicationInput) {
    const response = await fetch("/api/contact/partner-applications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...values,
        ward: values.ward || undefined,
        website: values.website || undefined,
        note: values.note || undefined,
      }),
    });
    const data = await response.json().catch(() => null);

    if (!response.ok) {
      toast.error(getSubmitErrorMessage(response, data));
      return;
    }

    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border bg-card py-12 text-center">
        <Rocket className="size-9 text-green-600 dark:text-green-400" />
        <p className="text-lg font-semibold">Đã gửi đăng ký!</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          Đội ngũ SanBong.vn sẽ liên hệ và kích hoạt tài khoản quản lý cho bạn trong thời
          gian sớm nhất.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="flex flex-col gap-3">
        {BENEFITS.map((benefit) => (
          <div
            key={benefit.label}
            className="flex items-start gap-3 rounded-2xl border bg-card p-4"
          >
            <benefit.icon className="mt-0.5 size-5 shrink-0 text-green-600 dark:text-green-400" />
            <p className="text-sm font-medium">{benefit.label}</p>
          </div>
        ))}
      </div>

      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex flex-col gap-5 rounded-2xl border bg-card p-5"
      >
        <div className="flex flex-col gap-3">
          <p className="font-semibold">Thông tin chủ sân</p>
          <div className="space-y-2">
            <Label htmlFor="ownerFullName">Họ tên chủ sân</Label>
            <Input
              id="ownerFullName"
              aria-invalid={!!errors.ownerFullName}
              {...form.register("ownerFullName")}
            />
            {errors.ownerFullName && (
              <p className="text-sm text-destructive">{errors.ownerFullName.message}</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="ownerPhone">Số điện thoại</Label>
              <Input
                id="ownerPhone"
                aria-invalid={!!errors.ownerPhone}
                {...form.register("ownerPhone")}
              />
              {errors.ownerPhone && (
                <p className="text-sm text-destructive">{errors.ownerPhone.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="ownerEmail">Email</Label>
              <Input
                id="ownerEmail"
                type="email"
                aria-invalid={!!errors.ownerEmail}
                {...form.register("ownerEmail")}
              />
              {errors.ownerEmail && (
                <p className="text-sm text-destructive">{errors.ownerEmail.message}</p>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t pt-4">
          <p className="font-semibold">Thông tin cơ sở</p>
          <div className="space-y-2">
            <Label htmlFor="venueName">Tên cơ sở</Label>
            <Input
              id="venueName"
              aria-invalid={!!errors.venueName}
              {...form.register("venueName")}
            />
            {errors.venueName && (
              <p className="text-sm text-destructive">{errors.venueName.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="address">Địa chỉ</Label>
            <Input
              id="address"
              aria-invalid={!!errors.address}
              {...form.register("address")}
            />
            {errors.address && (
              <p className="text-sm text-destructive">{errors.address.message}</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="province">Tỉnh/Thành phố</Label>
              <select
                id="province"
                value={provinceCode}
                onChange={(event) => handleProvinceChange(event.target.value)}
                className="h-9 w-full rounded-lg border px-2.5 text-sm"
              >
                <option value="">Chọn tỉnh/thành phố</option>
                {provinces.map((province) => (
                  <option key={province.code} value={province.code}>
                    {province.name}
                  </option>
                ))}
              </select>
              {errors.province && (
                <p className="text-sm text-destructive">{errors.province.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="ward">Phường/Xã</Label>
              <select
                id="ward"
                value={wardCode}
                onChange={(event) => handleWardChange(event.target.value)}
                disabled={!provinceCode}
                className="h-9 w-full rounded-lg border px-2.5 text-sm disabled:opacity-50"
              >
                <option value="">Chọn phường/xã</option>
                {wards.map((ward) => (
                  <option key={ward.code} value={ward.code}>
                    {ward.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t pt-4">
          <p className="font-semibold">Thông tin sân</p>
          <div className="space-y-2">
            <Label>Loại sân</Label>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {partnerSportTypeValues.map((value) => (
                <label key={value} className="flex items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    checked={sportTypes.includes(value)}
                    onChange={() => toggleSportType(value)}
                    className="size-4 rounded border-input"
                  />
                  {SPORT_TYPE_LABELS[value]}
                </label>
              ))}
            </div>
            {errors.sportTypes && (
              <p className="text-sm text-destructive">{errors.sportTypes.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="courtCount">Số lượng sân</Label>
            <Input
              id="courtCount"
              type="number"
              min={1}
              aria-invalid={!!errors.courtCount}
              {...form.register("courtCount")}
            />
            {errors.courtCount && (
              <p className="text-sm text-destructive">{errors.courtCount.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="website">Website/Facebook (tuỳ chọn)</Label>
            <Input id="website" {...form.register("website")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="note">Ghi chú thêm</Label>
            <textarea
              id="note"
              rows={3}
              className="w-full resize-y rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:border-neutral-700 dark:bg-neutral-800/50"
              {...form.register("note")}
            />
          </div>
        </div>

        <Button
          type="submit"
          className="gap-2 bg-green-600 hover:bg-green-700"
          disabled={form.formState.isSubmitting}
        >
          <Rocket className="size-4" />
          Gửi đăng ký
        </Button>
      </form>
    </div>
  );
}
```

- [ ] **Step 3: Wire the tab into the page shell**

In `apps/web/src/app/lien-he/page.tsx`, add the import:

```ts
import { PartnerTab } from "./partner-tab";
```

Replace the placeholder render block:

```tsx
        {tab === "ho-tro" ? (
          <SupportTab />
        ) : (
          <p className="text-muted-foreground">Đang tải...</p>
        )}
```

with:

```tsx
        {tab === "ho-tro" ? <SupportTab /> : <PartnerTab />}
```

- [ ] **Step 4: Verify manually in the browser**

With `apps/api` and `apps/web` running:

Open `http://localhost:3000/lien-he?tab=dang-ky-chu-san`.
Expected: 5 benefit rows render; the province `<select>` is populated (34 entries); selecting a province populates and enables the ward `<select>`; checking multiple sport-type checkboxes toggles them; submitting with all required fields shows the "Đã gửi đăng ký!" success state; submitting with an unchecked sport-type list shows a validation error under "Loại sân" instead of calling the API.

- [ ] **Step 5: Typecheck**

Run (from `apps/web`): `npm run build`
Expected: no type errors.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/lien-he/partner-tab.tsx apps/web/src/app/lien-he/page.tsx apps/web/src/lib/schemas.ts
git commit -m "feat(web): build the partner registration tab"
```

---

### Task 7: Wire up navigation to `/lien-he`

**Files:**
- Modify: `apps/web/src/components/public-header.tsx`
- Modify: `apps/web/src/components/public-footer.tsx`

**Interfaces:**
- None (pure navigation links to the route built in Tasks 5–6).

- [ ] **Step 1: Add a "Liên hệ" link to the header nav**

In `apps/web/src/components/public-header.tsx`, add `Headset` to the `lucide-react` import:

```ts
import { BookOpen, Headset, History, LandPlot, LogIn, LogOut, Map, Search, User } from "lucide-react";
```

Add a new `<Link>` right after the existing Blog link (still inside the `<nav>` that wraps "Tìm sân" / "Bản đồ" / "Blog"):

```tsx
            <Link
              href="/lien-he"
              className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-green-600 dark:hover:text-green-400"
            >
              <Headset className="size-4" />
              Liên hệ
            </Link>
```

- [ ] **Step 2: Point the footer's partner CTA at the new page**

In `apps/web/src/components/public-footer.tsx`, add a "Liên hệ & hỗ trợ" link under the existing "Khám phá" column (after the Blog link):

```tsx
            <Link href="/lien-he" className="hover:text-green-400">
              Liên hệ & hỗ trợ
            </Link>
```

Change the bottom CTA link from `/register/owner` to the partner tab of the new page:

```tsx
          <Link
            href="/lien-he?tab=dang-ky-chu-san"
            className="font-medium text-green-400 hover:underline"
          >
            Liên hệ ngay
          </Link>
```

- [ ] **Step 3: Verify manually in the browser**

Run (from `apps/web`): `npm run dev`, open `http://localhost:3000/`.
Expected: header nav shows a "Liên hệ" link that navigates to `/lien-he`; footer "Khám phá" column shows "Liên hệ & hỗ trợ" linking to `/lien-he`; footer bottom-bar "Liên hệ ngay" now opens `/lien-he?tab=dang-ky-chu-san` with the partner tab active.

- [ ] **Step 4: Typecheck**

Run (from `apps/web`): `npm run build`
Expected: no type errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/public-header.tsx apps/web/src/components/public-footer.tsx
git commit -m "feat(web): link header and footer to the lien-he page"
```
