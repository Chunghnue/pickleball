# Staff Accounts Module — Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an owner create staff accounts (Quản lý/Thu ngân/Nhân viên) that log in with reduced permissions scoped to that owner's data, per [2026-08-26-staff-accounts-design.md](../specs/2026-08-26-staff-accounts-design.md).

**Architecture:** Extend the existing `users` table with `owner_id`/`staff_role` instead of a new table. Add a new `OwnerScopeGuard` (2-tier: `full`/`operational`) that resolves an `effectiveOwnerId` per request and replaces `@Roles(UserRole.OWNER)` on every owner-facing controller. Add a new `staff` module (`/staff` CRUD) reusing the `User` entity directly. Login accepts email **or** phone as `identifier`.

**Tech Stack:** NestJS 11, TypeORM 1.1 (raw-SQL migrations), class-validator, bcrypt, Jest + Supertest (unit specs mocked-repo style, e2e specs against a real `pickleball_test` Postgres DB).

## Global Constraints

- `staffRole` ∈ `manager` | `cashier` | `staff` (spec §6). Password min length 6 for staff (spec §6, deliberately weaker than the 8-char customer/owner self-serve rule).
- `phone` required when creating staff, unique **system-wide** (spec §6) — includes existing customer/owner rows.
- `email` optional for staff, unique if present.
- Staff accounts skip email verification: created directly with `status = 'active'` (spec §1).
- `:id` in `PATCH /staff/:id`, `POST /staff/:id/deactivate`, `POST /staff/:id/reset-password` must belong to the calling `effectiveOwnerId` (404 otherwise) — cross-owner access must never leak a 403 (spec §6, same pattern as `getOwnedVenueOrThrow`).
- No audit log, no multi-owner staff, no self-service staff password change (reuses existing `/users/me`), no OTP — all explicitly out of scope (spec §8).
- The spec's §4 guard-rollout table also lists Revenue Reports, Page View Analytics, Chat Inbox, and Settings — none of those modules exist in `apps/api/src` yet (only Courts/Venues, Bookings, Payments, Customers, Customer Contacts, Pricing, Recurring Schedules, Dashboard do). This plan only rolls out `OwnerScopeGuard` to modules that currently exist (Tasks 7–14). Whichever plan builds those four modules later should use `@OwnerScope(...)` from the start instead of `@Roles(UserRole.OWNER)`.
- Every task must leave `npm test` and `npm run test:e2e` green before moving to the next task.

---

## File Structure

**New files:**
- `apps/api/src/migrations/1787930000000-AddStaffSupportToUsers.ts` — schema migration
- `apps/api/src/auth/decorators/owner-scope.decorator.ts` — `@OwnerScope('full' | 'operational')`
- `apps/api/src/auth/decorators/effective-owner-id.decorator.ts` — `@EffectiveOwnerId()` param decorator
- `apps/api/src/auth/guards/owner-scope.guard.ts` — `OwnerScopeGuard`
- `apps/api/src/auth/guards/owner-scope.guard.spec.ts`
- `apps/api/src/staff/staff.module.ts`
- `apps/api/src/staff/staff.controller.ts`
- `apps/api/src/staff/staff.service.ts`
- `apps/api/src/staff/staff.service.spec.ts`
- `apps/api/src/staff/dto/create-staff.dto.ts`
- `apps/api/src/staff/dto/update-staff.dto.ts`
- `apps/api/src/staff/dto/reset-staff-password.dto.ts`
- `apps/api/src/staff/dto/list-staff.dto.ts`
- `apps/api/test/staff.e2e-spec.ts`

**Modified files:**
- `apps/api/src/users/entities/user.entity.ts` — `UserRole.STAFF`, new `StaffRole` enum, `ownerId`/`staffRole` columns, `email` nullable
- `apps/api/src/users/users.service.ts` — `findByPhone`
- `apps/api/src/auth/dto/login.dto.ts` — `email` → `identifier`
- `apps/api/src/auth/auth.service.ts` — login-by-identifier, JWT payload carries `ownerId`/`staffRole`
- `apps/api/src/auth/strategies/jwt.strategy.ts` — `JwtPayload`/`validate()` carry `ownerId`/`staffRole`
- `apps/api/src/auth/decorators/current-user.decorator.ts` — `AuthenticatedUser` carries `ownerId`/`staffRole`
- `apps/api/src/app.module.ts` — register `StaffModule`
- `apps/api/test/utils/owner-fixtures.ts` — `loginAs` sends `identifier`; new `createStaff`/`loginByPhone` helpers
- 20 existing `test/*.e2e-spec.ts` files — `.send({ email, ... })` → `.send({ identifier: ..., ... })` for `/auth/login` calls only (listed exactly in Task 3)
- `apps/api/src/courts/venues.controller.ts`, `apps/api/src/courts/courts.controller.ts`, `apps/api/src/pricing/pricing.controller.ts`, `apps/api/src/recurring-schedules/recurring-schedules.controller.ts`, `apps/api/src/bookings/bookings.controller.ts`, `apps/api/src/payments/payments.controller.ts`, `apps/api/src/customers/customers.controller.ts`, `apps/api/src/customer-contacts/customer-contacts.controller.ts`, `apps/api/src/dashboard/dashboard.controller.ts` — swap `@Roles(UserRole.OWNER)` → `@OwnerScope(...)`, `user.userId` → `effectiveOwnerId`

---

### Task 1: Migration + entity — `users` gains staff support

**Files:**
- Create: `apps/api/src/migrations/1787930000000-AddStaffSupportToUsers.ts`
- Modify: `apps/api/src/users/entities/user.entity.ts`
- Test: `apps/api/src/users/users.service.spec.ts` (existing — must still pass unchanged)

**Interfaces:**
- Produces: `UserRole.STAFF`, `StaffRole` enum (`MANAGER`, `CASHIER`, `STAFF`), `User.ownerId: string | null`, `User.staffRole: StaffRole | null`, `User.email: string | null`.

- [ ] **Step 1: Write the migration**

```ts
import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddStaffSupportToUsers1787930000000
  implements MigrationInterface
{
  name = 'AddStaffSupportToUsers1787930000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."users_role_enum" ADD VALUE IF NOT EXISTS 'staff'`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."users_staff_role_enum" AS ENUM('manager', 'cashier', 'staff')`,
    );
    await queryRunner.query(`ALTER TABLE "users" ADD "owner_id" uuid`);
    await queryRunner.query(
      `ALTER TABLE "users" ADD CONSTRAINT "FK_users_owner_id" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD "staff_role" "public"."users_staff_role_enum"`,
    );

    await queryRunner.query(
      `ALTER TABLE "users" DROP CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "users_email_unique_idx" ON "users" ("email") WHERE "email" IS NOT NULL`,
    );

    // Existing phone values were never enforced unique — dedupe before adding
    // the partial unique index (keep the earliest row per phone, null the rest).
    await queryRunner.query(`
      UPDATE "users" u SET "phone" = NULL
      WHERE u."phone" IS NOT NULL AND u."id" NOT IN (
        SELECT DISTINCT ON ("phone") "id" FROM "users"
        WHERE "phone" IS NOT NULL
        ORDER BY "phone", "created_at" ASC
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "users_phone_unique_idx" ON "users" ("phone") WHERE "phone" IS NOT NULL`,
    );

    await queryRunner.query(
      `ALTER TABLE "users" ADD CONSTRAINT "CHK_users_identifier_present" CHECK ("email" IS NOT NULL OR "phone" IS NOT NULL)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" DROP CONSTRAINT "CHK_users_identifier_present"`,
    );
    await queryRunner.query(`DROP INDEX "public"."users_phone_unique_idx"`);
    await queryRunner.query(`DROP INDEX "public"."users_email_unique_idx"`);
    // Rows with NULL email fail this NOT NULL restore — expected/safe on rollback.
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "email" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email")`,
    );
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "staff_role"`);
    await queryRunner.query(
      `ALTER TABLE "users" DROP CONSTRAINT "FK_users_owner_id"`,
    );
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "owner_id"`);
    await queryRunner.query(`DROP TYPE "public"."users_staff_role_enum"`);
    // Postgres can't drop a single enum value — recreate users_role_enum without it.
    // Rows still set to 'staff' will fail this cast, which is the expected/safe
    // behavior for a destructive rollback (same pattern as
    // AddPausedStatusToRecurringSchedules1787920000000).
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "role" TYPE text`,
    );
    await queryRunner.query(`DROP TYPE "public"."users_role_enum"`);
    await queryRunner.query(
      `CREATE TYPE "public"."users_role_enum" AS ENUM('customer', 'owner', 'admin')`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "role" TYPE "public"."users_role_enum" USING "role"::"public"."users_role_enum"`,
    );
  }
}
```

- [ ] **Step 2: Update the entity**

Edit `apps/api/src/users/entities/user.entity.ts`:

```ts
export enum UserRole {
  CUSTOMER = 'customer',
  OWNER = 'owner',
  ADMIN = 'admin',
  STAFF = 'staff',
}

export enum StaffRole {
  MANAGER = 'manager',
  CASHIER = 'cashier',
  STAFF = 'staff',
}
```

Change the `email` column:

```ts
  @Column({ nullable: true, type: 'varchar' })
  email: string | null;
```

Add after the `phone` column:

```ts
  @Column({ name: 'owner_id', nullable: true, type: 'uuid' })
  ownerId: string | null;

  @Column({
    name: 'staff_role',
    type: 'enum',
    enum: StaffRole,
    nullable: true,
  })
  staffRole: StaffRole | null;
```

`email: string` is used as non-null in several places (`UsersService.create`, `AuthService`, `NotificationsService` callers) — those all still pass a real email for `customer`/`owner`/`admin` accounts, so no other file needs to change in this task. TypeScript will only start complaining where `user.email` is read as if guaranteed non-null; there are no such reads today (verified: no `.toUpperCase()`/string-only usage of `user.email` outside passing it straight to `sendMail`, which already accepts `string`). If `tsc`/`nest build` surfaces a type error in Step 4, fix it inline in this task rather than deferring.

- [ ] **Step 3: Run the migration against the dev and test databases**

Run: `cd apps/api && npm run migration:run`
Expected: `AddStaffSupportToUsers1787930000000` listed as applied, no errors.

Run: `cd apps/api && NODE_ENV=test npm run migration:run`
Expected: same, applied against `pickleball_test`.

(If `NODE_ENV=test` isn't picked up by the `typeorm` CLI script on this shell, run `npx dotenv -e .env.test -- npm run migration:run` instead — check `apps/api/src/config/data-source.ts` for how it loads env if this fails.)

- [ ] **Step 4: Verify existing tests still pass**

Run: `cd apps/api && npm run build && npm test`
Expected: PASS, no TypeScript errors from the entity change.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/migrations/1787930000000-AddStaffSupportToUsers.ts apps/api/src/users/entities/user.entity.ts
git commit -m "feat(api): add staff role, owner_id, nullable email to users"
```

---

### Task 2: Login by identifier (email or phone) + JWT carries owner scope

**Files:**
- Modify: `apps/api/src/auth/dto/login.dto.ts`
- Modify: `apps/api/src/auth/auth.service.ts`
- Modify: `apps/api/src/auth/strategies/jwt.strategy.ts`
- Modify: `apps/api/src/auth/decorators/current-user.decorator.ts`
- Modify: `apps/api/src/users/users.service.ts`
- Test: `apps/api/test/auth-login.e2e-spec.ts` (extend)

**Interfaces:**
- Consumes: `User.ownerId`, `User.staffRole` from Task 1.
- Produces: `AuthenticatedUser { userId, role, ownerId, staffRole }`, `UsersService.findByPhone(phone: string): Promise<User | null>`. Every later task's `@CurrentUser()`/`@EffectiveOwnerId()` usage relies on this shape.

