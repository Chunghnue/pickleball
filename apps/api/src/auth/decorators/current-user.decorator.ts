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
