import { OptionalJwtAuthGuard } from './optional-jwt-auth.guard';

describe('OptionalJwtAuthGuard', () => {
  it('returns the user unchanged when authentication succeeds', () => {
    const guard = new OptionalJwtAuthGuard();
    const user = { userId: 'user-1' };

    expect(guard.handleRequest(null, user)).toBe(user);
  });

  it('returns null instead of throwing when there is no token', () => {
    const guard = new OptionalJwtAuthGuard();

    expect(guard.handleRequest(null, false)).toBeNull();
  });

  it('returns null instead of throwing when the token is invalid', () => {
    const guard = new OptionalJwtAuthGuard();

    expect(guard.handleRequest(new Error('jwt malformed'), false)).toBeNull();
  });
});
