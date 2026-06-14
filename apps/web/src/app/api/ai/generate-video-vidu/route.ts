// ============================================================================
// /api/ai/generate-video-vidu — 阿里云百炼 Vidu 图生视频 API
//
// 支持：图生视频（I2V）、文生视频（T2V）、首尾帧生视频
// 模型：viduq3-turbo_img2video / viduq3-pro_img2video
// 协议：SSE 流式返回进度
// ============================================================================

import { NextRequest } from "next/server"
import { fetchWithTimeout } from "@/lib/ai/server-fetch"
import { findProviderByCapability } from "@/lib/ai/provider-registry"

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const POLL_INTERVAL_MS = 8_000  // 轮询间隔 8 秒（Vidu 生成约 1-5 分钟）
const MAX_POLL_MINUTES = 10     // 最大轮询 10 分钟
const VIDU_REQUEST_TIMEOUT_MS = 60_000

/** Supported Vidu models for image-to-video */
const VIDU_I2V_MODELS = {
  "vidu-q3-turbo-i2v": "vidu/viduq3-turbo_img2video",
  "vidu-q3-pro-i2v": "vidu/viduq3-pro_img2video",
  "vidu-q2-turbo-i2v": "vidu/viduq2-turbo_img2video",
  "vidu-q2-pro-i2v": "vidu/viduq2-pro_img2video",
} as const

/** Supported Vidu models for text-to-video */
const VIDU_T2V_MODELS = {
  "vidu-q3-turbo-t2v": "vidu/viduq3-turbo_text2video",
  "vidu-q3-pro-t2v": "vidu/viduq3-pro_text2video",
  "vidu-q2-turbo-t2v": "vidu/viduq2-turbo_text2video",
  "vidu-q2-pro-t2v": "vidu/viduq2-pro_text2video",
} as const

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ViduGenerateRequest {
  mode: "i2v" | "t2v" | "start-end"
  model?: string
  prompt: string
  /** For I2V: single image URL */
  imageUrl?: string
  /** For start-end mode */
  firstFrameUrl?: string
  lastFrameUrl?: string
  /** Generation parameters */
  duration?: number        // 1-16 seconds (Q3) or 1-10 (Q2), default 5
  resolution?: "540P" | "720P" | "1080P"  // default 720P
  audio?: boolean          // Q3 only, default false
  watermark?: boolean      // default false
  seed?: number
  size?: string            // e.g. "1280*720"
}

// ---------------------------------------------------------------------------
// SSE helpers
// ---------------------------------------------------------------------------

function sseEvent(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

// ---------------------------------------------------------------------------
// Vidu API client
// ---------------------------------------------------------------------------

async function createViduTask(params: ViduGenerateRequest, apiKey: string, baseUrl: string) {
  const { mode, model, prompt, imageUrl, firstFrameUrl, lastFrameUrl, duration, resolution, audio, watermark, seed, size } = params

  // Resolve model name
  let resolvedModel = model
  if (!resolvedModel) {
    resolvedModel = mode === "i2v"
      ? VIDU_I2V_MODELS["vidu-q3-turbo-i2v"]
      : VIDU_T2V_MODELS["vidu-q3-turbo-t2v"]
  }

  // Build input
  const input: Record<string, unknown> = { prompt }

  if (mode === "i2v" && imageUrl) {
    input.media = [{ type: "image", url: imageUrl }]
  } else if (mode === "start-end" && firstFrameUrl && lastFrameUrl) {
    input.media = [
      { type: "image", url: firstFrameUrl },
      { type: "image", url: lastFrameUrl },
    ]
  }

  // Build parameters
  const parameters: Record<string, unknown> = {
    duration: duration ?? 5,
    resolution: resolution ?? "720P",
  }
  if (audio !== undefined) parameters.audio = audio
  if (watermark !== undefined) parameters.watermark = watermark
  if (seed !== undefined) parameters.seed = seed
  if (size) parameters.size = size

  const body = {
    model: resolvedModel,
    input,
    parameters,
  }

  const res = await fetchWithTimeout(`${baseUrl}/services/aigc/video-generation/video-synthesis`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
      "X-DashScope-Async": "enable",
    },
    body: JSON.stringify(body),
  }, VIDU_REQUEST_TIMEOUT_MS)

  if (!res.ok) {
    const errorText = await res.text().catch(() => "Unknown error")
    let errorJson: { code?: string; message?: string } = {}
    try { errorJson = JSON.parse(errorText) } catch { /* ignore */ }
    throw new Error(`Vidu API error [${res.status}]: ${errorJson.message || errorJson.code || errorText}`)
  }

  const data = await res.json() as {
    output?: { task_id?: string; task_status?: string }
    request_id?: string
    code?: string
    message?: string
  }

  if (data.code) {
    throw new Error(`Vidu API error: ${data.message || data.code}`)
  }

  const taskId = data.output?.task_id
  if (!taskId) {
    throw new Error("Vidu API did not return task_id")
  }

  return taskId
}

