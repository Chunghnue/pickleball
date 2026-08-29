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
    expect(resolveRedirect('/me', undefined)).toBe('/login?returnTo=%2Fme');
  });

  it('lets a matching role through', () => {
    expect(resolveRedirect('/admin/approvals', makeToken('admin'))).toBeNull();
  });

  it('redirects a mismatched role to their own home', () => {
    expect(resolveRedirect('/admin/approvals', makeToken('customer'))).toBe('/me');
  });

  it('redirects an owner to /owner/dashboard when they hit a mismatched protected route', () => {
    expect(resolveRedirect('/admin/approvals', makeToken('owner'))).toBe('/owner/dashboard');
  });

  it('redirects to /login when the token cannot be decoded', () => {
    expect(resolveRedirect('/me', 'not-a-jwt')).toBe('/login?returnTo=%2Fme');
  });
});
