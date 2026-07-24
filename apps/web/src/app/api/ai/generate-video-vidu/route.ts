// ============================================================================
// LEGACY /api/ai/generate-video-vidu — 阿里云百炼 Vidu 图生视频 API
//
// New production-run callers must use the NestJS API:
// NEXT_PUBLIC_API_BASE_URL/api/v1/production-runs.
// This route remains for compatibility until canvas callers are migrated.
//
// 支持：图生视频（I2V）、文生视频（T2V）、首尾帧生视频
// 模型：viduq3-turbo_img2video / viduq3-pro_img2video
// 协议：SSE 流式返回进度
// ============================================================================

import { NextRequest } from "next/server"
import { findProviderByCapability, type AiProviderOverrides } from "@/lib/ai/provider-registry"
import { resolveViduAuth } from "./vidu-auth"
import {
  createViduTask,
  type ViduTaskRequest,
  waitForViduTaskResult,
} from "./vidu-task"
import { createViduSubmissionRegistry } from "./vidu-submission-registry"

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const POLL_INTERVAL_MS = 8_000  // 轮询间隔 8 秒（Vidu 生成约 1-5 分钟）
const MAX_POLL_MINUTES = 10     // 最大轮询 10 分钟

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ViduGenerateRequest extends ViduTaskRequest {
  mode: "i2v" | "t2v" | "start-end" | "r2v"
  requestId?: string
  _providerOverrides?: AiProviderOverrides
}

const viduSubmissionRegistry = createViduSubmissionRegistry()

// ---------------------------------------------------------------------------
// SSE helpers
// ---------------------------------------------------------------------------

function sseEvent(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  let body: ViduGenerateRequest
  try {
    body = await req.json()
  } catch {
    return new Response(
      sseEvent("error", { message: "Invalid JSON body" }),
      { status: 400, headers: { "Content-Type": "text/event-stream" } }
    )
  }

  let provider = null
  try {
    provider = findProviderByCapability("video", "dashscope")
  } catch {
    // A session DashScope key is enough for this dedicated Vidu route; the
    // endpoint stays fixed to DashScope rather than trusting arbitrary baseUrl.
  }

  const auth = resolveViduAuth({
    sessionApiKey: body._providerOverrides?.sessionApiKey,
    provider,
  })

  if (!auth) {
    return new Response(
      sseEvent("error", { message: "DASHSCOPE_API_KEY not configured" }),
      { status: 500, headers: { "Content-Type": "text/event-stream" } }
    )
  }
  const { apiKey, baseUrl } = auth

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

        const taskId = await viduSubmissionRegistry.getOrCreate(
          body.requestId,
          () => createViduTask(body, apiKey, baseUrl),
        )

        send("progress", {
          stage: "queued",
          percent: 10,
          message: `任务已创建 (ID: ${taskId.slice(0, 16)}...)，等待排队...`,
          taskId,
        })

        // Step 2: Poll for result
        let percent = 10
        const waitResult = await waitForViduTaskResult({
          taskId,
          apiKey,
          baseUrl,
          pollIntervalMs: POLL_INTERVAL_MS,
          maxPollMinutes: MAX_POLL_MINUTES,
        }, {
          onProgress: ({ status, lastStatus, pollCount, elapsedMs }) => {
            const elapsed = elapsedMs / 1000

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
          },
        })

        if (!waitResult.ok) {
          send("error", {
            message: waitResult.error,
            ...(waitResult.code ? { code: waitResult.code } : {}),
            taskId,
          })
          controller.close()
          return
        }

        send("progress", {
          stage: "done",
          percent: 100,
          message: "视频生成完成！",
        })
        send("result", {
          videoUrl: waitResult.videoUrl,
          taskId,
          prompt: waitResult.result.output?.orig_prompt,
          usage: waitResult.result.usage,
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
      "X-DashScope-OssResourceResolve": "enable",
    },
  })
}