- [ ] **Step 1: Write the failing e2e test**

Add to `apps/api/test/auth-login.e2e-spec.ts` (after the existing tests, matching its existing `beforeAll`/`beforeEach` setup):

```ts
  it('logs in with phone as the identifier', async () => {
    await registerAndVerifyCustomer('phone-login@test.com', 'password123');
    await dataSource
      .getRepository(User)
      .update({ email: 'phone-login@test.com' }, { phone: '0911222333' });

    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ identifier: '0911222333', password: 'password123' })
      .expect(201);

    expect(response.body.accessToken).toBeDefined();
  });
```

This needs `User` and `dataSource` in scope — check the top of the file: if `DataSource`/`User` aren't already imported, add:
```ts
import { DataSource } from 'typeorm';
import { User } from '../src/users/entities/user.entity';
```
and make sure `dataSource = app.get(DataSource);` exists in `beforeAll` (follow the same pattern as `test/payments.e2e-spec.ts:16`).

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/api && npm run test:e2e -- auth-login`
Expected: FAIL — existing `LoginDto` has no `identifier` field, request is rejected 400 (`whitelist`/`forbidNonWhitelisted`), or falls back to undefined email lookup.

- [ ] **Step 3: Update `LoginDto`**

Replace the full contents of `apps/api/src/auth/dto/login.dto.ts`:

```ts
import { IsString } from 'class-validator';

export class LoginDto {
  @IsString()
  identifier: string;

  @IsString()
  password: string;
}
```

- [ ] **Step 4: Add `UsersService.findByPhone`**

In `apps/api/src/users/users.service.ts`, add next to `findByEmail`:

```ts
  findByPhone(phone: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { phone } });
  }
```

- [ ] **Step 5: Update `JwtPayload`/`AuthenticatedUser`/`jwt.strategy.ts`**

`apps/api/src/auth/strategies/jwt.strategy.ts` — replace the file:

```ts
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { StaffRole, UserRole } from '../../users/entities/user.entity';

export interface JwtPayload {
  sub: string;
  role: UserRole;
  ownerId: string | null;
  staffRole: StaffRole | null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>(
        'JWT_ACCESS_SECRET',
        'change-me-access-secret',
      ),
    });
  }

  validate(payload: JwtPayload): {
    userId: string;
    role: UserRole;
    ownerId: string | null;
    staffRole: StaffRole | null;
  } {
    return {
      userId: payload.sub,
      role: payload.role,
      ownerId: payload.ownerId,
      staffRole: payload.staffRole,
    };
  }
}
```

`apps/api/src/auth/decorators/current-user.decorator.ts` — replace the file:

```ts
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { StaffRole, UserRole } from '../../users/entities/user.entity';

export interface AuthenticatedUser {
  userId: string;
  role: UserRole;
  ownerId: string | null;
  staffRole: StaffRole | null;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx.switchToHttp().getRequest();
    return request.user as AuthenticatedUser;
  },
);
```

- [ ] **Step 6: Update `AuthService.login`/`refreshTokens` to sign the new claims and resolve by identifier**

In `apps/api/src/auth/auth.service.ts`, replace the `login` method:

```ts
  async login(
    dto: LoginDto,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const user =
      (await this.usersService.findByEmail(dto.identifier)) ??
      (await this.usersService.findByPhone(dto.identifier));
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Thông tin đăng nhập không đúng');
    }

    this.assertActive(user.status);

    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      role: user.role,
      ownerId: user.ownerId,
      staffRole: user.staffRole,
    });
    const refreshToken = await this.issueRefreshToken(user.id);

    return { accessToken, refreshToken };
  }
```

And in `refreshTokens`, replace the token-signing block:

```ts
    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      role: user.role,
      ownerId: user.ownerId,
      staffRole: user.staffRole,
    });
```

(Leave everything else in `refreshTokens` unchanged — `user` is already loaded there via `usersService.findById`.)

- [ ] **Step 7: Run the new test**

Run: `cd apps/api && npm run test:e2e -- auth-login`
Expected: FAIL still — every other `/auth/login` call in the codebase (including this same file's earlier tests) sends `{ email, password }`, which now 400s under `forbidNonWhitelisted`. This is expected at this point; Task 3 fixes every call site. Confirm the **new** phone-login test's failure reason has changed from "no identifier field" to something else, or move straight to Task 3 if `auth-login.e2e-spec.ts`'s own other tests are what's failing.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/auth/dto/login.dto.ts apps/api/src/auth/auth.service.ts apps/api/src/auth/strategies/jwt.strategy.ts apps/api/src/auth/decorators/current-user.decorator.ts apps/api/src/users/users.service.ts apps/api/test/auth-login.e2e-spec.ts
git commit -m "feat(api): login accepts email or phone as identifier, JWT carries owner scope"
```

---

### Task 3: Fix every existing `/auth/login` call site for the `identifier` rename

**Files:** (test-only, mechanical — each bullet is one `Edit`-style exact replacement)
- Modify: `apps/api/test/utils/owner-fixtures.ts:36`
- Modify: `apps/api/test/admin-approvals.e2e-spec.ts:43,126`
- Modify: `apps/api/test/admin-owners.e2e-spec.ts:41,88,107,125`
- Modify: `apps/api/test/admin-stats.e2e-spec.ts:51`
- Modify: `apps/api/test/admin-venues.e2e-spec.ts:43,145`
- Modify: `apps/api/test/auth-login.e2e-spec.ts:38,50,57,70,89`
- Modify: `apps/api/test/auth-password-reset.e2e-spec.ts:38,54,59`
- Modify: `apps/api/test/auth-refresh-logout.e2e-spec.ts:33`
- Modify: `apps/api/test/bookings-pricing.e2e-spec.ts:52,56`
- Modify: `apps/api/test/bookings.e2e-spec.ts:47`
- Modify: `apps/api/test/courts-slots-pricing.e2e-spec.ts:42`
- Modify: `apps/api/test/dashboard.e2e-spec.ts:52`
- Modify: `apps/api/test/disputes.e2e-spec.ts:48`
- Modify: `apps/api/test/payments.e2e-spec.ts:46`
- Modify: `apps/api/test/pricing-summary.e2e-spec.ts:42`
- Modify: `apps/api/test/pricing-rules.e2e-spec.ts:42,234`
- Modify: `apps/api/test/recurring-schedules-list.e2e-spec.ts:42,115`
- Modify: `apps/api/test/recurring-schedules-renewal.e2e-spec.ts:46`
- Modify: `apps/api/test/users-profile.e2e-spec.ts:36`
- Modify: `apps/api/test/venues-mine-courts.e2e-spec.ts:42`

**Do NOT touch** any `.post('/auth/register')` or `.post('/auth/forgot-password')` call — only the `.send(...)` immediately following `.post('/auth/login')`.

- [ ] **Step 1: Apply each exact replacement**

| File | Line(s) | Old | New |
|---|---|---|---|
| `test/utils/owner-fixtures.ts` | 36 | `.send({ email, password: 'password123' });` | `.send({ identifier: email, password: 'password123' });` |
| `test/admin-approvals.e2e-spec.ts` | 43 | `.send({ email: 'admin@test.com', password: 'adminpass123' });` | `.send({ identifier: 'admin@test.com', password: 'adminpass123' });` |
| `test/admin-approvals.e2e-spec.ts` | 126 | `.send({ email: 'customer@test.com', password: 'password123' });` | `.send({ identifier: 'customer@test.com', password: 'password123' });` |
| `test/admin-owners.e2e-spec.ts` | 41 | `.send({ email: 'admin@test.com', password: 'adminpass123' });` | `.send({ identifier: 'admin@test.com', password: 'adminpass123' });` |
| `test/admin-owners.e2e-spec.ts` | 88 | `.send({ email: 'approve-me@test.com', password: 'password123' })` | `.send({ identifier: 'approve-me@test.com', password: 'password123' })` |
| `test/admin-owners.e2e-spec.ts` | 107 | `.send({ email: 'reject-me@test.com', password: 'password123' })` | `.send({ identifier: 'reject-me@test.com', password: 'password123' })` |
| `test/admin-owners.e2e-spec.ts` | 125 | `.send({ email: 'customer@test.com', password: 'password123' });` | `.send({ identifier: 'customer@test.com', password: 'password123' });` |
| `test/admin-stats.e2e-spec.ts` | 51 | `.send({ email, password: 'password123' });` | `.send({ identifier: email, password: 'password123' });` |
| `test/admin-venues.e2e-spec.ts` | 43 | `.send({ email: 'admin@test.com', password: 'adminpass123' });` | `.send({ identifier: 'admin@test.com', password: 'adminpass123' });` |
| `test/admin-venues.e2e-spec.ts` | 145 | `.send({ email: 'customer@test.com', password: 'password123' });` | `.send({ identifier: 'customer@test.com', password: 'password123' });` |
| `test/auth-login.e2e-spec.ts` | 38 | `.send({ email: 'login-me@test.com', password: 'password123' })` | `.send({ identifier: 'login-me@test.com', password: 'password123' })` |
| `test/auth-login.e2e-spec.ts` | 50 | `.send({ email: 'wrong-pass@test.com', password: 'nope-nope-nope' })` | `.send({ identifier: 'wrong-pass@test.com', password: 'nope-nope-nope' })` |
| `test/auth-login.e2e-spec.ts` | 57 | `.send({ email: 'nobody@test.com', password: 'password123' })` | `.send({ identifier: 'nobody@test.com', password: 'password123' })` |
| `test/auth-login.e2e-spec.ts` | 70 | `.send({ email: 'unverified@test.com', password: 'password123' })` | `.send({ identifier: 'unverified@test.com', password: 'password123' })` |
| `test/auth-login.e2e-spec.ts` | 89 | `.send({ email: 'pending-owner@test.com', password: 'password123' })` | `.send({ identifier: 'pending-owner@test.com', password: 'password123' })` |
| `test/auth-password-reset.e2e-spec.ts` | 38 | `.send({ email: 'reset-me@test.com', password: 'oldpassword1' });` | `.send({ identifier: 'reset-me@test.com', password: 'oldpassword1' });` |
| `test/auth-password-reset.e2e-spec.ts` | 54 | `.send({ email: 'reset-me@test.com', password: 'oldpassword1' })` | `.send({ identifier: 'reset-me@test.com', password: 'oldpassword1' })` |
| `test/auth-password-reset.e2e-spec.ts` | 59 | `.send({ email: 'reset-me@test.com', password: 'newpassword1' })` | `.send({ identifier: 'reset-me@test.com', password: 'newpassword1' })` |
| `test/auth-refresh-logout.e2e-spec.ts` | 33 | `.send({ email, password });` | `.send({ identifier: email, password });` |
| `test/bookings-pricing.e2e-spec.ts` | 52 | `.send({ email: 'owner@test.com', password: 'password123' });` | `.send({ identifier: 'owner@test.com', password: 'password123' });` |
| `test/bookings-pricing.e2e-spec.ts` | 56 | `.send({ email: 'customer@test.com', password: 'password123' });` | `.send({ identifier: 'customer@test.com', password: 'password123' });` |
| `test/bookings.e2e-spec.ts` | 47 | `.send({ email, password: 'password123' });` | `.send({ identifier: email, password: 'password123' });` |
| `test/courts-slots-pricing.e2e-spec.ts` | 42 | `.send({ email: 'owner@test.com', password: 'password123' });` | `.send({ identifier: 'owner@test.com', password: 'password123' });` |
| `test/dashboard.e2e-spec.ts` | 52 | `.send({ email, password: 'password123' });` | `.send({ identifier: email, password: 'password123' });` |
| `test/disputes.e2e-spec.ts` | 48 | `.send({ email, password: 'password123' });` | `.send({ identifier: email, password: 'password123' });` |
| `test/payments.e2e-spec.ts` | 46 | `.send({ email, password: 'password123' });` | `.send({ identifier: email, password: 'password123' });` |
| `test/pricing-summary.e2e-spec.ts` | 42 | `.send({ email: 'owner@test.com', password: 'password123' });` | `.send({ identifier: 'owner@test.com', password: 'password123' });` |
| `test/pricing-rules.e2e-spec.ts` | 42 | `.send({ email: 'owner@test.com', password: 'password123' });` | `.send({ identifier: 'owner@test.com', password: 'password123' });` |
| `test/pricing-rules.e2e-spec.ts` | 234 | `.send({ email: 'owner2@test.com', password: 'password123' });` | `.send({ identifier: 'owner2@test.com', password: 'password123' });` |
| `test/recurring-schedules-list.e2e-spec.ts` | 42 | `.send({ email: 'owner@test.com', password: 'password123' });` | `.send({ identifier: 'owner@test.com', password: 'password123' });` |
| `test/recurring-schedules-list.e2e-spec.ts` | 115 | `.send({ email: 'owner2@test.com', password: 'password123' });` | `.send({ identifier: 'owner2@test.com', password: 'password123' });` |
| `test/recurring-schedules-renewal.e2e-spec.ts` | 46 | `.send({ email: 'owner@test.com', password: 'password123' });` | `.send({ identifier: 'owner@test.com', password: 'password123' });` |
| `test/users-profile.e2e-spec.ts` | 36 | `.send({ email, password });` | `.send({ identifier: email, password });` |
| `test/venues-mine-courts.e2e-spec.ts` | 42 | `.send({ email: 'owner@test.com', password: 'password123' });` | `.send({ identifier: 'owner@test.com', password: 'password123' });` |

