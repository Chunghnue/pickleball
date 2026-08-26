# Admin Approvals (unified owner/venue queue) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give platform admins one merged, newest-first queue of pending owners and pending venues (instead of two separate pages), with each pending venue showing its owner's current account status, optional reject reasons, and email notifications on every approve/reject decision.

**Architecture:** NestJS backend (`apps/api`, TypeORM/Postgres) + Next.js frontend (`apps/web`) BFF proxy pattern. No new tables. A new `AdminApprovalsService` aggregates the existing `UsersService.findPendingOwners()` and `VenuesService.findPendingVenues()` behind one new `GET /admin/approvals` endpoint. The existing `POST /admin/owners/:id/approve|reject` and `POST /admin/venues/:id/approve|reject` endpoints stay as the action targets, gain an optional `reason` body field, and now trigger emails via `NotificationsService`. Frontend replaces the two existing admin pages with one merged page.

**Tech Stack:** NestJS, TypeORM, Postgres, Jest (`*.spec.ts` unit tests under `src/`, `*.e2e-spec.ts` under `test/` run against a real Postgres test DB via `supertest`), Next.js App Router, React, vitest (frontend unit tests), Tailwind, shadcn/ui (`Button`, `Card`), `sonner` toasts.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-26-admin-approvals-design.md` — no DB schema changes; reject `reason` is used only to compose the email, never persisted.
- No court-level approval (existing decision from `docs/superpowers/specs/2026-08-24-courts-module-design.md` stays in force).
- Follow existing patterns exactly: thin controllers, `notify*`/`sendSafely` style in `NotificationsService`, `mockRepository`/`buildTestingModule` style in `*.service.spec.ts`, direct-repo fixture setup in `*.e2e-spec.ts`.
- Vietnamese user-facing strings (emails, UI copy), matching the rest of the codebase.
- Global `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })` is active — every DTO field must be declared with `class-validator` decorators or requests get stripped/rejected.

---

## Task 1: `NotificationsService` — owner/venue approval emails

**Files:**
- Modify: `apps/api/src/notifications/notifications.service.ts`
- Test: `apps/api/src/notifications/notifications.service.spec.ts`

**Interfaces:**
- Produces: `NotificationsService.notifyOwnerApproved({ to, fullName }): Promise<void>`, `notifyOwnerRejected({ to, fullName, reason? }): Promise<void>`, `notifyVenueApproved({ to, ownerName, venueName }): Promise<void>`, `notifyVenueRejected({ to, ownerName, venueName, reason? }): Promise<void>` — consumed by Tasks 3 and 4.

- [ ] **Step 1: Write the failing tests**

Append to `apps/api/src/notifications/notifications.service.spec.ts` (after the existing `NotificationsService.notifyPaymentRefunded` describe block, before `NotificationsService best-effort error handling`):

```ts
describe('NotificationsService.notifyOwnerApproved', () => {
  it('sends an approval email to the owner', async () => {
    const { service, mailService } = await buildTestingModule();

    await service.notifyOwnerApproved({
      to: 'owner@test.com',
      fullName: 'Nguyễn Văn A',
    });

    expect(mailService.send).toHaveBeenCalledWith(
      'owner@test.com',
      'Tài khoản chủ sân đã được duyệt',
      expect.stringContaining('Nguyễn Văn A'),
    );
  });
});

describe('NotificationsService.notifyOwnerRejected', () => {
  it('includes the reason in the email when provided', async () => {
    const { service, mailService } = await buildTestingModule();

    await service.notifyOwnerRejected({
      to: 'owner@test.com',
      fullName: 'Nguyễn Văn A',
      reason: 'Thiếu giấy phép kinh doanh',
    });

    expect(mailService.send).toHaveBeenCalledWith(
      'owner@test.com',
      'Tài khoản chủ sân đã bị từ chối',
      expect.stringContaining('Thiếu giấy phép kinh doanh'),
    );
  });

  it('omits the reason section when not provided', async () => {
    const { service, mailService } = await buildTestingModule();

    await service.notifyOwnerRejected({
      to: 'owner@test.com',
      fullName: 'Nguyễn Văn A',
    });

    const html = mailService.send.mock.calls[0][2];
    expect(html).not.toContain('Lý do');
  });
});

describe('NotificationsService.notifyVenueApproved', () => {
  it('sends an approval email naming the venue', async () => {
    const { service, mailService } = await buildTestingModule();

    await service.notifyVenueApproved({
      to: 'owner@test.com',
      ownerName: 'Nguyễn Văn A',
      venueName: 'Sân ABC',
    });

    expect(mailService.send).toHaveBeenCalledWith(
      'owner@test.com',
      'Chi nhánh đã được duyệt',
      expect.stringContaining('Sân ABC'),
    );
  });
});

