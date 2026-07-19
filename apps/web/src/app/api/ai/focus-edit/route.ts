// ============================================================================
// Focus Edit (局部重绘) API Route
// Sends image + mask + instruction to upstream /images/edits endpoint
// ============================================================================
import { NextRequest, NextResponse } from "next/server"
import { getProvider } from "@/lib/ai/provider-registry"
import { fetchWithTimeout } from "@/lib/ai/server-fetch"

// ── Config ──────────────────────────────────────────────────────────────────
function getConfig() {
  const provider = getProvider()
  return {
    baseUrl: provider.baseUrl,
    apiKey: provider.apiKey,
    timeoutMs: provider.timeoutMs,
    retryAttempts: Math.max(1, Number(process.env.AI_IMAGE_RETRY_ATTEMPTS || 2)),
  }
}
const RETRYABLE_UPSTREAM_STATUSES = new Set([429, 500, 502, 503, 504])

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function shouldRetryUpstreamStatus(status: number): boolean {
  return RETRYABLE_UPSTREAM_STATUSES.has(status)
}

function getRetryDelayMs(attempt: number): number {
  const baseDelay = 600
  const exponentialDelay = baseDelay * Math.pow(2, Math.max(0, attempt - 1))
  const jitter = Math.floor(Math.random() * 250)
  return Math.min(5_000, exponentialDelay + jitter)
}

// ── Utility: convert data URL to Blob ──────────────────────────────────────
function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(",")
  const mimeType = header.match(/data:(.*?);base64/)?.[1] || "image/png"
  const binary = atob(base64 || "")
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return new Blob([bytes], { type: mimeType })
}

// ── Build focus-edit FormData ─────────────────────────────────────────────
function buildFocusEditFormData(params: {
  model: string
  prompt: string
  imageDataUrl: string
  maskDataUrl?: string
}): FormData {
  const { model, prompt, imageDataUrl, maskDataUrl } = params
  const form = new FormData()
  form.append("model", model)
  form.append("prompt", prompt)
  form.append("n", "1")
  form.append("response_format", "b64_json")

  // Append source image
  const imageBlob = dataUrlToBlob(imageDataUrl)
  const imageExt = imageBlob.type.includes("jpeg") ? "jpg" : imageBlob.type.includes("webp") ? "webp" : "png"
  form.append("image", imageBlob, `source.${imageExt}`)

  // Append mask if provided
  if (maskDataUrl) {
    const maskBlob = dataUrlToBlob(maskDataUrl)
    form.append("mask", maskBlob, "mask.png")
  }

  return form
}

// ── Utility: normalize image size ──────────────────────────────────────────
const SUPPORTED_IMAGE_SIZES = new Set(["1024x1024", "1792x1024", "1024x1792"])
const SIZE_ALIASES: Record<string, string> = {
  "1024x576": "1792x1024",
  "576x1024": "1024x1792",
  "1024x768": "1792x1024",
  "768x1024": "1024x1792",
  "512x512": "1024x1024",
}

function normalizeImageSize(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "1024x1024"
  const size = value.trim()
  if (SUPPORTED_IMAGE_SIZES.has(size)) return size
  return SIZE_ALIASES[size] || "1024x1024"
}

