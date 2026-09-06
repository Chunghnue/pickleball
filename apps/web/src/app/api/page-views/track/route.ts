import { NextRequest, NextResponse } from "next/server";
import { fetchApi } from "@/lib/fetch-api";
import { toNextResponse } from "@/lib/proxy-response";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const userAgent = request.headers.get("user-agent");
  const upstream = await fetchApi("/page-views/track", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(userAgent ? { "User-Agent": userAgent } : {}),
    },
    body: JSON.stringify(body),
  });
  if (upstream.status === 204) {
    return new NextResponse(null, { status: 204 });
  }
  return toNextResponse(upstream);
}
