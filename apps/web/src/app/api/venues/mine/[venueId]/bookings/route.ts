import { NextRequest } from 'next/server';
import { fetchApi } from '@/lib/fetch-api';
import { clearAuthCookies } from '@/lib/auth-cookies';
import { toNextResponse } from '@/lib/proxy-response';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ venueId: string }> },
) {
  const { venueId } = await params;
  const date = request.nextUrl.searchParams.get('date');
  const path = date
    ? `/venues/mine/${venueId}/bookings?date=${encodeURIComponent(date)}`
    : `/venues/mine/${venueId}/bookings`;
  const upstream = await fetchApi(path);
  if (upstream.status === 401) {
    await clearAuthCookies();
  }
  return toNextResponse(upstream);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ venueId: string }> },
) {
  const { venueId } = await params;
  const body = await request.json();
  const upstream = await fetchApi(`/venues/mine/${venueId}/bookings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (upstream.status === 401) {
    await clearAuthCookies();
  }
  return toNextResponse(upstream);
}