describe('NotificationsService.notifyVenueRejected', () => {
  it('includes the reason in the email when provided', async () => {
    const { service, mailService } = await buildTestingModule();

    await service.notifyVenueRejected({
      to: 'owner@test.com',
      ownerName: 'Nguyễn Văn A',
      venueName: 'Sân ABC',
      reason: 'Thiếu giấy phép kinh doanh',
    });

    expect(mailService.send).toHaveBeenCalledWith(
      'owner@test.com',
      'Chi nhánh đã bị từ chối',
      expect.stringContaining('Thiếu giấy phép kinh doanh'),
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run (from `apps/api`): `npm test -- notifications.service.spec.ts`
Expected: FAIL — `service.notifyOwnerApproved is not a function` (and similarly for the other 3 methods).

- [ ] **Step 3: Implement the methods**

In `apps/api/src/notifications/notifications.service.ts`, add these interfaces after `PaymentStatusParams` (line 45) and before the `@Injectable()` class:

```ts
export interface OwnerApprovalParams {
  to: string;
  fullName: string;
}

export interface OwnerRejectionParams {
  to: string;
  fullName: string;
  reason?: string;
}

export interface VenueApprovalParams {
  to: string;
  ownerName: string;
  venueName: string;
}

export interface VenueRejectionParams {
  to: string;
  ownerName: string;
  venueName: string;
  reason?: string;
}
```

Add these 4 methods to the `NotificationsService` class, right after `notifyPaymentRefunded` (after line 87, before the `private async sendSafely` method):

```ts
  notifyOwnerApproved(params: OwnerApprovalParams): Promise<void> {
    const html = `<p>Chào ${params.fullName}, tài khoản chủ sân của bạn đã được duyệt. Bạn có thể đăng nhập và bắt đầu tạo chi nhánh.</p>`;
    return this.sendSafely(params.to, 'Tài khoản chủ sân đã được duyệt', html);
  }

  notifyOwnerRejected(params: OwnerRejectionParams): Promise<void> {
    const reasonHtml = params.reason ? `<p>Lý do: ${params.reason}</p>` : '';
    const html = `<p>Chào ${params.fullName}, tài khoản chủ sân của bạn đã bị từ chối.</p>${reasonHtml}`;
    return this.sendSafely(params.to, 'Tài khoản chủ sân đã bị từ chối', html);
  }

  notifyVenueApproved(params: VenueApprovalParams): Promise<void> {
    const html = `<p>Chào ${params.ownerName}, chi nhánh "${params.venueName}" của bạn đã được duyệt và hiển thị công khai.</p>`;
    return this.sendSafely(params.to, 'Chi nhánh đã được duyệt', html);
  }

  notifyVenueRejected(params: VenueRejectionParams): Promise<void> {
    const reasonHtml = params.reason ? `<p>Lý do: ${params.reason}</p>` : '';
    const html = `<p>Chào ${params.ownerName}, chi nhánh "${params.venueName}" của bạn đã bị từ chối.</p>${reasonHtml}`;
    return this.sendSafely(params.to, 'Chi nhánh đã bị từ chối', html);
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- notifications.service.spec.ts`
Expected: PASS (all describe blocks, including the pre-existing ones).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/notifications/notifications.service.ts apps/api/src/notifications/notifications.service.spec.ts
git commit -m "feat(notifications): add owner/venue approval and rejection emails"
```

---

## Task 2: `UsersService.findByIds`

**Files:**
- Modify: `apps/api/src/users/users.service.ts`
- Test: `apps/api/src/users/users.service.spec.ts`

**Interfaces:**
- Produces: `UsersService.findByIds(ids: string[]): Promise<User[]>` — consumed by Task 5 (`AdminApprovalsService`).

- [ ] **Step 1: Write the failing test**

This task lands together with Task 3's rewrite of `users.service.spec.ts` (that file's constructor signature is changing in Task 3 regardless, since `UsersService` gains a `NotificationsService` dependency there). To keep this task independently testable right now, add `find: jest.fn()` to the existing `mockRepository` factory and a new describe block at the end of `apps/api/src/users/users.service.spec.ts` (after the `UsersService.updateProfile` block, i.e. after line 212):

First, update the `mockRepository` factory at the top of the file (line 7-11) to include `find`:

```ts
const mockRepository = () => ({
  create: jest.fn(),
  save: jest.fn(),
  findOne: jest.fn(),
  find: jest.fn(),
});
```

Then append:

```ts
describe('UsersService.findByIds', () => {
  let service: UsersService;
  let repo: ReturnType<typeof mockRepository>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(User), useFactory: mockRepository },
      ],
    }).compile();

    service = module.get(UsersService);
    repo = module.get(getRepositoryToken(User));
  });

  it('queries users by a list of ids', async () => {
    repo.find.mockResolvedValue([{ id: 'owner-1' }, { id: 'owner-2' }]);

    const result = await service.findByIds(['owner-1', 'owner-2']);

    expect(result).toEqual([{ id: 'owner-1' }, { id: 'owner-2' }]);
  });

  it('returns an empty array without querying when given no ids', async () => {
    const result = await service.findByIds([]);

    expect(result).toEqual([]);
    expect(repo.find).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `apps/api`): `npm test -- users.service.spec.ts`
Expected: FAIL — `service.findByIds is not a function`.

- [ ] **Step 3: Implement `findByIds`**

In `apps/api/src/users/users.service.ts`, change the import on line 3 from:

```ts
import { Repository } from 'typeorm';
```

to:

```ts
import { In, Repository } from 'typeorm';
```

Then add this method right after `findById` (after line 42, before `async markVerified`):

```ts
  findByIds(ids: string[]): Promise<User[]> {
    if (ids.length === 0) {
      return Promise.resolve([]);
    }
    return this.usersRepository.find({ where: { id: In(ids) } });
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- users.service.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/users/users.service.ts apps/api/src/users/users.service.spec.ts
git commit -m "feat(users): add findByIds for batch owner lookups"
```

---

## Task 3: Wire owner approve/reject to send emails, accept a reject reason

**Files:**
- Modify: `apps/api/src/users/users.service.ts`
- Modify: `apps/api/src/users/users.module.ts`
- Create: `apps/api/src/admin/dto/reject.dto.ts`
- Modify: `apps/api/src/admin/admin.controller.ts`
- Modify: `apps/api/src/users/users.service.spec.ts` (full rewrite — see Step 1)
- Modify: `apps/api/test/admin-owners.e2e-spec.ts`

**Interfaces:**
- Consumes: `NotificationsService.notifyOwnerApproved`/`notifyOwnerRejected` (Task 1). `UsersService.findByIds` (Task 2, already present in the file from Task 2 — this task's Step 1 rewrite preserves it).
- Produces: `UsersService.approveOwner(id: string): Promise<User>` (signature unchanged), `UsersService.rejectOwner(id: string, reason?: string): Promise<User>` (new optional param) — consumed by `AdminController` in this task, and referenced (unchanged) by Task 5. `RejectDto` (`apps/api/src/admin/dto/reject.dto.ts`) — reused by Task 4's `AdminVenuesController`.

- [ ] **Step 1: Rewrite the test file with the new constructor dependency (still failing)**

`UsersService` is about to require a `NotificationsService` dependency, so every `Test.createTestingModule` block in the spec file needs a mock provider for it. Replace the entire contents of `apps/api/src/users/users.service.spec.ts` with:

```ts
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { UsersService } from './users.service';
import { User, UserRole, UserStatus } from './entities/user.entity';
import { NotificationsService } from '../notifications/notifications.service';

const mockRepository = () => ({
  create: jest.fn(),
  save: jest.fn(),
  findOne: jest.fn(),
  find: jest.fn(),
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
      { provide: NotificationsService, useFactory: mockNotificationsService },
    ],
  }).compile();

  return {
    service: module.get(UsersService),
    repo: module.get(getRepositoryToken(User)) as ReturnType<
      typeof mockRepository
    >,
    notificationsService: module.get(NotificationsService) as ReturnType<
      typeof mockNotificationsService
    >,
  };
}

describe('UsersService', () => {
  it('hashes the password and defaults status/role fields before saving', async () => {
    const { service, repo } = await buildTestingModule();
    repo.create.mockImplementation((data) => data);
    repo.save.mockImplementation((data) =>
      Promise.resolve({ id: 'user-1', ...data }),
    );

    const result = await service.create({
      email: 'a@test.com',
      password: 'plaintext-password',
      fullName: 'A B',
      role: UserRole.CUSTOMER,
    });

    expect(result.passwordHash).toBeDefined();
    expect(result.passwordHash).not.toBe('plaintext-password');
    await expect(
      bcrypt.compare('plaintext-password', result.passwordHash),
    ).resolves.toBe(true);
    expect(result.status).toBe(UserStatus.PENDING_VERIFICATION);
    expect(result.emailVerified).toBe(false);
  });
});

describe('UsersService.markVerified', () => {
  it('sets emailVerified and the given status', async () => {
    const { service, repo } = await buildTestingModule();
    repo.findOne.mockResolvedValue({
      id: 'user-1',
      emailVerified: false,
      status: UserStatus.PENDING_VERIFICATION,
    });
    repo.save.mockImplementation((data) => Promise.resolve(data));

    const result = await service.markVerified('user-1', UserStatus.ACTIVE);

    expect(result.emailVerified).toBe(true);
    expect(result.status).toBe(UserStatus.ACTIVE);
  });
});

describe('UsersService owner approval', () => {
  it('findPendingOwners returns owners awaiting approval', async () => {
    const { service, repo } = await buildTestingModule();
    repo.find.mockResolvedValue([{ id: 'owner-1' }]);

    const result = await service.findPendingOwners();

    expect(repo.find).toHaveBeenCalledWith({
      where: { role: UserRole.OWNER, status: UserStatus.PENDING_APPROVAL },
    });
    expect(result).toEqual([{ id: 'owner-1' }]);
  });

  it('approveOwner activates a pending owner and sends an approval email', async () => {
    const { service, repo, notificationsService } = await buildTestingModule();
    repo.findOne.mockResolvedValue({
      id: 'owner-1',
      email: 'owner-1@test.com',
      fullName: 'Owner One',
      role: UserRole.OWNER,
      status: UserStatus.PENDING_APPROVAL,
    });
    repo.save.mockImplementation((data) => Promise.resolve(data));

    const result = await service.approveOwner('owner-1');

    expect(result.status).toBe(UserStatus.ACTIVE);
    expect(notificationsService.notifyOwnerApproved).toHaveBeenCalledWith({
      to: 'owner-1@test.com',
      fullName: 'Owner One',
    });
  });

  it('approveOwner rejects a user that is not pending approval', async () => {
    const { service, repo } = await buildTestingModule();
    repo.findOne.mockResolvedValue({
      id: 'owner-1',
      role: UserRole.OWNER,
      status: UserStatus.ACTIVE,
    });

    await expect(service.approveOwner('owner-1')).rejects.toThrow();
  });

  it('rejectOwner marks a pending owner as rejected and sends a rejection email with the reason', async () => {
    const { service, repo, notificationsService } = await buildTestingModule();
    repo.findOne.mockResolvedValue({
      id: 'owner-1',
      email: 'owner-1@test.com',
      fullName: 'Owner One',
      role: UserRole.OWNER,
      status: UserStatus.PENDING_APPROVAL,
    });
    repo.save.mockImplementation((data) => Promise.resolve(data));

    const result = await service.rejectOwner(
      'owner-1',
      'Thiếu giấy phép kinh doanh',
    );

    expect(result.status).toBe(UserStatus.REJECTED);
    expect(notificationsService.notifyOwnerRejected).toHaveBeenCalledWith({
      to: 'owner-1@test.com',
      fullName: 'Owner One',
      reason: 'Thiếu giấy phép kinh doanh',
    });
  });
});

describe('UsersService.updatePassword', () => {
  it('hashes and saves the new password', async () => {
    const { service, repo } = await buildTestingModule();
    repo.findOne.mockResolvedValue({ id: 'user-1', passwordHash: 'old-hash' });
    repo.save.mockImplementation((data) => Promise.resolve(data));

    await service.updatePassword('user-1', 'brand-new-password');

    const saved = await repo.save.mock.results[0].value;
    expect(saved.passwordHash).not.toBe('old-hash');
    await expect(
      bcrypt.compare('brand-new-password', saved.passwordHash),
    ).resolves.toBe(true);
  });
});

describe('UsersService.updateProfile', () => {
  it('updates only the provided fields', async () => {
    const { service, repo } = await buildTestingModule();
    repo.findOne.mockResolvedValue({
      id: 'user-1',
      fullName: 'Old Name',
      phone: '0900000000',
      avatarUrl: null,
    });
    repo.save.mockImplementation((data) => Promise.resolve(data));

    const result = await service.updateProfile('user-1', {
      fullName: 'New Name',
    });

    expect(result.fullName).toBe('New Name');
    expect(result.phone).toBe('0900000000');
  });
});

describe('UsersService.findByIds', () => {
  it('queries users by a list of ids', async () => {
    const { service, repo } = await buildTestingModule();
    repo.find.mockResolvedValue([{ id: 'owner-1' }, { id: 'owner-2' }]);

    const result = await service.findByIds(['owner-1', 'owner-2']);

    expect(result).toEqual([{ id: 'owner-1' }, { id: 'owner-2' }]);
  });

  it('returns an empty array without querying when given no ids', async () => {
    const { service, repo } = await buildTestingModule();

    const result = await service.findByIds([]);

    expect(result).toEqual([]);
    expect(repo.find).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify the owner-approval ones fail**

Run (from `apps/api`): `npm test -- users.service.spec.ts`
Expected: FAIL — `Nest can't resolve dependencies of the UsersService` is avoided because the mock provider is now present, but `approveOwner activates a pending owner and sends an approval email` and `rejectOwner marks a pending owner as rejected and sends a rejection email with the reason` FAIL because `notifyOwnerApproved`/`notifyOwnerRejected` are never called yet (service doesn't have `notificationsService` wired in).

- [ ] **Step 3: Wire `UsersService` to `NotificationsService`**

Replace the entire contents of `apps/api/src/users/users.service.ts` with:

```ts
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User, UserRole, UserStatus } from './entities/user.entity';
import { NotificationsService } from '../notifications/notifications.service';

export interface CreateUserInput {
  email: string;
  password: string;
  fullName: string;
  phone?: string;
  role: UserRole;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly notificationsService: NotificationsService,
  ) {}

  async create(input: CreateUserInput): Promise<User> {
    const passwordHash = await bcrypt.hash(input.password, 10);
    const user = this.usersRepository.create({
      email: input.email,
      passwordHash,
      fullName: input.fullName,
      phone: input.phone ?? null,
      role: input.role,
      status: UserStatus.PENDING_VERIFICATION,
      emailVerified: false,
    });
    return this.usersRepository.save(user);
  }

  findByEmail(email: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { email } });
  }

  findById(id: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { id } });
  }

  findByIds(ids: string[]): Promise<User[]> {
    if (ids.length === 0) {
      return Promise.resolve([]);
    }
    return this.usersRepository.find({ where: { id: In(ids) } });
  }

  async markVerified(userId: string, nextStatus: UserStatus): Promise<User> {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new Error(`User ${userId} not found`);
    }
    user.emailVerified = true;
    user.status = nextStatus;
    return this.usersRepository.save(user);
  }

  findPendingOwners(): Promise<User[]> {
    return this.usersRepository.find({
      where: { role: UserRole.OWNER, status: UserStatus.PENDING_APPROVAL },
    });
  }

  approveOwner(id: string): Promise<User> {
    return this.transitionOwnerStatus(id, UserStatus.ACTIVE);
  }

  rejectOwner(id: string, reason?: string): Promise<User> {
    return this.transitionOwnerStatus(id, UserStatus.REJECTED, reason);
  }

  private async transitionOwnerStatus(
    id: string,
    nextStatus: UserStatus,
    reason?: string,
  ): Promise<User> {
    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user || user.role !== UserRole.OWNER) {
      throw new NotFoundException(`Owner ${id} not found`);
    }
    if (user.status !== UserStatus.PENDING_APPROVAL) {
      throw new BadRequestException(
        'Chỉ có thể duyệt/từ chối tài khoản đang chờ duyệt',
      );
    }
    user.status = nextStatus;
    const saved = await this.usersRepository.save(user);
    if (nextStatus === UserStatus.ACTIVE) {
      await this.notificationsService.notifyOwnerApproved({
        to: saved.email,
        fullName: saved.fullName,
      });
    } else {
      await this.notificationsService.notifyOwnerRejected({
        to: saved.email,
        fullName: saved.fullName,
        reason,
      });
    }
    return saved;
  }

  async updatePassword(userId: string, newPassword: string): Promise<void> {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`User ${userId} not found`);
    }
    user.passwordHash = await bcrypt.hash(newPassword, 10);
    await this.usersRepository.save(user);
  }

  async updateProfile(
    userId: string,
    updates: { fullName?: string; phone?: string; avatarUrl?: string },
  ): Promise<User> {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`User ${userId} not found`);
    }
    if (updates.fullName !== undefined) user.fullName = updates.fullName;
    if (updates.phone !== undefined) user.phone = updates.phone;
    if (updates.avatarUrl !== undefined) user.avatarUrl = updates.avatarUrl;
    return this.usersRepository.save(user);
  }
}
```

Now update `apps/api/src/users/users.module.ts` so `NotificationsService` can be injected. Replace its contents with:

```ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [TypeOrmModule.forFeature([User]), NotificationsModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- users.service.spec.ts`
Expected: PASS (all describe blocks).

- [ ] **Step 5: Add `RejectDto` and wire it into `AdminController`**

Create `apps/api/src/admin/dto/reject.dto.ts`:

```ts
import { IsOptional, IsString } from 'class-validator';

export class RejectDto {
  @IsOptional()
  @IsString()
  reason?: string;
}
```

Replace the contents of `apps/api/src/admin/admin.controller.ts` with:

```ts
import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { RejectDto } from './dto/reject.dto';

@Controller('admin/owners')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminController {
  constructor(private readonly usersService: UsersService) {}

  @Get('pending')
  findPending() {
    return this.usersService.findPendingOwners();
  }

  @Post(':id/approve')
  approve(@Param('id') id: string) {
    return this.usersService.approveOwner(id);
  }

  @Post(':id/reject')
  reject(@Param('id') id: string, @Body() dto: RejectDto) {
    return this.usersService.rejectOwner(id, dto.reason);
  }
}
```

- [ ] **Step 6: Extend the owner-approval e2e test with email assertions**

In `apps/api/test/admin-owners.e2e-spec.ts`, change the `beforeEach` block (lines 15-18) from:

```ts
  beforeEach(async () => {
    await clearDatabase(app);
    mockMailService.sendVerificationEmail.mockClear();
  });
```

to:

```ts
  beforeEach(async () => {
    await clearDatabase(app);
    mockMailService.sendVerificationEmail.mockClear();
    mockMailService.send.mockClear();
  });
```

Then add these two tests at the end of the file, right before the closing `});` on line 137:

```ts
  it('sends an approval email when approving an owner', async () => {
    await registerVerifiedOwner('approve-email@test.com');
    const adminToken = await createAdminAndLogin();
    const dataSource = app.get(DataSource);
    const owner = await dataSource
      .getRepository(User)
      .findOneOrFail({ where: { email: 'approve-email@test.com' } });

    await request(app.getHttpServer())
      .post(`/admin/owners/${owner.id}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);

    const call = mockMailService.send.mock.calls.find(
      ([to]) => to === 'approve-email@test.com',
    );
    expect(call).toBeDefined();
  });

  it('sends a rejection email containing the reason when rejecting an owner', async () => {
    await registerVerifiedOwner('reject-with-reason@test.com');
    const adminToken = await createAdminAndLogin();
    const dataSource = app.get(DataSource);
    const owner = await dataSource
      .getRepository(User)
      .findOneOrFail({ where: { email: 'reject-with-reason@test.com' } });

    await request(app.getHttpServer())
      .post(`/admin/owners/${owner.id}/reject`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'Thiếu giấy phép kinh doanh' })
      .expect(201);

    const call = mockMailService.send.mock.calls.find(
      ([to]) => to === 'reject-with-reason@test.com',
    );
    expect(call).toBeDefined();
    expect(call![2]).toContain('Thiếu giấy phép kinh doanh');
  });
