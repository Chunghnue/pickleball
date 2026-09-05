import { decodeJwtPayload } from './jwt';

export type Role = 'customer' | 'owner' | 'admin' | 'staff';

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

  if (!protectedRoute.roles.includes(payload.role)) {
    return ROLE_HOME[payload.role];
  }

  return null;
}
