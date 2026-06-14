// ============================================================================
// Image Generation API Route - Non-streaming JSON response
// Supports text-to-image via /images/generations and image editing via /images/edits
// ============================================================================
import { NextRequest, NextResponse } from "next/server"
import { normalizeGenerationError } from "@/lib/ai/normalizeGenerationError"
import { getImageProviderCapability } from "@/lib/ai/imageProviderCapabilities"
import { fetchWithTimeout } from "@/lib/ai/server-fetch"
import { getProvider } from "@/lib/ai/provider-registry"

// ── Config ──────────────────────────────────────────────────────────────────
// 通过 Provider Registry 统一读取，不再直接读 process.env
function getImageConfig() {
  const provider = getProvider()
  return {
    baseUrl: provider.baseUrl,
    apiKey: provider.apiKey,
    timeoutMs: provider.timeoutMs,
    enhanceTimeoutMs: Math.min(provider.timeoutMs, 30000),
    retryAttempts: Math.max(1, Number(process.env.AI_IMAGE_RETRY_ATTEMPTS || 2)),
  }
}
const IS_DEV = process.env.NODE_ENV !== "production"

/** 仅在开发环境输出日志 */
function devLog(...args: unknown[]) { if (IS_DEV) console.log(...args) }
function devDebug(...args: unknown[]) { if (IS_DEV) console.debug(...args) }
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

// ── Reference image format mode ─────────────────────────────────────────────
// G0 finding against copse.top / gpt-image-2:
// - "image_pure_base64": returns 200; only usable format currently found.
// - "image_data_url":    upstream returns Cloudflare 502.
// - "image_url_data_url":fetch fails through upstream.
// NOTE: A 200 here does not prove the provider truly applies the reference image;
// visual QA is still required because unsupported fields may be silently ignored.
// "image_pure_base64": image: ["pureBase64"] — skyengine 方式 C（当前启用）
// "image_data_url":    image: ["data:image/png;base64,..."]
// "image_url_data_url":image_url: ["data:image/png;base64,..."] — ModelScope 风格
// "messages_image_url":messages multimodal payload — OpenAI-compatible fallback
type ReferenceImageFormat =
  | "image_pure_base64"
  | "image_data_url"
  | "image_url_data_url"
  | "messages_image_url"

const REFERENCE_IMAGE_FORMAT: ReferenceImageFormat = "image_pure_base64"
const IMAGE_TO_IMAGE_ENDPOINT = "/images/edits"
const TEXT_TO_IMAGE_ENDPOINT = "/images/generations"

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

// ── Utility: strip data URI prefix ──────────────────────────────────────────
function stripDataUriPrefix(value: string): string {
  const trimmed = value.trim()
  const match = trimmed.match(/^data:[^;]+;base64,(.*)$/)
  return match ? match[1] : trimmed
}

// ── Utility: normalize source images to string[] ────────────────────────────
function normalizeSourceImages(input: unknown): string[] {
  if (!input) return []

  const values = Array.isArray(input) ? input : [input]

  return values
    .map((item) => {
      if (typeof item === "string") return item
      if (
        item &&
        typeof item === "object" &&
        "image_url" in item &&
        typeof (item as { image_url?: unknown }).image_url === "string"
      ) {
        return (item as { image_url: string }).image_url
      }
      return null
    })
    .filter((item): item is string => Boolean(item && item.trim()))
}

function buildStrictEditPrompt(userPrompt: string): string {
  return [
    "Edit the provided source image. Preserve the exact main subject, building identity, architecture, camera angle, composition, framing, perspective, proportions, and surrounding layout.",
    "Do not replace the scene with another landmark, building, location, object, or composition.",
    "Only apply this requested change:",
    userPrompt.trim(),
  ].join("\n")
}

function buildMultimodalImageMessage(prompt: string, dataUrl: string) {
  return [{
    role: "user",
    content: [
      { type: "text", text: prompt },
      { type: "image_url", image_url: { url: dataUrl } },
    ],
  }]
}

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

function buildImageEditFormData(params: {
  model: string
  prompt: string
  size: string
  sourceImageValues: string[]
}): FormData {
  const { model, prompt, size, sourceImageValues } = params
  const form = new FormData()
  form.append("model", model)
  form.append("prompt", prompt)
  form.append("size", size)
  form.append("n", "1")
  form.append("response_format", "b64_json")

  sourceImageValues.forEach((sourceImage, index) => {
    const blob = dataUrlToBlob(sourceImage)
    const ext = blob.type.includes("jpeg") ? "jpg" : blob.type.includes("webp") ? "webp" : "png"
    form.append("image", blob, `reference-${index}.${ext}`)
  })

  return form
}