```

- [ ] **Step 7: Run the e2e test to verify it passes**

Run (from `apps/api`, requires the test Postgres DB running — same as any other e2e run in this repo): `npm run test:e2e -- admin-owners.e2e-spec.ts`
Expected: PASS (all tests in the file, including the 2 new ones).

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/users/users.service.ts apps/api/src/users/users.module.ts apps/api/src/users/users.service.spec.ts apps/api/src/admin/dto/reject.dto.ts apps/api/src/admin/admin.controller.ts apps/api/test/admin-owners.e2e-spec.ts
git commit -m "feat(admin): send owner approval/rejection emails, accept optional reject reason"
```

---

## Task 4: Wire venue approve/reject to send emails, accept a reject reason

**Files:**
- Modify: `apps/api/src/courts/venues.service.ts`
- Modify: `apps/api/src/courts/courts.module.ts`
- Modify: `apps/api/src/admin/admin-venues.controller.ts`
- Modify: `apps/api/src/courts/venues.service.spec.ts` (full rewrite — see Step 1)
- Create: `apps/api/test/admin-venues.e2e-spec.ts`

**Interfaces:**
- Consumes: `UsersService.findById(id): Promise<User | null>` (existing), `NotificationsService.notifyVenueApproved`/`notifyVenueRejected` (Task 1), `RejectDto` (Task 3, `apps/api/src/admin/dto/reject.dto.ts`).
- Produces: `VenuesService.approveVenue(id: string): Promise<Venue>` (signature unchanged), `VenuesService.rejectVenue(id: string, reason?: string): Promise<Venue>` (new optional param) — consumed by Task 5 (`AdminApprovalsService`, via `findPendingVenues`, unaffected) and this task's `AdminVenuesController`.

- [ ] **Step 1: Rewrite the test file with the new constructor dependencies (still failing)**

`VenuesService` is about to require `UsersService` and `NotificationsService` dependencies. Replace the entire contents of `apps/api/src/courts/venues.service.spec.ts` with:

