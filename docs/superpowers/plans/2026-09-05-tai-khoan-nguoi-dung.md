# Tài khoản người dùng (account area) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the customer account routes to `/tai-khoan/ho-so` and `/tai-khoan/lich-su`, add an `address` field to the profile, and add platform-wide profile stats (bookings count / total spent / member tier) to the profile page.

**Architecture:** Backend (`apps/api`, NestJS + TypeORM) gets a new nullable `address` column on `users` and a new `GET /users/me/stats` endpoint that aggregates the current customer's bookings across all venues (reusing the existing `classifyTier` pure function from the owner-facing Customers module). Frontend (`apps/web`, Next.js) moves the two existing account pages to new URLs, updates every place that hardcodes the old URLs, and extends the profile page's form/schema and the booking-history page's empty state.

**Tech Stack:** NestJS, TypeORM (Postgres), class-validator, Jest (`apps/api`) · Next.js App Router, react-hook-form + zod, Vitest (`apps/web`)

## Global Constraints

- Route rename: `/me` → `/tai-khoan/ho-so`, `/me/bookings` → `/tai-khoan/lich-su`. The backend API path `GET`/`PATCH /users/me` does **not** change.
- `GET /users/me/stats` computes `totalBookings`/`totalSpent`/`tier` **platform-wide** (all venues, not scoped to one owner) — do not reuse `CustomersService.aggregateCustomers` (that one is owner-scoped for the CRM feature).
- `UsersModule` must import the `Booking` entity directly (`TypeOrmModule.forFeature`), not `CustomersModule` — `CustomersModule` already depends on `UsersModule`, so the reverse import would be circular.
- Email stays read-only on the profile form — do not add it to `UpdateProfileDto`/`updateProfileSchema`.
- Do not edit historical spec files (`bookings-frontend-design.md`, `dat-san-online-design.md`, etc.) that mention `/me`/`/me/bookings` in prose — only the two live route-protection sources (`route-protection.ts`, `login/page.tsx`) are the authoritative route config.
- Full design context: [docs/superpowers/specs/2026-09-05-tai-khoan-nguoi-dung-design.md](../specs/2026-09-05-tai-khoan-nguoi-dung-design.md)

---

## Task 1: Backend — `address` column on `users`

**Files:**
- Create: `apps/api/src/migrations/1788010000000-AddAddressToUsers.ts`
- Modify: `apps/api/src/users/entities/user.entity.ts`
- Modify: `apps/api/src/users/dto/update-profile.dto.ts`
- Modify: `apps/api/src/users/users.service.ts:133-145`
- Test: `apps/api/src/users/users.service.spec.ts`

**Interfaces:**
- Produces: `User.address: string | null`; `UsersService.updateProfile(userId, { fullName?, phone?, avatarUrl?, address? })` now also persists `address`.

- [ ] **Step 1: Write the failing test**

Add to `apps/api/src/users/users.service.spec.ts` (inside the existing `describe('UsersService', ...)` block, after the existing `it(...)`):

```ts
  it('updates the address field when provided', async () => {
    const { service, repo } = await buildTestingModule();
    repo.findOne.mockResolvedValue({
      id: 'user-1',
      fullName: 'A B',
      phone: null,
      avatarUrl: null,
      address: null,
    });
    repo.save.mockImplementation((data) => Promise.resolve(data));

    const result = await service.updateProfile('user-1', {
      address: '123 Lê Lợi, Q1',
    });

    expect(result.address).toBe('123 Lê Lợi, Q1');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx jest src/users/users.service.spec.ts -t "updates the address field"`
Expected: FAIL — `Property 'address' does not exist on type ...` (TS compile error) or the returned object has no `address` key.

- [ ] **Step 3: Create the migration**

```ts
import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAddressToUsers1788010000000 implements MigrationInterface {
  name = 'AddAddressToUsers1788010000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN "address" varchar`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "address"`);
  }
}
```

- [ ] **Step 4: Add the entity column**

In `apps/api/src/users/entities/user.entity.ts`, right after the `avatarUrl` column (currently lines 49-50):

```ts
  @Column({ name: 'avatar_url', nullable: true, type: 'varchar' })
  avatarUrl: string | null;

  @Column({ nullable: true, type: 'varchar' })
  address: string | null;
```

- [ ] **Step 5: Add the DTO field**

`apps/api/src/users/dto/update-profile.dto.ts` becomes:

```ts
import { IsOptional, IsString, IsUrl } from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  fullName?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsUrl()
  avatarUrl?: string;

  @IsOptional()
  @IsString()
  address?: string;
}
```

- [ ] **Step 6: Update `updateProfile`**

In `apps/api/src/users/users.service.ts:133-145`, replace the method with:

```ts
  async updateProfile(
    userId: string,
    updates: {
      fullName?: string;
      phone?: string;
      avatarUrl?: string;
      address?: string;
    },
  ): Promise<User> {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`User ${userId} not found`);
    }
    if (updates.fullName !== undefined) user.fullName = updates.fullName;
    if (updates.phone !== undefined) user.phone = updates.phone;
    if (updates.avatarUrl !== undefined) user.avatarUrl = updates.avatarUrl;
    if (updates.address !== undefined) user.address = updates.address;
    return this.usersRepository.save(user);
  }
```

- [ ] **Step 7: Run test to verify it passes**

Run: `cd apps/api && npx jest src/users/users.service.spec.ts`
Expected: PASS (both the pre-existing test and the new one).

- [ ] **Step 8: Run the migration against the dev database**

Run: `cd apps/api && npm run migration:run` (or the project's equivalent script — check `apps/api/package.json` `"scripts"` for the exact TypeORM CLI invocation if the name differs).
Expected: Output includes `AddAddressToUsers1788010000000` migrated successfully.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/migrations/1788010000000-AddAddressToUsers.ts apps/api/src/users/entities/user.entity.ts apps/api/src/users/dto/update-profile.dto.ts apps/api/src/users/users.service.ts apps/api/src/users/users.service.spec.ts
git commit -m "feat(api): add address field to user profile"
```

---

## Task 2: Backend — `GET /users/me/stats`

**Files:**
- Modify: `apps/api/src/users/users.module.ts`
- Modify: `apps/api/src/users/users.service.ts`
- Modify: `apps/api/src/users/users.controller.ts`
- Test: `apps/api/src/users/users.service.spec.ts`

**Interfaces:**
- Consumes: `classifyTier(totalBookings: number, totalSpent: number): CustomerTier` from `apps/api/src/customers/customer-classification.ts` (already exists, exports `CustomerTier = 'new' | 'regular' | 'vip'`).
- Produces: `UsersService.getStats(userId: string): Promise<{ totalBookings: number; totalSpent: number; tier: CustomerTier }>`; `GET /users/me/stats` (guarded, role `customer` only).

- [ ] **Step 1: Write the failing tests**

Add to `apps/api/src/users/users.service.spec.ts`. First, update `buildTestingModule` to also provide a mock `Booking` repository — replace the whole helper with:

```ts
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { UsersService } from './users.service';
import { User, UserRole, UserStatus } from './entities/user.entity';
import { Booking } from '../bookings/entities/booking.entity';
import { NotificationsService } from '../notifications/notifications.service';

const mockRepository = () => ({
  create: jest.fn(),
  save: jest.fn(),
  findOne: jest.fn(),
  find: jest.fn(),
});

function buildMockRawQueryBuilder(result: Record<string, string> | null) {
  const qb: Record<string, jest.Mock> = {};
  qb.leftJoin = jest.fn().mockReturnValue(qb);
  qb.select = jest.fn().mockReturnValue(qb);
  qb.addSelect = jest.fn().mockReturnValue(qb);
  qb.where = jest.fn().mockReturnValue(qb);
  qb.getRawOne = jest.fn().mockResolvedValue(result);
  return qb;
}

const mockBookingsRepository = () => ({
  createQueryBuilder: jest.fn(),
});

const mockNotificationsService = () => ({
  notifyOwnerApproved: jest.fn().mockResolvedValue(undefined),
  notifyOwnerRejected: jest.fn().mockResolvedValue(undefined),
});

async function buildTestingModule() {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      UsersService,
      { provide: getRepositoryToken(User), useFactory: mockRepository },
      {
        provide: getRepositoryToken(Booking),
        useFactory: mockBookingsRepository,
      },
      { provide: NotificationsService, useFactory: mockNotificationsService },
    ],
  }).compile();

  return {
    service: module.get(UsersService),
    repo: module.get(getRepositoryToken(User)),
    bookingsRepo: module.get(getRepositoryToken(Booking)),
    notificationsService: module.get(NotificationsService),
  };
}
```

Then add a new `describe` block at the end of the file:

```ts
describe('UsersService.getStats', () => {
  it('returns zeroed stats and tier "new" when the customer has no bookings', async () => {
    const { service, bookingsRepo } = await buildTestingModule();
    bookingsRepo.createQueryBuilder.mockReturnValue(
      buildMockRawQueryBuilder({ totalBookings: '0', totalSpent: '0' }),
    );

    const result = await service.getStats('user-1');

    expect(result).toEqual({ totalBookings: 0, totalSpent: 0, tier: 'new' });
  });

  it('classifies as vip once total spent crosses the VIP threshold', async () => {
    const { service, bookingsRepo } = await buildTestingModule();
    bookingsRepo.createQueryBuilder.mockReturnValue(
      buildMockRawQueryBuilder({
        totalBookings: '12',
        totalSpent: '6000000',
      }),
    );

    const result = await service.getStats('user-1');

    expect(result).toEqual({
      totalBookings: 12,
      totalSpent: 6000000,
      tier: 'vip',
    });
  });

  it('treats a missing raw row as zero (customer never queried before)', async () => {
    const { service, bookingsRepo } = await buildTestingModule();
    bookingsRepo.createQueryBuilder.mockReturnValue(
      buildMockRawQueryBuilder(null),
    );

    const result = await service.getStats('user-1');

    expect(result).toEqual({ totalBookings: 0, totalSpent: 0, tier: 'new' });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/api && npx jest src/users/users.service.spec.ts -t "getStats"`
Expected: FAIL — `service.getStats is not a function`.

- [ ] **Step 3: Wire `Booking` into `UsersModule`**

`apps/api/src/users/users.module.ts` becomes:

```ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { Booking } from '../bookings/entities/booking.entity';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [TypeOrmModule.forFeature([User, Booking]), NotificationsModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
```

- [ ] **Step 4: Implement `getStats` in `UsersService`**

In `apps/api/src/users/users.service.ts`, add these imports at the top (alongside the existing ones):

```ts
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Booking } from '../bookings/entities/booking.entity';
import {
  CustomerTier,
  classifyTier,
} from '../customers/customer-classification';
```

(`InjectRepository`/`In`/`Repository` are already imported — only add `Booking` and the classification import if not already present.)

Update the constructor:

```ts
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(Booking)
    private readonly bookingsRepository: Repository<Booking>,
    private readonly notificationsService: NotificationsService,
  ) {}
```

Add the method (anywhere after `updateProfile`):

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
    return {
      totalBookings,
      totalSpent,
      tier: classifyTier(totalBookings, totalSpent),
    };
  }
```

- [ ] **Step 5: Add the controller endpoint**

`apps/api/src/users/users.controller.ts` becomes:

```ts
import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from './entities/user.entity';
import { UsersService } from './users.service';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.findById(user.userId);
  }

  @Patch('me')
  updateMe(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.usersService.updateProfile(user.userId, dto);
  }

  @Get('me/stats')
  @UseGuards(RolesGuard)
  @Roles(UserRole.CUSTOMER)
  stats(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.getStats(user.userId);
  }
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd apps/api && npx jest src/users/users.service.spec.ts`
Expected: PASS (all tests in the file, including the pre-existing `create`/`updateProfile` ones).

- [ ] **Step 7: Run the full API test suite to catch any collateral breakage**

Run: `cd apps/api && npx jest`
Expected: PASS — in particular, no other spec file constructs `UsersService`'s testing module without the new `Booking` repository provider (only `users.service.spec.ts` does; other specs that mock `UsersService` itself, e.g. `bookings.service.spec.ts`, are unaffected).

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/users/users.module.ts apps/api/src/users/users.service.ts apps/api/src/users/users.controller.ts apps/api/src/users/users.service.spec.ts
git commit -m "feat(api): add GET /users/me/stats (platform-wide booking count/spend/tier)"
```

---

## Task 3: Backend — BFF proxy route for `/users/me/stats`

**Files:**
- Create: `apps/web/src/app/api/users/me/stats/route.ts`

**Interfaces:**
- Consumes: `fetchApi(path: string): Promise<Response>` and `clearAuthCookies(): Promise<void>` and `toNextResponse(res: Response): Response` — all already used identically in `apps/web/src/app/api/users/me/route.ts`.
- Produces: `GET /api/users/me/stats` (Next.js route handler) proxying to the NestJS `GET /users/me/stats` from Task 2.

- [ ] **Step 1: Create the route handler**

```ts
import { fetchApi } from '@/lib/fetch-api';
import { clearAuthCookies } from '@/lib/auth-cookies';
import { toNextResponse } from '@/lib/proxy-response';

export async function GET() {
  const upstream = await fetchApi('/users/me/stats');
  if (upstream.status === 401) {
    await clearAuthCookies();
  }
  return toNextResponse(upstream);
}
```

- [ ] **Step 2: Manually verify the proxy**

With the API dev server and web dev server running (`cd apps/api && npm run start:dev`, `cd apps/web && npm run dev`), log in as a customer in the browser and open `http://localhost:3000/api/users/me/stats` directly.
Expected: JSON body `{"totalBookings":...,"totalSpent":...,"tier":"..."}`, HTTP 200.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/api/users/me/stats/route.ts
git commit -m "feat(web): proxy GET /api/users/me/stats to the API"
```

---

## Task 4: Frontend — rename `/me` → `/tai-khoan/ho-so`, `/me/bookings` → `/tai-khoan/lich-su`

**Files:**
- Move: `apps/web/src/app/me/page.tsx` → `apps/web/src/app/tai-khoan/ho-so/page.tsx`
- Move: `apps/web/src/app/me/bookings/page.tsx` → `apps/web/src/app/tai-khoan/lich-su/page.tsx`
- Modify: `apps/web/src/lib/route-protection.ts`
- Modify: `apps/web/src/lib/route-protection.test.ts`
- Modify: `apps/web/src/proxy.ts`
- Modify: `apps/web/src/app/login/page.tsx`
- Modify: `apps/web/src/components/public-header.tsx`

**Interfaces:**
- Produces: `resolveRedirect` now treats `/tai-khoan/*` as the customer-protected prefix and redirects unauthenticated customers to `/login?returnTo=%2Ftai-khoan%2Fho-so` (etc). Pages live at `/tai-khoan/ho-so` and `/tai-khoan/lich-su`.

- [ ] **Step 1: Update the failing test expectations first**

Replace the full contents of `apps/web/src/lib/route-protection.test.ts` with:

```ts
import { describe, it, expect } from 'vitest';
import { resolveRedirect } from './route-protection';

function makeToken(role: string): string {
  const payload = { sub: 'user-1', role, iat: 1, exp: 9999999999 };
  const base64 = Buffer.from(JSON.stringify(payload))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `header.${base64}.signature`;
}

describe('resolveRedirect', () => {
  it('lets an unprotected route through with no token', () => {
    expect(resolveRedirect('/login', undefined)).toBeNull();
  });

  it('redirects to /login when a protected route has no token', () => {
    expect(resolveRedirect('/tai-khoan/ho-so', undefined)).toBe(
      '/login?returnTo=%2Ftai-khoan%2Fho-so',
    );
  });

  it('lets a matching role through', () => {
    expect(resolveRedirect('/admin/approvals', makeToken('admin'))).toBeNull();
  });

  it('redirects a mismatched role to their own home', () => {
    expect(resolveRedirect('/admin/approvals', makeToken('customer'))).toBe(
      '/tai-khoan/ho-so',
    );
  });

  it('redirects an owner to /owner/dashboard when they hit a mismatched protected route', () => {
    expect(resolveRedirect('/admin/approvals', makeToken('owner'))).toBe('/owner/dashboard');
  });

  it('redirects to /login when the token cannot be decoded', () => {
    expect(resolveRedirect('/tai-khoan/ho-so', 'not-a-jwt')).toBe(
      '/login?returnTo=%2Ftai-khoan%2Fho-so',
    );
  });

  it('lets a staff account (manager/cashier/staff) through on /owner/*', () => {
    expect(resolveRedirect('/owner/dashboard', makeToken('staff'))).toBeNull();
    expect(resolveRedirect('/owner/accounts', makeToken('staff'))).toBeNull();
  });

  it('redirects a staff account to /owner/dashboard when they hit a mismatched protected route', () => {
    expect(resolveRedirect('/admin/approvals', makeToken('staff'))).toBe('/owner/dashboard');
    expect(resolveRedirect('/tai-khoan/ho-so', makeToken('staff'))).toBe(
      '/owner/dashboard',
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/web && npx vitest run src/lib/route-protection.test.ts`
Expected: FAIL — actual values still `/me`/`/login?returnTo=%2Fme`.

- [ ] **Step 3: Update `route-protection.ts`**

Replace lines 5-18 of `apps/web/src/lib/route-protection.ts` with:

```ts
const ROLE_HOME: Record<Role, string> = {
  customer: '/tai-khoan/ho-so',
  // Staff accounts (manager/cashier/staff) operate inside the same /owner/*
  // section as the owner — there's no separate /staff section.
  staff: '/owner/dashboard',
  owner: '/owner/dashboard',
  admin: '/admin/approvals',
};

const PROTECTED_PREFIXES: { prefix: string; roles: Role[] }[] = [
  { prefix: '/tai-khoan', roles: ['customer'] },
  { prefix: '/owner', roles: ['owner', 'staff'] },
  { prefix: '/admin', roles: ['admin'] },
];
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/web && npx vitest run src/lib/route-protection.test.ts`
Expected: PASS.

- [ ] **Step 5: Update `proxy.ts` matcher**

In `apps/web/src/proxy.ts:16`, change:

```ts
  matcher: ['/tai-khoan/:path*', '/owner/:path*', '/admin/:path*'],
```

- [ ] **Step 6: Update `login/page.tsx`**

In `apps/web/src/app/login/page.tsx:16-23`, change:

```ts
const ROLE_HOME: Record<string, string> = {
  customer: "/tai-khoan/ho-so",
  // Staff accounts (manager/cashier/staff) share the owner's /owner/*
  // section — there's no separate staff area.
  staff: "/owner/dashboard",
  owner: "/owner/dashboard",
  admin: "/admin/approvals",
};
```

- [ ] **Step 7: Move and update the profile page**

Create `apps/web/src/app/tai-khoan/ho-so/page.tsx` with the exact current contents of `apps/web/src/app/me/page.tsx`, except:
- Line 35: `router.push("/login?returnTo=%2Fme");` → `router.push("/login?returnTo=%2Ftai-khoan%2Fho-so");`
- Line 134-139: `<Link href="/me/bookings" ...>` → `<Link href="/tai-khoan/lich-su" ...>`

Then delete the old file: `rm apps/web/src/app/me/page.tsx` (and the now-empty `apps/web/src/app/me/` directory if `me/bookings` is also gone after the next step).

- [ ] **Step 8: Move and update the booking-history page**

Create `apps/web/src/app/tai-khoan/lich-su/page.tsx` with the exact current contents of `apps/web/src/app/me/bookings/page.tsx`, except:
- Line 47: `router.push("/login?returnTo=%2Fme%2Fbookings");` → `router.push("/login?returnTo=%2Ftai-khoan%2Flich-su");`

Then delete the old file and directory: `rm -rf apps/web/src/app/me`.

- [ ] **Step 9: Update the header dropdown**

In `apps/web/src/components/public-header.tsx`, change the import line to add `History`:

```ts
import { BookOpen, History, LandPlot, LogIn, LogOut, Map, Search, User } from "lucide-react";
```

Replace lines 96-104 (the single `DropdownMenuItem` for bookings) with two items:

```tsx
                <DropdownMenuItem
                  render={
                    <Link href="/tai-khoan/ho-so">
                      <User className="size-4" />
                      Hồ sơ
                    </Link>
                  }
                />
                <DropdownMenuItem
                  render={
                    <Link href="/tai-khoan/lich-su">
                      <History className="size-4" />
                      Lịch sử đặt sân
                    </Link>
                  }
                />
```

- [ ] **Step 10: Run the frontend test suite**

Run: `cd apps/web && npx vitest run`
Expected: PASS — no test references the old `/me` paths anymore (only `route-protection.test.ts` did, already updated in Step 1).

- [ ] **Step 11: Manually verify in the browser**

With both dev servers running, log in as a customer. Open the account dropdown in the header.
Expected: three items in order — "Hồ sơ" (→ `/tai-khoan/ho-so`), "Lịch sử đặt sân" (→ `/tai-khoan/lich-su`), divider, "Đăng xuất". Then, in a private/incognito window (no session), navigate directly to `/tai-khoan/ho-so`.
Expected: redirected to `/login?returnTo=%2Ftai-khoan%2Fho-so`.

- [ ] **Step 12: Commit**

```bash
git add apps/web/src/app/tai-khoan apps/web/src/lib/route-protection.ts apps/web/src/lib/route-protection.test.ts apps/web/src/proxy.ts apps/web/src/app/login/page.tsx apps/web/src/components/public-header.tsx
git rm -r apps/web/src/app/me
git commit -m "refactor(web): rename /me -> /tai-khoan/ho-so, /me/bookings -> /tai-khoan/lich-su"
```

---

## Task 5: Frontend — profile page: address field + stats cards

**Files:**
- Modify: `apps/web/src/lib/schemas.ts`
- Modify: `apps/web/src/lib/schemas.test.ts`
- Modify: `apps/web/src/app/tai-khoan/ho-so/page.tsx`

**Interfaces:**
- Consumes: `GET /api/users/me/stats` from Task 3, returning `{ totalBookings: number; totalSpent: number; tier: 'new' | 'regular' | 'vip' }`.
- Produces: `updateProfileSchema` now accepts an optional `address` field.

- [ ] **Step 1: Write the failing schema test**

Add to `apps/web/src/lib/schemas.test.ts`, inside the existing `describe('updateProfileSchema', ...)` block:

```ts
  it('keeps the address field in the parsed output', () => {
    const result = updateProfileSchema.parse({ address: '123 Lê Lợi, Q1' });
    expect(result.address).toBe('123 Lê Lợi, Q1');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run src/lib/schemas.test.ts -t "keeps the address field"`
Expected: FAIL — `result.address` is `undefined` (zod strips the unrecognized `address` key from the parsed output since the current schema shape doesn't declare it).

- [ ] **Step 3: Add `address` to the schema**

In `apps/web/src/lib/schemas.ts:28-37`, change:

```ts
export const updateProfileSchema = z.object({
  fullName: z.string().min(1, 'Vui lòng nhập họ tên').optional(),
  phone: z.string().optional(),
  avatarUrl: z
    .string()
    .url('URL không hợp lệ')
    .optional()
    .or(z.literal('')),
  address: z.string().optional(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run src/lib/schemas.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the address field and stats cards to the page**

Replace the full contents of `apps/web/src/app/tai-khoan/ho-so/page.tsx` (as produced in Task 4 Step 7) with:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { updateProfileSchema, type UpdateProfileInput } from "@/lib/schemas";
import { getSubmitErrorMessage } from "@/lib/error-message";

interface Profile {
  email: string;
  fullName: string;
  phone: string | null;
  avatarUrl: string | null;
  address: string | null;
}

type Tier = "new" | "regular" | "vip";

interface Stats {
  totalBookings: number;
  totalSpent: number;
  tier: Tier;
}

const TIER_LABELS: Record<Tier, string> = {
  new: "Mới",
  regular: "Thường xuyên",
  vip: "VIP",
};

export default function ProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const form = useForm<UpdateProfileInput>({
    resolver: zodResolver(updateProfileSchema),
    defaultValues: { fullName: "", phone: "", avatarUrl: "", address: "" },
  });

  useEffect(() => {
    fetch("/api/users/me")
      .then(async (res) => {
        if (res.status === 401) {
          router.push("/login?returnTo=%2Ftai-khoan%2Fho-so");
          return null;
        }
        return (await res.json()) as Profile;
      })
      .then((data) => {
        if (!data) return;
        setProfile(data);
        form.reset({
          fullName: data.fullName,
          phone: data.phone ?? "",
          avatarUrl: data.avatarUrl ?? "",
          address: data.address ?? "",
        });
      });
  }, [form, router]);

  useEffect(() => {
    fetch("/api/users/me/stats")
      .then((res) => (res.ok ? (res.json() as Promise<Stats>) : null))
      .then((data) => setStats(data));
  }, []);

  async function onSubmit(values: UpdateProfileInput) {
    const payload = {
      fullName: values.fullName,
      phone: values.phone,
      avatarUrl: values.avatarUrl === "" ? undefined : values.avatarUrl,
      address: values.address,
    };
    const response = await fetch("/api/users/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => null);

    if (!response.ok) {
      toast.error(getSubmitErrorMessage(response, data));
      return;
    }

    toast.success("Đã lưu thay đổi");
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  if (!profile) {
    return (
      <main className="flex flex-1 items-center justify-center p-8">
        <p>Đang tải...</p>
      </main>
    );
  }

  const { errors } = form.formState;

  return (
    <main className="flex flex-1 items-center justify-center p-8">
      <div className="w-full max-w-sm space-y-4">
        <div className="grid grid-cols-3 gap-2">
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold">
                {stats ? stats.totalBookings : "—"}
              </p>
              <p className="text-xs text-muted-foreground">Lần đặt sân</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold">
                {stats ? TIER_LABELS[stats.tier] : "—"}
              </p>
              <p className="text-xs text-muted-foreground">Hạng thành viên</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold">
                {stats ? `${stats.totalSpent.toLocaleString("vi-VN")}đ` : "—"}
              </p>
              <p className="text-xs text-muted-foreground">Tổng chi tiêu</p>
            </CardContent>
          </Card>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Hồ sơ của tôi</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-4 text-sm text-muted-foreground">{profile.email}</p>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="fullName">Họ tên</Label>
                <Input
                  id="fullName"
                  aria-invalid={!!errors.fullName}
                  {...form.register("fullName")}
                />
                {errors.fullName && (
                  <p className="text-sm text-destructive">
                    {errors.fullName.message}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Số điện thoại</Label>
                <Input id="phone" {...form.register("phone")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="address">Địa chỉ</Label>
                <Input id="address" {...form.register("address")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="avatarUrl">Ảnh đại diện (URL)</Label>
                <Input
                  id="avatarUrl"
                  aria-invalid={!!errors.avatarUrl}
                  {...form.register("avatarUrl")}
                />
                {errors.avatarUrl && (
                  <p className="text-sm text-destructive">
                    {errors.avatarUrl.message}
                  </p>
                )}
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={form.formState.isSubmitting}
              >
                Lưu thay đổi
              </Button>
            </form>
            <Link
              href="/tai-khoan/lich-su"
              className={`${buttonVariants({ variant: "outline" })} mt-4 w-full`}
            >
              Booking của tôi
            </Link>
            <Button variant="outline" className="mt-2 w-full" onClick={handleLogout}>
              Đăng xuất
            </Button>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
```

- [ ] **Step 6: Run the frontend test suite**

Run: `cd apps/web && npx vitest run`
Expected: PASS.

- [ ] **Step 7: Manually verify in the browser**

With both dev servers running, log in as a customer and open `/tai-khoan/ho-so`.
Expected: 3 stat cards render (showing `—` briefly then real numbers), the Địa chỉ field is present and editable, saving with a new address shows the "Đã lưu thay đổi" toast and the value persists on reload.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/lib/schemas.ts apps/web/src/lib/schemas.test.ts apps/web/src/app/tai-khoan/ho-so/page.tsx
git commit -m "feat(web): add address field + profile stats cards to /tai-khoan/ho-so"
```

---

## Task 6: Frontend — booking-history empty state copy + CTA

**Files:**
- Modify: `apps/web/src/app/tai-khoan/lich-su/page.tsx`

**Interfaces:**
- None (leaf UI change).

- [ ] **Step 1: Update the empty state**

In `apps/web/src/app/tai-khoan/lich-su/page.tsx` (as produced in Task 4 Step 8), replace:

```tsx
      {bookings.length === 0 && (
        <p className="text-muted-foreground">Bạn chưa có booking nào.</p>
      )}
```

with:

```tsx
      {bookings.length === 0 && (
        <div className="flex flex-col items-start gap-3">
          <p className="text-muted-foreground">Bạn chưa có lượt đặt sân nào.</p>
          <Link href="/venues" className={buttonVariants({ variant: "outline" })}>
            Tìm sân ngay
          </Link>
        </div>
      )}
```

Add the two needed imports at the top of the file (alongside the existing ones):

```ts
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
```

(the file already imports `Button` from `@/components/ui/button` — just add `buttonVariants` to that existing import instead of duplicating the line, and add the new `Link` import.)

- [ ] **Step 2: Manually verify in the browser**

Log in as a customer with zero bookings (or a fresh test account) and open `/tai-khoan/lich-su`.
Expected: "Bạn chưa có lượt đặt sân nào." followed by a "Tìm sân ngay" button that navigates to `/venues`.

- [ ] **Step 3: Run the frontend test suite one more time**

Run: `cd apps/web && npx vitest run`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/tai-khoan/lich-su/page.tsx
git commit -m "feat(web): update empty-state copy and add CTA on /tai-khoan/lich-su"
```