function buildImageGenerationPayload(params: {
  model: string
  prompt: string
  size: string
  sourceImageValues: string[]
}): Record<string, unknown> {
  const { model, prompt, size, sourceImageValues } = params
  const payload: Record<string, unknown> = {
    model,
    prompt,
    n: 1,
    size,
    response_format: "b64_json",
  }

  if (sourceImageValues.length === 0) return payload

  switch (REFERENCE_IMAGE_FORMAT) {
    case "image_pure_base64":
      payload.image = sourceImageValues.map(stripDataUriPrefix)
      break
    case "image_data_url":
      payload.image = sourceImageValues
      break
    case "image_url_data_url":
      payload.image_url = sourceImageValues
      break
    case "messages_image_url":
      payload.messages = buildMultimodalImageMessage(prompt, sourceImageValues[0])
      break
  }

  return payload
}

// ── Build system prompt for image prompt enhancement ────────────────────────
function buildEnhanceSystemPrompt(hasSourceImage: boolean): string {
  if (hasSourceImage) {
    return [
      "You are an expert image editing prompt engineer.",
      "The user has uploaded a source image and is asking to edit it, not replace it.",
      "Your job is to rewrite the user's request into a strict image-editing instruction.",
      "Preserve the source image's main subject, building identity, architecture, camera angle, composition, framing, perspective, proportions, and surrounding layout unless the user explicitly asks to change them.",
      "Only modify the requested attributes, such as time of day, lighting, weather, mood, color grading, or style.",
      "Do NOT invent a different landmark, building, scene, country, object, or composition.",
      "Do NOT describe a generic scene; describe an edited version of the SAME source image.",
      "Output ONLY the instruction text, nothing else.",
      "Keep it under 160 words.",
    ].join(" ")
  }

  return [
    "You are an expert image prompt engineer.",
    "Convert the user's request into a detailed, high-quality English image generation prompt.",
    "Output ONLY the prompt text, nothing else.",
    "Be specific about: subject, composition, lighting, style, mood, color palette, and technical quality terms.",
    "Keep it under 200 words.",
  ].join(" ")
}

