import { NextRequest } from "next/server";
import { fetchApi } from "@/lib/fetch-api";
import { clearAuthCookies } from "@/lib/auth-cookies";
import { toNextResponse } from "@/lib/proxy-response";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ venueId: string }> },
) {
  const { venueId } = await params;
  const formData = await request.formData();
  const upstream = await fetchApi(`/venues/mine/${venueId}/logo`, {
    method: "POST",
    body: formData,
  });
  if (upstream.status === 401) {
    await clearAuthCookies();
  }
  return toNextResponse(upstream);
}