```ts
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { VenuesService } from './venues.service';
import { Venue, VenueStatus } from './entities/venue.entity';
import { VenueImage } from './entities/venue-image.entity';
import { UsersService } from '../users/users.service';
import { NotificationsService } from '../notifications/notifications.service';

const mockVenuesRepository = () => ({
  create: jest.fn(),
  save: jest.fn(),
  findOne: jest.fn(),
  find: jest.fn(),
});

const mockVenueImagesRepository = () => ({
  create: jest.fn(),
  save: jest.fn(),
  findOne: jest.fn(),
  remove: jest.fn(),
  find: jest.fn(),
});

const mockUsersService = () => ({
  findById: jest.fn(),
});

const mockNotificationsService = () => ({
  notifyVenueApproved: jest.fn().mockResolvedValue(undefined),
  notifyVenueRejected: jest.fn().mockResolvedValue(undefined),
});

async function buildTestingModule() {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      VenuesService,
      { provide: getRepositoryToken(Venue), useFactory: mockVenuesRepository },
      {
        provide: getRepositoryToken(VenueImage),
        useFactory: mockVenueImagesRepository,
      },
      { provide: UsersService, useFactory: mockUsersService },
      { provide: NotificationsService, useFactory: mockNotificationsService },
    ],
  }).compile();

  return {
    service: module.get(VenuesService),
    venuesRepo: module.get(getRepositoryToken(Venue)) as ReturnType<
      typeof mockVenuesRepository
    >,
    venueImagesRepo: module.get(getRepositoryToken(VenueImage)) as ReturnType<
      typeof mockVenueImagesRepository
    >,
    usersService: module.get(UsersService) as ReturnType<
      typeof mockUsersService
    >,
    notificationsService: module.get(NotificationsService) as ReturnType<
      typeof mockNotificationsService
    >,
  };
}

describe('VenuesService.create', () => {
  it('creates a venue with pending_approval status', async () => {
    const { service, venuesRepo } = await buildTestingModule();
    venuesRepo.create.mockImplementation((data) => data);
    venuesRepo.save.mockImplementation((data) =>
      Promise.resolve({ id: 'venue-1', ...data }),
    );

    const result = await service.create('owner-1', {
      name: 'ABC Pickleball',
      address: '123 Le Loi',
      city: 'Ho Chi Minh',
    });

    expect(result.ownerId).toBe('owner-1');
    expect(result.status).toBe(VenueStatus.PENDING_APPROVAL);
  });
});

describe('VenuesService.getOwnedVenueOrThrow', () => {
  it('returns the venue when owned by the caller', async () => {
    const { service, venuesRepo } = await buildTestingModule();
    venuesRepo.findOne.mockResolvedValue({ id: 'venue-1', ownerId: 'owner-1' });

    const result = await service.getOwnedVenueOrThrow('owner-1', 'venue-1');

    expect(result.id).toBe('venue-1');
  });

  it('throws NotFoundException when the venue does not exist', async () => {
    const { service, venuesRepo } = await buildTestingModule();
    venuesRepo.findOne.mockResolvedValue(null);

    await expect(
      service.getOwnedVenueOrThrow('owner-1', 'venue-1'),
    ).rejects.toThrow('Venue venue-1 không tồn tại');
  });

  it('throws ForbiddenException when owned by someone else', async () => {
    const { service, venuesRepo } = await buildTestingModule();
    venuesRepo.findOne.mockResolvedValue({ id: 'venue-1', ownerId: 'owner-2' });

    await expect(
      service.getOwnedVenueOrThrow('owner-1', 'venue-1'),
    ).rejects.toThrow('Bạn không có quyền truy cập venue này');
  });
});

describe('VenuesService.update', () => {
  it('updates only the provided fields', async () => {
    const { service, venuesRepo } = await buildTestingModule();
    venuesRepo.findOne.mockResolvedValue({
      id: 'venue-1',
      ownerId: 'owner-1',
      name: 'Old Name',
      address: 'Old Address',
      city: 'Old City',
      description: null,
    });
    venuesRepo.save.mockImplementation((data) => Promise.resolve(data));

    const result = await service.update('owner-1', 'venue-1', {
      name: 'New Name',
    });

    expect(result.name).toBe('New Name');
    expect(result.address).toBe('Old Address');
  });

  it('updates cancellationCutoffHours when provided', async () => {
    const { service, venuesRepo } = await buildTestingModule();
    venuesRepo.findOne.mockResolvedValue({
      id: 'venue-1',
      ownerId: 'owner-1',
      name: 'Old Name',
      address: 'Old Address',
      city: 'Old City',
      description: null,
      cancellationCutoffHours: 2,
    });
    venuesRepo.save.mockImplementation((data) => Promise.resolve(data));

    const result = await service.update('owner-1', 'venue-1', {
      cancellationCutoffHours: 4,
    });

    expect(result.cancellationCutoffHours).toBe(4);
  });
});

describe('VenuesService images', () => {
  it('addImage creates an image for an owned venue', async () => {
    const { service, venuesRepo, venueImagesRepo } = await buildTestingModule();
    venuesRepo.findOne.mockResolvedValue({ id: 'venue-1', ownerId: 'owner-1' });
    venueImagesRepo.create.mockImplementation((data) => data);
    venueImagesRepo.save.mockImplementation((data) =>
      Promise.resolve({ id: 'image-1', ...data }),
    );

    const result = await service.addImage('owner-1', 'venue-1', {
      url: 'https://example.com/a.jpg',
    });

    expect(result.venueId).toBe('venue-1');
    expect(result.url).toBe('https://example.com/a.jpg');
  });

  it('removeImage deletes an image belonging to an owned venue', async () => {
    const { service, venuesRepo, venueImagesRepo } = await buildTestingModule();
    venuesRepo.findOne.mockResolvedValue({ id: 'venue-1', ownerId: 'owner-1' });
    venueImagesRepo.findOne.mockResolvedValue({ id: 'image-1', venueId: 'venue-1' });

    await service.removeImage('owner-1', 'venue-1', 'image-1');

    expect(venueImagesRepo.remove).toHaveBeenCalledWith({
      id: 'image-1',
      venueId: 'venue-1',
    });
  });

  it('removeImage throws NotFoundException when the image does not exist', async () => {
    const { service, venuesRepo, venueImagesRepo } = await buildTestingModule();
    venuesRepo.findOne.mockResolvedValue({ id: 'venue-1', ownerId: 'owner-1' });
    venueImagesRepo.findOne.mockResolvedValue(null);

    await expect(
      service.removeImage('owner-1', 'venue-1', 'image-1'),
    ).rejects.toThrow('Ảnh image-1 không tồn tại');
  });
});

describe('VenuesService approval', () => {
  it('approveVenue activates a pending venue and sends an approval email', async () => {
    const { service, venuesRepo, usersService, notificationsService } =
      await buildTestingModule();
    venuesRepo.findOne.mockResolvedValue({
      id: 'venue-1',
      name: 'ABC Pickleball',
      ownerId: 'owner-1',
      status: VenueStatus.PENDING_APPROVAL,
    });
    venuesRepo.save.mockImplementation((data) => Promise.resolve(data));
    usersService.findById.mockResolvedValue({
      id: 'owner-1',
      email: 'owner-1@test.com',
      fullName: 'Owner One',
    });

    const result = await service.approveVenue('venue-1');

    expect(result.status).toBe(VenueStatus.ACTIVE);
    expect(notificationsService.notifyVenueApproved).toHaveBeenCalledWith({
      to: 'owner-1@test.com',
      ownerName: 'Owner One',
      venueName: 'ABC Pickleball',
    });
  });

  it('approveVenue rejects a venue that is not pending approval', async () => {
    const { service, venuesRepo } = await buildTestingModule();
    venuesRepo.findOne.mockResolvedValue({
      id: 'venue-1',
      status: VenueStatus.ACTIVE,
    });

    await expect(service.approveVenue('venue-1')).rejects.toThrow();
  });

  it('rejectVenue marks a pending venue as rejected and sends a rejection email with the reason', async () => {
    const { service, venuesRepo, usersService, notificationsService } =
      await buildTestingModule();
    venuesRepo.findOne.mockResolvedValue({
      id: 'venue-1',
      name: 'ABC Pickleball',
      ownerId: 'owner-1',
      status: VenueStatus.PENDING_APPROVAL,
    });
    venuesRepo.save.mockImplementation((data) => Promise.resolve(data));
    usersService.findById.mockResolvedValue({
      id: 'owner-1',
      email: 'owner-1@test.com',
      fullName: 'Owner One',
    });

    const result = await service.rejectVenue('venue-1', 'Thiếu giấy phép');

    expect(result.status).toBe(VenueStatus.REJECTED);
    expect(notificationsService.notifyVenueRejected).toHaveBeenCalledWith({
      to: 'owner-1@test.com',
      ownerName: 'Owner One',
      venueName: 'ABC Pickleball',
      reason: 'Thiếu giấy phép',
    });
  });

  it('findPendingVenues queries by pending_approval status', async () => {
    const { service, venuesRepo } = await buildTestingModule();
    venuesRepo.find.mockResolvedValue([{ id: 'venue-1' }]);

    const result = await service.findPendingVenues();

    expect(venuesRepo.find).toHaveBeenCalledWith({
      where: { status: VenueStatus.PENDING_APPROVAL },
    });
    expect(result).toEqual([{ id: 'venue-1' }]);
  });
});
```

- [ ] **Step 2: Run tests to verify the approval ones fail**

Run (from `apps/api`): `npm test -- venues.service.spec.ts`
Expected: FAIL — `approveVenue activates a pending venue and sends an approval email` and `rejectVenue marks a pending venue as rejected and sends a rejection email with the reason` fail because the service doesn't call `notificationsService` yet.

- [ ] **Step 3: Wire `VenuesService` to `UsersService` and `NotificationsService`**

