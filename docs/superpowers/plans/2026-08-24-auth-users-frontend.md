# Auth + Users Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Next.js UI for the Auth + Users module — register/login/verify/reset/profile for customers, owner registration, and the admin owner-approval screen — per `docs/superpowers/specs/2026-08-24-auth-users-frontend-design.md`.

**Architecture:** BFF pattern. The browser only ever talks to Next.js Route Handlers under `apps/web/src/app/api/*`; those handlers proxy to the already-built NestJS API (`apps/api`) and manage `access_token`/`refresh_token` as httpOnly cookies. A shared `fetchApiCore` helper transparently refreshes an expired access token and retries once. `proxy.ts` does cheap, unverified role-based redirects for UX only — the real authorization boundary is NestJS's existing `JwtAuthGuard`/`RolesGuard`.

**Tech Stack:** Next.js 16 (App Router, already scaffolded), React 19, shadcn/ui (Radix + Tailwind v4, already installed), react-hook-form + zod + `@hookform/resolvers`, Vitest (pure-function tests only — no component rendering, no Playwright, per the approved design).

## Global Constraints

- Token storage: httpOnly, `sameSite=lax` cookies set by Next.js Route Handlers — the browser must never see a raw access/refresh token (spec §2).
- All browser→backend traffic goes through same-origin Next.js Route Handlers; the NestJS API is never called directly from the browser, so **no CORS configuration is needed on the backend**.
- `proxy.ts` role checks are UX-only (unverified JWT decode); real authorization stays enforced by NestJS's existing guards (spec §2).
- Verification/reset emails must link to the frontend (`APP_URL`), not the API (spec §2, §7 — this plan's Task 1).
- Testing scope per the approved design (spec §6): Vitest covers only the refresh-retry logic and the zod schemas. No component-render tests, no Playwright. Every page is verified either by a curl render-smoke-check (during its own task) or by the full interactive walkthrough in the final task.
- Route handlers are thin proxies with no dedicated automated tests (matches the design's stated scope) — they are verified via curl against the real running `apps/api` as each task builds them.
- Self-review note: the design's error-handling section requires "401 after a failed silent refresh → redirect to `/login`." The initial draft of `/me` and `/admin/owners` (Tasks 17–18) fetched their data without checking for a `401` first, which would have rendered `undefined` fields instead of redirecting. Both are fixed below to redirect on `401`. Mutation calls (`PATCH /users/me`, `POST /admin/owners/:id/approve|reject`) are intentionally left toast-only on `401` — by the time a mutation fires, the page's own initial load already proved the session was valid, so a 401 there is a rare mid-session expiry, not a wrong assumption; the API's `"Unauthorized"` message still surfaces via the toast rather than failing silently.
- Execution note (found during Task 11): this project's `Button` (Base UI, not Radix) has no `asChild` prop — Base UI uses a different, unrelated polymorphic-composition API. Don't write `<Button asChild><Link .../></Button>`; use the exported `buttonVariants(...)` class-name helper directly on the `Link` instead (see Task 11).
- Execution note (found during Task 3): Next.js 16 deprecates `middleware.ts`/`export function middleware(...)` in favor of `proxy.ts`/`export function proxy(...)` — same behavior and `matcher` config, new file and export name. Use `proxy.ts` throughout, not `middleware.ts`.
- Execution note (found during Task 2): this project's `components.json` resolves the **Base UI** component library (`@base-ui/react`, via `shadcn init -d`'s default `base` library choice), not classic Radix. The composite `form` shadcn component (`Form`/`FormField`/`FormItem`/`FormControl`/`FormMessage`, built on `radix-ui`'s `Slot`) hasn't been ported to Base UI in the registry yet — `npx shadcn add form` silently no-ops instead of erroring, while every other component in Task 2's list installs fine. **Every form page in this plan (Tasks 12, 13, 14, 16, 17) uses react-hook-form's plain `register()` API directly with the installed `Label`/`Input` instead of the missing composite wrapper:**

  ```tsx
  <div className="space-y-2">
    <Label htmlFor="email">Email</Label>
    <Input
      id="email"
      type="email"
      aria-invalid={!!form.formState.errors.email}
      {...form.register("email")}
    />
    {form.formState.errors.email && (
      <p className="text-sm text-destructive">
        {form.formState.errors.email.message}
      </p>
    )}
  </div>
  ```

  This still fully satisfies the design's "react-hook-form + zod" requirement — it's a different (simpler, more standard for plain text inputs) wiring of the same libraries, not a scope change. `Input`'s existing Tailwind classes already style the `aria-invalid` state, so no extra CSS is needed for the error look.

---

## File Structure

```
apps/api/
  src/mail/mail.service.ts        # MODIFY: link to APP_URL instead of API_BASE_URL
  .env.example                     # MODIFY: API_BASE_URL -> APP_URL

apps/web/
  .env.example                     # API_BASE_URL for server-side proxy calls
  .env.local                       # local copy (gitignored)
  vitest.config.ts
  components.json                  # via shadcn init
  src/
    proxy.ts
    lib/
      utils.ts                     # via shadcn init (cn())
      api-config.ts                # API_BASE_URL constant
      auth-cookies.ts              # get/set/clear access+refresh cookies
      jwt.ts                       # decodeJwtPayload (pure, tested)
      route-protection.ts          # resolveRedirect (pure, tested)
      fetch-api-core.ts            # fetchApiCore (pure, tested)
      fetch-api.ts                 # real fetchApi() wrapper
      schemas.ts                   # all zod schemas (tested)
      proxy-response.ts            # toNextResponse() shared helper
    components/ui/                 # shadcn: button, input, label, card, alert, sonner (no "form" -- see note above)
    app/
      layout.tsx                   # MODIFY: add <Toaster />
      page.tsx                     # MODIFY: landing page
      register/page.tsx
      register/owner/page.tsx
      login/page.tsx
      verify-email/page.tsx
      forgot-password/page.tsx
      reset-password/page.tsx
      me/page.tsx
      owner/page.tsx
      admin/owners/page.tsx
      api/
        auth/
          register/route.ts
          register/owner/route.ts
          verify-email/route.ts
          forgot-password/route.ts
          reset-password/route.ts
          login/route.ts
          logout/route.ts
        users/me/route.ts
        admin/owners/pending/route.ts
        admin/owners/[id]/approve/route.ts
        admin/owners/[id]/reject/route.ts
```

---

### Task 1: Backend — verification/reset email links point at the frontend

**Files:**
- Modify: `apps/api/src/mail/mail.service.ts`
- Modify: `apps/api/src/mail/mail.service.spec.ts`
- Modify: `apps/api/.env.example`
- Modify: `apps/api/.env` (local only, not committed)

**Interfaces:**
- Consumes: nothing new.
- Produces: `MailService.sendVerificationEmail`/`sendPasswordResetEmail` now link to `${APP_URL}/verify-email?token=...` and `${APP_URL}/reset-password?token=...`. `API_BASE_URL` env var is removed (no longer used anywhere in the backend).

- [ ] **Step 1: Write the failing test**

Replace `apps/api/src/mail/mail.service.spec.ts` entirely:

```ts
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { MailService } from './mail.service';

jest.mock('nodemailer');

describe('MailService', () => {
  let service: MailService;
  const sendMail = jest.fn().mockResolvedValue(undefined);

  beforeEach(async () => {
    (nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail });
    sendMail.mockClear();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MailService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string, fallback?: string) =>
              ({
                MAIL_HOST: 'localhost',
                MAIL_PORT: '1025',
                MAIL_FROM: 'no-reply@pickleball.local',
                APP_URL: 'http://localhost:3000',
              })[key] ?? fallback,
          },
        },
      ],
    }).compile();

    service = module.get(MailService);
  });

  it('sends a verification email linking to the frontend app', async () => {
    await service.sendVerificationEmail('user@test.com', 'raw-token-123');

    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user@test.com',
        subject: expect.any(String),
        html: expect.stringContaining(
          'http://localhost:3000/verify-email?token=raw-token-123',
        ),
      }),
    );
  });

  it('sends a password reset email linking to the frontend app', async () => {
    await service.sendPasswordResetEmail('user@test.com', 'reset-token-456');

    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user@test.com',
        html: expect.stringContaining(
          'http://localhost:3000/reset-password?token=reset-token-456',
        ),
      }),
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/api && npm test -- mail.service.spec.ts`
Expected: FAIL — the generated link still contains `http://localhost:3001/auth/verify-email` (the old `API_BASE_URL` default), not `http://localhost:3000/verify-email`.

- [ ] **Step 3: Implement**

Replace `apps/api/src/mail/mail.service.ts` entirely:

```ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly transporter: nodemailer.Transporter;
  private readonly from: string;
  private readonly appUrl: string;

  constructor(private readonly config: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: this.config.get<string>('MAIL_HOST', 'localhost'),
      port: this.config.get<number>('MAIL_PORT', 1025),
      secure: false,
    });
    this.from = this.config.get<string>('MAIL_FROM', 'no-reply@pickleball.local');
    this.appUrl = this.config.get<string>('APP_URL', 'http://localhost:3000');
  }

  async sendVerificationEmail(to: string, token: string): Promise<void> {
    const link = `${this.appUrl}/verify-email?token=${token}`;
    await this.transporter.sendMail({
      from: this.from,
      to,
      subject: 'Xác thực email của bạn',
      html: `<p>Nhấn vào link để xác thực email: <a href="${link}">${link}</a></p>`,
    });
  }

  async sendPasswordResetEmail(to: string, token: string): Promise<void> {
    const link = `${this.appUrl}/reset-password?token=${token}`;
    await this.transporter.sendMail({
      from: this.from,
      to,
      subject: 'Đặt lại mật khẩu',
      html: `<p>Nhấn vào link để đặt lại mật khẩu: <a href="${link}">${link}</a></p>`,
    });
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/api && npm test -- mail.service.spec.ts`
Expected: PASS

- [ ] **Step 5: Update env files**

In `apps/api/.env.example`, replace the `API_BASE_URL=http://localhost:3001` line with:

```
APP_URL=http://localhost:3000
```

In `apps/api/.env` (your local, untracked copy), make the same change by hand — this file isn't committed, so it won't show up in `git status`, but the running dev server reads it.

- [ ] **Step 6: Run the full backend suite to verify nothing else broke**

Run: `cd apps/api && npm test && npm run test:e2e`
Expected: PASS — the `auth-verify-email`/`auth-password-reset` e2e specs only assert on the token, not the link content, so they're unaffected.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/mail apps/api/.env.example
git commit -m "feat(api): point verification/reset email links at the frontend app"
```

---

### Task 2: Scaffold shadcn/ui, form libraries, and Vitest in `apps/web`

**Files:**
- Create: `apps/web/components.json`, `apps/web/src/lib/utils.ts` (via `shadcn init`)
- Modify: `apps/web/src/app/globals.css` (via `shadcn init`)
- Create: `apps/web/src/components/ui/{button,input,label,card,alert,sonner}.tsx` (via `shadcn add`)
- Modify: `apps/web/package.json` (dependencies + `test` script)
- Create: `apps/web/vitest.config.ts`

**Interfaces:**
- Produces: shadcn/ui primitives under `@/components/ui/*`, `cn()` helper at `@/lib/utils`, `react-hook-form`/`zod`/`@hookform/resolvers` available for later tasks, `npm run test` running Vitest.

- [ ] **Step 1: Initialize shadcn/ui**

```bash
cd apps/web
npx shadcn@latest init -y -d
cd ../..
```

Expected: creates `components.json` and `src/lib/utils.ts`, and adds CSS theme variables to `src/app/globals.css`.

- [ ] **Step 2: Add the components this module needs**

```bash
cd apps/web
npx shadcn@latest add button input label card alert sonner -y
cd ../..
```

Expected: creates files under `apps/web/src/components/ui/`. (Deliberately not `form` — see the Global Constraints note on why, and the react-hook-form `register()` pattern used instead.)

- [ ] **Step 3: Install form and validation libraries**

```bash
cd apps/web
npm install react-hook-form zod @hookform/resolvers
cd ../..
```

- [ ] **Step 4: Install Vitest**

```bash
cd apps/web
npm install -D vitest
cd ../..
```

- [ ] **Step 5: Add the Vitest config**

Create `apps/web/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
```

In `apps/web/package.json`, add to `"scripts"`:

```json
"test": "vitest run"
```

- [ ] **Step 6: Verify the app still builds**

Run: `cd apps/web && npm run build`
Expected: `✓ Compiled successfully`

- [ ] **Step 7: Commit**

```bash
git add apps/web
git commit -m "feat(web): add shadcn/ui, react-hook-form/zod, and Vitest"
```

---

### Task 3: JWT decode + route-protection logic (tested), then `proxy.ts`

**Files:**
- Create: `apps/web/src/lib/jwt.ts`
- Create: `apps/web/src/lib/jwt.test.ts`
- Create: `apps/web/src/lib/route-protection.ts`
- Create: `apps/web/src/lib/route-protection.test.ts`
- Create: `apps/web/src/proxy.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `decodeJwtPayload(token: string): JwtPayload | null` where `JwtPayload = { sub: string; role: 'customer' | 'owner' | 'admin'; iat: number; exp: number }` — Task 8 (login route) and Task 14 (`/login` page) use this to read the role claim.
  - `resolveRedirect(pathname: string, accessToken: string | undefined): string | null` — returns a redirect path, or `null` if the request should proceed.
  - `proxy.ts` wired to run on `/me/:path*`, `/owner/:path*`, `/admin/:path*`.

- [ ] **Step 1: Write the failing test for `decodeJwtPayload`**

Create `apps/web/src/lib/jwt.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { decodeJwtPayload } from './jwt';

function base64UrlEncode(json: object): string {
  const base64 = Buffer.from(JSON.stringify(json)).toString('base64');
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

describe('decodeJwtPayload', () => {
  it('decodes a valid JWT payload', () => {
    const payload = { sub: 'user-1', role: 'admin', iat: 1, exp: 2 };
    const token = `header.${base64UrlEncode(payload)}.signature`;

    expect(decodeJwtPayload(token)).toEqual(payload);
  });

  it('returns null for a token that is not three dot-separated parts', () => {
    expect(decodeJwtPayload('not-a-jwt')).toBeNull();
  });

  it('returns null when the payload segment is not valid base64/JSON', () => {
    expect(decodeJwtPayload('header.###.signature')).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/web && npm test -- jwt.test.ts`
Expected: FAIL — `Cannot find module './jwt'`.

- [ ] **Step 3: Implement `decodeJwtPayload`**

Create `apps/web/src/lib/jwt.ts`:

```ts
export interface JwtPayload {
  sub: string;
  role: 'customer' | 'owner' | 'admin';
  iat: number;
  exp: number;
}

export function decodeJwtPayload(token: string): JwtPayload | null {
  const parts = token.split('.');
  if (parts.length !== 3) {
    return null;
  }

  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(
      base64.length + ((4 - (base64.length % 4)) % 4),
      '=',
    );
    const payloadJson = atob(padded);
    return JSON.parse(payloadJson) as JwtPayload;
  } catch {
    return null;
  }
}
```

`atob` (not `Buffer`) is used deliberately — it's a global in both Node.js and browsers, so this file works unmodified in `proxy.ts` (Task 3, Node.js runtime by default in Next.js 16) without depending on a Node-specific API.

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/web && npm test -- jwt.test.ts`
Expected: PASS

- [ ] **Step 5: Write the failing test for `resolveRedirect`**

Create `apps/web/src/lib/route-protection.test.ts`:

```ts
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
    expect(resolveRedirect('/admin/owners', makeToken('admin'))).toBeNull();
  });

  it('redirects a mismatched role to their own home', () => {
    expect(resolveRedirect('/admin/owners', makeToken('customer'))).toBe('/me');
  });

  it('redirects to /login when the token cannot be decoded', () => {
    expect(resolveRedirect('/me', 'not-a-jwt')).toBe('/login?returnTo=%2Fme');
  });
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `cd apps/web && npm test -- route-protection.test.ts`
Expected: FAIL — `Cannot find module './route-protection'`.

- [ ] **Step 7: Implement `resolveRedirect`**

Create `apps/web/src/lib/route-protection.ts`:

```ts
import { decodeJwtPayload } from './jwt';

export type Role = 'customer' | 'owner' | 'admin';

const ROLE_HOME: Record<Role, string> = {
  customer: '/me',
  owner: '/owner',
  admin: '/admin/owners',
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
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `cd apps/web && npm test -- route-protection.test.ts`
Expected: PASS

- [ ] **Step 9: Wire up `proxy.ts`**

Create `apps/web/src/proxy.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { resolveRedirect } from '@/lib/route-protection';

export function proxy(request: NextRequest) {
  const accessToken = request.cookies.get('access_token')?.value;
  const redirectPath = resolveRedirect(request.nextUrl.pathname, accessToken);

  if (redirectPath) {
    return NextResponse.redirect(new URL(redirectPath, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/me/:path*', '/owner/:path*', '/admin/:path*'],
};
```

- [ ] **Step 10: Run the full Vitest suite and verify the build still works**

Run: `cd apps/web && npm test && npm run build`
Expected: both PASS

- [ ] **Step 11: Commit**

```bash
git add apps/web/src/lib/jwt.ts apps/web/src/lib/jwt.test.ts apps/web/src/lib/route-protection.ts apps/web/src/lib/route-protection.test.ts apps/web/src/proxy.ts
git commit -m "feat(web): add JWT decode, route-protection redirects, and proxy"
```

---

### Task 4: Server env config and auth cookie helpers

**Files:**
- Create: `apps/web/.env.example`
- Create: `apps/web/.env.local` (local only, gitignored by the existing `.env*` rule)
- Create: `apps/web/src/lib/api-config.ts`
- Create: `apps/web/src/lib/auth-cookies.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `API_BASE_URL: string` — the NestJS API's base URL, read server-side only (never sent to the browser bundle, so no `NEXT_PUBLIC_` prefix).
  - `setAuthCookies(tokens: { accessToken: string; refreshToken: string }): Promise<void>`
  - `clearAuthCookies(): Promise<void>`
  - `getAccessToken(): Promise<string | undefined>`
  - `getRefreshToken(): Promise<string | undefined>`

These are thin wrappers around Next.js's `cookies()` API with no independent logic to unit test (per the design's stated testing scope) — they're exercised through Task 5's `fetchApi` and the manual verification in Task 19.

- [ ] **Step 1: Add env files**

Create `apps/web/.env.example`:

```
API_BASE_URL=http://localhost:3001
```

```bash
cp apps/web/.env.example apps/web/.env.local
```

- [ ] **Step 2: Add the API base URL constant**

Create `apps/web/src/lib/api-config.ts`:

```ts
export const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:3001';
```

- [ ] **Step 3: Add the auth cookie helpers**

Create `apps/web/src/lib/auth-cookies.ts`:

```ts
import { cookies } from 'next/headers';

const ACCESS_TOKEN_COOKIE = 'access_token';
const REFRESH_TOKEN_COOKIE = 'refresh_token';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export async function setAuthCookies(tokens: AuthTokens): Promise<void> {
  const cookieStore = await cookies();
  const isProduction = process.env.NODE_ENV === 'production';

  cookieStore.set(ACCESS_TOKEN_COOKIE, tokens.accessToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
  });
  cookieStore.set(REFRESH_TOKEN_COOKIE, tokens.refreshToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
  });
}

export async function clearAuthCookies(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(ACCESS_TOKEN_COOKIE);
  cookieStore.delete(REFRESH_TOKEN_COOKIE);
}

export async function getAccessToken(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get(ACCESS_TOKEN_COOKIE)?.value;
}

export async function getRefreshToken(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get(REFRESH_TOKEN_COOKIE)?.value;
}
```

- [ ] **Step 4: Verify the build still works**

Run: `cd apps/web && npm run build`
Expected: `✓ Compiled successfully`

- [ ] **Step 5: Commit**

```bash
git add apps/web/.env.example apps/web/src/lib/api-config.ts apps/web/src/lib/auth-cookies.ts
git commit -m "feat(web): add API base URL config and auth cookie helpers"
```

---

### Task 5: `fetchApiCore` refresh-retry logic (tested), then the real `fetchApi` wrapper

This is the core piece the design calls out for full unit testing: a pure function that takes fetch/cookie access as injected dependencies, so the retry-on-401 behavior is tested without a real Next.js request context.

**Files:**
- Create: `apps/web/src/lib/fetch-api-core.ts`
- Create: `apps/web/src/lib/fetch-api-core.test.ts`
- Create: `apps/web/src/lib/fetch-api.ts`

**Interfaces:**
- Consumes: `API_BASE_URL` (Task 4), `getAccessToken`/`getRefreshToken`/`setAuthCookies` (Task 4).
- Produces:
  - `fetchApiCore(deps: FetchApiCoreDeps, path: string, init?: RequestInit): Promise<Response>` where `FetchApiCoreDeps = { fetchFn: typeof fetch; apiBaseUrl: string; getAccessToken(): string | undefined | Promise<string | undefined>; getRefreshToken(): string | undefined | Promise<string | undefined>; onTokensRefreshed(tokens: { accessToken: string; refreshToken: string }): void | Promise<void> }`.
  - `fetchApi(path: string, init?: RequestInit): Promise<Response>` — the real wrapper Tasks 9 and 10's protected route handlers call.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/lib/fetch-api-core.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { fetchApiCore } from './fetch-api-core';

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('fetchApiCore', () => {
  it('returns the response directly when the status is not 401', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ ok: true }, 200));
    const onTokensRefreshed = vi.fn();

    const response = await fetchApiCore(
      {
        fetchFn,
        apiBaseUrl: 'http://api.test',
        getAccessToken: () => 'access-1',
        getRefreshToken: () => 'refresh-1',
        onTokensRefreshed,
      },
      '/users/me',
    );

    expect(response.status).toBe(200);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(onTokensRefreshed).not.toHaveBeenCalled();
  });

  it('refreshes and retries once on a 401, returning the retried response', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ message: 'Unauthorized' }, 401))
      .mockResolvedValueOnce(
        jsonResponse({ accessToken: 'access-2', refreshToken: 'refresh-2' }, 201),
      )
      .mockResolvedValueOnce(jsonResponse({ ok: true }, 200));
    const onTokensRefreshed = vi.fn();

    const response = await fetchApiCore(
      {
        fetchFn,
        apiBaseUrl: 'http://api.test',
        getAccessToken: () => 'access-1',
        getRefreshToken: () => 'refresh-1',
        onTokensRefreshed,
      },
      '/users/me',
    );

    expect(response.status).toBe(200);
    expect(fetchFn).toHaveBeenCalledTimes(3);
    expect(fetchFn).toHaveBeenNthCalledWith(
      2,
      'http://api.test/auth/refresh',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(onTokensRefreshed).toHaveBeenCalledWith({
      accessToken: 'access-2',
      refreshToken: 'refresh-2',
    });
  });

  it('gives up and returns the original 401 when there is no refresh token', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(jsonResponse({ message: 'Unauthorized' }, 401));

    const response = await fetchApiCore(
      {
        fetchFn,
        apiBaseUrl: 'http://api.test',
        getAccessToken: () => 'access-1',
        getRefreshToken: () => undefined,
        onTokensRefreshed: vi.fn(),
      },
      '/users/me',
    );

    expect(response.status).toBe(401);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('gives up and returns the original 401 when the refresh call itself fails', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ message: 'Unauthorized' }, 401))
      .mockResolvedValueOnce(
        jsonResponse({ message: 'Refresh token không hợp lệ' }, 401),
      );

    const response = await fetchApiCore(
      {
        fetchFn,
        apiBaseUrl: 'http://api.test',
        getAccessToken: () => 'access-1',
        getRefreshToken: () => 'refresh-1',
        onTokensRefreshed: vi.fn(),
      },
      '/users/me',
    );

    expect(response.status).toBe(401);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/web && npm test -- fetch-api-core.test.ts`
Expected: FAIL — `Cannot find module './fetch-api-core'`.

- [ ] **Step 3: Implement `fetchApiCore`**

Create `apps/web/src/lib/fetch-api-core.ts`:

```ts
export interface FetchApiCoreDeps {
  fetchFn: typeof fetch;
  apiBaseUrl: string;
  getAccessToken(): string | undefined | Promise<string | undefined>;
  getRefreshToken(): string | undefined | Promise<string | undefined>;
  onTokensRefreshed(tokens: {
    accessToken: string;
    refreshToken: string;
  }): void | Promise<void>;
}

export async function fetchApiCore(
  deps: FetchApiCoreDeps,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const attempt = (token: string | undefined) =>
    deps.fetchFn(`${deps.apiBaseUrl}${path}`, {
      ...init,
      headers: {
        ...(init.headers ?? {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });

  const firstResponse = await attempt(await deps.getAccessToken());
  if (firstResponse.status !== 401) {
    return firstResponse;
  }

  const refreshToken = await deps.getRefreshToken();
  if (!refreshToken) {
    return firstResponse;
  }

  const refreshResponse = await deps.fetchFn(`${deps.apiBaseUrl}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });
  if (!refreshResponse.ok) {
    return firstResponse;
  }

  const tokens = (await refreshResponse.json()) as {
    accessToken: string;
    refreshToken: string;
  };
  await deps.onTokensRefreshed(tokens);

  return attempt(tokens.accessToken);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/web && npm test -- fetch-api-core.test.ts`
Expected: PASS — all 4 cases green.

- [ ] **Step 5: Add the real wrapper**

Create `apps/web/src/lib/fetch-api.ts`:

```ts
import { API_BASE_URL } from './api-config';
import { getAccessToken, getRefreshToken, setAuthCookies } from './auth-cookies';
import { fetchApiCore } from './fetch-api-core';

export function fetchApi(path: string, init?: RequestInit): Promise<Response> {
  return fetchApiCore(
    {
      fetchFn: fetch,
      apiBaseUrl: API_BASE_URL,
      getAccessToken,
      getRefreshToken,
      onTokensRefreshed: setAuthCookies,
    },
    path,
    init,
  );
}
```

- [ ] **Step 6: Run the full Vitest suite and verify the build still works**

Run: `cd apps/web && npm test && npm run build`
Expected: both PASS

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/fetch-api-core.ts apps/web/src/lib/fetch-api-core.test.ts apps/web/src/lib/fetch-api.ts
git commit -m "feat(web): add fetchApiCore refresh-retry logic and fetchApi wrapper"
```

---

### Task 6: Zod schemas for all forms, and the shared submit-error-message helper

**Files:**
- Create: `apps/web/src/lib/schemas.ts`
- Create: `apps/web/src/lib/schemas.test.ts`
- Create: `apps/web/src/lib/error-message.ts`
- Create: `apps/web/src/lib/error-message.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `registerSchema`, `loginSchema`, `forgotPasswordSchema`, `resetPasswordSchema`, `updateProfileSchema` (all `zod` objects) and their inferred types `RegisterInput`, `LoginInput`, `ForgotPasswordInput`, `ResetPasswordInput`, `UpdateProfileInput`. Tasks 12–17's pages import these directly.
  - `getSubmitErrorMessage(response: Response, data: { message?: string } | null): string` — per the design's error-handling section, a `429` always renders the specific rate-limit message rather than whatever NestJS's `ThrottlerException` body happens to contain. Tasks 12–14 (`/register`, `/register/owner`, `/login` — the only endpoints the backend actually rate-limits) use this instead of a bare `data?.message` fallback.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/lib/schemas.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  updateProfileSchema,
} from './schemas';

describe('registerSchema', () => {
  it('accepts a valid payload', () => {
    const result = registerSchema.safeParse({
      email: 'a@test.com',
      password: 'password123',
      fullName: 'A B',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an invalid email', () => {
    const result = registerSchema.safeParse({
      email: 'not-an-email',
      password: 'password123',
      fullName: 'A B',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a password shorter than 8 characters', () => {
    const result = registerSchema.safeParse({
      email: 'a@test.com',
      password: '123',
      fullName: 'A B',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an empty full name', () => {
    const result = registerSchema.safeParse({
      email: 'a@test.com',
      password: 'password123',
      fullName: '',
    });
    expect(result.success).toBe(false);
  });
});

describe('loginSchema', () => {
  it('accepts a valid payload', () => {
    expect(
      loginSchema.safeParse({ email: 'a@test.com', password: 'anything' }).success,
    ).toBe(true);
  });

  it('rejects an empty password', () => {
    expect(
      loginSchema.safeParse({ email: 'a@test.com', password: '' }).success,
    ).toBe(false);
  });
});

describe('forgotPasswordSchema', () => {
  it('accepts a valid email', () => {
    expect(forgotPasswordSchema.safeParse({ email: 'a@test.com' }).success).toBe(
      true,
    );
  });

  it('rejects an invalid email', () => {
    expect(forgotPasswordSchema.safeParse({ email: 'nope' }).success).toBe(false);
  });
});

describe('resetPasswordSchema', () => {
  it('accepts a valid payload', () => {
    expect(
      resetPasswordSchema.safeParse({ token: 'abc', newPassword: 'password123' })
        .success,
    ).toBe(true);
  });

  it('rejects a short new password', () => {
    expect(
      resetPasswordSchema.safeParse({ token: 'abc', newPassword: '123' }).success,
    ).toBe(false);
  });
});

describe('updateProfileSchema', () => {
  it('accepts an empty object (no fields required)', () => {
    expect(updateProfileSchema.safeParse({}).success).toBe(true);
  });

  it('accepts a valid avatarUrl', () => {
    expect(
      updateProfileSchema.safeParse({ avatarUrl: 'https://example.com/a.png' })
        .success,
    ).toBe(true);
  });

  it('rejects an invalid avatarUrl', () => {
    expect(updateProfileSchema.safeParse({ avatarUrl: 'not-a-url' }).success).toBe(
      false,
    );
  });

  it('accepts an empty string avatarUrl (an untouched optional field)', () => {
    expect(updateProfileSchema.safeParse({ avatarUrl: '' }).success).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/web && npm test -- schemas.test.ts`
Expected: FAIL — `Cannot find module './schemas'`.

- [ ] **Step 3: Implement the schemas**

Create `apps/web/src/lib/schemas.ts`:

```ts
import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email('Email không hợp lệ'),
  password: z.string().min(8, 'Mật khẩu tối thiểu 8 ký tự'),
  fullName: z.string().min(1, 'Vui lòng nhập họ tên'),
  phone: z.string().optional(),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().email('Email không hợp lệ'),
  password: z.string().min(1, 'Vui lòng nhập mật khẩu'),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({
  email: z.string().email('Email không hợp lệ'),
});
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(8, 'Mật khẩu tối thiểu 8 ký tự'),
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const updateProfileSchema = z.object({
  fullName: z.string().min(1, 'Vui lòng nhập họ tên').optional(),
  phone: z.string().optional(),
  avatarUrl: z
    .string()
    .url('URL không hợp lệ')
    .optional()
    .or(z.literal('')),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/web && npm test -- schemas.test.ts`
Expected: PASS — all cases green.

- [ ] **Step 5: Write the failing test for the error-message helper**

Create `apps/web/src/lib/error-message.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { getSubmitErrorMessage } from './error-message';

describe('getSubmitErrorMessage', () => {
  it('returns the rate-limit message for a 429, ignoring the response body', () => {
    const response = new Response(null, { status: 429 });
    expect(getSubmitErrorMessage(response, { message: 'ThrottlerException' })).toBe(
      'Bạn đã thử quá nhiều lần, vui lòng thử lại sau.',
    );
  });

  it('returns the API message for any other error status', () => {
    const response = new Response(null, { status: 409 });
    expect(getSubmitErrorMessage(response, { message: 'Email đã được sử dụng' })).toBe(
      'Email đã được sử dụng',
    );
  });

  it('falls back to a generic message when the body has none', () => {
    const response = new Response(null, { status: 500 });
    expect(getSubmitErrorMessage(response, null)).toBe(
      'Có lỗi xảy ra, vui lòng thử lại.',
    );
  });
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `cd apps/web && npm test -- error-message.test.ts`
Expected: FAIL — `Cannot find module './error-message'`.

- [ ] **Step 7: Implement the helper**

Create `apps/web/src/lib/error-message.ts`:

```ts
export function getSubmitErrorMessage(
  response: Response,
  data: { message?: string } | null,
): string {
  if (response.status === 429) {
    return 'Bạn đã thử quá nhiều lần, vui lòng thử lại sau.';
  }
  return data?.message ?? 'Có lỗi xảy ra, vui lòng thử lại.';
}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `cd apps/web && npm test -- error-message.test.ts`
Expected: PASS

- [ ] **Step 9: Run the full Vitest suite**

Run: `cd apps/web && npm test`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add apps/web/src/lib/schemas.ts apps/web/src/lib/schemas.test.ts apps/web/src/lib/error-message.ts apps/web/src/lib/error-message.test.ts
git commit -m "feat(web): add zod schemas and the submit-error-message helper"
```

---

### Task 7: Public route handlers — register, register/owner, verify-email, forgot-password, reset-password

From this task on, verification is done by curling the real running servers instead of automated tests (per the design's testing scope — these are thin, mechanical proxies). Start everything once and leave it running for the rest of this plan:

```bash
docker compose up -d
cd apps/api && npm run start:dev &
cd apps/web && npm run dev &
```

Wait a few seconds for both to report ready (`Nest application successfully started` and `✓ Ready`), then confirm:

```bash
curl -s http://localhost:3001/health
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/
```

Expected: `{"status":"ok"}` and `200`.

**Files:**
- Create: `apps/web/src/lib/proxy-response.ts`
- Create: `apps/web/src/app/api/auth/register/route.ts`
- Create: `apps/web/src/app/api/auth/register/owner/route.ts`
- Create: `apps/web/src/app/api/auth/verify-email/route.ts`
- Create: `apps/web/src/app/api/auth/forgot-password/route.ts`
- Create: `apps/web/src/app/api/auth/reset-password/route.ts`

**Interfaces:**
- Consumes: `API_BASE_URL` (Task 4).
- Produces: `toNextResponse(upstream: Response): Promise<NextResponse>` (shared by every route handler task from here on); the five proxy routes listed above, each forwarding verbatim to the matching NestJS endpoint.

- [ ] **Step 1: Add the shared response helper**

Create `apps/web/src/lib/proxy-response.ts`:

```ts
import { NextResponse } from 'next/server';

export async function toNextResponse(upstream: Response): Promise<NextResponse> {
  const data = await upstream.json().catch(() => null);
  return NextResponse.json(data, { status: upstream.status });
}
```

- [ ] **Step 2: Add the register route handlers**

Create `apps/web/src/app/api/auth/register/route.ts`:

```ts
import { NextRequest } from 'next/server';
import { API_BASE_URL } from '@/lib/api-config';
import { toNextResponse } from '@/lib/proxy-response';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const upstream = await fetch(`${API_BASE_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return toNextResponse(upstream);
}
```

Create `apps/web/src/app/api/auth/register/owner/route.ts`:

```ts
import { NextRequest } from 'next/server';
import { API_BASE_URL } from '@/lib/api-config';
import { toNextResponse } from '@/lib/proxy-response';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const upstream = await fetch(`${API_BASE_URL}/auth/register/owner`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return toNextResponse(upstream);
}
```

- [ ] **Step 3: Verify the register routes**

```bash
curl -s -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"fe-customer@test.com","password":"password123","fullName":"FE Customer"}'
echo
curl -s -X POST http://localhost:3000/api/auth/register/owner \
  -H "Content-Type: application/json" \
  -d '{"email":"fe-owner@test.com","password":"password123","fullName":"FE Owner"}'
```

Expected: both return `{"id":"...","email":"..."}`, matching what calling `apps/api` directly returns.

- [ ] **Step 4: Add the verify-email route handler**

Create `apps/web/src/app/api/auth/verify-email/route.ts`:

```ts
import { NextRequest } from 'next/server';
import { API_BASE_URL } from '@/lib/api-config';
import { toNextResponse } from '@/lib/proxy-response';

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token') ?? '';
  const upstream = await fetch(
    `${API_BASE_URL}/auth/verify-email?token=${encodeURIComponent(token)}`,
  );
  return toNextResponse(upstream);
}
```

- [ ] **Step 5: Verify the verify-email route**

Open `http://localhost:8025` (Mailhog), find the email sent to `fe-customer@test.com`, copy its token, then:

```bash
curl -s "http://localhost:3000/api/auth/verify-email?token=<paste-token-here>"
```

Expected: `{"status":"active"}`

- [ ] **Step 6: Add the forgot-password and reset-password route handlers**

Create `apps/web/src/app/api/auth/forgot-password/route.ts`:

```ts
import { NextRequest } from 'next/server';
import { API_BASE_URL } from '@/lib/api-config';
import { toNextResponse } from '@/lib/proxy-response';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const upstream = await fetch(`${API_BASE_URL}/auth/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return toNextResponse(upstream);
}
```

Create `apps/web/src/app/api/auth/reset-password/route.ts`:

```ts
import { NextRequest } from 'next/server';
import { API_BASE_URL } from '@/lib/api-config';
import { toNextResponse } from '@/lib/proxy-response';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const upstream = await fetch(`${API_BASE_URL}/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return toNextResponse(upstream);
}
```

- [ ] **Step 7: Verify the forgot-password route**

```bash
curl -s -X POST http://localhost:3000/api/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{"email":"fe-customer@test.com"}'
```

Expected: `{"message":"Nếu email tồn tại, chúng tôi đã gửi hướng dẫn đặt lại mật khẩu"}`. (`reset-password` is verified together with its page in Task 16, once there's a real reset token to use.)

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/lib/proxy-response.ts apps/web/src/app/api/auth/register apps/web/src/app/api/auth/verify-email apps/web/src/app/api/auth/forgot-password apps/web/src/app/api/auth/reset-password
git commit -m "feat(web): add public auth proxy route handlers"
```

---

### Task 8: `login` and `logout` route handlers (cookie-setting)

**Files:**
- Create: `apps/web/src/app/api/auth/login/route.ts`
- Create: `apps/web/src/app/api/auth/logout/route.ts`

**Interfaces:**
- Consumes: `setAuthCookies`, `clearAuthCookies`, `getRefreshToken` (Task 4), `decodeJwtPayload` (Task 3), `API_BASE_URL` (Task 4).
- Produces: `POST /api/auth/login` → sets `access_token`/`refresh_token` cookies, responds `{ role }`; `POST /api/auth/logout` → revokes the refresh token upstream and clears both cookies, responds `204`.

- [ ] **Step 1: Add the login route handler**

Create `apps/web/src/app/api/auth/login/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { API_BASE_URL } from '@/lib/api-config';
import { setAuthCookies } from '@/lib/auth-cookies';
import { decodeJwtPayload } from '@/lib/jwt';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const upstream = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await upstream.json().catch(() => null);

  if (!upstream.ok || !data?.accessToken) {
    return NextResponse.json(data, { status: upstream.status });
  }

  await setAuthCookies({
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
  });
  const payload = decodeJwtPayload(data.accessToken);

  return NextResponse.json({ role: payload?.role ?? null }, { status: 200 });
}
```

- [ ] **Step 2: Add the logout route handler**

Create `apps/web/src/app/api/auth/logout/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { API_BASE_URL } from '@/lib/api-config';
import { clearAuthCookies, getRefreshToken } from '@/lib/auth-cookies';

export async function POST() {
  const refreshToken = await getRefreshToken();

  if (refreshToken) {
    await fetch(`${API_BASE_URL}/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    }).catch(() => undefined);
  }

  await clearAuthCookies();
  return new NextResponse(null, { status: 204 });
}
```

- [ ] **Step 3: Verify login sets httpOnly cookies and logout clears them**

The customer registered in Task 7 (`fe-customer@test.com`) was verified in Task 7 Step 5, so it can log in now:

```bash
curl -s -i -c /tmp/fe-cookies.txt -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"fe-customer@test.com","password":"password123"}' | grep -i "set-cookie\|HTTP/"
```

Expected: an `HTTP/1.1 200` line and two `Set-Cookie` lines (`access_token=...; HttpOnly; ...` and `refresh_token=...; HttpOnly; ...`). The response body (not shown by `grep`) is `{"role":"customer"}`.

```bash
curl -s -i -b /tmp/fe-cookies.txt -X POST http://localhost:3000/api/auth/logout | grep "HTTP/"
```

Expected: `HTTP/1.1 204`.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/api/auth/login apps/web/src/app/api/auth/logout
git commit -m "feat(web): add login/logout route handlers with httpOnly cookies"
```

---

### Task 9: `/users/me` route handlers (protected)

**Files:**
- Create: `apps/web/src/app/api/users/me/route.ts`

**Interfaces:**
- Consumes: `fetchApi` (Task 5), `clearAuthCookies` (Task 4), `toNextResponse` (Task 7).
- Produces: `GET /api/users/me` → proxies to NestJS with the access token attached, transparently refreshing on a first 401; `PATCH /api/users/me` → same, with the request body forwarded. Both clear the auth cookies if the (possibly retried) call still comes back `401`, so the browser stops sending dead cookies.

- [ ] **Step 1: Add the route handler**

Create `apps/web/src/app/api/users/me/route.ts`:

```ts
import { NextRequest } from 'next/server';
import { fetchApi } from '@/lib/fetch-api';
import { clearAuthCookies } from '@/lib/auth-cookies';
import { toNextResponse } from '@/lib/proxy-response';

export async function GET() {
  const upstream = await fetchApi('/users/me');
  if (upstream.status === 401) {
    await clearAuthCookies();
  }
  return toNextResponse(upstream);
}

export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const upstream = await fetchApi('/users/me', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (upstream.status === 401) {
    await clearAuthCookies();
  }
  return toNextResponse(upstream);
}
```

- [ ] **Step 2: Verify GET and PATCH work through the cookie jar**

Re-login first (the cookie jar from Task 8 is still valid unless the access token has expired — 15 minutes; re-run the login curl from Task 8 Step 3 if needed), then:

```bash
curl -s -b /tmp/fe-cookies.txt http://localhost:3000/api/users/me
```

Expected: `{"email":"fe-customer@test.com","fullName":"FE Customer",...}` with **no** `passwordHash` field.

```bash
curl -s -b /tmp/fe-cookies.txt -X PATCH http://localhost:3000/api/users/me \
  -H "Content-Type: application/json" \
  -d '{"fullName":"FE Customer Updated"}'
```

Expected: same shape with `"fullName":"FE Customer Updated"`.

- [ ] **Step 3: Verify unauthenticated access is rejected**

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/users/me
```

Expected: `401`

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/api/users
git commit -m "feat(web): add protected /users/me route handlers"
```

---

### Task 10: `/admin/owners` route handlers (protected)

**Files:**
- Create: `apps/web/src/app/api/admin/owners/pending/route.ts`
- Create: `apps/web/src/app/api/admin/owners/[id]/approve/route.ts`
- Create: `apps/web/src/app/api/admin/owners/[id]/reject/route.ts`

**Interfaces:**
- Consumes: `fetchApi` (Task 5), `toNextResponse` (Task 7).
- Produces: `GET /api/admin/owners/pending`, `POST /api/admin/owners/:id/approve`, `POST /api/admin/owners/:id/reject` — all proxy to the matching NestJS admin endpoint with the access token attached.

- [ ] **Step 1: Add the route handlers**

Create `apps/web/src/app/api/admin/owners/pending/route.ts`:

```ts
import { fetchApi } from '@/lib/fetch-api';
import { toNextResponse } from '@/lib/proxy-response';

export async function GET() {
  const upstream = await fetchApi('/admin/owners/pending');
  return toNextResponse(upstream);
}
```

Create `apps/web/src/app/api/admin/owners/[id]/approve/route.ts`:

```ts
import { fetchApi } from '@/lib/fetch-api';
import { toNextResponse } from '@/lib/proxy-response';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const upstream = await fetchApi(`/admin/owners/${id}/approve`, {
    method: 'POST',
  });
  return toNextResponse(upstream);
}
```

Create `apps/web/src/app/api/admin/owners/[id]/reject/route.ts`:

```ts
import { fetchApi } from '@/lib/fetch-api';
import { toNextResponse } from '@/lib/proxy-response';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const upstream = await fetchApi(`/admin/owners/${id}/reject`, {
    method: 'POST',
  });
  return toNextResponse(upstream);
}
```

- [ ] **Step 2: Seed an admin account (if not already seeded)**

```bash
cd apps/api
ADMIN_EMAIL=admin@pickleball.local ADMIN_PASSWORD=changeme123 npm run seed:admin
cd ../..
```

Expected: `Admin admin@pickleball.local created.` (or `already exists, skipping.` if this was already run).

- [ ] **Step 3: Verify the pending-owner is visible and approvable**

`fe-owner@test.com` (registered in Task 7 Step 3) still needs its email verified before it shows up as "pending approval" rather than "pending verification" — open Mailhog, find its verification email, and:

```bash
curl -s "http://localhost:3000/api/auth/verify-email?token=<fe-owner-token-from-mailhog>"
```

Expected: `{"status":"pending_approval"}`

Now log in as admin and list pending owners:

```bash
curl -s -c /tmp/admin-cookies.txt -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@pickleball.local","password":"changeme123"}'
echo
curl -s -b /tmp/admin-cookies.txt http://localhost:3000/api/admin/owners/pending
```

Expected: first call returns `{"role":"admin"}`; second returns a JSON array containing the `fe-owner@test.com` record (no `passwordHash`).

```bash
OWNER_ID=$(curl -s -b /tmp/admin-cookies.txt http://localhost:3000/api/admin/owners/pending | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d)[0].id))")
curl -s -b /tmp/admin-cookies.txt -X POST "http://localhost:3000/api/admin/owners/$OWNER_ID/approve"
```

Expected: the owner's record with `"status":"active"`.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/api/admin
git commit -m "feat(web): add protected admin owner-approval route handlers"
```

---

### Task 11: Root layout (toast provider) and landing page

**Files:**
- Modify: `apps/web/src/app/layout.tsx`
- Modify: `apps/web/src/app/page.tsx`

**Interfaces:**
- Consumes: `Toaster`, `Button` (shadcn components from Task 2).
- Produces: every page rendered from here on has toast notifications available (`import { toast } from "sonner"` used by Tasks 12–18); `/` links to `/login` and `/register`.

- [ ] **Step 1: Add the toast provider to the root layout**

Replace `apps/web/src/app/layout.tsx` entirely:

```tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Pickleball",
  description: "Đặt sân pickleball",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="vi"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
```

- [ ] **Step 2: Build the landing page**

Replace `apps/web/src/app/page.tsx` entirely:

```tsx
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default function HomePage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="text-3xl font-bold">Pickleball</h1>
      <p className="text-muted-foreground">
        Đặt sân pickleball nhanh chóng, dễ dàng.
      </p>
      <div className="flex gap-4">
        <Link href="/login" className={buttonVariants()}>
          Đăng nhập
        </Link>
        <Link href="/register" className={buttonVariants({ variant: "outline" })}>
          Đăng ký
        </Link>
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Verify it renders**

```bash
curl -s http://localhost:3000/ | grep -o 'Đăng nhập'
```

Expected: at least one match.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/layout.tsx apps/web/src/app/page.tsx
git commit -m "feat(web): add toast provider and landing page"
```

---

### Task 12: `/register` page (customer)

**Files:**
- Create: `apps/web/src/app/register/page.tsx`

**Interfaces:**
- Consumes: `registerSchema`/`RegisterInput`, `getSubmitErrorMessage` (Task 6), `POST /api/auth/register` (Task 7).
- Produces: the `/register` page — no exports other later tasks depend on.

- [ ] **Step 1: Build the page**

Create `apps/web/src/app/register/page.tsx`:

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { registerSchema, type RegisterInput } from "@/lib/schemas";
import { getSubmitErrorMessage } from "@/lib/error-message";

export default function RegisterPage() {
  const [submitted, setSubmitted] = useState(false);
  const form = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: { email: "", password: "", fullName: "", phone: "" },
  });

  async function onSubmit(values: RegisterInput) {
    const response = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const data = await response.json().catch(() => null);

    if (!response.ok) {
      toast.error(getSubmitErrorMessage(response, data));
      return;
    }

    setSubmitted(true);
  }

  if (submitted) {
    return (
      <main className="flex flex-1 items-center justify-center p-8">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>Kiểm tra email của bạn</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Chúng tôi đã gửi link xác thực tới email bạn vừa đăng ký.
            </p>
          </CardContent>
        </Card>
      </main>
    );
  }

  const { errors } = form.formState;

  return (
    <main className="flex flex-1 items-center justify-center p-8">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Đăng ký</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fullName">Họ tên</Label>
              <Input
                id="fullName"
                aria-invalid={!!errors.fullName}
                {...form.register("fullName")}
              />
              {errors.fullName && (
                <p className="text-sm text-destructive">
                  {errors.fullName.message}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                aria-invalid={!!errors.email}
                {...form.register("email")}
              />
              {errors.email && (
                <p className="text-sm text-destructive">{errors.email.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Mật khẩu</Label>
              <Input
                id="password"
                type="password"
                aria-invalid={!!errors.password}
                {...form.register("password")}
              />
              {errors.password && (
                <p className="text-sm text-destructive">
                  {errors.password.message}
                </p>
              )}
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={form.formState.isSubmitting}
            >
              Đăng ký
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            Bạn là chủ sân?{" "}
            <Link href="/register/owner" className="underline">
              Đăng ký tại đây
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
```

- [ ] **Step 2: Verify it renders**

```bash
curl -s http://localhost:3000/register | grep -o 'name="email"'
```

Expected: at least one match (confirms the page server-renders without a runtime error).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/register/page.tsx
git commit -m "feat(web): add /register page"
```

---

### Task 13: `/register/owner` page

**Files:**
- Create: `apps/web/src/app/register/owner/page.tsx`

**Interfaces:**
- Consumes: `registerSchema`/`RegisterInput`, `getSubmitErrorMessage` (Task 6), `POST /api/auth/register/owner` (Task 7).
- Produces: the `/register/owner` page.

- [ ] **Step 1: Build the page**

Create `apps/web/src/app/register/owner/page.tsx`:

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { registerSchema, type RegisterInput } from "@/lib/schemas";
import { getSubmitErrorMessage } from "@/lib/error-message";

export default function RegisterOwnerPage() {
  const [submitted, setSubmitted] = useState(false);
  const form = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: { email: "", password: "", fullName: "", phone: "" },
  });

  async function onSubmit(values: RegisterInput) {
    const response = await fetch("/api/auth/register/owner", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const data = await response.json().catch(() => null);

    if (!response.ok) {
      toast.error(getSubmitErrorMessage(response, data));
      return;
    }

    setSubmitted(true);
  }

  if (submitted) {
    return (
      <main className="flex flex-1 items-center justify-center p-8">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>Kiểm tra email của bạn</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Chúng tôi đã gửi link xác thực tới email bạn vừa đăng ký. Sau khi
              xác thực, tài khoản của bạn sẽ chờ admin duyệt trước khi có thể
              đăng nhập.
            </p>
          </CardContent>
        </Card>
      </main>
    );
  }

  const { errors } = form.formState;

  return (
    <main className="flex flex-1 items-center justify-center p-8">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Đăng ký chủ sân</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fullName">Họ tên</Label>
              <Input
                id="fullName"
                aria-invalid={!!errors.fullName}
                {...form.register("fullName")}
              />
              {errors.fullName && (
                <p className="text-sm text-destructive">
                  {errors.fullName.message}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                aria-invalid={!!errors.email}
                {...form.register("email")}
              />
              {errors.email && (
                <p className="text-sm text-destructive">{errors.email.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Mật khẩu</Label>
              <Input
                id="password"
                type="password"
                aria-invalid={!!errors.password}
                {...form.register("password")}
              />
              {errors.password && (
                <p className="text-sm text-destructive">
                  {errors.password.message}
                </p>
              )}
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={form.formState.isSubmitting}
            >
              Đăng ký
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            Là khách hàng?{" "}
            <Link href="/register" className="underline">
              Đăng ký tại đây
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
```

- [ ] **Step 2: Verify it renders**

```bash
curl -s http://localhost:3000/register/owner | grep -o 'Đăng ký chủ sân'
```

Expected: at least one match.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/register/owner/page.tsx
git commit -m "feat(web): add /register/owner page"
```

---

### Task 14: `/login` page

`useSearchParams()` (used here to read `?returnTo=`) requires a `<Suspense>` boundary around the component that calls it, or the production build fails with "useSearchParams() should be wrapped in a suspense boundary." This page (and Tasks 15 and 16's `/reset-password`) use the split-component pattern below to satisfy that.

**Files:**
- Create: `apps/web/src/app/login/page.tsx`

**Interfaces:**
- Consumes: `loginSchema`/`LoginInput`, `getSubmitErrorMessage` (Task 6), `POST /api/auth/login` (Task 8).
- Produces: the `/login` page.

- [ ] **Step 1: Build the page**

Create `apps/web/src/app/login/page.tsx`:

```tsx
"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { loginSchema, type LoginInput } from "@/lib/schemas";
import { getSubmitErrorMessage } from "@/lib/error-message";

const ROLE_HOME: Record<string, string> = {
  customer: "/me",
  owner: "/owner",
  admin: "/admin/owners",
};

export default function LoginPage() {
  return (
    <Suspense>
      <LoginPageContent />
    </Suspense>
  );
}

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(values: LoginInput) {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const data = await response.json().catch(() => null);

    if (!response.ok) {
      toast.error(getSubmitErrorMessage(response, data));
      return;
    }

    const returnTo = searchParams.get("returnTo");
    router.push(returnTo ?? ROLE_HOME[data.role] ?? "/");
    router.refresh();
  }

  const { errors } = form.formState;

  return (
    <main className="flex flex-1 items-center justify-center p-8">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Đăng nhập</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                aria-invalid={!!errors.email}
                {...form.register("email")}
              />
              {errors.email && (
                <p className="text-sm text-destructive">{errors.email.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Mật khẩu</Label>
              <Input
                id="password"
                type="password"
                aria-invalid={!!errors.password}
                {...form.register("password")}
              />
              {errors.password && (
                <p className="text-sm text-destructive">
                  {errors.password.message}
                </p>
              )}
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={form.formState.isSubmitting}
            >
              Đăng nhập
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            Quên mật khẩu?{" "}
            <Link href="/forgot-password" className="underline">
              Đặt lại tại đây
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
```

- [ ] **Step 2: Verify it renders**

```bash
curl -s http://localhost:3000/login | grep -o 'name="password"'
```

Expected: at least one match.

- [ ] **Step 3: Verify the production build handles `useSearchParams` correctly**

```bash
cd apps/web && npm run build
cd ../..
```

Expected: `✓ Compiled successfully` with no "useSearchParams() should be wrapped in a suspense boundary" error.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/login/page.tsx
git commit -m "feat(web): add /login page"
```

---

### Task 15: `/verify-email` page

**Files:**
- Create: `apps/web/src/app/verify-email/page.tsx`

**Interfaces:**
- Consumes: `GET /api/auth/verify-email` (Task 7).
- Produces: the `/verify-email` page.

- [ ] **Step 1: Build the page**

Create `apps/web/src/app/verify-email/page.tsx`:

```tsx
"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Status = "loading" | "success" | "error";

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <VerifyEmailContent />
    </Suspense>
  );
}

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [status, setStatus] = useState<Status>("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setMessage("Thiếu token xác thực.");
      return;
    }

    fetch(`/api/auth/verify-email?token=${encodeURIComponent(token)}`)
      .then(async (response) => {
        const data = await response.json().catch(() => null);
        if (!response.ok) {
          setStatus("error");
          setMessage(data?.message ?? "Xác thực thất bại.");
          return;
        }
        setStatus("success");
        setMessage(
          data.status === "pending_approval"
            ? "Xác thực email thành công. Tài khoản của bạn đang chờ admin duyệt."
            : "Xác thực email thành công. Bạn có thể đăng nhập ngay.",
        );
      })
      .catch(() => {
        setStatus("error");
        setMessage("Có lỗi xảy ra, vui lòng thử lại.");
      });
  }, [token]);

  return (
    <main className="flex flex-1 items-center justify-center p-8">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Xác thực email</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {status === "loading" && <p>Đang xác thực...</p>}
          {status !== "loading" && <p>{message}</p>}
          {status === "success" && (
            <Link href="/login" className="underline">
              Đến trang đăng nhập
            </Link>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
```

- [ ] **Step 2: Verify it renders**

```bash
curl -s http://localhost:3000/verify-email | grep -o 'Xác thực email'
```

Expected: at least one match. (The full click-through — real token, real success/pending_approval message — is exercised in Task 19's browser walkthrough, since the actual verification call only runs client-side after hydration.)

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/verify-email/page.tsx
git commit -m "feat(web): add /verify-email page"
```

---

### Task 16: `/forgot-password` and `/reset-password` pages

**Files:**
- Create: `apps/web/src/app/forgot-password/page.tsx`
- Create: `apps/web/src/app/reset-password/page.tsx`

**Interfaces:**
- Consumes: `forgotPasswordSchema`/`resetPasswordSchema` (Task 6), `POST /api/auth/forgot-password` and `POST /api/auth/reset-password` (Task 7).
- Produces: the `/forgot-password` and `/reset-password` pages.

- [ ] **Step 1: Build `/forgot-password`**

Create `apps/web/src/app/forgot-password/page.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { forgotPasswordSchema, type ForgotPasswordInput } from "@/lib/schemas";

export default function ForgotPasswordPage() {
  const [submitted, setSubmitted] = useState(false);
  const form = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  async function onSubmit(values: ForgotPasswordInput) {
    const response = await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });

    if (!response.ok) {
      toast.error("Có lỗi xảy ra, vui lòng thử lại.");
      return;
    }

    setSubmitted(true);
  }

  if (submitted) {
    return (
      <main className="flex flex-1 items-center justify-center p-8">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>Kiểm tra email của bạn</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Nếu email tồn tại, chúng tôi đã gửi hướng dẫn đặt lại mật khẩu.
            </p>
          </CardContent>
        </Card>
      </main>
    );
  }

  const { errors } = form.formState;

  return (
    <main className="flex flex-1 items-center justify-center p-8">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Quên mật khẩu</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                aria-invalid={!!errors.email}
                {...form.register("email")}
              />
              {errors.email && (
                <p className="text-sm text-destructive">{errors.email.message}</p>
              )}
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={form.formState.isSubmitting}
            >
              Gửi yêu cầu
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
```

- [ ] **Step 2: Build `/reset-password`**

Create `apps/web/src/app/reset-password/page.tsx`:

```tsx
"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { resetPasswordSchema, type ResetPasswordInput } from "@/lib/schemas";
import { getSubmitErrorMessage } from "@/lib/error-message";

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordContent />
    </Suspense>
  );
}

function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const form = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { token, newPassword: "" },
  });

  async function onSubmit(values: ResetPasswordInput) {
    const response = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const data = await response.json().catch(() => null);

    if (!response.ok) {
      toast.error(getSubmitErrorMessage(response, data));
      return;
    }

    toast.success("Đặt lại mật khẩu thành công");
    router.push("/login");
  }

  const { errors } = form.formState;

  return (
    <main className="flex flex-1 items-center justify-center p-8">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Đặt lại mật khẩu</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="newPassword">Mật khẩu mới</Label>
              <Input
                id="newPassword"
                type="password"
                aria-invalid={!!errors.newPassword}
                {...form.register("newPassword")}
              />
              {errors.newPassword && (
                <p className="text-sm text-destructive">
                  {errors.newPassword.message}
                </p>
              )}
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={form.formState.isSubmitting}
            >
              Đặt lại mật khẩu
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
```

Note: `token` has no visible input field — it's carried purely through `defaultValues` (set from the URL's `?token=`) and submitted as-is via `form.handleSubmit`, which includes every field in the form's state whether or not it has a rendered control.

- [ ] **Step 3: Verify both render, and verify `/api/auth/reset-password` end-to-end**

```bash
curl -s http://localhost:3000/forgot-password | grep -o 'Quên mật khẩu'
curl -s http://localhost:3000/reset-password | grep -o 'Đặt lại mật khẩu'
```

Expected: both find a match.

Now exercise the real reset flow (this also verifies Task 7's `/api/auth/reset-password` proxy, which Task 7 deferred):

```bash
curl -s -X POST http://localhost:3000/api/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{"email":"fe-customer@test.com"}'
```

Open Mailhog, copy the reset token from the new email, then:

```bash
curl -s -X POST http://localhost:3000/api/auth/reset-password \
  -H "Content-Type: application/json" \
  -d '{"token":"<paste-token-here>","newPassword":"newpassword123"}'
```

Expected: `{"message":"Đặt lại mật khẩu thành công"}`. Confirm the new password works:

```bash
curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"fe-customer@test.com","password":"newpassword123"}'
```

Expected: `{"role":"customer"}`.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/forgot-password/page.tsx apps/web/src/app/reset-password/page.tsx
git commit -m "feat(web): add /forgot-password and /reset-password pages"
```

---

### Task 17: `/me` (profile) and `/owner` (placeholder) pages

**Files:**
- Create: `apps/web/src/app/me/page.tsx`
- Create: `apps/web/src/app/owner/page.tsx`

**Interfaces:**
- Consumes: `updateProfileSchema`/`UpdateProfileInput` (Task 6), `GET`/`PATCH /api/users/me` (Task 9), `POST /api/auth/logout` (Task 8).
- Produces: the `/me` and `/owner` pages.

- [ ] **Step 1: Build `/me`**

Create `apps/web/src/app/me/page.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { updateProfileSchema, type UpdateProfileInput } from "@/lib/schemas";
import { getSubmitErrorMessage } from "@/lib/error-message";

interface Profile {
  email: string;
  fullName: string;
  phone: string | null;
  avatarUrl: string | null;
}

export default function ProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const form = useForm<UpdateProfileInput>({
    resolver: zodResolver(updateProfileSchema),
    defaultValues: { fullName: "", phone: "", avatarUrl: "" },
  });

  useEffect(() => {
    fetch("/api/users/me")
      .then(async (res) => {
        if (res.status === 401) {
          router.push("/login?returnTo=%2Fme");
          return null;
        }
        return (await res.json()) as Profile;
      })
      .then((data) => {
        if (!data) return;
        setProfile(data);
        form.reset({
          fullName: data.fullName,
          phone: data.phone ?? "",
          avatarUrl: data.avatarUrl ?? "",
        });
      });
  }, [form, router]);

  async function onSubmit(values: UpdateProfileInput) {
    const response = await fetch("/api/users/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const data = await response.json().catch(() => null);

    if (!response.ok) {
      toast.error(getSubmitErrorMessage(response, data));
      return;
    }

    toast.success("Đã lưu thay đổi");
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  if (!profile) {
    return (
      <main className="flex flex-1 items-center justify-center p-8">
        <p>Đang tải...</p>
      </main>
    );
  }

  const { errors } = form.formState;

  return (
    <main className="flex flex-1 items-center justify-center p-8">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Hồ sơ của tôi</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-muted-foreground">{profile.email}</p>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fullName">Họ tên</Label>
              <Input
                id="fullName"
                aria-invalid={!!errors.fullName}
                {...form.register("fullName")}
              />
              {errors.fullName && (
                <p className="text-sm text-destructive">
                  {errors.fullName.message}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Số điện thoại</Label>
              <Input id="phone" {...form.register("phone")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="avatarUrl">Ảnh đại diện (URL)</Label>
              <Input
                id="avatarUrl"
                aria-invalid={!!errors.avatarUrl}
                {...form.register("avatarUrl")}
              />
              {errors.avatarUrl && (
                <p className="text-sm text-destructive">
                  {errors.avatarUrl.message}
                </p>
              )}
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={form.formState.isSubmitting}
            >
              Lưu thay đổi
            </Button>
          </form>
          <Button variant="outline" className="mt-4 w-full" onClick={handleLogout}>
            Đăng xuất
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
```

- [ ] **Step 2: Build `/owner`**

Create `apps/web/src/app/owner/page.tsx`:

```tsx
"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function OwnerDashboardPage() {
  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <main className="flex flex-1 items-center justify-center p-8">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Chào chủ sân</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">
            Bạn đã đăng nhập với vai trò chủ sân. Tính năng quản lý sân sẽ sớm
            ra mắt.
          </p>
          <Button variant="outline" className="w-full" onClick={handleLogout}>
            Đăng xuất
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
```

- [ ] **Step 3: Verify both render**

```bash
curl -s http://localhost:3000/me | grep -o 'Đang tải\|Hồ sơ của tôi'
curl -s http://localhost:3000/owner | grep -o 'Chào chủ sân'
```

Expected: both find a match. (`/me`'s initial server-render shows the loading state since the profile fetch only runs client-side after hydration — the real data-loaded view is checked in Task 19.)

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/me/page.tsx apps/web/src/app/owner/page.tsx
git commit -m "feat(web): add /me profile page and /owner placeholder page"
```

---

### Task 18: `/admin/owners` page

**Files:**
- Create: `apps/web/src/app/admin/owners/page.tsx`

**Interfaces:**
- Consumes: `GET /api/admin/owners/pending`, `POST /api/admin/owners/:id/approve`, `POST /api/admin/owners/:id/reject` (Task 10), `POST /api/auth/logout` (Task 8).
- Produces: the `/admin/owners` page.

- [ ] **Step 1: Build the page**

Create `apps/web/src/app/admin/owners/page.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface PendingOwner {
  id: string;
  email: string;
  fullName: string;
}

export default function AdminOwnersPage() {
  const router = useRouter();
  const [owners, setOwners] = useState<PendingOwner[] | null>(null);

  async function loadPending() {
    const response = await fetch("/api/admin/owners/pending");
    if (response.status === 401) {
      router.push("/login?returnTo=%2Fadmin%2Fowners");
      return;
    }
    const data = await response.json().catch(() => []);
    setOwners(Array.isArray(data) ? data : []);
  }

  useEffect(() => {
    loadPending();
  }, []);

  async function handleDecision(id: string, action: "approve" | "reject") {
    const response = await fetch(`/api/admin/owners/${id}/${action}`, {
      method: "POST",
    });
    if (!response.ok) {
      toast.error("Có lỗi xảy ra, vui lòng thử lại.");
      return;
    }
    toast.success(action === "approve" ? "Đã duyệt chủ sân" : "Đã từ chối chủ sân");
    loadPending();
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-1 flex-col gap-6 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Chủ sân chờ duyệt</h1>
        <Button variant="outline" onClick={handleLogout}>
          Đăng xuất
        </Button>
      </div>

      {owners === null && <p>Đang tải...</p>}
      {owners !== null && owners.length === 0 && (
        <p className="text-muted-foreground">
          Không có chủ sân nào đang chờ duyệt.
        </p>
      )}

      <div className="flex flex-col gap-4">
        {owners?.map((owner) => (
          <Card key={owner.id}>
            <CardHeader>
              <CardTitle className="text-base">{owner.fullName}</CardTitle>
            </CardHeader>
            <CardContent className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{owner.email}</span>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => handleDecision(owner.id, "approve")}>
                  Duyệt
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => handleDecision(owner.id, "reject")}
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

- [ ] **Step 2: Verify it renders**

```bash
curl -s http://localhost:3000/admin/owners | grep -o 'Chủ sân chờ duyệt'
```

Expected: at least one match.

- [ ] **Step 3: Run the full Vitest suite and a production build one more time**

Run: `cd apps/web && npm test && npm run build`
Expected: both PASS

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/admin/owners/page.tsx
git commit -m "feat(web): add /admin/owners page"
```

---

### Task 19: Manual browser verification and final automated test run

Every prior task verified its own piece via curl. This task is the real thing: click through both flows in an actual browser, using fresh accounts so nothing collides with the curl-created ones (`fe-customer@test.com`'s password was already changed in Task 16; `fe-owner@test.com` was already approved in Task 10).

- [ ] **Step 1: Confirm the admin account still exists**

```bash
cd apps/api
ADMIN_EMAIL=admin@pickleball.local ADMIN_PASSWORD=changeme123 npm run seed:admin
cd ../..
```

Expected: `already exists, skipping.` (or `created.` if this is the first time in this session).

- [ ] **Step 2: Full customer flow, in a real browser**

1. Open `http://localhost:3000`. Click **Đăng nhập** and **Đăng ký** — confirm both land on the right pages.
2. Go to `/register`. Fill in email `browser-customer@test.com`, password `password123`, full name `Browser Customer`. Submit.
3. Confirm the page now shows "Kiểm tra email của bạn".
4. Open `http://localhost:8025` (Mailhog), find the email to `browser-customer@test.com`, click its verification link.
5. Confirm the `/verify-email` page shows "Xác thực email thành công. Bạn có thể đăng nhập ngay." with a working "Đến trang đăng nhập" link.
6. Go to `/login`, log in with `browser-customer@test.com` / `password123`.
7. Confirm you land on `/me` showing the profile, pre-filled with "Browser Customer".
8. Change "Họ tên" to "Browser Customer Updated", click "Lưu thay đổi". Confirm a success toast appears and the field keeps the new value after a page refresh.
9. While still logged in as this customer, navigate directly to `http://localhost:3000/admin/owners`. Confirm you're redirected back to `/me` (role mismatch, not the admin page).
10. Click "Đăng xuất". Confirm you land on `/login`.
11. Navigate directly to `http://localhost:3000/me`. Confirm you're redirected to `/login?returnTo=%2Fme` (no session left).

- [ ] **Step 3: Full owner + admin approval flow, in a real browser**

1. Go to `/register/owner`. Fill in email `browser-owner@test.com`, password `password123`, full name `Browser Owner`. Submit.
2. Confirm the success message mentions waiting for admin approval.
3. Verify the email via its Mailhog link. Confirm the `/verify-email` page shows the "đang chờ admin duyệt" message (not the plain "đăng nhập ngay" one).
4. Go to `/login` and try logging in as `browser-owner@test.com` / `password123`. Confirm you get an error toast (something like "Tài khoản đang chờ admin duyệt") and stay on `/login`.
5. Log in as `admin@pickleball.local` / `changeme123`. Confirm you land on `/admin/owners` and see `browser-owner@test.com` in the list.
6. Click "Duyệt" on that row. Confirm a success toast appears and the row disappears from the list.
7. Click "Đăng xuất".
8. Log in again as `browser-owner@test.com` / `password123`. Confirm it now succeeds and you land on `/owner`, showing the placeholder message.
9. Click "Đăng xuất" and confirm you land on `/login`.

- [ ] **Step 4: Run the full automated suite one last time**

```bash
cd apps/web && npm test && npx tsc --noEmit && npm run build
cd ../api && npm test && npm run test:e2e
cd ..
```

Expected: every command passes — Vitest (frontend logic), `tsc` (frontend types), the frontend production build, and the full backend unit + e2e suite (confirming Task 1's `mail.service.ts` change didn't regress anything).

- [ ] **Step 5: Stop the background dev servers**

```bash
# find and kill the `next dev` and `nest start --watch` processes started in Task 7
```

(No commit for this task — it's verification only.)
