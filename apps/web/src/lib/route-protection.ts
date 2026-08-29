import { decodeJwtPayload } from './jwt';

export type Role = 'customer' | 'owner' | 'admin';

const ROLE_HOME: Record<Role, string> = {
  customer: '/me',
  owner: '/owner/dashboard',
  admin: '/admin/approvals',
};

const PROTECTED_PREFIXES: { prefix: string; role: Role }[] = [
  { prefix: '/me', role: 'customer' },
  { prefix: '/owner', role: 'owner' },
  { prefix: '/admin', role: 'admin' },
];

export function resolveRedirect(
  pathname: string,
  accessToken: string | undefined,
): string | null {
  const protectedRoute = PROTECTED_PREFIXES.find((p) =>
    pathname.startsWith(p.prefix),
  );
  if (!protectedRoute) {
    return null;
  }

  if (!accessToken) {
    return `/login?returnTo=${encodeURIComponent(pathname)}`;
  }

  const payload = decodeJwtPayload(accessToken);
  if (!payload) {
    return `/login?returnTo=${encodeURIComponent(pathname)}`;
  }

  if (payload.role !== protectedRoute.role) {
    return ROLE_HOME[payload.role];
  }

  return null;
}
