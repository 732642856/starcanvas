import { NextRequest, NextResponse } from "next/server";

import { buildProviderSmokeReport } from "@/lib/ai/providerSmoke";
import type { AiProviderOverrides } from "@/lib/ai/provider-config";

function extractOverrides(body: unknown): AiProviderOverrides | undefined {
  if (!body || typeof body !== "object") return undefined;
  const value = (body as { _providerOverrides?: unknown })._providerOverrides;
  if (!value || typeof value !== "object") return undefined;
  return value as AiProviderOverrides;
}

export async function GET() {
  return NextResponse.json(
    buildProviderSmokeReport({
      voxcpmBaseUrl: process.env.VOXCPM_BASE_URL,
    }),
  );
}

export async function POST(request: NextRequest) {
  let body: unknown = undefined;
  try {
    body = await request.json();
  } catch {
    body = undefined;
  }

  return NextResponse.json(
    buildProviderSmokeReport({
      overrides: extractOverrides(body),
      voxcpmBaseUrl: process.env.VOXCPM_BASE_URL,
    }),
  );
}
