import { NextResponse } from "next/server"

import { fetchCopseBatchImageModels } from "@/lib/ai/copse-batch-image-client"
import { getProvider } from "@/lib/ai/provider-registry"

export const dynamic = "force-dynamic"

export async function GET() {
  const provider = getProvider()

  if (!provider.apiKey) {
    return NextResponse.json({ ok: false, error: "图片 Provider 未配置 API Key。" }, { status: 400 })
  }

  try {
    const models = await fetchCopseBatchImageModels({
      baseUrl: provider.baseUrl,
      apiKey: provider.apiKey,
    })

    return NextResponse.json({
      ok: true,
      providerId: provider.id,
      configuredImageModel: provider.defaultImageModel,
      configuredImageModelAvailable: models.includes(provider.defaultImageModel),
      models,
    })
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "读取 Copse 异步图片模型目录失败。",
    }, { status: 502 })
  }
}