- [ ] **Step 2: Run the full e2e suite**

Run: `cd apps/api && npm run test:e2e`
Expected: PASS (all files).

- [ ] **Step 3: Run unit tests too**

Run: `cd apps/api && npm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/api/test
git commit -m "test(api): update e2e login calls for identifier rename"
```

---

### Task 4: `OwnerScopeGuard` + `@OwnerScope` + `@EffectiveOwnerId`

**Files:**
- Create: `apps/api/src/auth/decorators/owner-scope.decorator.ts`
- Create: `apps/api/src/auth/decorators/effective-owner-id.decorator.ts`
- Create: `apps/api/src/auth/guards/owner-scope.guard.ts`
- Test: `apps/api/src/auth/guards/owner-scope.guard.spec.ts`

**Interfaces:**
- Consumes: `AuthenticatedUser` from Task 2 (`role`, `ownerId`, `staffRole`).
- Produces: `OwnerScope(tier: 'full' | 'operational')` handler/class decorator; `OwnerScopeGuard` (sets `request.effectiveOwnerId: string`); `EffectiveOwnerId()` param decorator reading it. Tasks 5–14 depend on this exact triplet.

- [ ] **Step 1: Write the failing unit test**

Create `apps/api/src/auth/guards/owner-scope.guard.spec.ts`:

```ts
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { OwnerScopeGuard } from './owner-scope.guard';
import { OWNER_SCOPE_KEY } from '../decorators/owner-scope.decorator';
import { StaffRole, UserRole } from '../../users/entities/user.entity';

function buildContext(user: unknown, request: { effectiveOwnerId?: string } = {}) {
  const req = { user, ...request };
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

function buildReflector(tier: 'full' | 'operational' | undefined) {
  return { getAllAndOverride: () => tier } as unknown as Reflector;
}

describe('OwnerScopeGuard', () => {
  it('allows an owner on a full-tier route and sets effectiveOwnerId to their own id', () => {
    const guard = new OwnerScopeGuard(buildReflector('full'));
    const ctx = buildContext({ userId: 'owner-1', role: UserRole.OWNER, ownerId: null, staffRole: null });

    expect(guard.canActivate(ctx)).toBe(true);
    expect((ctx.switchToHttp().getRequest() as any).effectiveOwnerId).toBe('owner-1');
  });

  it('allows a manager staff on a full-tier route, scoped to their owner', () => {
    const guard = new OwnerScopeGuard(buildReflector('full'));
    const ctx = buildContext({
      userId: 'staff-1',
      role: UserRole.STAFF,
      ownerId: 'owner-1',
      staffRole: StaffRole.MANAGER,
    });

    expect(guard.canActivate(ctx)).toBe(true);
    expect((ctx.switchToHttp().getRequest() as any).effectiveOwnerId).toBe('owner-1');
  });

  it('rejects a cashier staff on a full-tier route', () => {
    const guard = new OwnerScopeGuard(buildReflector('full'));
    const ctx = buildContext({
      userId: 'staff-2',
      role: UserRole.STAFF,
      ownerId: 'owner-1',
      staffRole: StaffRole.CASHIER,
    });

    expect(guard.canActivate(ctx)).toBe(false);
  });

  it('allows a cashier staff on an operational-tier route', () => {
    const guard = new OwnerScopeGuard(buildReflector('operational'));
    const ctx = buildContext({
      userId: 'staff-2',
      role: UserRole.STAFF,
      ownerId: 'owner-1',
      staffRole: StaffRole.CASHIER,
    });

    expect(guard.canActivate(ctx)).toBe(true);
    expect((ctx.switchToHttp().getRequest() as any).effectiveOwnerId).toBe('owner-1');
  });

  it('rejects a customer on any owner-scoped route', () => {
    const guard = new OwnerScopeGuard(buildReflector('operational'));
    const ctx = buildContext({ userId: 'cust-1', role: UserRole.CUSTOMER, ownerId: null, staffRole: null });

    expect(guard.canActivate(ctx)).toBe(false);
  });

  it('allows any authenticated user when no @OwnerScope metadata is set', () => {
    const guard = new OwnerScopeGuard(buildReflector(undefined));
    const ctx = buildContext({ userId: 'cust-1', role: UserRole.CUSTOMER, ownerId: null, staffRole: null });

    expect(guard.canActivate(ctx)).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/api && npx jest auth/guards/owner-scope.guard.spec.ts`
Expected: FAIL — `owner-scope.guard.ts`/`owner-scope.decorator.ts` don't exist yet (module not found).

- [ ] **Step 3: Write the decorator**

Create `apps/api/src/auth/decorators/owner-scope.decorator.ts`:

```ts
import { SetMetadata } from '@nestjs/common';

export const OWNER_SCOPE_KEY = 'ownerScope';
export type OwnerScopeTier = 'full' | 'operational';
export const OwnerScope = (tier: OwnerScopeTier) =>
  SetMetadata(OWNER_SCOPE_KEY, tier);
```

Create `apps/api/src/auth/decorators/effective-owner-id.decorator.ts`:

```ts
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const EffectiveOwnerId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest();
    return request.effectiveOwnerId as string;
  },
);
```

- [ ] **Step 4: Write the guard**

Create `apps/api/src/auth/guards/owner-scope.guard.ts`:

```ts
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { OWNER_SCOPE_KEY, OwnerScopeTier } from '../decorators/owner-scope.decorator';
import { AuthenticatedUser } from '../decorators/current-user.decorator';
import { StaffRole, UserRole } from '../../users/entities/user.entity';

const TIER_RANK: Record<OwnerScopeTier, number> = {
  operational: 0,
  full: 1,
};

@Injectable()
export class OwnerScopeGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredTier = this.reflector.getAllAndOverride<OwnerScopeTier | undefined>(
      OWNER_SCOPE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requiredTier) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user as AuthenticatedUser | undefined;
    if (!user) {
      return false;
    }

    const resolved = this.resolveTier(user);
    if (!resolved) {
      return false;
    }

    if (TIER_RANK[resolved.tier] < TIER_RANK[requiredTier]) {
      return false;
    }

    request.effectiveOwnerId = resolved.effectiveOwnerId;
    return true;
  }

  private resolveTier(
    user: AuthenticatedUser,
  ): { effectiveOwnerId: string; tier: OwnerScopeTier } | null {
    if (user.role === UserRole.OWNER) {
      return { effectiveOwnerId: user.userId, tier: 'full' };
    }
    if (user.role === UserRole.STAFF && user.ownerId) {
      const tier: OwnerScopeTier =
        user.staffRole === StaffRole.MANAGER ? 'full' : 'operational';
      return { effectiveOwnerId: user.ownerId, tier };
    }
    return null;
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd apps/api && npx jest auth/guards/owner-scope.guard.spec.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/auth/decorators/owner-scope.decorator.ts apps/api/src/auth/decorators/effective-owner-id.decorator.ts apps/api/src/auth/guards/owner-scope.guard.ts apps/api/src/auth/guards/owner-scope.guard.spec.ts
git commit -m "feat(api): add OwnerScopeGuard for 2-tier owner/staff permissions"
```

---

### Task 5: Staff module — create & list

**Files:**
- Create: `apps/api/src/staff/staff.module.ts`
- Create: `apps/api/src/staff/staff.controller.ts`
- Create: `apps/api/src/staff/staff.service.ts`
- Create: `apps/api/src/staff/staff.service.spec.ts`
- Create: `apps/api/src/staff/dto/create-staff.dto.ts`
- Create: `apps/api/src/staff/dto/list-staff.dto.ts`
- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/api/test/utils/owner-fixtures.ts` — add `createStaff`/`loginByPhone`
- Create: `apps/api/test/staff.e2e-spec.ts`

**Interfaces:**
- Consumes: `OwnerScopeGuard`, `OwnerScope`, `EffectiveOwnerId` from Task 4; `User`, `UserRole`, `StaffRole` from Task 1.
- Produces: `StaffService.create(ownerId, dto): Promise<StaffListItem>`, `StaffService.list(ownerId, query): Promise<StaffListItem[]>`, `StaffListItem` type (consumed by Task 6's `update`/`deactivate`/`resetPassword`, which live in the same service).

- [ ] **Step 1: Write the DTOs**

Create `apps/api/src/staff/dto/create-staff.dto.ts`:

```ts
import { IsEmail, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { StaffRole } from '../../users/entities/user.entity';

export class CreateStaffDto {
  @IsString()
  @MinLength(1)
  fullName: string;

  @IsString()
  @MinLength(1)
  phone: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsEnum(StaffRole)
  staffRole: StaffRole;

  @IsString()
  @MinLength(6)
  password: string;
}
```

Create `apps/api/src/staff/dto/list-staff.dto.ts`:

```ts
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { StaffRole } from '../../users/entities/user.entity';

export class ListStaffDto {
  @IsOptional()
  @IsEnum(StaffRole)
  staffRole?: StaffRole;

  @IsOptional()
  @IsString()
  search?: string;
}
```

- [ ] **Step 2: Write the failing unit test**

Create `apps/api/src/staff/staff.service.spec.ts`:

```ts
import { ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { StaffService } from './staff.service';
import { StaffRole, User, UserRole, UserStatus } from '../users/entities/user.entity';

const mockUsersRepository = () => ({
  create: jest.fn(),
  save: jest.fn(),
  findOne: jest.fn(),
  find: jest.fn(),
});

async function buildTestingModule() {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      StaffService,
      { provide: getRepositoryToken(User), useFactory: mockUsersRepository },
    ],
  }).compile();

  return {
    service: module.get(StaffService),
    usersRepo: module.get(getRepositoryToken(User)) as ReturnType<typeof mockUsersRepository>,
  };
}

