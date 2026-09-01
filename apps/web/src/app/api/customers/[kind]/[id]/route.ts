import { NextRequest } from "next/server";
import { fetchApi } from "@/lib/fetch-api";
import { toNextResponse } from "@/lib/proxy-response";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ kind: string; id: string }> },
) {
  const { kind, id } = await params;
  const upstream = await fetchApi(`/customers/${kind}/${id}`);
  return toNextResponse(upstream);
}