async function queryViduTask(taskId: string, apiKey: string, baseUrl: string) {
  const res = await fetchWithTimeout(`${baseUrl}/tasks/${taskId}`, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
    },
  }, VIDU_REQUEST_TIMEOUT_MS)

  if (!res.ok) {
    const errorText = await res.text().catch(() => "Unknown error")
    throw new Error(`Query error [${res.status}]: ${errorText}`)
  }

  return await res.json() as {
    output?: {
      task_id?: string
      task_status?: "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELED" | "UNKNOWN"
      video_url?: string
      code?: string
      message?: string
      orig_prompt?: string
    }
    request_id?: string
    usage?: {
      duration?: number
      size?: string
      fps?: number
      video_count?: number
      audio?: boolean
    }
  }
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  let apiKey: string
  let baseUrl: string
  try {
    const provider = findProviderByCapability("video", "dashscope")
    apiKey = provider.apiKey
    baseUrl = provider.baseUrl
  } catch {
    return new Response(
      sseEvent("error", { message: "DASHSCOPE_API_KEY not configured" }),
      { status: 500, headers: { "Content-Type": "text/event-stream" } }
    )
  }

  let body: ViduGenerateRequest
  try {
    body = await req.json()
  } catch {
    return new Response(
      sseEvent("error", { message: "Invalid JSON body" }),
      { status: 400, headers: { "Content-Type": "text/event-stream" } }
    )
  }

  if (!body.prompt) {
    return new Response(
      sseEvent("error", { message: "prompt is required" }),
      { status: 400, headers: { "Content-Type": "text/event-stream" } }
    )
  }

  // Create SSE stream
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(sseEvent(event, data)))
      }

      try {
        // Step 1: Create task
        send("progress", {
          stage: "queued",
          percent: 5,
          message: "正在提交视频生成任务到 Vidu...",
        })

        const taskId = await createViduTask(body, apiKey, baseUrl)

        send("progress", {
          stage: "queued",
          percent: 10,
          message: `任务已创建 (ID: ${taskId.slice(0, 16)}...)，等待排队...`,
          taskId,
        })

        // Step 2: Poll for result
        const startTime = Date.now()
        const maxPollTime = MAX_POLL_MINUTES * 60 * 1000
        let lastStatus = "PENDING"
        let percent = 10
        let pollCount = 0

        while (Date.now() - startTime < maxPollTime) {
          pollCount++
          await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))

          const result = await queryViduTask(taskId, apiKey, baseUrl)
          const status = result.output?.task_status || "UNKNOWN"
          const elapsed = (Date.now() - startTime) / 1000

          if (status === "SUCCEEDED") {
            send("progress", {
              stage: "done",
              percent: 100,
              message: "视频生成完成！",
            })
            send("result", {
              videoUrl: result.output?.video_url,
              taskId,
              prompt: result.output?.orig_prompt,
              usage: result.usage,
            })
            controller.close()
            return
          }

          if (status === "FAILED") {
            send("error", {
              message: result.output?.message || "视频生成失败",
              code: result.output?.code,
              taskId,
            })
            controller.close()
            return
          }

          if (status === "CANCELED") {
            send("error", { message: "任务已取消", taskId })
            controller.close()
            return
          }

          // Progress based on observed status transitions
          // (Vidu API does not expose real-time progress percentage)
          if (status === "RUNNING" && lastStatus !== "RUNNING") {
            percent = 30
            send("progress", {
              stage: "processing",
              percent,
              message: "任务处理中，正在生成视频...",
            })
          } else if (status === "RUNNING") {
            // Smooth progress curve: 30→70 over first 2 min, 70→90 after
            const elapsedMin = elapsed / 60
            percent = elapsedMin < 2
              ? Math.min(70, 30 + Math.round(elapsedMin * 20))
              : Math.min(90, 70 + Math.round((elapsedMin - 2) * 4))
            send("progress", {
              stage: "processing",
              percent,
              message: "视频渲染中...（通常 1-5 分钟）",
            })
          } else if (status === "PENDING") {
            percent = Math.min(25, 10 + pollCount * 1)
            send("progress", {
              stage: "queued",
              percent,
              message: "任务排队中...",
            })
          }

          lastStatus = status
        }

        // Timeout
        send("error", {
          message: `视频生成超时（超过 ${MAX_POLL_MINUTES} 分钟），请稍后通过 task_id 查询`,
          taskId,
        })
        controller.close()
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unknown error"
        send("error", { message })
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  })
}
