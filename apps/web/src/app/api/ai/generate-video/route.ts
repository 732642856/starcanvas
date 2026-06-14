// ============================================================================
// Video Generation API Route — Image-to-Video (图生视频)
// ============================================================================
// 支持 SSE 流式进度返回。调用 OpenAI 兼容的中转站视频生成 API。
// 凭据通过 Provider Registry 统一管理（不再直接读取 process.env）。
// 预留配置字段方便后续对接不同中转站文档。
// ============================================================================

import { NextRequest, NextResponse } from "next/server"
import { normalizeUpstreamError, normalizeClientError } from "@/lib/ai/errors"
import { fetchWithTimeout } from "@/lib/ai/server-fetch"
import { getProvider } from "@/lib/ai/provider-registry"

// ---------------------------------------------------------------------------
// Config & Types
// ---------------------------------------------------------------------------

interface VideoGenRequestBody {
  prompt: string
  imageUrl: string
  model?: string
  duration?: number
  motionStrength?: number
  size?: string
  /** 局部覆盖配置 (P2-5B Lite)，只允许非敏感字段 */
  overrides?: {
    baseUrl?: string
    videoModel?: string
    timeoutMs?: number
  }
}

interface VideoGenStreamEvent {
  type: "progress" | "result" | "error"
  stage?: "queued" | "processing" | "rendering" | "done" | "failed"
  percent?: number
  message?: string
  estimatedSecondsRemaining?: number
  videoUrl?: string
  status?: string
  jobId?: string
  error?: string
}

/** 视频生成超时（默认 5 分钟） */
const DEFAULT_VIDEO_TIMEOUT_MS = 300_000

/** 轮询间隔（毫秒） */
const POLL_INTERVAL_MS = 3_000

/** 轮询最大次数 */
const MAX_POLL_COUNT = 100

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getConfig(overrides?: VideoGenRequestBody["overrides"]) {
  const provider = getProvider()

  const baseUrl = overrides?.baseUrl ?? provider.baseUrl

  const apiKey = provider.apiKey

  const timeoutMs = overrides?.timeoutMs ?? provider.timeoutMs

  return {
    baseUrl: baseUrl.replace(/\/+$/, ""),
    apiKey,
    timeoutMs,
    videoModel: provider.videoModel,
  }
}

function sendEvent(
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
  event: VideoGenStreamEvent,
) {
  controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
}

// ---------------------------------------------------------------------------
// SSE Stream Factory
// ---------------------------------------------------------------------------