Replace the entire contents of `apps/api/src/courts/venues.service.ts` with:

```ts
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import { Venue, VenueStatus } from './entities/venue.entity';
import { VenueImage } from './entities/venue-image.entity';
import { CreateVenueDto } from './dto/create-venue.dto';
import { UpdateVenueDto } from './dto/update-venue.dto';
import { AddVenueImageDto } from './dto/add-venue-image.dto';
import { UsersService } from '../users/users.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class VenuesService {
  constructor(
    @InjectRepository(Venue)
    private readonly venuesRepository: Repository<Venue>,
    @InjectRepository(VenueImage)
    private readonly venueImagesRepository: Repository<VenueImage>,
    private readonly usersService: UsersService,
    private readonly notificationsService: NotificationsService,
  ) {}

  create(ownerId: string, dto: CreateVenueDto): Promise<Venue> {
    const venue = this.venuesRepository.create({
      ownerId,
      name: dto.name,
      address: dto.address,
      city: dto.city,
      description: dto.description ?? null,
      status: VenueStatus.PENDING_APPROVAL,
    });
    return this.venuesRepository.save(venue);
  }

  findMineByOwner(ownerId: string): Promise<Venue[]> {
    return this.venuesRepository.find({ where: { ownerId } });
  }

  findMineById(ownerId: string, id: string): Promise<Venue> {
    return this.getOwnedVenueOrThrow(ownerId, id);
  }

  async update(
    ownerId: string,
    id: string,
    dto: UpdateVenueDto,
  ): Promise<Venue> {
    const venue = await this.getOwnedVenueOrThrow(ownerId, id);
    if (dto.name !== undefined) venue.name = dto.name;
    if (dto.address !== undefined) venue.address = dto.address;
    if (dto.city !== undefined) venue.city = dto.city;
    if (dto.description !== undefined) venue.description = dto.description;
    if (dto.cancellationCutoffHours !== undefined) {
      venue.cancellationCutoffHours = dto.cancellationCutoffHours;
    }
    return this.venuesRepository.save(venue);
  }

  async addImage(
    ownerId: string,
    venueId: string,
    dto: AddVenueImageDto,
  ): Promise<VenueImage> {
    await this.getOwnedVenueOrThrow(ownerId, venueId);
    const image = this.venueImagesRepository.create({
      venueId,
      url: dto.url,
    });
    return this.venueImagesRepository.save(image);
  }

  async removeImage(
    ownerId: string,
    venueId: string,
    imageId: string,
  ): Promise<void> {
    await this.getOwnedVenueOrThrow(ownerId, venueId);
    const image = await this.venueImagesRepository.findOne({
      where: { id: imageId, venueId },
    });
    if (!image) {
      throw new NotFoundException(`Ảnh ${imageId} không tồn tại`);
    }
    await this.venueImagesRepository.remove(image);
  }

  findImagesByVenue(venueId: string): Promise<VenueImage[]> {
    return this.venueImagesRepository.find({ where: { venueId } });
  }

  async getOwnedVenueOrThrow(
    ownerId: string,
    venueId: string,
  ): Promise<Venue> {
    const venue = await this.venuesRepository.findOne({
      where: { id: venueId },
    });
    if (!venue) {
      throw new NotFoundException(`Venue ${venueId} không tồn tại`);
    }
    if (venue.ownerId !== ownerId) {
      throw new ForbiddenException('Bạn không có quyền truy cập venue này');
    }
    return venue;
  }

  async findByIdOrThrow(id: string): Promise<Venue> {
    const venue = await this.venuesRepository.findOne({ where: { id } });
    if (!venue) {
      throw new NotFoundException(`Venue ${id} không tồn tại`);
    }
    return venue;
  }

  findPendingVenues(): Promise<Venue[]> {
    return this.venuesRepository.find({
      where: { status: VenueStatus.PENDING_APPROVAL },
    });
  }

  approveVenue(id: string): Promise<Venue> {
    return this.transitionStatus(id, VenueStatus.ACTIVE);
  }

  rejectVenue(id: string, reason?: string): Promise<Venue> {
    return this.transitionStatus(id, VenueStatus.REJECTED, reason);
  }

  private async transitionStatus(
    id: string,
    nextStatus: VenueStatus,
    reason?: string,
  ): Promise<Venue> {
    const venue = await this.venuesRepository.findOne({ where: { id } });
    if (!venue) {
      throw new NotFoundException(`Venue ${id} không tồn tại`);
    }
    if (venue.status !== VenueStatus.PENDING_APPROVAL) {
      throw new BadRequestException(
        'Chỉ có thể duyệt/từ chối venue đang chờ duyệt',
      );
    }
    venue.status = nextStatus;
    const saved = await this.venuesRepository.save(venue);
    const owner = await this.usersService.findById(saved.ownerId);
    if (owner) {
      if (nextStatus === VenueStatus.ACTIVE) {
        await this.notificationsService.notifyVenueApproved({
          to: owner.email,
          ownerName: owner.fullName,
          venueName: saved.name,
        });
      } else {
        await this.notificationsService.notifyVenueRejected({
          to: owner.email,
          ownerName: owner.fullName,
          venueName: saved.name,
          reason,
        });
      }
    }
    return saved;
  }

  searchPublic(query?: string): Promise<Venue[]> {
    if (!query) {
      return this.venuesRepository.find({
        where: { status: VenueStatus.ACTIVE },
      });
    }
    return this.venuesRepository.find({
      where: [
        { status: VenueStatus.ACTIVE, name: ILike(`%${query}%`) },
        { status: VenueStatus.ACTIVE, address: ILike(`%${query}%`) },
        { status: VenueStatus.ACTIVE, city: ILike(`%${query}%`) },
      ],
    });
  }

  async findPublicById(id: string): Promise<Venue> {
    const venue = await this.venuesRepository.findOne({
      where: { id, status: VenueStatus.ACTIVE },
    });
    if (!venue) {
      throw new NotFoundException(`Venue ${id} không tồn tại`);
    }
    return venue;
  }
}
```

Now update `apps/api/src/courts/courts.module.ts` so `UsersService` and `NotificationsService` can be injected. Replace its contents with:

```ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Venue } from './entities/venue.entity';
import { VenueImage } from './entities/venue-image.entity';
import { Court } from './entities/court.entity';
import { VenuesService } from './venues.service';
import { CourtsService } from './courts.service';
import { VenuesController } from './venues.controller';
import { CourtsController } from './courts.controller';
import { UsersModule } from '../users/users.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Venue, VenueImage, Court]),
    UsersModule,
    NotificationsModule,
  ],
  controllers: [VenuesController, CourtsController],
  providers: [VenuesService, CourtsService],
  exports: [VenuesService, CourtsService],
})
export class CourtsModule {}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- venues.service.spec.ts`
Expected: PASS (all describe blocks).

- [ ] **Step 5: Wire `RejectDto` into `AdminVenuesController`**

Replace the contents of `apps/api/src/admin/admin-venues.controller.ts` with:

```ts
import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { VenuesService } from '../courts/venues.service';
import { RejectDto } from './dto/reject.dto';

@Controller('admin/venues')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminVenuesController {
  constructor(private readonly venuesService: VenuesService) {}

  @Get('pending')
  findPending() {
    return this.venuesService.findPendingVenues();
  }

  @Post(':id/approve')
  approve(@Param('id') id: string) {
    return this.venuesService.approveVenue(id);
  }

  @Post(':id/reject')
  reject(@Param('id') id: string, @Body() dto: RejectDto) {
    return this.venuesService.rejectVenue(id, dto.reason);
  }
}
```

- [ ] **Step 6: Write the venue-approval e2e test**

There is no existing e2e file for `admin/venues` — only `admin-owners.e2e-spec.ts` exists as a pattern to mirror. Create `apps/api/test/admin-venues.e2e-spec.ts`:

