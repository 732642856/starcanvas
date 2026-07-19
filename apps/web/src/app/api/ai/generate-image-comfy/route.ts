import { NextRequest, NextResponse } from "next/server"

import { getLocalComfyConfig, runComfyTextToImage } from "@/lib/ai/comfy-client"
import { getComfyImageResponse } from "./route-core"

export async function POST(request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    body = undefined
  }
  const response = await getComfyImageResponse({
    host: request.headers.get("host"),
    body,
    config: getLocalComfyConfig(),
    run: runComfyTextToImage,
  })
  return NextResponse.json(response.body, { status: response.status })
}
