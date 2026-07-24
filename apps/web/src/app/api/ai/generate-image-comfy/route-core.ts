import {
  getLocalComfyConfig,
  runComfyTextToImage,
  type LocalComfyConfig,
} from "../../../../lib/ai/comfy-client.ts"
import { isLoopbackHost } from "../../../../lib/local-skills/environment.ts"

type ComfyImageResponseBody = {
  ok: boolean
  error?: string
  imageUrl?: string
  prompt?: string
  model?: string
  provider?: string
  promptId?: string
}

type ComfyRunner = typeof runComfyTextToImage

function readDimension(value: unknown, fallback: number): number | null {
  if (value === undefined) return fallback
  return typeof value === "number" && Number.isInteger(value) && value >= 64 && value <= 2048
    ? value
    : null
}

export async function getComfyImageResponse({
  host,
  body,
  config = getLocalComfyConfig(),
  run = runComfyTextToImage,
}: {
  host: string | null
  body: unknown
  config?: LocalComfyConfig
  run?: ComfyRunner
}): Promise<{ status: number; body: ComfyImageResponseBody }> {
  if (!isLoopbackHost(host)) {
    return { status: 403, body: { ok: false, error: "Local ComfyUI is available only to loopback callers." } }
  }
  if (!config.enabled) {
    return { status: 403, body: { ok: false, error: `ComfyUI is unavailable: ${config.reason}` } }
  }
  if (!body || typeof body !== "object") {
    return { status: 400, body: { ok: false, error: "Invalid JSON body." } }
  }

  const input = body as Record<string, unknown>
  const prompt = typeof input.prompt === "string" ? input.prompt.trim() : ""
  const negativePrompt = typeof input.negativePrompt === "string" ? input.negativePrompt.trim() : undefined
  const width = readDimension(input.width, 1024)
  const height = readDimension(input.height, 1024)
  const rawSeed = input.seed
  const seed = typeof rawSeed === "number" ? rawSeed : undefined
  if (!prompt || prompt.length > 8_000) {
    return { status: 400, body: { ok: false, error: "Prompt is required and must be at most 8000 characters." } }
  }
  if (negativePrompt && negativePrompt.length > 4_000) {
    return { status: 400, body: { ok: false, error: "Negative prompt must be at most 4000 characters." } }
  }
  if (width === null || height === null) {
    return { status: 400, body: { ok: false, error: "Width and height must be integers between 64 and 2048." } }
  }
  if (rawSeed !== undefined && (
    typeof rawSeed !== "number"
    || !Number.isSafeInteger(rawSeed)
    || rawSeed < 0
  )) {
    return { status: 400, body: { ok: false, error: "Seed must be a non-negative safe integer." } }
  }

  try {
    const result = await run({ config, prompt, negativePrompt, width, height, seed })
    return {
      status: 200,
      body: {
        ok: true,
        imageUrl: result.imageUrl,
        prompt,
        model: config.checkpoint,
        provider: "local-comfyui",
        promptId: result.promptId,
      },
    }
  } catch (error) {
    return {
      status: 502,
      body: { ok: false, error: error instanceof Error ? error.message : "ComfyUI image generation failed." },
    }
  }
}
