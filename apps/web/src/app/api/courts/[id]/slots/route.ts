import { NextRequest } from 'next/server';
import { API_BASE_URL } from '@/lib/api-config';
import { toNextResponse } from '@/lib/proxy-response';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const date = request.nextUrl.searchParams.get('date') ?? '';
  const upstream = await fetch(
    `${API_BASE_URL}/courts/${id}/slots?date=${encodeURIComponent(date)}`,
  );
  return toNextResponse(upstream);
}
