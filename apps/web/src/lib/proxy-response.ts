import { NextResponse } from 'next/server';

export async function toNextResponse(upstream: Response): Promise<NextResponse> {
  const data = await upstream.json().catch(() => null);
  return NextResponse.json(data, { status: upstream.status });
}
