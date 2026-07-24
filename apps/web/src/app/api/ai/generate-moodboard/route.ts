// ============================================================================
// POST /api/ai/generate-moodboard — SSE 流式 Moodboard 参考图生成
// ============================================================================
// 流程：
// 1. 接收用户风格描述
// 2. 调用 Chat API 生成 8 条图片生成提示词
// 3. 逐条调用 Image Generation API 生成参考图
// 4. SSE 流式返回进度
// ============================================================================

import { NextRequest } from "next/server"
import { mergeProviderConfig } from "@/lib/ai/provider-config"
import type { AiProviderOverrides } from "@/lib/ai/provider-config"
import { normalizeUpstreamError, normalizeClientError } from "@/lib/ai/errors"
import { MOODBOARD_SYSTEM_PROMPT, buildMoodboardUserMessage } from "@/lib/ai/agents/agent-moodboard"
import { fetchWithTimeout } from "@/lib/ai/server-fetch"

// ── SSE Helper ──────────────────────────────────────────────────────────────

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

// ── SDK Helper: 调用 Chat API 生成 prompt ─────────────────────────────────────

interface MoodboardPromptItem {
  dimension: string
  dimension_en: string
  prompt: string
}

async function callChatForPrompts(
  description: string,
  config: { baseUrl: string; apiKey: string; model: string; timeoutMs: number },
): Promise<MoodboardPromptItem[]> {
  try {
    const res = await fetchWithTimeout(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: "system", content: MOODBOARD_SYSTEM_PROMPT },
          { role: "user", content: buildMoodboardUserMessage(description) },
        ],
        temperature: 0.8,
        response_format: { type: "json_object" },
      }),
    }, config.timeoutMs)

    if (!res.ok) {
      const text = await res.text()
      const error = normalizeUpstreamError(res.status, text)
      throw new Error(error.message)
    }

    const data = await res.json()
    const content: string = data.choices?.[0]?.message?.content ?? ""

    // Parse JSON from response
    let parsed: { moodboard?: MoodboardPromptItem[] } | null = null
    try {
      parsed = JSON.parse(content)
    } catch {
      // Try to extract JSON array from markdown
      const match = content.match(/\[[\s\S]*\]/)
      if (match) {
        try {
          const items = JSON.parse(match[0])
          if (Array.isArray(items)) return items
        } catch { /* fall through */ }
      }
    }

    if (parsed?.moodboard && Array.isArray(parsed.moodboard) && parsed.moodboard.length > 0) {
      return parsed.moodboard
    }

    // Direct array
    if (Array.isArray(parsed)) return parsed

    // Last resort: try to find any array in the parsed object
    for (const value of Object.values(parsed ?? {})) {
      if (Array.isArray(value) && value.length > 0) {
        return value as MoodboardPromptItem[]
      }
    }

    throw new Error("无法从 AI 响应中解析出 moodboard 提示词数组")
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("AI 请求超时，请稍后重试")
    }
    throw error
  }
}

// ── SDK Helper: 调用 Image Generation API ────────────────────────────────────

interface ImageGenResult {
  imageUrl: string
  prompt: string
  model: string
}

