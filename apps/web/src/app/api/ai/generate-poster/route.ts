// ============================================================================
// POST /api/ai/generate-poster — AI 海报生成
// ============================================================================
// 复用现有图片生成基础设施，使用海报优化的 prompt 模板。
// 支持多种海报风格：角色卡、概念图、宣传海报、社交媒体封面。
// ============================================================================

import { NextRequest, NextResponse } from "next/server"
import { mergeProviderConfig } from "@/lib/ai/provider-config"
import { normalizeUpstreamError, normalizeClientError } from "@/lib/ai/errors"
import { fetchWithTimeout } from "@/lib/ai/server-fetch"

// ── 海报类型与 Prompt 模板 ──────────────────────────────────────────────────

type PosterType = "character-card" | "concept-art" | "promo-poster" | "social-cover" | "story-poster"

interface PosterTemplate {
  type: PosterType
  name: string
  aspectRatio: string
  size: string
  promptTemplate: (subject: string, style: string, extras: string) => string
  negativePrompt?: string
}

const POSTER_TEMPLATES: Record<PosterType, PosterTemplate> = {
  "character-card": {
    type: "character-card",
    name: "角色卡",
    aspectRatio: "3:4",
    size: "1024x1792",
    promptTemplate: (subject, style, extras) =>
      `Professional character design card, ${subject}, full body or portrait, clean background, ` +
      `character turnaround reference sheet style, detailed facial features, costume design, ` +
      `color palette visible, ${style}, ${extras}, studio lighting, high detail, 8k, concept art`.trim(),
    negativePrompt: "blurry, low quality, text, watermark, cropped, bad anatomy",
  },
  "concept-art": {
    type: "concept-art",
    name: "概念场景图",
    aspectRatio: "16:9",
    size: "1792x1024",
    promptTemplate: (subject, style, extras) =>
      `Cinematic concept art, ${subject}, epic composition, dramatic lighting, ` +
      `atmospheric perspective, detailed environment, matte painting style, ` +
      `${style}, ${extras}, film grain, color grading, production quality, 8k`.trim(),
    negativePrompt: "cartoon, anime, low quality, blurry, deformed",
  },
  "promo-poster": {
    type: "promo-poster",
    name: "宣传海报",
    aspectRatio: "2:3",
    size: "1024x1792",
    promptTemplate: (subject, style, extras) =>
      `Movie poster design, ${subject}, dramatic central composition, bold typography space at top and bottom, ` +
      `cinematic color grading, lens flare, atmospheric effects, ${style}, ${extras}, ` +
      `professional graphic design, print quality, high contrast`.trim(),
    negativePrompt: "cluttered, bad composition, text overlay, watermark, low resolution",
  },
  "social-cover": {
    type: "social-cover",
    name: "社交媒体封面",
    aspectRatio: "16:9",
    size: "1792x1024",
    promptTemplate: (subject, style, extras) =>
      `Social media banner design, ${subject}, wide composition, safe space for text overlay in center, ` +
      `eye-catching colors, modern graphic design, ${style}, ${extras}, ` +
      `clean edges, high contrast, optimized for thumbnail`.trim(),
    negativePrompt: "busy center, text, watermark, low quality",
  },
  "story-poster": {
    type: "story-poster",
    name: "故事海报",
    aspectRatio: "9:16",
    size: "1024x1792",
    promptTemplate: (subject, style, extras) =>
      `Vertical story poster, ${subject}, narrative composition, emotional storytelling, ` +
      `character in environment, depth of field, cinematic framing, ${style}, ${extras}, ` +
      `vertical format optimized, phone wallpaper quality`.trim(),
    negativePrompt: "horizontal composition, cropped character, low quality",
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
      throw new Error("图片生成返回空结果")
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

  const posterType = (body.posterType as PosterType) || "promo-poster"
  const subject = typeof body.subject === "string" ? body.subject : ""
  const style = typeof body.style === "string" ? body.style : "cinematic"
  const extras = typeof body.extras === "string" ? body.extras : ""

  if (!subject) {
    return NextResponse.json(
      { error: { code: "invalid_request", message: "subject is required" } },
      { status: 400 },
    )
  }

  const template = POSTER_TEMPLATES[posterType]
  if (!template) {
    return NextResponse.json(
      { error: { code: "invalid_request", message: `Unknown poster type: ${posterType}` } },
      { status: 400 },
    )
  }

  // 构建 prompt
  const prompt = template.promptTemplate(subject, style, extras)

  try {
    const config = mergeProviderConfig()
    const imageModel = config.defaultImageModel || config.defaultModel

    const result = await generateImage({
      prompt,
      size: template.size,
      model: imageModel,
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      timeoutMs: config.timeoutMs,
    })

    return NextResponse.json({
      image: result.b64_json,
      posterType,
      prompt,
      revisedPrompt: result.revised_prompt,
      aspectRatio: template.aspectRatio,
      size: template.size,
    })
  } catch (error) {
    const normalized = normalizeClientError(error, "openai-compatible")
    return NextResponse.json(
      { error: normalized },
      { status: normalized.status ?? 500 },
    )
  }
}
