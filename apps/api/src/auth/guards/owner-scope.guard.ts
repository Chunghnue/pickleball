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
