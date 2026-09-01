import { NextRequest } from 'next/server';
import { fetchApi } from '@/lib/fetch-api';
import { clearAuthCookies } from '@/lib/auth-cookies';
import { toNextResponse } from '@/lib/proxy-response';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ venueId: string; sourceVenueId: string }> },
) {
  const { venueId, sourceVenueId } = await params;
  const upstream = await fetchApi(
    `/venues/mine/${venueId}/pricing-rules/copy-from-venue/${sourceVenueId}`,
    { method: 'POST' },
  );
  if (upstream.status === 401) {
    await clearAuthCookies();
  }
  return toNextResponse(upstream);
}
