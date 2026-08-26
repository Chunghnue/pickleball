import { fetchApi } from '@/lib/fetch-api';
import { toNextResponse } from '@/lib/proxy-response';

export async function GET() {
  const upstream = await fetchApi('/admin/stats');
  return toNextResponse(upstream);
}
