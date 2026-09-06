import { toNextResponse } from "@/lib/proxy-response";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const upstream = await fetch(
    `https://provinces.open-api.vn/api/v2/p/${code}?depth=2`,
  );
  return toNextResponse(upstream);
}
