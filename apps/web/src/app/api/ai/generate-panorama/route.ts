// ============================================================================
// POST /api/ai/generate-panorama — AI 720/360 全景场景图生成
// ============================================================================
// 复用现有图片生成基础设施，使用 equirectangular 优化的 prompt 模板。
// 支持多种全景场景类型：室内、户外、科幻、水下、天空、自定义。
// ============================================================================

import { NextRequest, NextResponse } from "next/server"
import { mergeProviderConfig } from "@/lib/ai/provider-config"
import { normalizeUpstreamError, normalizeClientError } from "@/lib/ai/errors"
import { fetchWithTimeout } from "@/lib/ai/server-fetch"

// ── 全景类型与 Prompt 模板 ───────────────────────────────────────────────────

type PanoramaType = "indoor" | "outdoor" | "sci-fi" | "underwater" | "sky" | "custom"

interface PanoramaTemplate {
  type: PanoramaType
  name: string
  nameCN: string
  size: string
  promptTemplate: (subject: string, style: string, extras: string) => string
  negativePrompt?: string
}

const PANORAMA_TEMPLATES: Record<PanoramaType, PanoramaTemplate> = {
  indoor: {
    type: "indoor",
    name: "indoor",
    nameCN: "室内全景",
    size: "1792x1024",
    promptTemplate: (subject, style, extras) =>
      `360-degree equirectangular indoor panoramic view, ${subject}, seamless 360x180 immersive environment, ` +
      `room-scale, photorealistic interior, consistent lighting across entire panorama, ` +
      `no visible seams or distortions, ${style}, ${extras}, uniform exposure, 8k`.trim(),
    negativePrompt: "cropped, seam visible, distorted edges, inconsistent lighting, flat projection, non-equirectangular",
  },
  outdoor: {
    type: "outdoor",
    name: "outdoor",
    nameCN: "户外全景",
    size: "1792x1024",
    promptTemplate: (subject, style, extras) =>
      `360-degree equirectangular outdoor panoramic view, ${subject}, seamless 360x180 immersive environment, ` +
      `natural landscape, continuous horizon, consistent sky and lighting across full panorama, ` +
      `${style}, ${extras}, photorealistic, 8k, hdr`.trim(),
    negativePrompt: "cropped, seam visible, distorted horizon, inconsistent sky, flat projection, non-equirectangular",
  },
  "sci-fi": {
    type: "sci-fi",
    name: "sci-fi",
    nameCN: "科幻全景",
    size: "1792x1024",
    promptTemplate: (subject, style, extras) =>
      `360-degree equirectangular sci-fi panoramic view, ${subject}, seamless 360x180 immersive environment, ` +
      `futuristic environment, consistent neon/ambient lighting across full panorama, ` +
      `${style}, ${extras}, cyberpunk or space station aesthetic, 8k`.trim(),
    negativePrompt: "cropped, seam visible, inconsistent lighting, flat projection, non-equirectangular",
  },
  underwater: {
    type: "underwater",
    name: "underwater",
    nameCN: "水下全景",
    size: "1792x1024",
    promptTemplate: (subject, style, extras) =>
      `360-degree equirectangular underwater panoramic view, ${subject}, seamless 360x180 immersive environment, ` +
      `ocean or aquatic scene, caustic lighting, consistent water color across full panorama, ` +
      `${style}, ${extras}, photorealistic underwater atmosphere, 8k`.trim(),
    negativePrompt: "cropped, seam visible, inconsistent water color, flat projection, non-equirectangular",
  },
  sky: {
    type: "sky",
    name: "sky",
    nameCN: "天空全景",
    size: "1792x1024",
    promptTemplate: (subject, style, extras) =>
      `360-degree equirectangular sky/aerial panoramic view, ${subject}, seamless 360x180 immersive environment, ` +
      `clouds or celestial scene, consistent sky gradient across full panorama, ` +
      `${style}, ${extras}, atmospheric, hdr, 8k`.trim(),
    negativePrompt: "cropped, seam visible, inconsistent sky, flat projection, non-equirectangular",
  },
  custom: {
    type: "custom",
    name: "custom",
    nameCN: "自定义全景",
    size: "1792x1024",
    promptTemplate: (subject, style, extras) =>
      `360-degree equirectangular panoramic view, ${subject}, seamless 360x180 immersive environment, ` +
      `consistent lighting and atmosphere across full spherical panorama, ` +
      `${style}, ${extras}, photorealistic, 8k, uniform exposure`.trim(),
    negativePrompt: "cropped, seam visible, distorted edges, inconsistent lighting, flat projection",
  },
}

