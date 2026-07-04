import { NextRequest, NextResponse } from "next/server";

import { runProviderRealSmoke, type ProviderRealSmokeRequest } from "../run-core";

export async function POST(request: NextRequest) {
  let body: ProviderRealSmokeRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        ok: false,
        status: "blocked",
        message: "Invalid JSON body",
        target: "text",
      },
      { status: 400 },
    );
  }

  const result = await runProviderRealSmoke(body);
  return NextResponse.json(result, {
    status: result.status === "blocked" ? 400 : result.ok ? 200 : 502,
  });
}
