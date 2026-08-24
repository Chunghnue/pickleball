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