describe('StaffService.create', () => {
  it('creates an active staff account scoped to the owner', async () => {
    const { service, usersRepo } = await buildTestingModule();
    usersRepo.findOne.mockResolvedValue(null); // no phone/email conflict
    usersRepo.create.mockImplementation((data) => data);
    usersRepo.save.mockImplementation((data) => Promise.resolve({ id: 'staff-1', ...data }));

    const result = await service.create('owner-1', {
      fullName: 'Nguyễn Văn A',
      phone: '0911000099',
      staffRole: StaffRole.CASHIER,
      password: 'password1',
    });

    expect(result).toMatchObject({
      id: 'staff-1',
      fullName: 'Nguyễn Văn A',
      role: UserRole.OWNER === UserRole.STAFF ? undefined : UserRole.STAFF,
      staffRole: StaffRole.CASHIER,
    });
    expect(usersRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerId: 'owner-1',
        role: UserRole.STAFF,
        status: UserStatus.ACTIVE,
      }),
    );
  });

  it('rejects a duplicate phone number', async () => {
    const { service, usersRepo } = await buildTestingModule();
    usersRepo.findOne.mockResolvedValueOnce({ id: 'existing-user' });

    await expect(
      service.create('owner-1', {
        fullName: 'B',
        phone: '0911000099',
        staffRole: StaffRole.STAFF,
        password: 'password1',
      }),
    ).rejects.toThrow(ConflictException);
  });
});

describe('StaffService.list', () => {
  it('includes the owner as a "Chủ sân" row alongside staff', async () => {
    const { service, usersRepo } = await buildTestingModule();
    usersRepo.findOne.mockResolvedValue({
      id: 'owner-1',
      fullName: 'Chủ sân',
      phone: '0900000001',
      email: 'owner@test.com',
      role: UserRole.OWNER,
      staffRole: null,
      status: UserStatus.ACTIVE,
    });
    usersRepo.find.mockResolvedValue([
      {
        id: 'staff-1',
        fullName: 'Cashier A',
        phone: '0911000099',
        email: null,
        role: UserRole.STAFF,
        staffRole: StaffRole.CASHIER,
        status: UserStatus.ACTIVE,
      },
    ]);

    const result = await service.list('owner-1', {});

    expect(result.map((r) => r.id)).toEqual(['owner-1', 'staff-1']);
  });

  it('filters by staffRole (excludes the owner row, which has no staffRole)', async () => {
    const { service, usersRepo } = await buildTestingModule();
    usersRepo.findOne.mockResolvedValue({
      id: 'owner-1',
      fullName: 'Chủ sân',
      phone: '0900000001',
      email: 'owner@test.com',
      role: UserRole.OWNER,
      staffRole: null,
      status: UserStatus.ACTIVE,
    });
    usersRepo.find.mockResolvedValue([
      {
        id: 'staff-1',
        fullName: 'Cashier A',
        phone: '0911000099',
        email: null,
        role: UserRole.STAFF,
        staffRole: StaffRole.CASHIER,
        status: UserStatus.ACTIVE,
      },
    ]);

    const result = await service.list('owner-1', { staffRole: StaffRole.CASHIER });

    expect(result.map((r) => r.id)).toEqual(['staff-1']);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `cd apps/api && npx jest staff/staff.service.spec.ts`
Expected: FAIL — `./staff.service` module not found.

- [ ] **Step 4: Write `StaffService`**

Create `apps/api/src/staff/staff.service.ts`:

```ts
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { StaffRole, User, UserRole, UserStatus } from '../users/entities/user.entity';
import { CreateStaffDto } from './dto/create-staff.dto';
import { ListStaffDto } from './dto/list-staff.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';

export interface StaffListItem {
  id: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  role: UserRole.OWNER | UserRole.STAFF;
  staffRole: StaffRole | null;
  status: UserStatus;
}

@Injectable()
export class StaffService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  async create(ownerId: string, dto: CreateStaffDto): Promise<StaffListItem> {
    await this.assertPhoneAvailable(dto.phone);
    if (dto.email) {
      await this.assertEmailAvailable(dto.email);
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const staff = this.usersRepository.create({
      fullName: dto.fullName,
      phone: dto.phone,
      email: dto.email ?? null,
      passwordHash,
      role: UserRole.STAFF,
      ownerId,
      staffRole: dto.staffRole,
      status: UserStatus.ACTIVE,
      emailVerified: false,
    });
    const saved = await this.usersRepository.save(staff);
    return this.toListItem(saved);
  }

  async list(ownerId: string, query: ListStaffDto): Promise<StaffListItem[]> {
    const owner = await this.usersRepository.findOne({ where: { id: ownerId } });
    const staff = await this.usersRepository.find({
      where: { ownerId },
      order: { createdAt: 'ASC' },
    });
    let items = [owner, ...staff].filter((u): u is User => !!u);

    if (query.staffRole) {
      items = items.filter((u) => u.staffRole === query.staffRole);
    }
    if (query.search) {
      const s = query.search.trim().toLowerCase();
      items = items.filter(
        (u) =>
          u.fullName.toLowerCase().includes(s) ||
          (u.phone ?? '').toLowerCase().includes(s) ||
          (u.email ?? '').toLowerCase().includes(s),
      );
    }

    return items.map((u) => this.toListItem(u));
  }

  async getOwnedStaffOrThrow(ownerId: string, staffId: string): Promise<User> {
    const staff = await this.usersRepository.findOne({
      where: { id: staffId, ownerId, role: UserRole.STAFF },
    });
    if (!staff) {
      throw new NotFoundException(`Nhân viên ${staffId} không tồn tại`);
    }
    return staff;
  }

  private async assertPhoneAvailable(phone: string, excludeId?: string): Promise<void> {
    const existing = await this.usersRepository.findOne({ where: { phone } });
    if (existing && existing.id !== excludeId) {
      throw new ConflictException('Số điện thoại đã được sử dụng');
    }
  }

  private async assertEmailAvailable(email: string, excludeId?: string): Promise<void> {
    const existing = await this.usersRepository.findOne({ where: { email } });
    if (existing && existing.id !== excludeId) {
      throw new ConflictException('Email đã được sử dụng');
    }
  }

  private toListItem(user: User): StaffListItem {
    return {
      id: user.id,
      fullName: user.fullName,
      phone: user.phone,
      email: user.email,
      role: user.role as UserRole.OWNER | UserRole.STAFF,
      staffRole: user.staffRole,
      status: user.status,
    };
  }
}
```

Note: this imports `UpdateStaffDto` from `./dto/update-staff.dto`, which doesn't exist until Task 6. Create a minimal placeholder now so Task 5 compiles standalone:

Create `apps/api/src/staff/dto/update-staff.dto.ts`:

```ts
import { IsEmail, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { StaffRole } from '../../users/entities/user.entity';

export class UpdateStaffDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  fullName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsEnum(StaffRole)
  staffRole?: StaffRole;
}
```

(Task 6 uses this DTO for the actual `update` method — it isn't referenced by `create`/`list` above beyond the unused import, which is fine since TypeScript only needs the type to exist.)

Actually — `staff.service.ts` above imports `UpdateStaffDto` but never uses it in this task's methods. Remove that import for now to avoid an unused-import lint error:

Delete the line `import { UpdateStaffDto } from './dto/update-staff.dto';` from `staff.service.ts` (Task 6 re-adds it when it adds the `update` method).

- [ ] **Step 5: Write the controller and module**

Create `apps/api/src/staff/staff.controller.ts`:

```ts
import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OwnerScopeGuard } from '../auth/guards/owner-scope.guard';
import { OwnerScope } from '../auth/decorators/owner-scope.decorator';
import { EffectiveOwnerId } from '../auth/decorators/effective-owner-id.decorator';
import { StaffService } from './staff.service';
import { CreateStaffDto } from './dto/create-staff.dto';
import { ListStaffDto } from './dto/list-staff.dto';

@Controller('staff')
@UseGuards(JwtAuthGuard, OwnerScopeGuard)
@OwnerScope('full')
export class StaffController {
  constructor(private readonly staffService: StaffService) {}

  @Post()
  create(@EffectiveOwnerId() ownerId: string, @Body() dto: CreateStaffDto) {
    return this.staffService.create(ownerId, dto);
  }

  @Get()
  list(@EffectiveOwnerId() ownerId: string, @Query() query: ListStaffDto) {
    return this.staffService.list(ownerId, query);
  }
}
```

Create `apps/api/src/staff/staff.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/entities/user.entity';
import { StaffController } from './staff.controller';
import { StaffService } from './staff.service';

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  controllers: [StaffController],
  providers: [StaffService],
})
export class StaffModule {}
```

Register it in `apps/api/src/app.module.ts` — add the import:

```ts
import { StaffModule } from './staff/staff.module';
```

and add `StaffModule,` to the `imports` array (after `RecurringSchedulesModule,`).

- [ ] **Step 6: Run the unit test to verify it passes**

Run: `cd apps/api && npx jest staff/staff.service.spec.ts`
Expected: PASS (4 tests).

- [ ] **Step 7: Add e2e fixtures**

In `apps/api/test/utils/owner-fixtures.ts`, add near the top imports:

```ts
import { StaffRole } from '../../src/users/entities/user.entity';
```

and add these two functions (after `createUser`):

```ts
export async function createStaff(
  ds: DataSource,
  ownerId: string,
  fullName: string,
  phone: string,
  staffRole: StaffRole,
): Promise<User> {
  const passwordHash = await bcrypt.hash('password123', 10);
  const repo = ds.getRepository(User);
  return repo.save(
    repo.create({
      fullName,
      phone,
      email: null,
      passwordHash,
      role: UserRole.STAFF,
      ownerId,
      staffRole,
      status: UserStatus.ACTIVE,
      emailVerified: false,
    }),
  );
}

export async function loginByPhone(app: INestApplication, phone: string): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ identifier: phone, password: 'password123' });
  return res.body.accessToken as string;
}
```

(`loginAs` in the same file already sends `identifier: email` after Task 3.)

- [ ] **Step 8: Write the failing e2e test**

Create `apps/api/test/staff.e2e-spec.ts`:

```ts
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { createTestApp, clearDatabase } from './utils/test-app';
import { createUser, createStaff, loginAs, loginByPhone } from './utils/owner-fixtures';
import { UserRole, StaffRole } from '../src/users/entities/user.entity';

describe('Staff (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
  });

  beforeEach(async () => {
    await clearDatabase(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it('lets an owner create a staff account, list it, and log in as that staff', async () => {
    const owner = await createUser(dataSource, 'staffowner1@test.com', UserRole.OWNER);
    const ownerToken = await loginAs(app, 'staffowner1@test.com');

    const createResponse = await request(app.getHttpServer())
      .post('/staff')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        fullName: 'Thu ngân A',
        phone: '0911000088',
        staffRole: 'cashier',
        password: 'password1',
      })
      .expect(201);
    expect(createResponse.body).toMatchObject({
      fullName: 'Thu ngân A',
      role: 'staff',
      staffRole: 'cashier',
    });

    const listResponse = await request(app.getHttpServer())
      .get('/staff')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(listResponse.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: owner.id, role: 'owner' }),
        expect.objectContaining({ fullName: 'Thu ngân A', role: 'staff' }),
      ]),
    );

    const staffToken = await loginByPhone(app, '0911000088');
    expect(staffToken).toBeDefined();
  });

  it('rejects duplicate phone across owners', async () => {
    const owner1 = await createUser(dataSource, 'staffowner2@test.com', UserRole.OWNER);
    const owner1Token = await loginAs(app, 'staffowner2@test.com');
    await createStaff(dataSource, owner1.id, 'Existing', '0911000077', StaffRole.STAFF);

    await request(app.getHttpServer())
      .post('/staff')
      .set('Authorization', `Bearer ${owner1Token}`)
      .send({
        fullName: 'Trùng SĐT',
        phone: '0911000077',
        staffRole: 'manager',
        password: 'password1',
      })
      .expect(409);
  });

  it('rejects a cashier calling POST /staff (operational tier has no access)', async () => {
    const owner = await createUser(dataSource, 'staffowner3@test.com', UserRole.OWNER);
    const cashier = await createStaff(dataSource, owner.id, 'Cashier', '0911000066', StaffRole.CASHIER);
    const cashierToken = await loginByPhone(app, '0911000066');
    void cashier;

    await request(app.getHttpServer())
      .post('/staff')
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({ fullName: 'X', phone: '0911000055', staffRole: 'staff', password: 'password1' })
      .expect(403);
  });
});
```

- [ ] **Step 9: Run it to verify it fails, then run again after wiring, to verify it passes**

Run: `cd apps/api && npm run test:e2e -- staff`
Expected first: FAIL (route doesn't exist / module not registered, depending on how far Steps 4–5 got). After completing Steps 4–5: PASS (3 tests).

- [ ] **Step 10: Commit**

```bash
git add apps/api/src/staff apps/api/src/app.module.ts apps/api/test/staff.e2e-spec.ts apps/api/test/utils/owner-fixtures.ts
git commit -m "feat(api): add staff module — create and list endpoints"
```

---

### Task 6: Staff module — update, deactivate, reset-password

**Files:**
- Modify: `apps/api/src/staff/staff.service.ts`
- Modify: `apps/api/src/staff/staff.controller.ts`
- Create: `apps/api/src/staff/dto/reset-staff-password.dto.ts`
- Modify: `apps/api/src/staff/staff.service.spec.ts`
- Modify: `apps/api/test/staff.e2e-spec.ts`

**Interfaces:**
- Consumes: `StaffService`, `StaffListItem`, `getOwnedStaffOrThrow` from Task 5.
- Produces: `StaffService.update(ownerId, staffId, dto)`, `.deactivate(ownerId, staffId)`, `.resetPassword(ownerId, staffId, newPassword)`.

- [ ] **Step 1: Write the failing unit tests**

Append to `apps/api/src/staff/staff.service.spec.ts`:

```ts
describe('StaffService.update', () => {
  it('404s when the staff id does not belong to this owner', async () => {
    const { service, usersRepo } = await buildTestingModule();
    usersRepo.findOne.mockResolvedValue(null);

    await expect(
      service.update('owner-1', 'not-mine', { fullName: 'X' }),
    ).rejects.toThrow('Nhân viên not-mine không tồn tại');
  });

  it('updates allowed fields', async () => {
    const { service, usersRepo } = await buildTestingModule();
    const existing = {
      id: 'staff-1',
      ownerId: 'owner-1',
      role: UserRole.STAFF,
      fullName: 'Old',
      phone: '0911000001',
      email: null,
      staffRole: StaffRole.STAFF,
      status: UserStatus.ACTIVE,
    };
    usersRepo.findOne
      .mockResolvedValueOnce(existing) // getOwnedStaffOrThrow
      .mockResolvedValueOnce(null); // phone availability check
    usersRepo.save.mockImplementation((data) => Promise.resolve(data));

    const result = await service.update('owner-1', 'staff-1', { fullName: 'New Name' });

    expect(result.fullName).toBe('New Name');
  });
});

describe('StaffService.deactivate', () => {
  it('sets status to suspended', async () => {
    const { service, usersRepo } = await buildTestingModule();
    const existing = {
      id: 'staff-1',
      ownerId: 'owner-1',
      role: UserRole.STAFF,
      fullName: 'A',
      phone: '0911000001',
      email: null,
      staffRole: StaffRole.STAFF,
      status: UserStatus.ACTIVE,
    };
    usersRepo.findOne.mockResolvedValue(existing);
    usersRepo.save.mockImplementation((data) => Promise.resolve(data));

    const result = await service.deactivate('owner-1', 'staff-1');

    expect(result.status).toBe(UserStatus.SUSPENDED);
  });

  it('404s when the owner targets their own id (getOwnedStaffOrThrow requires role=staff)', async () => {
    const { service, usersRepo } = await buildTestingModule();
    // The repository query filters `role: UserRole.STAFF`, so an owner row
    // (role='owner') never matches even when id === ownerId — this is how
    // spec §6 "owner cannot deactivate themselves via this endpoint" is enforced.
    usersRepo.findOne.mockResolvedValue(null);

    await expect(service.deactivate('owner-1', 'owner-1')).rejects.toThrow(
      'Nhân viên owner-1 không tồn tại',
    );
  });
});

describe('StaffService.resetPassword', () => {
  it('rehashes the password for an owned staff account', async () => {
    const { service, usersRepo } = await buildTestingModule();
    const existing = {
      id: 'staff-1',
      ownerId: 'owner-1',
      role: UserRole.STAFF,
      passwordHash: 'old-hash',
      status: UserStatus.ACTIVE,
    };
    usersRepo.findOne.mockResolvedValue(existing);
    usersRepo.save.mockImplementation((data) => Promise.resolve(data));

    await service.resetPassword('owner-1', 'staff-1', 'newpassword1');

    expect(usersRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'staff-1' }),
    );
    const saved = usersRepo.save.mock.calls[0][0];
    expect(saved.passwordHash).not.toBe('old-hash');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/api && npx jest staff/staff.service.spec.ts`
Expected: FAIL — `service.update`/`deactivate`/`resetPassword` don't exist.

- [ ] **Step 3: Add the DTO**

Create `apps/api/src/staff/dto/reset-staff-password.dto.ts`:

```ts
import { IsString, MinLength } from 'class-validator';

export class ResetStaffPasswordDto {
  @IsString()
  @MinLength(6)
  newPassword: string;
}
```

- [ ] **Step 4: Add the service methods**

In `apps/api/src/staff/staff.service.ts`:

Add back the import (removed at the end of Task 5 Step 4):
```ts
import { UpdateStaffDto } from './dto/update-staff.dto';
```

Add these methods to the class, after `list`:

```ts
  async update(ownerId: string, staffId: string, dto: UpdateStaffDto): Promise<StaffListItem> {
    const staff = await this.getOwnedStaffOrThrow(ownerId, staffId);

    if (dto.phone !== undefined) {
      await this.assertPhoneAvailable(dto.phone, staffId);
      staff.phone = dto.phone;
    }
    if (dto.email !== undefined) {
      await this.assertEmailAvailable(dto.email, staffId);
      staff.email = dto.email;
    }
    if (dto.fullName !== undefined) staff.fullName = dto.fullName;
    if (dto.staffRole !== undefined) staff.staffRole = dto.staffRole;

    const saved = await this.usersRepository.save(staff);
    return this.toListItem(saved);
  }

  async deactivate(ownerId: string, staffId: string): Promise<StaffListItem> {
    const staff = await this.getOwnedStaffOrThrow(ownerId, staffId);
    staff.status = UserStatus.SUSPENDED;
    const saved = await this.usersRepository.save(staff);
    return this.toListItem(saved);
  }

  async resetPassword(ownerId: string, staffId: string, newPassword: string): Promise<void> {
    const staff = await this.getOwnedStaffOrThrow(ownerId, staffId);
    staff.passwordHash = await bcrypt.hash(newPassword, 10);
    await this.usersRepository.save(staff);
  }
```

- [ ] **Step 5: Run the unit tests to verify they pass**

Run: `cd apps/api && npx jest staff/staff.service.spec.ts`
Expected: PASS (all tests, including Task 5's).

- [ ] **Step 6: Wire the controller endpoints**

In `apps/api/src/staff/staff.controller.ts`, add imports:

```ts
import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
```
(replace the existing `import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';` line)

```ts
import { UpdateStaffDto } from './dto/update-staff.dto';
import { ResetStaffPasswordDto } from './dto/reset-staff-password.dto';
```

Add methods to the class:

```ts
  @Patch(':id')
  update(
    @EffectiveOwnerId() ownerId: string,
    @Param('id') id: string,
    @Body() dto: UpdateStaffDto,
  ) {
    return this.staffService.update(ownerId, id, dto);
  }

  @Post(':id/deactivate')
  deactivate(@EffectiveOwnerId() ownerId: string, @Param('id') id: string) {
    return this.staffService.deactivate(ownerId, id);
  }

  @Post(':id/reset-password')
  resetPassword(
    @EffectiveOwnerId() ownerId: string,
    @Param('id') id: string,
    @Body() dto: ResetStaffPasswordDto,
  ) {
    return this.staffService.resetPassword(ownerId, id, dto.newPassword);
  }
```

- [ ] **Step 7: Write the failing e2e tests**

Append to `apps/api/test/staff.e2e-spec.ts`:

```ts
  it('updates, deactivates, and resets the password of an owned staff account', async () => {
    const owner = await createUser(dataSource, 'staffowner4@test.com', UserRole.OWNER);
    const ownerToken = await loginAs(app, 'staffowner4@test.com');
    const staff = await createStaff(dataSource, owner.id, 'Old Name', '0911000044', StaffRole.STAFF);

    await request(app.getHttpServer())
      .patch(`/staff/${staff.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ fullName: 'New Name' })
      .expect(200)
      .expect((res) => expect(res.body.fullName).toBe('New Name'));

    await request(app.getHttpServer())
      .post(`/staff/${staff.id}/reset-password`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ newPassword: 'brandnew1' })
      .expect(201);
    const relogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ identifier: '0911000044', password: 'brandnew1' })
      .expect(201);
    expect(relogin.body.accessToken).toBeDefined();

    await request(app.getHttpServer())
      .post(`/staff/${staff.id}/deactivate`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(201);
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ identifier: '0911000044', password: 'brandnew1' })
      .expect(403);
  });

  it('404s when acting on another owner\'s staff', async () => {
    const owner1 = await createUser(dataSource, 'staffowner5@test.com', UserRole.OWNER);
    const owner2 = await createUser(dataSource, 'staffowner6@test.com', UserRole.OWNER);
    const owner2Token = await loginAs(app, 'staffowner6@test.com');
    const staffOfOwner1 = await createStaff(dataSource, owner1.id, 'A', '0911000033', StaffRole.STAFF);

    await request(app.getHttpServer())
      .patch(`/staff/${staffOfOwner1.id}`)
      .set('Authorization', `Bearer ${owner2Token}`)
      .send({ fullName: 'Hijacked' })
      .expect(404);
  });

  it('lets a manager reach full-tier staff endpoints', async () => {
    const owner = await createUser(dataSource, 'staffowner7@test.com', UserRole.OWNER);
    const manager = await createStaff(dataSource, owner.id, 'Manager', '0911000022', StaffRole.MANAGER);
    const managerToken = await loginByPhone(app, '0911000022');

    await request(app.getHttpServer())
      .get('/staff')
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(200)
      .expect((res) =>
        expect(res.body).toEqual(
          expect.arrayContaining([expect.objectContaining({ id: manager.id })]),
        ),
      );
  });
