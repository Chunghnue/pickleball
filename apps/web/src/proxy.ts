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
