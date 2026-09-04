import { NextRequest } from 'next/server';
import { fetchApi } from '@/lib/fetch-api';
import { toNextResponse } from '@/lib/proxy-response';

export async function GET(request: NextRequest) {
  const qs = request.nextUrl.searchParams.toString();
  const upstream = await fetchApi(`/dashboard/summary${qs ? `?${qs}` : ''}`);
  return toNextResponse(upstream);
}
