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
