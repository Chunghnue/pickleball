import { NextRequest } from 'next/server';
import { API_BASE_URL } from '@/lib/api-config';
import { toNextResponse } from '@/lib/proxy-response';

export async function GET(request: NextRequest) {
  const params = new URLSearchParams();
  for (const key of ['query', 'city']) {
    const value = request.nextUrl.searchParams.get(key);
    if (value) params.set(key, value);
  }
  const qs = params.toString();
  const upstream = await fetch(`${API_BASE_URL}/venues/map${qs ? `?${qs}` : ''}`);
  return toNextResponse(upstream);
}