async function callImageGeneration(
  prompt: string,
  config: { baseUrl: string; apiKey: string; imageModel: string; timeoutMs: number },
): Promise<ImageGenResult> {
  try {
    const res = await fetchWithTimeout(`${config.baseUrl}/images/generations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.imageModel,
        prompt,
        n: 1,
        size: "1792x1024",
        response_format: "b64_json",
      }),
    }, config.timeoutMs)

    if (!res.ok) {
      const text = await res.text()
      const error = normalizeUpstreamError(res.status, text)
      throw new Error(error.message)
    }

    const data = await res.json()
    const b64Json: string | undefined = data.data?.[0]?.b64_json

    if (!b64Json) {
      const url = data.data?.[0]?.url
      if (url) {
        return { imageUrl: url, prompt, model: config.imageModel }
      }
      throw new Error("图片生成 API 未返回图片数据")
    }

    return {
      imageUrl: `data:image/png;base64,${b64Json}`,
      prompt,
      model: config.imageModel,
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("图片生成请求超时")
    }
    throw error
  }
}

// ── Main Handler ────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { description } = body

    if (!description || typeof description !== "string" || !description.trim()) {
      return new Response(
        sseEvent("error", { error: "描述不能为空" }),
        { status: 200, headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } },
      )
    }

    // Resolve AI provider config
    const overrides: AiProviderOverrides | undefined =
      body._providerOverrides && typeof body._providerOverrides === "object"
        ? (body._providerOverrides as AiProviderOverrides)
        : undefined

    const config = mergeProviderConfig(overrides)

    // Create SSE stream
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        const enqueue = (event: string, data: unknown) => {
          controller.enqueue(encoder.encode(sseEvent(event, data)))
        }

        try {
          // ── Phase 1: Generate prompts ────────────────────────────────────
          enqueue("phase", { phase: "generating_prompts", message: "正在分析风格并生成提示词..." })

          let prompts: MoodboardPromptItem[]
          try {
            prompts = await callChatForPrompts(description.trim(), {
              baseUrl: config.baseUrl,
              apiKey: config.apiKey,
              model: config.defaultModel,
              timeoutMs: config.timeoutMs,
            })
          } catch (err) {
            const msg = err instanceof Error ? err.message : "生成提示词失败"
            enqueue("error", { error: msg, phase: "prompts" })
            controller.close()
            return
          }

          if (!Array.isArray(prompts) || prompts.length === 0) {
            enqueue("error", { error: "AI 返回的提示词列表为空，请调整描述后重试", phase: "prompts" })
            controller.close()
            return
          }

          // Ensure we only use the first 8 prompts
          const activePrompts = prompts.slice(0, 8)
          enqueue("prompts", {
            count: activePrompts.length,
            items: activePrompts.map((p, i) => ({ index: i, dimension: p.dimension, dimension_en: p.dimension_en })),
          })

          // ── Phase 2: Generate images ─────────────────────────────────────
          enqueue("phase", { phase: "generating_images", message: `开始生成 ${activePrompts.length} 张参考图...` })

          const results: Array<{
            index: number
            dimension: string
            dimension_en: string
            imageUrl: string
            prompt: string
          }> = []

          for (let i = 0; i < activePrompts.length; i++) {
            const item = activePrompts[i]
            enqueue("image_start", {
              index: i,
              dimension: item.dimension,
              dimension_en: item.dimension_en,
              total: activePrompts.length,
              message: `正在生成第 ${i + 1}/${activePrompts.length} 张参考图：${item.dimension}`,
            })

            try {
              const genResult = await callImageGeneration(item.prompt, {
                baseUrl: config.baseUrl,
                apiKey: config.apiKey,
                imageModel: config.defaultImageModel,
                timeoutMs: config.timeoutMs,
              })

              results.push({
                index: i,
                dimension: item.dimension,
                dimension_en: item.dimension_en,
                imageUrl: genResult.imageUrl,
                prompt: genResult.prompt,
              })

              enqueue("image_done", {
                index: i,
                dimension: item.dimension,
                dimension_en: item.dimension_en,
                imageUrl: genResult.imageUrl,
                total: activePrompts.length,
                message: `第 ${i + 1}/${activePrompts.length} 张参考图生成完成`,
              })
            } catch (err) {
              const msg = err instanceof Error ? err.message : "图片生成失败"
              enqueue("image_error", {
                index: i,
                dimension: item.dimension,
                dimension_en: item.dimension_en,
                error: msg,
                message: `第 ${i + 1}/${activePrompts.length} 张参考图生成失败：${msg}`,
              })
            }
          }

          // ── Done ─────────────────────────────────────────────────────────
          enqueue("complete", {
            results,
            totalCount: results.length,
            failedCount: activePrompts.length - results.length,
            message: `已完成 ${results.length}/${activePrompts.length} 张参考图`,
          })
        } catch (err) {
          const msg = err instanceof Error ? err.message : "未知错误"
          enqueue("error", { error: msg, phase: "unknown" })
        } finally {
          controller.close()
        }
      },
    })

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "请求解析失败"
    return new Response(
      sseEvent("error", { error: msg }),
      { status: 200, headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } },
    )
  }
}
