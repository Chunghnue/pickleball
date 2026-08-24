import { API_BASE_URL } from '@/lib/api-config';
import { toNextResponse } from '@/lib/proxy-response';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const upstream = await fetch(`${API_BASE_URL}/venues/${id}`);
  return toNextResponse(upstream);
}
