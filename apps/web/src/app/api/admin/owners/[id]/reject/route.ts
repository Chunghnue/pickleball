import { fetchApi } from '@/lib/fetch-api';
import { toNextResponse } from '@/lib/proxy-response';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const upstream = await fetchApi(`/admin/owners/${id}/reject`, {
    method: 'POST',
  });
  return toNextResponse(upstream);
}