// ── Main handler ────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  const config = getConfig()

  try {
    const body = await request.json()
    const {
      imageUrl,       // source image data URL
      maskBase64,     // mask base64 (white = edit region)
      instruction,    // text instruction like "添加蝴蝶结"
      model = "gpt-image-2",
      size = "1024x1024",
      requestId,
    } = body

    if (!instruction || typeof instruction !== "string") {
      return NextResponse.json(
        { ok: false, error: "Instruction is required", requestId, model },
        { status: 400 },
      )
    }

    if (!imageUrl || typeof imageUrl !== "string") {
      return NextResponse.json(
        { ok: false, error: "Image URL is required", requestId, model },
        { status: 400 },
      )
    }

    if (!config.apiKey) {
      return NextResponse.json(
        { ok: false, error: "API key is not configured", requestId, model },
        { status: 500 },
      )
    }

    const normalizedSize = normalizeImageSize(size)
    const stripDataUriPrefix = (value: string) => {
      const match = value.match(/^data:[^;]+;base64,(.*)$/)
      return match ? match[1] : value
    }

    // Build edit prompt — preserve composition, only apply requested change
    const editPrompt = [
      "Edit the provided source image within the masked region only.",
      "Preserve the exact main subject, composition, framing, perspective, and surrounding layout outside the mask.",
      "Only apply this requested change to the masked area:",
      instruction.trim(),
    ].join("\n")

    const upstreamUrl = `${config.baseUrl}/images/edits`
    const formData = buildFocusEditFormData({
      model,
      prompt: editPrompt,
      imageDataUrl: imageUrl,
      maskDataUrl: maskBase64 ? `data:image/png;base64,${stripDataUriPrefix(maskBase64)}` : undefined,
    })

    // ── Call upstream API with retry ──────────────────────────────────────
    let imageRes: Response | null = null
    let lastFailure: { status?: number; body?: string; error?: unknown } | null = null
    let attemptsUsed = 0
    const upstreamHeaders: Record<string, string> = {
      Authorization: `Bearer ${config.apiKey}`,
    }

    for (let attempt = 1; attempt <= config.retryAttempts; attempt += 1) {
      attemptsUsed = attempt
      try {
        console.info("[focus-edit]", requestId || "no-request-id", "upstream attempt", attempt, "/", config.retryAttempts)
        imageRes = await fetchWithTimeout(upstreamUrl, {
          method: "POST",
          headers: upstreamHeaders,
          body: formData,
        }, config.timeoutMs)

        console.info("[focus-edit]", requestId || "no-request-id", "upstream status", imageRes.status)
        if (imageRes.ok) break

        const errorText = await imageRes.text()
        lastFailure = { status: imageRes.status, body: errorText }
        if (!shouldRetryUpstreamStatus(imageRes.status) || attempt >= config.retryAttempts) {
          imageRes = null
          break
        }
      } catch (error) {
        lastFailure = { error }
        console.warn("[focus-edit]", requestId || "no-request-id", "upstream request failed on attempt", attempt, error)
        if (attempt >= config.retryAttempts) break
      }

      const delayMs = getRetryDelayMs(attempt)
      console.info("[focus-edit]", requestId || "no-request-id", "retrying:", attempt + 1, "/", config.retryAttempts, "after", delayMs, "ms")
      await sleep(delayMs)
    }

    if (!imageRes?.ok) {
      const status = lastFailure?.status || 502
      const body = lastFailure?.body || "unknown error"
      console.debug("[focus-edit] upstream error:", body)
      return NextResponse.json(
        { ok: false, error: body, requestId, attempts: attemptsUsed, model },
        { status },
      )
    }

    let imageData: any
    try {
      imageData = await imageRes.json()
    } catch (error) {
      return NextResponse.json(
        { ok: false, error: "Invalid response from upstream", requestId, attempts: attemptsUsed, model },
        { status: 502 },
      )
    }

    const b64Json = imageData.data?.[0]?.b64_json
    if (!b64Json) {
      const url = imageData.data?.[0]?.url
      if (url) {
        return NextResponse.json({
          ok: true,
          imageUrl: url,
          prompt: editPrompt,
          model,
          requestId,
          attempts: attemptsUsed,
        })
      }
      return NextResponse.json(
        { ok: false, error: "No image data returned", requestId, attempts: attemptsUsed, model },
        { status: 500 },
      )
    }

    return NextResponse.json({
      ok: true,
      imageUrl: `data:image/png;base64,${b64Json}`,
      prompt: editPrompt,
      model,
      requestId,
      attempts: attemptsUsed,
    })
  } catch (error: any) {
    console.debug("[focus-edit] unexpected error:", error)
    return NextResponse.json(
      { ok: false, error: error?.message || "Internal server error", attempts: 0 },
      { status: 500 },
    )
  }
}
