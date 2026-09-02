import { NextRequest } from "next/server";
import { fetchApi } from "@/lib/fetch-api";
import { clearAuthCookies } from "@/lib/auth-cookies";
import { toNextResponse } from "@/lib/proxy-response";

export async function GET() {
  const upstream = await fetchApi("/staff");
  return toNextResponse(upstream);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const upstream = await fetchApi("/staff", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (upstream.status === 401) {
    await clearAuthCookies();
  }
  return toNextResponse(upstream);
}
