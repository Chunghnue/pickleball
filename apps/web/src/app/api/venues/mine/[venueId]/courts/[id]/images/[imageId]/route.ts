import { NextRequest } from 'next/server';
import { fetchApi } from '@/lib/fetch-api';
import { clearAuthCookies } from '@/lib/auth-cookies';
import { toNextResponse } from '@/lib/proxy-response';

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ venueId: string; id: string; imageId: string }> },
) {
  const { venueId, id, imageId } = await params;
  const upstream = await fetchApi(
    `/venues/mine/${venueId}/courts/${id}/images/${imageId}`,
    { method: 'DELETE' },
  );
  if (upstream.status === 401) {
    await clearAuthCookies();
  }
  return toNextResponse(upstream);
}