// ── 图片生成调用 ────────────────────────────────────────────────────────────

async function generateImage(params: {
  prompt: string
  size: string
  model: string
  baseUrl: string
  apiKey: string
  timeoutMs: number
}): Promise<{ b64_json: string; revised_prompt?: string }> {
  const { prompt, size, model, baseUrl, apiKey, timeoutMs } = params
  try {
    const upstream = await fetchWithTimeout(`${baseUrl}/images/generations`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        prompt,
        n: 1,
        size,
        response_format: "b64_json",
      }),
    }, timeoutMs)

    if (!upstream.ok) {
      const text = await upstream.text()
      const error = normalizeUpstreamError(upstream.status, text, "openai-compatible")
      throw new Error(error.message)
    }

    const data = await upstream.json()
    const image = data.data?.[0]

    if (!image?.b64_json) {
      throw new Error("全景图生成返回空结果")
    }

    return {
      b64_json: image.b64_json,
      revised_prompt: image.revised_prompt,
    }
  } catch (error) {
    throw error
  }
}

// ── API Handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>

  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { error: { code: "invalid_request", message: "Invalid JSON body" } },
      { status: 400 },
    )
  }

  const panoramaType = (body.panoramaType as PanoramaType) || "custom"
  const subject = typeof body.subject === "string" ? body.subject : ""
  const style = typeof body.style === "string" ? body.style : "photorealistic"
  const extras = typeof body.extras === "string" ? body.extras : ""

  if (!subject) {
    return NextResponse.json(
      { error: { code: "missing_subject", message: "请提供全景场景描述 (subject)" } },
      { status: 400 },
    )
  }

  const template = PANORAMA_TEMPLATES[panoramaType] || PANORAMA_TEMPLATES.custom
  const prompt = template.promptTemplate(subject, style, extras)
  const negativePrompt = body.negativePrompt as string | undefined
  const fullPrompt = negativePrompt
    ? `${prompt}\n\nNegative prompt: ${negativePrompt}, ${template.negativePrompt || ""}`
    : `${prompt}\n\nNegative prompt: ${template.negativePrompt || ""}`

  // ── 获取 AI Provider 配置 ─────────────────────────────────────────────────
  const providerConfig = mergeProviderConfig(
    body._providerOverrides as Record<string, unknown> | undefined,
  )

  const baseUrl = providerConfig.baseUrl || process.env.AI_BASE_URL || "https://api.openai.com/v1"
  const apiKey = providerConfig.apiKey || process.env.AI_API_KEY || ""
  const model = (body.model as string) || providerConfig.defaultModel || providerConfig.defaultImageModel || "dall-e-3"
  const timeoutMs = Math.min(
    Number(body.timeoutMs) || 120000,
    300000,
  )

  if (!apiKey) {
    return NextResponse.json(
      { error: { code: "no_api_key", message: "AI API Key 未配置" } },
      { status: 400 },
    )
  }

  try {
    const result = await generateImage({
      prompt: fullPrompt,
      size: template.size,
      model,
      baseUrl,
      apiKey,
      timeoutMs,
    })

    return NextResponse.json({
      data: [{
        b64_json: result.b64_json,
        revised_prompt: result.revised_prompt,
        panoramaType,
        prompt: fullPrompt,
      }],
      meta: {
        panorama: true,
        equirectangular: true,
        size: template.size,
      },
    })
  } catch (error) {
    const normalized = normalizeClientError(error)
    return NextResponse.json(
      { error: { code: normalized.code, message: normalized.message } },
      { status: normalized.status || 500 },
    )
  }
}
