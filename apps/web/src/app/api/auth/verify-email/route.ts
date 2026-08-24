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