// ── Main handler ────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  const config = getImageConfig()

  try {
    const body = await request.json()
    const {
      prompt,
      model = "gpt-image-2",
      size = "1024x1024",
      sourceImage,
      requestId,
    } = body

    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json(
        { ok: false, error: "Prompt is required", requestId, attempts: 0, model },
        { status: 400 },
      )
    }

    if (!config.apiKey) {
      return NextResponse.json(
        { ok: false, error: "AI Provider API Key is not configured", requestId, attempts: 0, model },
        { status: 500 },
      )
    }

    // ── Normalize request fields ───────────────────────────────────────────
    const normalizedSize = normalizeImageSize(size)
    if (normalizedSize !== size) {
      devLog("[generate-image] normalized unsupported size:", size, "=>", normalizedSize)
    }

    // ── Normalize reference images ─────────────────────────────────────────
    const sourceImageValues = normalizeSourceImages(sourceImage)
    const isImageToImage = sourceImageValues.length > 0
    const capability = getImageProviderCapability(model)

    if (isImageToImage && !capability.supportsImageToImage) {
      const normalized = normalizeGenerationError({
        status: 400,
        provider: capability.provider,
        error: new Error("UNSUPPORTED_IMAGE_TO_IMAGE"),
      })
      devDebug("[generate-image] unsupported image-to-image:", normalized.raw)
      return NextResponse.json(
        {
          ok: false,
          error: normalized,
          requestId,
          attempts: 0,
          provider: capability.provider,
          model,
        },
        { status: 400 },
      )
    }

    const endpoint = isImageToImage ? IMAGE_TO_IMAGE_ENDPOINT : TEXT_TO_IMAGE_ENDPOINT
    devLog("[generate-image] endpoint:", endpoint)
    devLog("[generate-image] mode:", isImageToImage ? "image-to-image" : "text-to-image")
    devLog("[generate-image] source image count:", sourceImageValues.length)

    if (isImageToImage) {
      const firstPayloadImage =
        REFERENCE_IMAGE_FORMAT === "image_pure_base64"
          ? stripDataUriPrefix(sourceImageValues[0])
          : sourceImageValues[0]

      devLog(
        "[generate-image] first image starts with data uri:",
        firstPayloadImage.startsWith("data:")
      )
      devLog(
        "[generate-image] first image base64 prefix:",
        firstPayloadImage.replace(/^data:[^;]+;base64,/, "").slice(0, 16)
      )
    }

    // ── Enhance prompt if needed ───────────────────────────────────────────
    let finalPrompt = prompt
    const needsEnhancement = prompt.length < 30 || /[\u4e00-\u9fa5]/.test(prompt)

    if (needsEnhancement) {
      try {
        const enhanceUserContent = isImageToImage
          ? `The user uploaded a source image and said: "${prompt}"\n\nRewrite this as a strict image-editing instruction. The output must preserve the same source image subject, building identity, composition, camera angle, framing, and layout. Only the requested change may be applied.`
          : prompt

        const enhanceRes = await fetchWithTimeout(`${config.baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${config.apiKey}`,
          },
          body: JSON.stringify({
            model: "gpt-5.5",
            messages: [
              { role: "system", content: buildEnhanceSystemPrompt(isImageToImage) },
              { role: "user", content: enhanceUserContent },
            ],
            stream: false,
          }),
        }, config.enhanceTimeoutMs)

        if (enhanceRes.ok) {
          const enhanceData = await enhanceRes.json()
          const enhanced = enhanceData.choices?.[0]?.message?.content?.trim()
          if (enhanced) finalPrompt = enhanced
        }
      } catch {
        // Enhancement failed, use original
      }
    }

    // ── Build upstream body ────────────────────────────────────────────────
    if (isImageToImage) {
      finalPrompt = buildStrictEditPrompt(finalPrompt)
    }

    const upstreamBody = isImageToImage
      ? buildImageEditFormData({
          model,
          prompt: finalPrompt,
          size: normalizedSize,
          sourceImageValues,
        })
      : buildImageGenerationPayload({
          model,
          prompt: finalPrompt,
          size: normalizedSize,
          sourceImageValues,
        })

    // ── Diagnostic log: upstream request shape ─────────────────────────────
    devLog("[generate-image] REFERENCE_IMAGE_FORMAT:", isImageToImage ? "multipart_form_image_file" : REFERENCE_IMAGE_FORMAT)
    devLog("[generate-image] upstream model:", model)
    devLog("[generate-image] upstream size:", normalizedSize)
    devLog("[generate-image] upstream prompt length:", finalPrompt.length)
    if (upstreamBody instanceof FormData) {
      devLog("[generate-image] upstream form-data image count:", sourceImageValues.length)
    } else {
      devLog("[generate-image] upstream has 'image' field:", "image" in upstreamBody)
      devLog("[generate-image] upstream has 'image_url' field:", "image_url" in upstreamBody)
      devLog("[generate-image] upstream has 'messages' field:", "messages" in upstreamBody)
      if ("image" in upstreamBody && Array.isArray(upstreamBody.image)) {
        const img = upstreamBody.image[0] as string
        devLog("[generate-image] upstream image[0] starts with data:uri:", img.startsWith("data:"))
        devLog("[generate-image] upstream image[0] length:", img.length)
        devLog("[generate-image] upstream image[0] prefix (50 chars):", img.slice(0, 50))
      }
      if ("image_url" in upstreamBody && Array.isArray(upstreamBody.image_url)) {
        const imgUrl = upstreamBody.image_url[0] as string
        devLog("[generate-image] upstream image_url[0] starts with data:uri:", imgUrl.startsWith("data:"))
      }
      if ("messages" in upstreamBody) {
        devLog("[generate-image] upstream messages payload enabled")
      }
    }

    // ── Call image generation/edit API ─────────────────────────────────────
    let imageRes: Response | null = null
    let lastFailure: { status?: number; body?: string; error?: unknown } | null = null
    let attemptsUsed = 0
    const upstreamUrl = `${config.baseUrl}${endpoint}`
    const upstreamHeaders: Record<string, string> = upstreamBody instanceof FormData
      ? { Authorization: `Bearer ${config.apiKey}` }
      : {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`,
        }
    const upstreamBodyPayload = upstreamBody instanceof FormData ? upstreamBody : JSON.stringify(upstreamBody)

    for (let attempt = 1; attempt <= config.retryAttempts; attempt += 1) {
      attemptsUsed = attempt
      try {
        devLog("[generate-image]", requestId || "no-request-id", "upstream attempt", attempt, "/", config.retryAttempts)
        imageRes = await fetchWithTimeout(upstreamUrl, {
          method: "POST",
          headers: upstreamHeaders,
          body: upstreamBodyPayload,
        }, config.timeoutMs)

        devLog("[generate-image]", requestId || "no-request-id", "upstream status", imageRes.status)
        if (imageRes.ok) break

        const errorText = await imageRes.text()
        lastFailure = { status: imageRes.status, body: errorText }
        if (!shouldRetryUpstreamStatus(imageRes.status) || attempt >= config.retryAttempts) {
          imageRes = null
          break
        }
      } catch (error) {
        lastFailure = { error }
        console.warn("[generate-image]", requestId || "no-request-id", "upstream request failed on attempt", attempt, error)
        if (attempt >= config.retryAttempts) break
      }

      const delayMs = getRetryDelayMs(attempt)
      devLog("[generate-image]", requestId || "no-request-id", "retrying upstream request:", attempt + 1, "/", config.retryAttempts, "after", delayMs, "ms")
      await sleep(delayMs)
    }

    if (!imageRes?.ok) {
      const normalized = normalizeGenerationError({
        status: lastFailure?.status,
        body: lastFailure?.body,
        provider: capability.provider,
        error: lastFailure?.error,
      })
      devDebug("[generate-image] upstream error raw:", normalized.raw)
      return NextResponse.json(
        {
          ok: false,
          error: normalized,
          requestId,
          attempts: attemptsUsed,
          provider: capability.provider,
          model,
        },
        { status: normalized.status || lastFailure?.status || 502 }
      )
    }

    let imageData: any
    try {
      imageData = await imageRes.json()
    } catch (error) {
      const normalized = normalizeGenerationError({
        status: imageRes.status,
        body: await imageRes.text().catch(() => ""),
        provider: capability.provider,
        error,
      })
      devDebug("[generate-image] invalid json raw:", normalized.raw)
      return NextResponse.json(
        {
          ok: false,
          error: normalized,
          requestId,
          attempts: attemptsUsed,
          provider: capability.provider,
          model,
        },
        { status: 502 },
      )
    }

    // ── Diagnostic log: upstream response ──────────────────────────────────
    devLog("[generate-image] upstream response keys:", Object.keys(imageData).join(", "))
    devLog("[generate-image] upstream data count:", imageData.data?.length ?? 0)
    const hasB64 = Boolean(imageData.data?.[0]?.b64_json)
    const hasUrl = Boolean(imageData.data?.[0]?.url)
    devLog("[generate-image] upstream has b64_json:", hasB64, "has url:", hasUrl)
    if (imageData.data?.[0]?.revised_prompt) {
      devLog("[generate-image] upstream revised_prompt:", imageData.data[0].revised_prompt.slice(0, 120))
    }

    const b64Json = imageData.data?.[0]?.b64_json

    if (!b64Json) {
      const url = imageData.data?.[0]?.url
      if (url) {
        return NextResponse.json({
          ok: true,
          imageUrl: url,
          prompt: finalPrompt,
          model,
          requestId,
          attempts: attemptsUsed,
          provider: capability.provider,
          revisedPrompt: imageData.data?.[0]?.revised_prompt || finalPrompt,
          endpoint,
          referenceFormat: isImageToImage ? "multipart_form_image_file" : REFERENCE_IMAGE_FORMAT,
        })
      }
      return NextResponse.json(
        {
          ok: false,
          error: "No image data returned",
          requestId,
          attempts: attemptsUsed,
          provider: capability.provider,
          model,
        },
        { status: 500 },
      )
    }

    return NextResponse.json({
      ok: true,
      imageUrl: `data:image/png;base64,${b64Json}`,
      prompt: finalPrompt,
      model,
      requestId,
      attempts: attemptsUsed,
      provider: capability.provider,
      revisedPrompt: imageData.data?.[0]?.revised_prompt || finalPrompt,
      endpoint,
      referenceFormat: isImageToImage ? "multipart_form_image_file" : REFERENCE_IMAGE_FORMAT,
    })
  } catch (error: any) {
    const normalized = normalizeGenerationError({ error, provider: "copse" })
    devDebug("[generate-image] unexpected error raw:", normalized.raw)
    return NextResponse.json(
      { ok: false, error: normalized, attempts: 0, provider: "copse" },
      { status: normalized.status || 500 },
    )
  }
}
