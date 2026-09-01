import { NextRequest } from 'next/server';
import { fetchApi } from '@/lib/fetch-api';
import { clearAuthCookies } from '@/lib/auth-cookies';
import { toNextResponse } from '@/lib/proxy-response';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ venueId: string; id: string }> },
) {
  const { venueId, id } = await params;
  const upstream = await fetchApi(`/venues/mine/${venueId}/recurring-schedules/${id}`);
  if (upstream.status === 401) {
    await clearAuthCookies();
  }
  return toNextResponse(upstream);
}
