import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthenticatedUser } from '../decorators/current-user.decorator';

@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<TUser = AuthenticatedUser | null>(
    err: unknown,
    user: unknown,
  ): TUser {
    return ((user as AuthenticatedUser) || null) as TUser;
  }
}