```

- [ ] **Step 8: Run all staff e2e tests**

Run: `cd apps/api && npm run test:e2e -- staff`
Expected: PASS (7 tests total).

- [ ] **Step 9: Run the full suite**

Run: `cd apps/api && npm test && npm run test:e2e`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add apps/api/src/staff apps/api/test/staff.e2e-spec.ts
git commit -m "feat(api): add staff update/deactivate/reset-password endpoints"
```

---

### Task 7: Roll out `OwnerScopeGuard` — Venues (`full` tier)

**Files:**
- Modify: `apps/api/src/courts/venues.controller.ts`
- Test: `apps/api/test/venues-mine-courts.e2e-spec.ts` (existing, must still pass), extend with one new test

**Interfaces:**
- Consumes: `OwnerScopeGuard`, `OwnerScope`, `EffectiveOwnerId` from Task 4.

- [ ] **Step 1: Write the failing e2e test**

`apps/api/test/venues-mine-courts.e2e-spec.ts` defines its own local `createOwnerAndLogin()` helper (not the shared `owner-fixtures.ts`) and imports `User, UserRole, UserStatus` from `'../src/users/entities/user.entity'` (line 6). Change that import line to also pull in `StaffRole`:

```ts
import { StaffRole, User, UserRole, UserStatus } from '../src/users/entities/user.entity';
```

