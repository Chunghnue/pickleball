import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { OwnerScopeGuard } from './owner-scope.guard';
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
