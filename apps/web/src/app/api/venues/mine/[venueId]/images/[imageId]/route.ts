import { fetchApi } from '@/lib/fetch-api';
import { clearAuthCookies } from '@/lib/auth-cookies';
import { toNextResponse } from '@/lib/proxy-response';

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ venueId: string; imageId: string }> },
) {
  const { venueId, imageId } = await params;
  const upstream = await fetchApi(
    `/venues/mine/${venueId}/images/${imageId}`,
    { method: 'DELETE' },
  );
  if (upstream.status === 401) {
    await clearAuthCookies();
  }
  return toNextResponse(upstream);
}