Then add this test inside the `describe('GET /venues/mine/courts (e2e)', ...)` block, after `createOwnerAndLogin`:

```ts
  it('rejects a cashier staff from creating a venue (full tier only)', async () => {
    const { ownerId } = await createOwnerAndLogin();
    const passwordHash = await bcrypt.hash('password123', 10);
    const usersRepo = dataSource.getRepository(User);
    await usersRepo.save(
      usersRepo.create({
        fullName: 'Cashier',
        phone: '0911000011',
        email: null,
        passwordHash,
        role: UserRole.STAFF,
        ownerId,
        staffRole: StaffRole.CASHIER,
        status: UserStatus.ACTIVE,
        emailVerified: false,
      }),
    );
    const cashierLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ identifier: '0911000011', password: 'password123' });

    await request(app.getHttpServer())
      .post('/venues')
      .set('Authorization', `Bearer ${cashierLogin.body.accessToken}`)
      .send({ name: 'Sân X', address: '1 Đường A', city: 'HCM' })
      .expect(403);
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/api && npm run test:e2e -- venues-mine-courts`
Expected: FAIL — currently `@Roles(UserRole.OWNER)` rejects staff with 403 already (role isn't `owner`)... **check this carefully**: since `RolesGuard` checks `requiredRoles.includes(user.role)` and a cashier's `role` is `'staff'`, not `'owner'`, this test may already pass even before the swap. That's fine — this test's real purpose is regression coverage for after the swap; if it passes immediately, proceed to Step 3 anyway to complete the guard swap (the test staying green through the change is the point).

- [ ] **Step 3: Swap the guard on every endpoint**

Edit `apps/api/src/courts/venues.controller.ts`. Replace the imports block:

```ts
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OwnerScopeGuard } from '../auth/guards/owner-scope.guard';
import { OwnerScope } from '../auth/decorators/owner-scope.decorator';
import { EffectiveOwnerId } from '../auth/decorators/effective-owner-id.decorator';
import { VenuesService } from './venues.service';
import { CourtsService } from './courts.service';
import { CreateVenueDto } from './dto/create-venue.dto';
import { UpdateVenueDto } from './dto/update-venue.dto';
import { AddVenueImageDto } from './dto/add-venue-image.dto';
```

(drops `RolesGuard`, `Roles`, `CurrentUser`, `AuthenticatedUser`, `UserRole` — none of them are used anywhere else in this file after the edits below)

For each of the 6 guarded endpoints (`create`, `findMine`, `findAllMineCourts`, `findMineById`, `update`, `addImage`, `removeImage` — 7 actually, recount: `create`, `findMine`, `findAllMineCourts`, `findMineById`, `update`, `addImage`, `removeImage`), apply this transform:

- `@UseGuards(JwtAuthGuard, RolesGuard)` → `@UseGuards(JwtAuthGuard, OwnerScopeGuard)`
- `@Roles(UserRole.OWNER)` → `@OwnerScope('full')`
- `@CurrentUser() user: AuthenticatedUser` (as a parameter) → `@EffectiveOwnerId() effectiveOwnerId: string`
- every `user.userId` in that method body → `effectiveOwnerId`

The full resulting file body (everything from `@Controller('venues')` down):

```ts
@Controller('venues')
export class VenuesController {
  constructor(
    private readonly venuesService: VenuesService,
    private readonly courtsService: CourtsService,
  ) {}

  @Post()
  @UseGuards(JwtAuthGuard, OwnerScopeGuard)
  @OwnerScope('full')
  create(@EffectiveOwnerId() effectiveOwnerId: string, @Body() dto: CreateVenueDto) {
    return this.venuesService.create(effectiveOwnerId, dto);
  }

  @Get('mine')
  @UseGuards(JwtAuthGuard, OwnerScopeGuard)
  @OwnerScope('full')
  findMine(@EffectiveOwnerId() effectiveOwnerId: string) {
    return this.venuesService.findMineByOwner(effectiveOwnerId);
  }

  @Get('mine/courts')
  @UseGuards(JwtAuthGuard, OwnerScopeGuard)
  @OwnerScope('full')
  findAllMineCourts(@EffectiveOwnerId() effectiveOwnerId: string) {
    return this.courtsService.findAllForOwner(effectiveOwnerId);
  }

  @Get('mine/:id')
  @UseGuards(JwtAuthGuard, OwnerScopeGuard)
  @OwnerScope('full')
  async findMineById(
    @EffectiveOwnerId() effectiveOwnerId: string,
    @Param('id') id: string,
  ) {
    const venue = await this.venuesService.findMineById(effectiveOwnerId, id);
    const images = await this.venuesService.findImagesByVenue(id);
    return { ...venue, images };
  }

  @Patch('mine/:id')
  @UseGuards(JwtAuthGuard, OwnerScopeGuard)
  @OwnerScope('full')
  update(
    @EffectiveOwnerId() effectiveOwnerId: string,
    @Param('id') id: string,
    @Body() dto: UpdateVenueDto,
  ) {
    return this.venuesService.update(effectiveOwnerId, id, dto);
  }

  @Post('mine/:id/images')
  @UseGuards(JwtAuthGuard, OwnerScopeGuard)
  @OwnerScope('full')
  addImage(
    @EffectiveOwnerId() effectiveOwnerId: string,
    @Param('id') id: string,
    @Body() dto: AddVenueImageDto,
  ) {
    return this.venuesService.addImage(effectiveOwnerId, id, dto);
  }

  @Delete('mine/:id/images/:imageId')
  @UseGuards(JwtAuthGuard, OwnerScopeGuard)
  @OwnerScope('full')
  removeImage(
    @EffectiveOwnerId() effectiveOwnerId: string,
    @Param('id') id: string,
    @Param('imageId') imageId: string,
  ) {
    return this.venuesService.removeImage(effectiveOwnerId, id, imageId);
  }

  @Get()
  search(@Query('query') query?: string) {
    return this.venuesService.searchPublic(query);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const venue = await this.venuesService.findPublicById(id);
    const courts = await this.courtsService.findActiveByVenue(id);
    const images = await this.venuesService.findImagesByVenue(id);
    return { ...venue, courts, images };
  }
}
```

- [ ] **Step 4: Run the venues e2e tests**

Run: `cd apps/api && npm run test:e2e -- venues-mine-courts`
Expected: PASS.

- [ ] **Step 5: Run the full suite**

Run: `cd apps/api && npm test && npm run test:e2e`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/courts/venues.controller.ts apps/api/test/venues-mine-courts.e2e-spec.ts
git commit -m "refactor(api): venues controller uses OwnerScopeGuard (full tier)"
```

---

### Task 8: Roll out `OwnerScopeGuard` — Courts (`full` tier)

**Files:**
- Modify: `apps/api/src/courts/courts.controller.ts`
- Test: `apps/api/test/courts-slots-pricing.e2e-spec.ts` (existing, must still pass)

**Interfaces:**
- Consumes: same as Task 7.

- [ ] **Step 1: Edit `apps/api/src/courts/courts.controller.ts`**

Replace the imports:

```ts
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OwnerScopeGuard } from '../auth/guards/owner-scope.guard';
import { OwnerScope } from '../auth/decorators/owner-scope.decorator';
import { EffectiveOwnerId } from '../auth/decorators/effective-owner-id.decorator';
import { CourtsService } from './courts.service';
import { CreateCourtDto } from './dto/create-court.dto';
import { UpdateCourtDto } from './dto/update-court.dto';
import { courtImageUploadOptions } from './court-image-upload.config';
```

Replace the class body (everything from `@Controller()` down):

```ts
@Controller()
export class CourtsController {
  constructor(private readonly courtsService: CourtsService) {}

  @Post('venues/mine/:venueId/courts')
  @UseGuards(JwtAuthGuard, OwnerScopeGuard)
  @OwnerScope('full')
  create(
    @EffectiveOwnerId() effectiveOwnerId: string,
    @Param('venueId') venueId: string,
    @Body() dto: CreateCourtDto,
  ) {
    return this.courtsService.create(effectiveOwnerId, venueId, dto);
  }

  @Get('venues/mine/:venueId/courts')
  @UseGuards(JwtAuthGuard, OwnerScopeGuard)
  @OwnerScope('full')
  findMine(
    @EffectiveOwnerId() effectiveOwnerId: string,
    @Param('venueId') venueId: string,
  ) {
    return this.courtsService.findByVenueForOwner(effectiveOwnerId, venueId);
  }

  @Patch('venues/mine/:venueId/courts/:id')
  @UseGuards(JwtAuthGuard, OwnerScopeGuard)
  @OwnerScope('full')
  update(
    @EffectiveOwnerId() effectiveOwnerId: string,
    @Param('venueId') venueId: string,
    @Param('id') id: string,
    @Body() dto: UpdateCourtDto,
  ) {
    return this.courtsService.update(effectiveOwnerId, venueId, id, dto);
  }

  @Delete('venues/mine/:venueId/courts/:id')
  @UseGuards(JwtAuthGuard, OwnerScopeGuard)
  @OwnerScope('full')
  remove(
    @EffectiveOwnerId() effectiveOwnerId: string,
    @Param('venueId') venueId: string,
    @Param('id') id: string,
  ) {
    return this.courtsService.remove(effectiveOwnerId, venueId, id);
  }

  @Post('venues/mine/:venueId/courts/:courtId/images')
  @UseGuards(JwtAuthGuard, OwnerScopeGuard)
  @OwnerScope('full')
  @UseInterceptors(FileInterceptor('file', courtImageUploadOptions))
  addImage(
    @EffectiveOwnerId() effectiveOwnerId: string,
    @Param('venueId') venueId: string,
    @Param('courtId') courtId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('Vui lòng chọn file ảnh');
    }
    return this.courtsService.addImage(effectiveOwnerId, venueId, courtId, file);
  }

  @Delete('venues/mine/:venueId/courts/:courtId/images/:imageId')
  @UseGuards(JwtAuthGuard, OwnerScopeGuard)
  @OwnerScope('full')
  removeImage(
    @EffectiveOwnerId() effectiveOwnerId: string,
    @Param('venueId') venueId: string,
    @Param('courtId') courtId: string,
    @Param('imageId') imageId: string,
  ) {
    return this.courtsService.removeImage(effectiveOwnerId, venueId, courtId, imageId);
  }

  @Get('courts/:id/slots')
  getSlots(@Param('id') id: string, @Query('date') date: string) {
    return this.courtsService.getSlotsForDate(id, date);
  }
}
```

- [ ] **Step 2: Run the full suite**

Run: `cd apps/api && npm test && npm run test:e2e`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/courts/courts.controller.ts
git commit -m "refactor(api): courts controller uses OwnerScopeGuard (full tier)"
```

---

### Task 9: Roll out `OwnerScopeGuard` — Pricing + Recurring Schedules (`full` tier)

**Files:**
- Modify: `apps/api/src/pricing/pricing.controller.ts`
- Modify: `apps/api/src/recurring-schedules/recurring-schedules.controller.ts`

**Interfaces:**
- Consumes: same as Task 7. The spec (§4 table) groups these two as one row — same tier, same rollout mechanics.

- [ ] **Step 1: Edit `apps/api/src/pricing/pricing.controller.ts`**

Replace the imports:

```ts
import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OwnerScopeGuard } from '../auth/guards/owner-scope.guard';
import { OwnerScope } from '../auth/decorators/owner-scope.decorator';
import { EffectiveOwnerId } from '../auth/decorators/effective-owner-id.decorator';
import { PricingService } from './pricing.service';
import { CreatePricingRuleDto } from './dto/create-pricing-rule.dto';
import { UpdatePricingRuleDto } from './dto/update-pricing-rule.dto';
```