```ts
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { createTestApp, clearDatabase, mockMailService } from './utils/test-app';
import { User, UserRole, UserStatus } from '../src/users/entities/user.entity';
import { Venue, VenueStatus } from '../src/courts/entities/venue.entity';

describe('Admin venue approval (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
  });

  beforeEach(async () => {
    await clearDatabase(app);
    mockMailService.sendVerificationEmail.mockClear();
    mockMailService.send.mockClear();
  });

  afterAll(async () => {
    await app.close();
  });

  async function createAdminAndLogin(): Promise<string> {
    const passwordHash = await bcrypt.hash('adminpass123', 10);
    const repo = dataSource.getRepository(User);
    await repo.save(
      repo.create({
        email: 'admin@test.com',
        passwordHash,
        fullName: 'Admin',
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
        emailVerified: true,
      }),
    );
    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@test.com', password: 'adminpass123' });
    return loginResponse.body.accessToken as string;
  }

  async function createOwnerWithPendingVenue(
    ownerEmail: string,
    venueName: string,
  ): Promise<{ ownerId: string; venueId: string }> {
    const passwordHash = await bcrypt.hash('password123', 10);
    const usersRepo = dataSource.getRepository(User);
    const owner = await usersRepo.save(
      usersRepo.create({
        email: ownerEmail,
        passwordHash,
        fullName: `Owner ${ownerEmail}`,
        role: UserRole.OWNER,
        status: UserStatus.ACTIVE,
        emailVerified: true,
      }),
    );
    const venuesRepo = dataSource.getRepository(Venue);
    const venue = await venuesRepo.save(
      venuesRepo.create({
        ownerId: owner.id,
        name: venueName,
        address: '123 Le Loi',
        city: 'Ho Chi Minh',
        status: VenueStatus.PENDING_APPROVAL,
      }),
    );
    return { ownerId: owner.id, venueId: venue.id };
  }

  it('lists pending venues for an admin', async () => {
    await createOwnerWithPendingVenue('owner1@test.com', 'Sân ABC');
    const adminToken = await createAdminAndLogin();

    const response = await request(app.getHttpServer())
      .get('/admin/venues/pending')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(response.body).toHaveLength(1);
    expect(response.body[0]).toMatchObject({ name: 'Sân ABC' });
  });

  it('approves a venue, sends an approval email, and makes it publicly visible', async () => {
    const { venueId } = await createOwnerWithPendingVenue(
      'owner2@test.com',
      'Sân XYZ',
    );
    const adminToken = await createAdminAndLogin();

    await request(app.getHttpServer())
      .post(`/admin/venues/${venueId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);

    const call = mockMailService.send.mock.calls.find(
      ([to]) => to === 'owner2@test.com',
    );
    expect(call).toBeDefined();

    await request(app.getHttpServer())
      .get(`/venues/${venueId}`)
      .expect(200);
  });

  it('rejects a venue with a reason and sends a rejection email containing it', async () => {
    const { venueId } = await createOwnerWithPendingVenue(
      'owner3@test.com',
      'Sân DEF',
    );
    const adminToken = await createAdminAndLogin();

    await request(app.getHttpServer())
      .post(`/admin/venues/${venueId}/reject`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'Thiếu giấy phép kinh doanh' })
      .expect(201);

    const call = mockMailService.send.mock.calls.find(
      ([to]) => to === 'owner3@test.com',
    );
    expect(call).toBeDefined();
    expect(call![2]).toContain('Thiếu giấy phép kinh doanh');
  });

  it('rejects a non-admin active user with 403', async () => {
    await request(app.getHttpServer()).post('/auth/register').send({
      email: 'customer@test.com',
      password: 'password123',
      fullName: 'Customer',
    });
    const call = mockMailService.sendVerificationEmail.mock.calls.find(
      ([to]) => to === 'customer@test.com',
    );
    await request(app.getHttpServer())
      .get('/auth/verify-email')
      .query({ token: call![1] });
    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'customer@test.com', password: 'password123' });

    await request(app.getHttpServer())
      .get('/admin/venues/pending')
      .set('Authorization', `Bearer ${loginResponse.body.accessToken}`)
      .expect(403);
  });

  it('rejects unauthenticated access with 401', async () => {
    await request(app.getHttpServer())
      .get('/admin/venues/pending')
      .expect(401);
  });
});
```

- [ ] **Step 7: Run the e2e test to verify it passes**

Run (from `apps/api`): `npm run test:e2e -- admin-venues.e2e-spec.ts`
Expected: PASS (all 6 tests).

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/courts/venues.service.ts apps/api/src/courts/courts.module.ts apps/api/src/courts/venues.service.spec.ts apps/api/src/admin/admin-venues.controller.ts apps/api/test/admin-venues.e2e-spec.ts
git commit -m "feat(admin): send venue approval/rejection emails, accept optional reject reason"
```

---

## Task 5: `AdminApprovalsService` — merge and enrich pending owners + venues

**Files:**
- Create: `apps/api/src/admin/admin-approvals.service.ts`
- Test: `apps/api/src/admin/admin-approvals.service.spec.ts`

**Interfaces:**
- Consumes: `UsersService.findPendingOwners(): Promise<User[]>`, `UsersService.findByIds(ids: string[]): Promise<User[]>` (Task 2), `VenuesService.findPendingVenues(): Promise<Venue[]>` (all pre-existing/Task 2, unchanged signatures).
- Produces: `AdminApprovalsService.findAll(): Promise<PendingApprovalRow[]>`, exported types `PendingOwnerRow`, `PendingVenueRow`, `PendingApprovalRow` — consumed by Task 6 (`AdminApprovalsController`).

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/admin/admin-approvals.service.spec.ts`:

```ts
import { Test, TestingModule } from '@nestjs/testing';
import { AdminApprovalsService } from './admin-approvals.service';
import { UsersService } from '../users/users.service';
import { VenuesService } from '../courts/venues.service';
import { UserStatus } from '../users/entities/user.entity';

const mockUsersService = () => ({
  findPendingOwners: jest.fn(),
  findByIds: jest.fn(),
});

const mockVenuesService = () => ({
  findPendingVenues: jest.fn(),
});

async function buildTestingModule() {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      AdminApprovalsService,
      { provide: UsersService, useFactory: mockUsersService },
      { provide: VenuesService, useFactory: mockVenuesService },
    ],
  }).compile();

  return {
    service: module.get(AdminApprovalsService),
    usersService: module.get(UsersService) as ReturnType<
      typeof mockUsersService
    >,
    venuesService: module.get(VenuesService) as ReturnType<
      typeof mockVenuesService
    >,
  };
}

