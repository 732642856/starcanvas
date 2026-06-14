// ============================================================================
// Ideogram 4 Image Generation API Route — JSON 结构化提示
// 支持分镜数据直接翻译为 Ideogram 4 JSON prompt 进行生图
// ============================================================================
import { NextRequest, NextResponse } from "next/server"
import { fetchWithTimeout } from "@/lib/ai/server-fetch"
import { findProviderByCapability } from "@/lib/ai/provider-registry"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      jsonPrompt,           // Ideogram JSON 结构化提示（字符串）
      textPrompt,           // 备选：纯文本提示
      width = 1024,
      height = 1024,
      samplerPreset = "V4_QUALITY_48",
      seed,
      model = "V_4",        // Ideogram 4 模型标识
      magicPrompt = true,   // 自动扩写提示词
      useIdeogramApi = true,
    } = body

    // 通过 Provider Registry 获取 Ideogram 凭据（统一读取，不再直接读 process.env）
    const provider = findProviderByCapability("image", "ideogram")
    const apiKey = provider.apiKey

    if (!apiKey) {
      return NextResponse.json(
        { error: "Ideogram Provider API Key not configured. Set AI_PROVIDER_IDEOGRAM_API_KEY or IDEOGRAM_API_KEY in .env.local" },
        { status: 500 }
      )
    }

    // 构建请求体
    const requestBody: Record<string, any> = {
      model,
      width,
      height,
      magic_prompt: magicPrompt,
      sampler_preset: samplerPreset,
    }

    if (seed !== undefined) {
      requestBody.seed = seed
    }

    // 优先使用 JSON 结构化提示
    if (jsonPrompt) {
      requestBody.json_prompt = jsonPrompt
    } else if (textPrompt) {
      requestBody.prompt = textPrompt
    } else {
      return NextResponse.json(
        { error: "Either jsonPrompt or textPrompt is required" },
        { status: 400 }
      )
    }

    // 调用 Ideogram API（通过 Provider baseUrl）
    const ideogramEndpoint = `${provider.baseUrl}/ideogram-v4/generate`
    const imageRes = await fetchWithTimeout(ideogramEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Api-Key": apiKey,
      },
      body: JSON.stringify(requestBody),
    }, provider.timeoutMs)

    if (!imageRes.ok) {
      const errorText = await imageRes.text()
      console.error("[Ideogram API Error]", imageRes.status, errorText)
      return NextResponse.json(
        { error: `Ideogram API error: ${imageRes.status} - ${errorText.slice(0, 200)}` },
        { status: imageRes.status }
      )
    }

    const imageData = await imageRes.json()

    // Ideogram API 返回格式: { images: [{ url: "...", prompt: "..." }] }
    const imageUrl = imageData.images?.[0]?.url
    const responsePrompt = imageData.images?.[0]?.prompt || jsonPrompt || textPrompt

    if (!imageUrl) {
      return NextResponse.json(
        { error: "No image URL returned from Ideogram", raw: imageData },
        { status: 500 }
      )
    }

    return NextResponse.json({
      imageUrl,
      prompt: responsePrompt,
      model: "ideogram-4",
      width,
      height,
      samplerPreset,
    })
  } catch (error) {
    console.error("[Ideogram Generate Image API Error]", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}