Replace the class body:

```ts
@Controller()
export class PricingController {
  constructor(private readonly pricingService: PricingService) {}

  @Post('venues/mine/:venueId/courts/:courtId/pricing-rules')
  @UseGuards(JwtAuthGuard, OwnerScopeGuard)
  @OwnerScope('full')
  create(
    @EffectiveOwnerId() effectiveOwnerId: string,
    @Param('venueId') venueId: string,
    @Param('courtId') courtId: string,
    @Body() dto: CreatePricingRuleDto,
  ) {
    return this.pricingService.create(effectiveOwnerId, venueId, courtId, dto);
  }

  @Get('venues/mine/:venueId/pricing-summary')
  @UseGuards(JwtAuthGuard, OwnerScopeGuard)
  @OwnerScope('full')
  getSummary(
    @EffectiveOwnerId() effectiveOwnerId: string,
    @Param('venueId') venueId: string,
    @Query('courtId') courtId?: string,
  ) {
    return this.pricingService.getSummary(effectiveOwnerId, venueId, courtId);
  }

  @Get('venues/mine/:venueId/courts/:courtId/pricing-rules')
  @UseGuards(JwtAuthGuard, OwnerScopeGuard)
  @OwnerScope('full')
  findByCourt(
    @EffectiveOwnerId() effectiveOwnerId: string,
    @Param('venueId') venueId: string,
    @Param('courtId') courtId: string,
  ) {
    return this.pricingService.findByCourt(effectiveOwnerId, venueId, courtId);
  }

  @Patch('venues/mine/:venueId/courts/:courtId/pricing-rules/:id')
  @UseGuards(JwtAuthGuard, OwnerScopeGuard)
  @OwnerScope('full')
  update(
    @EffectiveOwnerId() effectiveOwnerId: string,
    @Param('venueId') venueId: string,
    @Param('courtId') courtId: string,
    @Param('id') id: string,
    @Body() dto: UpdatePricingRuleDto,
  ) {
    return this.pricingService.update(effectiveOwnerId, venueId, courtId, id, dto);
  }

  @Delete('venues/mine/:venueId/courts/:courtId/pricing-rules/:id')
  @UseGuards(JwtAuthGuard, OwnerScopeGuard)
  @OwnerScope('full')
  remove(
    @EffectiveOwnerId() effectiveOwnerId: string,
    @Param('venueId') venueId: string,
    @Param('courtId') courtId: string,
    @Param('id') id: string,
  ) {
    return this.pricingService.remove(effectiveOwnerId, venueId, courtId, id);
  }

  @Post('venues/mine/:venueId/courts/:courtId/pricing-rules/copy-from/:sourceCourtId')
  @UseGuards(JwtAuthGuard, OwnerScopeGuard)
  @OwnerScope('full')
  copyFrom(
    @EffectiveOwnerId() effectiveOwnerId: string,
    @Param('venueId') venueId: string,
    @Param('courtId') courtId: string,
    @Param('sourceCourtId') sourceCourtId: string,
  ) {
    return this.pricingService.copyFrom(effectiveOwnerId, venueId, courtId, sourceCourtId);
  }

  @Post('venues/mine/:venueId/pricing-rules/copy-from-venue/:sourceVenueId')
  @UseGuards(JwtAuthGuard, OwnerScopeGuard)
  @OwnerScope('full')
  copyFromVenue(
    @EffectiveOwnerId() effectiveOwnerId: string,
    @Param('venueId') venueId: string,
    @Param('sourceVenueId') sourceVenueId: string,
  ) {
    return this.pricingService.copyFromVenue(effectiveOwnerId, venueId, sourceVenueId);
  }
}
```

- [ ] **Step 2: Edit `apps/api/src/recurring-schedules/recurring-schedules.controller.ts`**

Replace the imports:

```ts
import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OwnerScopeGuard } from '../auth/guards/owner-scope.guard';
import { OwnerScope } from '../auth/decorators/owner-scope.decorator';
import { EffectiveOwnerId } from '../auth/decorators/effective-owner-id.decorator';
import { RecurringSchedulesService } from './recurring-schedules.service';
import { CreateRecurringScheduleDto } from './dto/create-recurring-schedule.dto';
import { UpdateRecurringScheduleDto } from './dto/update-recurring-schedule.dto';
```

Replace the class body:

```ts
@Controller()
export class RecurringSchedulesController {
  constructor(private readonly recurringSchedulesService: RecurringSchedulesService) {}

  @Post('venues/mine/:venueId/recurring-schedules')
  @UseGuards(JwtAuthGuard, OwnerScopeGuard)
  @OwnerScope('full')
  create(
    @EffectiveOwnerId() effectiveOwnerId: string,
    @Param('venueId') venueId: string,
    @Body() dto: CreateRecurringScheduleDto,
  ) {
    return this.recurringSchedulesService.create(effectiveOwnerId, venueId, dto);
  }

  @Get('venues/mine/:venueId/recurring-schedules')
  @UseGuards(JwtAuthGuard, OwnerScopeGuard)
  @OwnerScope('full')
  findAll(
    @EffectiveOwnerId() effectiveOwnerId: string,
    @Param('venueId') venueId: string,
  ) {
    return this.recurringSchedulesService.findByVenueForOwner(effectiveOwnerId, venueId);
  }

  @Get('venues/mine/:venueId/recurring-schedules/:id')
  @UseGuards(JwtAuthGuard, OwnerScopeGuard)
  @OwnerScope('full')
  findOne(
    @EffectiveOwnerId() effectiveOwnerId: string,
    @Param('venueId') venueId: string,
    @Param('id') id: string,
  ) {
    return this.recurringSchedulesService.findByIdForOwner(effectiveOwnerId, venueId, id);
  }

  @Post('venues/mine/:venueId/recurring-schedules/:id/cancel')
  @UseGuards(JwtAuthGuard, OwnerScopeGuard)
  @OwnerScope('full')
  cancel(
    @EffectiveOwnerId() effectiveOwnerId: string,
    @Param('venueId') venueId: string,
    @Param('id') id: string,
  ) {
    return this.recurringSchedulesService.cancel(effectiveOwnerId, venueId, id);
  }

  @Post('venues/mine/:venueId/recurring-schedules/:id/pause')
  @UseGuards(JwtAuthGuard, OwnerScopeGuard)
  @OwnerScope('full')
  pause(
    @EffectiveOwnerId() effectiveOwnerId: string,
    @Param('venueId') venueId: string,
    @Param('id') id: string,
  ) {
    return this.recurringSchedulesService.pause(effectiveOwnerId, venueId, id);
  }

  @Post('venues/mine/:venueId/recurring-schedules/:id/resume')
  @UseGuards(JwtAuthGuard, OwnerScopeGuard)
  @OwnerScope('full')
  resume(
    @EffectiveOwnerId() effectiveOwnerId: string,
    @Param('venueId') venueId: string,
    @Param('id') id: string,
  ) {
    return this.recurringSchedulesService.resume(effectiveOwnerId, venueId, id);
  }

  @Patch('venues/mine/:venueId/recurring-schedules/:id')
  @UseGuards(JwtAuthGuard, OwnerScopeGuard)
  @OwnerScope('full')
  update(
    @EffectiveOwnerId() effectiveOwnerId: string,
    @Param('venueId') venueId: string,
    @Param('id') id: string,
    @Body() dto: UpdateRecurringScheduleDto,
  ) {
    return this.recurringSchedulesService.update(effectiveOwnerId, venueId, id, dto);
  }
}
```

- [ ] **Step 3: Run the full suite**

Run: `cd apps/api && npm test && npm run test:e2e`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/pricing/pricing.controller.ts apps/api/src/recurring-schedules/recurring-schedules.controller.ts
git commit -m "refactor(api): pricing and recurring-schedules controllers use OwnerScopeGuard (full tier)"
```

---

### Task 10: Roll out `OwnerScopeGuard` — Bookings owner-facing endpoints (`operational` tier)

**Files:**
- Modify: `apps/api/src/bookings/bookings.controller.ts`
- Test: `apps/api/test/bookings.e2e-spec.ts` (existing, must still pass), extend with one new test

**Interfaces:**
- Consumes: same as Task 7. Only the 3 owner-facing endpoints (`findForVenue`, `createForVenue`, `cancelForVenue`) change — the 4 customer-facing endpoints (`@Roles(UserRole.CUSTOMER)`) and the public `getAvailability` are untouched, so `RolesGuard`/`Roles`/`CurrentUser`/`AuthenticatedUser`/`UserRole` imports stay.

- [ ] **Step 1: Write the failing e2e test**

`apps/api/test/bookings.e2e-spec.ts` already defines local `createActiveUserAndLogin(email, role)` and `createActiveVenueAndCourt(ownerId, cancellationCutoffHours = 2)` helpers (lines 29–79ish) and imports `User, UserRole, UserStatus` from `'../src/users/entities/user.entity'` (line 6). Change that import line to also pull in `StaffRole`:

```ts
import { StaffRole, User, UserRole, UserStatus } from '../src/users/entities/user.entity';
```

Then add this test inside the top-level `describe('Bookings (e2e)', ...)` block, alongside the other `it(...)` cases:

```ts
  it('lets a cashier staff create and cancel an owner-facing booking (operational tier)', async () => {
    const owner = await createActiveUserAndLogin('bookingsowner-staff@test.com', UserRole.OWNER);
    const { venueId, courtId } = await createActiveVenueAndCourt(owner.userId);
    const passwordHash = await bcrypt.hash('password123', 10);
    const usersRepo = dataSource.getRepository(User);
    await usersRepo.save(
      usersRepo.create({
        fullName: 'Cashier',
        phone: '0911000010',
        email: null,
        passwordHash,
        role: UserRole.STAFF,
        ownerId: owner.userId,
        staffRole: StaffRole.CASHIER,
        status: UserStatus.ACTIVE,
        emailVerified: false,
      }),
    );
    const cashierLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ identifier: '0911000010', password: 'password123' });
    const cashierToken = cashierLogin.body.accessToken as string;

    const createResponse = await request(app.getHttpServer())
      .post(`/venues/mine/${venueId}/bookings`)
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({ courtId, date: '2099-03-01', startTime: '08:00', endTime: '09:00' })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/venues/mine/${venueId}/bookings/${createResponse.body.id}/cancel`)
      .set('Authorization', `Bearer ${cashierToken}`)
      .expect(201);
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/api && npm run test:e2e -- bookings\.e2e`
Expected: FAIL — 403, since the endpoint still requires `role === 'owner'` exactly.

- [ ] **Step 3: Swap the guard on the 3 owner-facing endpoints only**