describe('AdminApprovalsService.findAll', () => {
  it('merges pending owners and venues, sorted by submittedAt descending', async () => {
    const { service, usersService, venuesService } = await buildTestingModule();
    usersService.findPendingOwners.mockResolvedValue([
      {
        id: 'owner-1',
        fullName: 'Owner One',
        email: 'owner-1@test.com',
        phone: null,
        createdAt: new Date('2026-08-20T00:00:00Z'),
      },
    ]);
    venuesService.findPendingVenues.mockResolvedValue([
      {
        id: 'venue-1',
        name: 'ABC Pickleball',
        address: '123 Le Loi',
        city: 'Ho Chi Minh',
        ownerId: 'owner-2',
        createdAt: new Date('2026-08-25T00:00:00Z'),
      },
    ]);
    usersService.findByIds.mockResolvedValue([
      { id: 'owner-2', fullName: 'Owner Two', status: UserStatus.ACTIVE },
    ]);

    const result = await service.findAll();

    expect(usersService.findByIds).toHaveBeenCalledWith(['owner-2']);
    expect(result).toEqual([
      {
        type: 'venue',
        id: 'venue-1',
        name: 'ABC Pickleball',
        address: '123 Le Loi',
        city: 'Ho Chi Minh',
        submittedAt: new Date('2026-08-25T00:00:00Z'),
        owner: {
          id: 'owner-2',
          fullName: 'Owner Two',
          status: UserStatus.ACTIVE,
        },
      },
      {
        type: 'owner',
        id: 'owner-1',
        fullName: 'Owner One',
        email: 'owner-1@test.com',
        phone: null,
        submittedAt: new Date('2026-08-20T00:00:00Z'),
      },
    ]);
  });

  it('reflects a pending owner status on their venue row when the owner is also pending', async () => {
    const { service, usersService, venuesService } = await buildTestingModule();
    usersService.findPendingOwners.mockResolvedValue([]);
    venuesService.findPendingVenues.mockResolvedValue([
      {
        id: 'venue-1',
        name: 'ABC Pickleball',
        address: '123 Le Loi',
        city: 'Ho Chi Minh',
        ownerId: 'owner-1',
        createdAt: new Date('2026-08-25T00:00:00Z'),
      },
    ]);
    usersService.findByIds.mockResolvedValue([
      {
        id: 'owner-1',
        fullName: 'Owner One',
        status: UserStatus.PENDING_APPROVAL,
      },
    ]);

    const result = await service.findAll();

    expect(result[0]).toMatchObject({
      type: 'venue',
      owner: {
        id: 'owner-1',
        fullName: 'Owner One',
        status: UserStatus.PENDING_APPROVAL,
      },
    });
  });

  it('returns an empty array when nothing is pending', async () => {
    const { service, usersService, venuesService } = await buildTestingModule();
    usersService.findPendingOwners.mockResolvedValue([]);
    venuesService.findPendingVenues.mockResolvedValue([]);
    usersService.findByIds.mockResolvedValue([]);

    const result = await service.findAll();

    expect(result).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `apps/api`): `npm test -- admin-approvals.service.spec.ts`
Expected: FAIL — `Cannot find module './admin-approvals.service'`.

- [ ] **Step 3: Implement `AdminApprovalsService`**

Create `apps/api/src/admin/admin-approvals.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { VenuesService } from '../courts/venues.service';
import { UserStatus } from '../users/entities/user.entity';

export interface PendingOwnerRow {
  type: 'owner';
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  submittedAt: Date;
}

export interface PendingVenueRow {
  type: 'venue';
  id: string;
  name: string;
  address: string;
  city: string;
  submittedAt: Date;
  owner: {
    id: string;
    fullName: string;
    status: UserStatus;
  };
}

export type PendingApprovalRow = PendingOwnerRow | PendingVenueRow;

@Injectable()
export class AdminApprovalsService {
  constructor(
    private readonly usersService: UsersService,
    private readonly venuesService: VenuesService,
  ) {}

  async findAll(): Promise<PendingApprovalRow[]> {
    const [pendingOwners, pendingVenues] = await Promise.all([
      this.usersService.findPendingOwners(),
      this.venuesService.findPendingVenues(),
    ]);

    const owners = await this.usersService.findByIds(
      pendingVenues.map((venue) => venue.ownerId),
    );
    const ownersById = new Map(owners.map((owner) => [owner.id, owner]));

    const ownerRows: PendingOwnerRow[] = pendingOwners.map((owner) => ({
      type: 'owner',
      id: owner.id,
      fullName: owner.fullName,
      email: owner.email,
      phone: owner.phone,
      submittedAt: owner.createdAt,
    }));

    const venueRows: PendingVenueRow[] = pendingVenues.map((venue) => {
      // owner is guaranteed to exist (FK constraint on venues.owner_id)
      const owner = ownersById.get(venue.ownerId)!;
      return {
        type: 'venue',
        id: venue.id,
        name: venue.name,
        address: venue.address,
        city: venue.city,
        submittedAt: venue.createdAt,
        owner: {
          id: owner.id,
          fullName: owner.fullName,
          status: owner.status,
        },
      };
    });

    return [...ownerRows, ...venueRows].sort(
      (a, b) => b.submittedAt.getTime() - a.submittedAt.getTime(),
    );
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- admin-approvals.service.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/admin/admin-approvals.service.ts apps/api/src/admin/admin-approvals.service.spec.ts
git commit -m "feat(admin): add AdminApprovalsService merging pending owners and venues"
```

---

## Task 6: `GET /admin/approvals` endpoint

**Files:**
- Create: `apps/api/src/admin/admin-approvals.controller.ts`
- Modify: `apps/api/src/admin/admin.module.ts`
- Create: `apps/api/test/admin-approvals.e2e-spec.ts`

**Interfaces:**
- Consumes: `AdminApprovalsService.findAll()` (Task 5).
- Produces: `GET /admin/approvals` (admin-only) — consumed by Task 7 (frontend proxy route).

- [ ] **Step 1: Write the failing e2e test**

Create `apps/api/test/admin-approvals.e2e-spec.ts`:

```ts
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { createTestApp, clearDatabase, mockMailService } from './utils/test-app';
import { User, UserRole, UserStatus } from '../src/users/entities/user.entity';
import { Venue, VenueStatus } from '../src/courts/entities/venue.entity';

describe('Admin approvals - merged queue (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
  });

  beforeEach(async () => {
    await clearDatabase(app);
    mockMailService.sendVerificationEmail.mockClear();
    mockMailService.send.mockClear();
  });

  afterAll(async () => {
    await app.close();
  });

  async function createAdminAndLogin(): Promise<string> {
    const passwordHash = await bcrypt.hash('adminpass123', 10);
    const repo = dataSource.getRepository(User);
    await repo.save(
      repo.create({
        email: 'admin@test.com',
        passwordHash,
        fullName: 'Admin',
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
        emailVerified: true,
      }),
    );
    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@test.com', password: 'adminpass123' });
    return loginResponse.body.accessToken as string;
  }

  async function createOwner(
    email: string,
    status: UserStatus,
  ): Promise<string> {
    const passwordHash = await bcrypt.hash('password123', 10);
    const repo = dataSource.getRepository(User);
    const owner = await repo.save(
      repo.create({
        email,
        passwordHash,
        fullName: `Owner ${email}`,
        role: UserRole.OWNER,
        status,
        emailVerified: true,
      }),
    );
    return owner.id;
  }

  async function createVenue(
    ownerId: string,
    name: string,
    status: VenueStatus,
  ): Promise<string> {
    const repo = dataSource.getRepository(Venue);
    const venue = await repo.save(
      repo.create({
        ownerId,
        name,
        address: '123 Le Loi',
        city: 'Ho Chi Minh',
        status,
      }),
    );
    return venue.id;
  }

  it('merges pending owners and venues, showing owner status on venue rows', async () => {
    const activeOwnerId = await createOwner(
      'active-owner@test.com',
      UserStatus.ACTIVE,
    );
    await createVenue(
      activeOwnerId,
      'Venue Of Active Owner',
      VenueStatus.PENDING_APPROVAL,
    );
    await createOwner('pending-owner@test.com', UserStatus.PENDING_APPROVAL);
    const adminToken = await createAdminAndLogin();

    const response = await request(app.getHttpServer())
      .get('/admin/approvals')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(response.body).toHaveLength(2);
    const venueRow = response.body.find((row: { type: string }) => row.type === 'venue');
    const ownerRow = response.body.find((row: { type: string }) => row.type === 'owner');
    expect(venueRow).toMatchObject({
      name: 'Venue Of Active Owner',
      owner: { status: 'active' },
    });
    expect(ownerRow).toMatchObject({ email: 'pending-owner@test.com' });
  });

  it('rejects a non-admin active user with 403', async () => {
    await request(app.getHttpServer()).post('/auth/register').send({
      email: 'customer@test.com',
      password: 'password123',
      fullName: 'Customer',
    });
    const call = mockMailService.sendVerificationEmail.mock.calls.find(
      ([to]) => to === 'customer@test.com',
    );
    await request(app.getHttpServer())
      .get('/auth/verify-email')
      .query({ token: call![1] });
    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'customer@test.com', password: 'password123' });

    await request(app.getHttpServer())
      .get('/admin/approvals')
      .set('Authorization', `Bearer ${loginResponse.body.accessToken}`)
      .expect(403);
  });

  it('rejects unauthenticated access with 401', async () => {
    await request(app.getHttpServer()).get('/admin/approvals').expect(401);
  });
});
```

- [ ] **Step 2: Run the e2e test to verify it fails**

Run (from `apps/api`): `npm run test:e2e -- admin-approvals.e2e-spec.ts`
Expected: FAIL — `404 Not Found` for `GET /admin/approvals` (route doesn't exist yet).

- [ ] **Step 3: Implement the controller and register it**

Create `apps/api/src/admin/admin-approvals.controller.ts`:

```ts
import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { AdminApprovalsService } from './admin-approvals.service';

@Controller('admin/approvals')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminApprovalsController {
  constructor(private readonly adminApprovalsService: AdminApprovalsService) {}

  @Get()
  findAll() {
    return this.adminApprovalsService.findAll();
  }
}
```

Replace the contents of `apps/api/src/admin/admin.module.ts` with:

```ts
import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { CourtsModule } from '../courts/courts.module';
import { AdminController } from './admin.controller';
import { AdminVenuesController } from './admin-venues.controller';
import { AdminApprovalsController } from './admin-approvals.controller';
import { AdminApprovalsService } from './admin-approvals.service';

@Module({
  imports: [UsersModule, CourtsModule],
  controllers: [AdminController, AdminVenuesController, AdminApprovalsController],
  providers: [AdminApprovalsService],
})
export class AdminModule {}
```

- [ ] **Step 4: Run the e2e test to verify it passes**

Run: `npm run test:e2e -- admin-approvals.e2e-spec.ts`
Expected: PASS (all 3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/admin/admin-approvals.controller.ts apps/api/src/admin/admin.module.ts apps/api/test/admin-approvals.e2e-spec.ts
git commit -m "feat(admin): add GET /admin/approvals merged queue endpoint"
```

---

## Task 7: Frontend proxy routes

**Files:**
- Create: `apps/web/src/app/api/admin/approvals/route.ts`
- Modify: `apps/web/src/app/api/admin/owners/[id]/reject/route.ts`
- Modify: `apps/web/src/app/api/admin/venues/[id]/reject/route.ts`
- Delete: `apps/web/src/app/api/admin/owners/pending/route.ts`
- Delete: `apps/web/src/app/api/admin/venues/pending/route.ts`

**Interfaces:**
- Consumes: `GET /admin/approvals`, `POST /admin/owners/:id/reject`, `POST /admin/venues/:id/reject` (backend, Tasks 3/4/6).
- Produces: `GET /api/admin/approvals`, `POST /api/admin/owners/:id/reject` (now forwards `{ reason? }` body), `POST /api/admin/venues/:id/reject` (same) — consumed by Task 8's frontend page.

There's no unit test coverage for proxy routes elsewhere in this codebase (they're thin pass-throughs, verified via the page that calls them in Task 8), so this task has no test step of its own — Task 8's manual verification covers it end-to-end.

- [ ] **Step 1: Add the merged-queue proxy route**

Create `apps/web/src/app/api/admin/approvals/route.ts`:

```ts
import { fetchApi } from '@/lib/fetch-api';
import { toNextResponse } from '@/lib/proxy-response';

export async function GET() {
  const upstream = await fetchApi('/admin/approvals');
  return toNextResponse(upstream);
}
```

- [ ] **Step 2: Forward the reject reason body**

Replace `apps/web/src/app/api/admin/owners/[id]/reject/route.ts` with:

```ts
import { fetchApi } from '@/lib/fetch-api';
import { toNextResponse } from '@/lib/proxy-response';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const upstream = await fetchApi(`/admin/owners/${id}/reject`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return toNextResponse(upstream);
}
```

Replace `apps/web/src/app/api/admin/venues/[id]/reject/route.ts` with:

```ts
import { fetchApi } from '@/lib/fetch-api';
import { toNextResponse } from '@/lib/proxy-response';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const upstream = await fetchApi(`/admin/venues/${id}/reject`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return toNextResponse(upstream);
}
```

- [ ] **Step 3: Remove the now-unused pending-list proxy routes**

Delete `apps/web/src/app/api/admin/owners/pending/route.ts` and `apps/web/src/app/api/admin/venues/pending/route.ts` (Task 8 removes the pages that were their only callers; `GET /admin/approvals` replaces both).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/api/admin/approvals/route.ts apps/web/src/app/api/admin/owners/[id]/reject/route.ts apps/web/src/app/api/admin/venues/[id]/reject/route.ts
git rm apps/web/src/app/api/admin/owners/pending/route.ts apps/web/src/app/api/admin/venues/pending/route.ts
git commit -m "feat(web): add merged approvals proxy route, forward reject reason"
```

---

## Task 8: Merged admin approvals page

**Files:**
- Create: `apps/web/src/app/admin/approvals/page.tsx`
- Delete: `apps/web/src/app/admin/owners/page.tsx`
- Delete: `apps/web/src/app/admin/venues/page.tsx`
- Modify: `apps/web/src/components/admin-nav.tsx`
- Modify: `apps/web/src/lib/route-protection.ts`
- Modify: `apps/web/src/app/login/page.tsx`
- Modify: `apps/web/src/lib/route-protection.test.ts`

**Interfaces:**
- Consumes: `GET /api/admin/approvals`, `POST /api/admin/owners/:id/approve|reject`, `POST /api/admin/venues/:id/approve|reject` (Task 7).

- [ ] **Step 1: Update the test to exercise the new admin path**

`resolveRedirect(pathname, token)` only checks whether `pathname`'s prefix matches the token's role (redirecting to `ROLE_HOME[role]` on mismatch) — the specific `/admin/*` path doesn't affect the assertions, so this step just moves the test's example path from the page being deleted (`/admin/owners`) to the one replacing it (`/admin/approvals`), keeping the same expected outcomes. In `apps/web/src/lib/route-protection.test.ts`, change lines 23-29 from:

```ts
  it('lets a matching role through', () => {
    expect(resolveRedirect('/admin/owners', makeToken('admin'))).toBeNull();
  });

  it('redirects a mismatched role to their own home', () => {
    expect(resolveRedirect('/admin/owners', makeToken('customer'))).toBe('/me');
  });
```

to:

```ts
  it('lets a matching role through', () => {
    expect(resolveRedirect('/admin/approvals', makeToken('admin'))).toBeNull();
  });

  it('redirects a mismatched role to their own home', () => {
    expect(resolveRedirect('/admin/approvals', makeToken('customer'))).toBe('/me');
  });
```

- [ ] **Step 2: Run the test to verify it still passes**

Run (from `apps/web`): `npm test -- route-protection.test.ts`
Expected: PASS — this step doesn't change `resolveRedirect`'s behavior, only which example path the test uses, so it should pass immediately. `ROLE_HOME.admin` still needs updating in Step 3 for the actual post-login redirect (used by `login/page.tsx`, not by this test) to land on the new page.

- [ ] **Step 3: Update `ROLE_HOME` in both places**

In `apps/web/src/lib/route-protection.ts`, change line 8 from:

```ts
  admin: '/admin/owners',
```

to:

```ts
  admin: '/admin/approvals',
```

In `apps/web/src/app/login/page.tsx`, change line 19 from:

```ts
  admin: "/admin/owners",
```

to:

```ts
  admin: "/admin/approvals",
```

- [ ] **Step 4: Run the test to verify it passes**

Run (from `apps/web`): `npm test -- route-protection.test.ts`
Expected: PASS.

- [ ] **Step 5: Create the merged approvals page**

Create `apps/web/src/app/admin/approvals/page.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminNav } from "@/components/admin-nav";

interface PendingOwnerRow {
  type: "owner";
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  submittedAt: string;
}

interface PendingVenueRow {
  type: "venue";
  id: string;
  name: string;
  address: string;
  city: string;
  submittedAt: string;
  owner: {
    id: string;
    fullName: string;
    status: string;
  };
}

type ApprovalRow = PendingOwnerRow | PendingVenueRow;

const OWNER_STATUS_LABELS: Record<string, string> = {
  pending_verification: "Chưa xác thực email",
  pending_approval: "Chờ duyệt",
  active: "Đã duyệt",
  rejected: "Đã từ chối",
  suspended: "Đã khoá",
};

export default function AdminApprovalsPage() {
  const router = useRouter();
  const [rows, setRows] = useState<ApprovalRow[] | null>(null);

  async function loadPending() {
    const response = await fetch("/api/admin/approvals");
    if (response.status === 401) {
      router.push("/login?returnTo=%2Fadmin%2Fapprovals");
      return;
    }
    const data = await response.json().catch(() => []);
    setRows(Array.isArray(data) ? data : []);
  }

  useEffect(() => {
    loadPending();
  }, []);

  async function handleDecision(row: ApprovalRow, action: "approve" | "reject") {
    let reason: string | undefined;
    if (action === "reject") {
      const input = window.prompt("Lý do từ chối (không bắt buộc):");
      if (input === null) return;
      reason = input.trim() || undefined;
    }

    const basePath = row.type === "owner" ? "/api/admin/owners" : "/api/admin/venues";
    const response = await fetch(`${basePath}/${row.id}/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });
    if (!response.ok) {
      toast.error("Có lỗi xảy ra, vui lòng thử lại.");
      return;
    }
    toast.success(action === "approve" ? "Đã duyệt" : "Đã từ chối");
    loadPending();
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-1 flex-col gap-6 p-8">
      <AdminNav />
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Chờ duyệt</h1>
        <Button variant="outline" onClick={handleLogout}>
          Đăng xuất
        </Button>
      </div>

      {rows === null && <p>Đang tải...</p>}
      {rows !== null && rows.length === 0 && (
        <p className="text-muted-foreground">Không có gì đang chờ duyệt.</p>
      )}

      <div className="flex flex-col gap-4">
        {rows?.map((row) => (
          <Card key={`${row.type}-${row.id}`}>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                <span className="rounded bg-muted px-2 py-0.5 text-xs font-medium uppercase text-muted-foreground">
                  {row.type === "owner" ? "Chủ sân" : "Chi nhánh"}
                </span>
                {row.type === "owner" ? row.fullName : row.name}
                {row.type === "venue" && (
                  <span className="rounded bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                    Chủ sân: {OWNER_STATUS_LABELS[row.owner.status] ?? row.owner.status}
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                {row.type === "owner" ? row.email : `${row.address}, ${row.city}`}
              </span>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => handleDecision(row, "approve")}>
                  Duyệt
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => handleDecision(row, "reject")}
                >
                  Từ chối
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </main>
  );
}
```

- [ ] **Step 6: Replace the admin nav and delete the old pages**

Replace `apps/web/src/components/admin-nav.tsx` with:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const LINKS = [{ href: "/admin/approvals", label: "Chờ duyệt" }];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="flex gap-4 border-b pb-2">
      {LINKS.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className={cn(
            "text-sm font-medium text-muted-foreground hover:text-foreground",
            pathname === link.href && "text-foreground underline",
          )}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
```

Delete `apps/web/src/app/admin/owners/page.tsx` and `apps/web/src/app/admin/venues/page.tsx`.

- [ ] **Step 7: Manually verify the page against the running backend**

Run the app per this repo's `run` workflow (backend on its usual port, frontend dev server), then:
1. Seed one pending owner and one pending venue (owned by a *different*, already-active owner) directly in the dev database, or through the normal registration + venue-creation flows.
2. Log in as the seeded admin account, confirm redirect lands on `/admin/approvals`.
3. Confirm both rows render, the venue row shows "Chủ sân: Đã duyệt" (or "Chờ duyệt" if that owner is also pending).
4. Click "Từ chối" on one row, enter a reason in the prompt, confirm the row disappears and a toast shows; check the dev mail log/output shows the reason.
5. Click "Duyệt" on the other row, confirm it disappears and a toast shows.

Expected: all 5 checks pass. Report the result before proceeding to commit.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/app/admin/approvals/page.tsx apps/web/src/components/admin-nav.tsx apps/web/src/lib/route-protection.ts apps/web/src/app/login/page.tsx apps/web/src/lib/route-protection.test.ts
git rm apps/web/src/app/admin/owners/page.tsx apps/web/src/app/admin/venues/page.tsx
git commit -m "feat(web): replace owner/venue admin pages with one merged approvals page"
```

---

## Self-Review Notes

- **Spec coverage:** §2 API (Task 3, 4, 6), §3 backend implementation incl. `findByIds` and module wiring (Task 2, 3, 4), §4 notifications (Task 1), §5 frontend incl. nav/page replacement (Task 7, 8), §6 testing — unit tests for merge/enrichment and reason-in-email (Task 3, 4, 5), e2e for merged endpoint and reason-driven emails (Task 3, 4, 6). §7 out-of-scope items (court approval, persisting reason, bulk actions, pagination, stats dashboard, dispute handling) are correctly not present in any task.
- **Type consistency:** `PendingApprovalRow`/`PendingOwnerRow`/`PendingVenueRow` (Task 5) match the JSON shape asserted in Task 6's e2e test and the frontend types in Task 8. `RejectDto` (Task 3) is reused verbatim by Task 4 rather than redefined. `rejectOwner`/`rejectVenue`/`transitionOwnerStatus`/`transitionStatus` signatures are consistent between their implementation and every call site across tasks.
- **Placeholder scan:** no TBD/TODO; every step has runnable code and exact test commands.
