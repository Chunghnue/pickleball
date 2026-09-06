import { API_BASE_URL } from '@/lib/api-config';
import { toNextResponse } from '@/lib/proxy-response';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const upstream = await fetch(`${API_BASE_URL}/blog/${slug}`);
  return toNextResponse(upstream);
}
