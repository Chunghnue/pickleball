import { toNextResponse } from "@/lib/proxy-response";

export async function GET() {
  const upstream = await fetch("https://provinces.open-api.vn/api/v2/?depth=1");
  return toNextResponse(upstream);
}
