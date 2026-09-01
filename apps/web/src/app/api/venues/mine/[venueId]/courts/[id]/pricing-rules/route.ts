import { NextRequest } from 'next/server';
import { fetchApi } from '@/lib/fetch-api';
import { clearAuthCookies } from '@/lib/auth-cookies';
import { toNextResponse } from '@/lib/proxy-response';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ venueId: string; id: string }> },
) {
  const { venueId, id } = await params;
  const upstream = await fetchApi(`/venues/mine/${venueId}/courts/${id}/pricing-rules`);
  if (upstream.status === 401) {
    await clearAuthCookies();
  }
  return toNextResponse(upstream);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ venueId: string; id: string }> },
) {
  const { venueId, id } = await params;
  const body = await request.json();
  const upstream = await fetchApi(`/venues/mine/${venueId}/courts/${id}/pricing-rules`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (upstream.status === 401) {
    await clearAuthCookies();
  }
  return toNextResponse(upstream);
}
