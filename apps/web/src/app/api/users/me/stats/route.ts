import { fetchApi } from '@/lib/fetch-api';
import { clearAuthCookies } from '@/lib/auth-cookies';
import { toNextResponse } from '@/lib/proxy-response';

export async function GET() {
  const upstream = await fetchApi('/users/me/stats');
  if (upstream.status === 401) {
    await clearAuthCookies();
  }
  return toNextResponse(upstream);
}