Edit `apps/api/src/bookings/bookings.controller.ts`. Add to the imports (don't remove any existing ones — `RolesGuard`/`Roles`/`CurrentUser`/`AuthenticatedUser`/`UserRole` are still used by the customer-facing endpoints below):

```ts
import { OwnerScopeGuard } from '../auth/guards/owner-scope.guard';
import { OwnerScope } from '../auth/decorators/owner-scope.decorator';
import { EffectiveOwnerId } from '../auth/decorators/effective-owner-id.decorator';
```

Replace these three methods:

```ts
  @Get('venues/mine/:venueId/bookings')
  @UseGuards(JwtAuthGuard, OwnerScopeGuard)
  @OwnerScope('operational')
  findForVenue(
    @EffectiveOwnerId() effectiveOwnerId: string,
    @Param('venueId') venueId: string,
    @Query('date') date?: string,
    @Query('courtId') courtId?: string,
  ) {
    return this.bookingsService.findByVenueForOwner(effectiveOwnerId, venueId, {
      date,
      courtId,
    });
  }

  @Post('venues/mine/:venueId/bookings')
  @UseGuards(JwtAuthGuard, OwnerScopeGuard)
  @OwnerScope('operational')
  createForVenue(
    @EffectiveOwnerId() effectiveOwnerId: string,
    @Param('venueId') venueId: string,
    @Body() dto: CreateOwnerBookingDto,
  ) {
    return this.bookingsService.createForOwner(effectiveOwnerId, venueId, dto);
  }

  @Post('venues/mine/:venueId/bookings/:id/cancel')
  @UseGuards(JwtAuthGuard, OwnerScopeGuard)
  @OwnerScope('operational')
  cancelForVenue(
    @EffectiveOwnerId() effectiveOwnerId: string,
    @Param('venueId') venueId: string,
    @Param('id') id: string,
  ) {
    return this.bookingsService.cancelByOwner(effectiveOwnerId, venueId, id);
  }
```

(Leave `create`, `findMine`, `findMineById`, `cancelMine`, and `getAvailability` exactly as they are.)

- [ ] **Step 4: Run the bookings e2e tests**

Run: `cd apps/api && npm run test:e2e -- bookings`
Expected: PASS (`bookings.e2e-spec.ts` and `bookings-pricing.e2e-spec.ts`).

- [ ] **Step 5: Run the full suite**

Run: `cd apps/api && npm test && npm run test:e2e`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/bookings/bookings.controller.ts apps/api/test/bookings.e2e-spec.ts
git commit -m "refactor(api): owner-facing bookings endpoints use OwnerScopeGuard (operational tier)"
```

---

### Task 11: Roll out `OwnerScopeGuard` — Payments (`operational` tier)

**Files:**
- Modify: `apps/api/src/payments/payments.controller.ts`
- Test: `apps/api/test/payments.e2e-spec.ts` (existing, must still pass), extend with one new test

- [ ] **Step 1: Write the failing e2e test**

Add to `apps/api/test/payments.e2e-spec.ts`, reusing `createActiveUserAndLogin`/`createActiveVenueAndCourt` already defined in that file:

```ts
  it('lets a cashier staff mark a booking paid (operational tier)', async () => {
    const owner = await createActiveUserAndLogin('payowner-staff@test.com', UserRole.OWNER);
    const { venueId, courtId } = await createActiveVenueAndCourt(owner.userId);
    const passwordHash = await bcrypt.hash('password123', 10);
    const usersRepo = dataSource.getRepository(User);
    await usersRepo.save(
      usersRepo.create({
        fullName: 'Cashier',
        phone: '0911000009',
        email: null,
        passwordHash,
        role: UserRole.STAFF,
        ownerId: owner.userId,
        staffRole: StaffRole.CASHIER,
        status: UserStatus.ACTIVE,
        emailVerified: false,
      }),
    );
    const cashierLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ identifier: '0911000009', password: 'password123' });
    const cashierToken = cashierLogin.body.accessToken as string;

    const customer = await createActiveUserAndLogin('paycustomer-staff@test.com', UserRole.CUSTOMER);
    const bookingResponse = await request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ courtId, date: '2099-04-01', startTime: '08:00', endTime: '09:00' })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/venues/mine/${venueId}/bookings/${bookingResponse.body.id}/payment/mark-paid`)
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({ note: 'Tiền mặt' })
      .expect(201);
  });
```

Add `StaffRole` to the `user.entity` import at the top of the file.

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/api && npm run test:e2e -- payments`
Expected: FAIL — 403.

- [ ] **Step 3: Swap the guard**

Edit `apps/api/src/payments/payments.controller.ts`. Replace the imports:

```ts
import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OwnerScopeGuard } from '../auth/guards/owner-scope.guard';
import { OwnerScope } from '../auth/decorators/owner-scope.decorator';
import { EffectiveOwnerId } from '../auth/decorators/effective-owner-id.decorator';
import { PaymentsService } from './payments.service';
import { MarkPaymentDto } from './dto/mark-payment.dto';
```

Replace the class body:

```ts
@Controller()
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('venues/mine/:venueId/bookings/:id/payment/mark-paid')
  @UseGuards(JwtAuthGuard, OwnerScopeGuard)
  @OwnerScope('operational')
  markPaid(
    @EffectiveOwnerId() effectiveOwnerId: string,
    @Param('venueId') venueId: string,
    @Param('id') id: string,
    @Body() dto: MarkPaymentDto,
  ) {
    return this.paymentsService.markPaid(effectiveOwnerId, venueId, id, dto.note);
  }

  @Post('venues/mine/:venueId/bookings/:id/payment/mark-refunded')
  @UseGuards(JwtAuthGuard, OwnerScopeGuard)
  @OwnerScope('operational')
  markRefunded(
    @EffectiveOwnerId() effectiveOwnerId: string,
    @Param('venueId') venueId: string,
    @Param('id') id: string,
    @Body() dto: MarkPaymentDto,
  ) {
    return this.paymentsService.markRefunded(
      effectiveOwnerId,
      venueId,
      id,
      dto.note,
    );
  }
}
```

- [ ] **Step 4: Run the full suite**

Run: `cd apps/api && npm test && npm run test:e2e`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/payments/payments.controller.ts apps/api/test/payments.e2e-spec.ts
git commit -m "refactor(api): payments controller uses OwnerScopeGuard (operational tier)"
```

---

### Task 12: Roll out `OwnerScopeGuard` — Customers (`operational` tier)

**Files:**
- Modify: `apps/api/src/customers/customers.controller.ts`

- [ ] **Step 1: Edit the file**

Replace the imports:

```ts
import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OwnerScopeGuard } from '../auth/guards/owner-scope.guard';
import { OwnerScope } from '../auth/decorators/owner-scope.decorator';
import { EffectiveOwnerId } from '../auth/decorators/effective-owner-id.decorator';
import { CustomersService } from './customers.service';
import { ListCustomersDto } from './dto/list-customers.dto';
```

Replace the class:

```ts
@Controller('customers')
@UseGuards(JwtAuthGuard, OwnerScopeGuard)
@OwnerScope('operational')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get('summary')
  getSummary(@EffectiveOwnerId() effectiveOwnerId: string, @Query('venueId') venueId?: string) {
    return this.customersService.getSummary(effectiveOwnerId, venueId);
  }

  @Get()
  list(@EffectiveOwnerId() effectiveOwnerId: string, @Query() query: ListCustomersDto) {
    return this.customersService.listCustomers(effectiveOwnerId, query);
  }

  @Get(':kind/:id')
  detail(
    @EffectiveOwnerId() effectiveOwnerId: string,
    @Param('kind') kind: string,
    @Param('id') id: string,
  ) {
    return this.customersService.getCustomerDetail(effectiveOwnerId, kind, id);
  }
}
```

- [ ] **Step 2: Run the full suite**

Run: `cd apps/api && npm test && npm run test:e2e`
Expected: PASS (`customers-list`, `customers-detail`, `customers-summary` e2e specs still pass unmodified — they all log in as `role: owner`, which still resolves to `full` ⊇ `operational`).

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/customers/customers.controller.ts
git commit -m "refactor(api): customers controller uses OwnerScopeGuard (operational tier)"
```

---

### Task 13: Roll out `OwnerScopeGuard` — Customer Contacts (`operational` tier)

**Files:**
- Modify: `apps/api/src/customer-contacts/customer-contacts.controller.ts`

- [ ] **Step 1: Edit the file**

Replace the imports:

```ts
import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OwnerScopeGuard } from '../auth/guards/owner-scope.guard';
import { OwnerScope } from '../auth/decorators/owner-scope.decorator';
import { EffectiveOwnerId } from '../auth/decorators/effective-owner-id.decorator';
import { CustomerContactsService } from './customer-contacts.service';
import { NewCustomerDto } from './dto/customer-selector.dto';
```

Replace the class:

```ts
@Controller('customer-contacts')
@UseGuards(JwtAuthGuard, OwnerScopeGuard)
@OwnerScope('operational')
export class CustomerContactsController {
  constructor(private readonly customerContactsService: CustomerContactsService) {}

  @Post()
  create(@EffectiveOwnerId() effectiveOwnerId: string, @Body() dto: NewCustomerDto) {
    return this.customerContactsService.create(effectiveOwnerId, dto);
  }
}
```

- [ ] **Step 2: Run the full suite**

Run: `cd apps/api && npm test && npm run test:e2e`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/customer-contacts/customer-contacts.controller.ts
git commit -m "refactor(api): customer-contacts controller uses OwnerScopeGuard (operational tier)"
```

---

### Task 14: Roll out `OwnerScopeGuard` — Dashboard (`operational` tier)

**Files:**
- Modify: `apps/api/src/dashboard/dashboard.controller.ts`

- [ ] **Step 1: Edit the file**

Replace the imports:

```ts
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OwnerScopeGuard } from '../auth/guards/owner-scope.guard';
import { OwnerScope } from '../auth/decorators/owner-scope.decorator';
import { EffectiveOwnerId } from '../auth/decorators/effective-owner-id.decorator';
import { DashboardService } from './dashboard.service';
```

Replace the class:

```ts
@Controller('dashboard')
@UseGuards(JwtAuthGuard, OwnerScopeGuard)
@OwnerScope('operational')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('summary')
  getSummary(
    @EffectiveOwnerId() effectiveOwnerId: string,
    @Query('venueId') venueId?: string,
  ) {
    return this.dashboardService.getSummary(effectiveOwnerId, venueId);
  }
}
```

- [ ] **Step 2: Run the full suite**

Run: `cd apps/api && npm test && npm run test:e2e`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/dashboard/dashboard.controller.ts
git commit -m "refactor(api): dashboard controller uses OwnerScopeGuard (operational tier)"
```

---

### Task 15: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Full clean run**

Run: `cd apps/api && npm run lint && npm run build && npm test && npm run test:e2e`
Expected: all PASS, no lint errors, no unused imports (especially in the 9 controllers touched in Tasks 7–14 — double check `RolesGuard`/`Roles`/`UserRole` aren't left imported-but-unused in files where every usage was replaced, e.g. `venues.controller.ts`, `courts.controller.ts`, `pricing.controller.ts`, `recurring-schedules.controller.ts`, `customers.controller.ts`, `customer-contacts.controller.ts`, `dashboard.controller.ts`, `payments.controller.ts`).

- [ ] **Step 2: Manual smoke test against the dev DB**

Run: `cd apps/api && npm run start:dev` (leave running), then in another shell:

```bash
curl -s -X POST http://localhost:3001/auth/login -H "Content-Type: application/json" -d '{"identifier":"owner@demo.com","password":"demo1234"}'
```
Expected: 200 with `accessToken`/`refreshToken` (confirms the demo owner seeded by `demo.seed.ts` still logs in after the DTO rename).

```bash
OWNER_TOKEN=<paste accessToken>
curl -s -X POST http://localhost:3001/staff -H "Authorization: Bearer $OWNER_TOKEN" -H "Content-Type: application/json" -d '{"fullName":"Quản lý Demo","phone":"0900000099","staffRole":"manager","password":"demo1234"}'
curl -s -X POST http://localhost:3001/auth/login -H "Content-Type: application/json" -d '{"identifier":"0900000099","password":"demo1234"}'
```
Expected: staff created (201, JSON body with `role: "staff"`, `staffRole: "manager"`), then login by phone succeeds (200 with tokens).

Stop the dev server (Ctrl+C) once confirmed.

- [ ] **Step 3: Update the spec status**

Edit `docs/superpowers/specs/2026-08-26-staff-accounts-design.md` line 4:
```
**Trạng thái:** Đã duyệt
```
(was `Chờ review` — backend is now implemented and verified end-to-end).

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-08-26-staff-accounts-design.md
git commit -m "docs: mark staff-accounts-design as implemented"
```
