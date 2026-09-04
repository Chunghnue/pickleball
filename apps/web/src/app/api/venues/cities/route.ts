import { API_BASE_URL } from '@/lib/api-config';
import { toNextResponse } from '@/lib/proxy-response';

export async function GET() {
  const upstream = await fetch(`${API_BASE_URL}/venues/cities`);
  return toNextResponse(upstream);
}
