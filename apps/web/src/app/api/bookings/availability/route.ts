import { NextRequest } from 'next/server';
import { API_BASE_URL } from '@/lib/api-config';
import { toNextResponse } from '@/lib/proxy-response';

export async function GET(request: NextRequest) {
  const courtId = request.nextUrl.searchParams.get('courtId') ?? '';
  const date = request.nextUrl.searchParams.get('date') ?? '';
  const upstream = await fetch(
    `${API_BASE_URL}/bookings/availability?courtId=${encodeURIComponent(courtId)}&date=${encodeURIComponent(date)}`,
  );
  return toNextResponse(upstream);
}