function createVideoGenStream(
  body: VideoGenRequestBody,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()

  return new ReadableStream({
    async start(controller) {
      const send = (event: VideoGenStreamEvent) =>
        sendEvent(controller, encoder, event)

      // ---- 1. 读取配置 ------------------------------------------------------
      let config: ReturnType<typeof getConfig>
      try {
        config = getConfig(body.overrides)
      } catch (err) {
        const msg = err instanceof Error ? err.message : "配置错误"
        send({ type: "error", error: msg, stage: "failed", percent: 0 })
        controller.close()
        return
      }

      // ---- 2. 参数校验 ------------------------------------------------------
      const prompt = body.prompt
      const imageUrl = body.imageUrl
      const model = body.model ?? config.videoModel ?? "kling"
      const duration =
        typeof body.duration === "number" ? body.duration : 5
      const motionStrength =
        typeof body.motionStrength === "number" ? body.motionStrength : 0.5

      if (!prompt || typeof prompt !== "string") {
        send({
          type: "error",
          error: "prompt 参数必填且必须为字符串",
          stage: "failed",
          percent: 0,
        })
        controller.close()
        return
      }

      if (!imageUrl || typeof imageUrl !== "string") {
        send({
          type: "error",
          error: "imageUrl 参数必填且必须为字符串（图生视频需要输入图片）",
          stage: "failed",
          percent: 0,
        })
        controller.close()
        return
      }

      // ---- 3. 提交任务 ------------------------------------------------------
      send({
        type: "progress",
        stage: "queued",
        percent: 5,
        message: "任务已提交，正在排队...",
        estimatedSecondsRemaining: Math.round(duration * 8),
      })

      // 构建 OpenAI 兼容格式的视频生成请求体
      // 预留字段：不同中转站可能要求不同的字段名，可在此调整。
      const requestPayload: Record<string, unknown> = {
        model,
        prompt,
        image: imageUrl,
        duration,
        motion_strength: motionStrength,
        // 可扩展字段（预留）
        // aspect_ratio: "16:9",
        // resolution: "720p",
        // negative_prompt: "",
      }

      // 如果用户传了 size，加入请求体
      if (body.size) {
        requestPayload.size = body.size
      }

      let submitRes: Response | undefined
      try {
        submitRes = await fetchWithTimeout(
          `${config.baseUrl}/videos/generations`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${config.apiKey}`,
            },
            body: JSON.stringify(requestPayload),
          },
          config.timeoutMs,
        )
      } catch (err: unknown) {
        const normalized = normalizeClientError(err)
        send({
          type: "error",
          error: normalized.message,
          stage: "failed",
          percent: 0,
        })
        controller.close()
        return
      }

      if (!submitRes.ok) {
        const errorText = await submitRes.text()
        const normalized = normalizeUpstreamError(
          submitRes.status,
          errorText,
          "openai-compatible",
        )
        send({
          type: "error",
          error: normalized.message,
          stage: "failed",
          percent: 0,
        })
        controller.close()
        return
      }

      // ---- 4. 解析提交响应 --------------------------------------------------
      let submitData: Record<string, unknown>
      try {
        submitData = await submitRes.json()
      } catch {
        send({
          type: "error",
          error: "无法解析上游 API 响应",
          stage: "failed",
          percent: 0,
        })
        controller.close()
        return
      }

      // OpenAI 兼容格式常见返回：
      //   - 同步完成: { data: [{ url: "..." }] }
      //   - 异步任务: { id: "job_xxx", status: "processing" }
      const dataArr = submitData.data as
        | Array<{ url?: string; video_url?: string }>
        | undefined
      const immediateVideoUrl =
        dataArr?.[0]?.url ??
        dataArr?.[0]?.video_url ??
        (submitData.url as string | undefined) ??
        (submitData.video_url as string | undefined)

      const jobId =
        (submitData.id as string | undefined) ??
        (submitData.job_id as string | undefined)

      // ---- 5. 如果同步返回了 videoUrl，直接结束 ----------------------------
      if (immediateVideoUrl) {
        send({
          type: "progress",
          stage: "rendering",
          percent: 90,
          message: "视频生成完成，正在返回结果...",
        })

        send({
          type: "result",
          stage: "done",
          percent: 100,
          message: "生成完成",
          videoUrl: immediateVideoUrl,
          status: "done",
          jobId,
        })

        controller.enqueue(encoder.encode("data: [DONE]\n\n"))
        controller.close()
        return
      }

      // ---- 6. 异步任务：轮询进度 --------------------------------------------
      if (!jobId) {
        send({
          type: "error",
          error: "上游 API 未返回视频地址或任务 ID，无法获取结果",
          stage: "failed",
          percent: 0,
        })
        controller.close()
        return
      }

      send({
        type: "progress",
        stage: "processing",
        percent: 15,
        message: `任务已创建 (Job: ${jobId.slice(-8)})，等待处理...`,
        jobId,
      })

      // 轮询状态
      // 预留：不同中转站的状态查询端点可能不同，如 /videos/generations/{id}
      const pollEndpoint = `${config.baseUrl}/videos/generations/${jobId}`
      let pollCount = 0
      let videoUrl: string | undefined

      while (pollCount < MAX_POLL_COUNT) {
        pollCount++
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))

        // 模拟递增进度（真实场景中应根据 status 响应调整）
        const simulatedPercent = Math.min(15 + pollCount * 2, 85)
        send({
          type: "progress",
          stage: "processing",
          percent: simulatedPercent,
          message: `视频生成中... (${pollCount}/${MAX_POLL_COUNT})`,
          estimatedSecondsRemaining: Math.max(
            0,
            Math.round((MAX_POLL_COUNT - pollCount) * (POLL_INTERVAL_MS / 1000)),
          ),
          jobId,
        })

        try {
          const pollRes = await fetchWithTimeout(pollEndpoint, {
            method: "GET",
            headers: {
              Authorization: `Bearer ${config.apiKey}`,
            },
          }, Math.min(config.timeoutMs, 60_000))

          if (!pollRes.ok) {
            // 某些中转站可能不支持 GET 查询，直接跳过轮询
            if (pollRes.status === 404) {
              send({
                type: "progress",
                stage: "processing",
                percent: simulatedPercent,
                message: "等待视频生成完成（中转站不支持进度查询）...",
                jobId,
              })
              // 继续轮询，但不再期待 200
              continue
            }
            const errText = await pollRes.text()
            console.warn(
              `[VideoGen] Poll failed ${pollRes.status}:`,
              errText.slice(0, 200),
            )
            continue
          }

          const pollData: Record<string, unknown> = await pollRes.json()

          const status =
            (pollData.status as string | undefined) ??
            (pollData.job_status as string | undefined) ??
            "unknown"

          const pollDataArr = pollData.data as
            | Array<{ url?: string; video_url?: string }>
            | undefined
          const maybeUrl =
            pollDataArr?.[0]?.url ??
            pollDataArr?.[0]?.video_url ??
            (pollData.url as string | undefined) ??
            (pollData.video_url as string | undefined)

          if (maybeUrl) {
            videoUrl = maybeUrl
          }

          if (status === "succeeded" || status === "completed" || status === "done") {
            if (videoUrl) break
            // 状态成功但还没有 URL，再等待一轮
          } else if (
            status === "failed" ||
            status === "error" ||
            status === "rejected"
          ) {
            const errMsg =
              (pollData.error as string | undefined) ??
              (pollData.failure_reason as string | undefined) ??
              "任务处理失败"
            send({
              type: "error",
              error: errMsg,
              stage: "failed",
              percent: 0,
              jobId,
            })
            controller.close()
            return
          }
        } catch (pollErr) {
          console.warn("[VideoGen] Poll network error:", pollErr)
          // 继续轮询
        }
      }

      if (!videoUrl) {
        send({
          type: "error",
          error: `视频生成超时或未能获取结果。Job ID: ${jobId}`,
          stage: "failed",
          percent: 0,
          jobId,
        })
        controller.close()
        return
      }

      send({
        type: "progress",
        stage: "rendering",
        percent: 95,
        message: "视频生成完成，正在返回结果...",
        jobId,
      })

      send({
        type: "result",
        stage: "done",
        percent: 100,
        message: "生成完成",
        videoUrl,
        status: "done",
        jobId,
      })

      controller.enqueue(encoder.encode("data: [DONE]\n\n"))
      controller.close()
    },
  })
}

// ---------------------------------------------------------------------------
// Route Handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  let body: VideoGenRequestBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: "请求体必须是合法的 JSON" },
      { status: 400 },
    )
  }

  const stream = createVideoGenStream(body)

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  })
}
