import { NextRequest } from 'next/server';
import { API_BASE_URL } from '@/lib/api-config';
import { fetchApi } from '@/lib/fetch-api';
import { clearAuthCookies } from '@/lib/auth-cookies';
import { toNextResponse } from '@/lib/proxy-response';

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('query');
  const url = query
    ? `${API_BASE_URL}/venues?query=${encodeURIComponent(query)}`
    : `${API_BASE_URL}/venues`;
  const upstream = await fetch(url);
  return toNextResponse(upstream);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const upstream = await fetchApi('/venues', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (upstream.status === 401) {
    await clearAuthCookies();
  }
  return toNextResponse(upstream);
}
