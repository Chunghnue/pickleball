import { NextRequest, NextResponse } from "next/server";
import { fetchApi } from "@/lib/fetch-api";

export async function GET(request: NextRequest) {
  const qs = request.nextUrl.searchParams.toString();
  const upstream = await fetchApi(`/reports/revenue/export${qs ? `?${qs}` : ""}`);
  const body = await upstream.arrayBuffer();
  return new NextResponse(body, {
    status: upstream.status,
    headers: {
      "Content-Type": upstream.headers.get("Content-Type") ?? "text/csv",
      "Content-Disposition": upstream.headers.get("Content-Disposition") ?? "attachment",
    },
  });
}
