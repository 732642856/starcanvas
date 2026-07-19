export type ComfyEnvironment = Record<string, string | undefined>

export type LocalComfyConfig =
  | {
      enabled: true
      baseUrl: string
      checkpoint: string
      timeoutMs: number
      pollIntervalMs: number
    }
  | {
      enabled: false
      reason: "disabled" | "cloud-disabled" | "missing-config" | "invalid-url" | "remote-endpoint-blocked"
    }

type ComfyWorkflowInput = string | number | Array<string | number>

export type ComfyWorkflow = Record<string, {
  class_type: string
  inputs: Record<string, ComfyWorkflowInput>
}>

export class ComfyConfigurationError extends Error {
  readonly code: "COMFY_DISABLED" | "COMFY_REQUEST_FAILED" | "COMFY_TIMEOUT" | "COMFY_OUTPUT_MISSING"

  constructor(code: ComfyConfigurationError["code"], message: string) {
    super(message)
    this.name = "ComfyConfigurationError"
    this.code = code
  }
}

function isLoopbackHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname.endsWith(".localhost")
}

function positiveInt(value: string | undefined, fallback: number, max: number): number {
  const parsed = Number.parseInt(value ?? "", 10)
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, max) : fallback
}

export function getLocalComfyConfig(env: ComfyEnvironment = process.env): LocalComfyConfig {
  if (env.STARCANVAS_CLOUD_DEPLOYMENT === "1") return { enabled: false, reason: "cloud-disabled" }
  const isLocalRuntime = env.NODE_ENV !== "production" || env.STARCANVAS_DESKTOP_LOCAL === "1"
  if (!isLocalRuntime || env.STARCANVAS_LOCAL_COMFYUI !== "1") return { enabled: false, reason: "disabled" }

  const baseUrl = env.COMFYUI_BASE_URL?.trim().replace(/\/+$/, "")
  const checkpoint = env.COMFYUI_CHECKPOINT?.trim()
  if (!baseUrl || !checkpoint) return { enabled: false, reason: "missing-config" }

  let parsed: URL
  try {
    parsed = new URL(baseUrl)
  } catch {
    return { enabled: false, reason: "invalid-url" }
  }
  if (!/^https?:$/.test(parsed.protocol)) return { enabled: false, reason: "invalid-url" }
  if (!isLoopbackHost(parsed.hostname) && env.STARCANVAS_ALLOW_REMOTE_COMFYUI !== "1") {
    return { enabled: false, reason: "remote-endpoint-blocked" }
  }

  return {
    enabled: true,
    baseUrl,
    checkpoint,
    timeoutMs: positiveInt(env.COMFYUI_TIMEOUT_MS, 120_000, 600_000),
    pollIntervalMs: positiveInt(env.COMFYUI_POLL_INTERVAL_MS, 750, 10_000),
  }
}

export function buildComfyTextToImageWorkflow(input: {
  checkpoint: string
  prompt: string
  negativePrompt?: string
  width?: number
  height?: number
  seed?: number
}): ComfyWorkflow {
  const width = Math.max(64, Math.min(2048, input.width ?? 1024))
  const height = Math.max(64, Math.min(2048, input.height ?? 1024))
  const seed = Number.isSafeInteger(input.seed) ? input.seed! : Math.floor(Math.random() * 2_147_483_647)
  return {
    "1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: input.checkpoint } },
    "2": { class_type: "CLIPTextEncode", inputs: { text: input.negativePrompt ?? "", clip: ["1", 1] } },
    "3": { class_type: "CLIPTextEncode", inputs: { text: input.prompt, clip: ["1", 1] } },
    "4": { class_type: "EmptyLatentImage", inputs: { width, height, batch_size: 1 } },
    "5": { class_type: "KSampler", inputs: { seed, steps: 28, cfg: 7, sampler_name: "euler", scheduler: "normal", denoise: 1, model: ["1", 0], positive: ["3", 0], negative: ["2", 0], latent_image: ["4", 0] } },
    "8": { class_type: "VAEDecode", inputs: { samples: ["5", 0], vae: ["1", 2] } },
    "9": { class_type: "SaveImage", inputs: { filename_prefix: "StarCanvas", images: ["8", 0] } },
  }
}

type ComfyImage = { filename?: unknown; subfolder?: unknown; type?: unknown }

function imageUrl(baseUrl: string, image: ComfyImage): string | null {
  if (typeof image.filename !== "string" || !image.filename.trim()) return null
  const params = new URLSearchParams({ filename: image.filename, type: typeof image.type === "string" ? image.type : "output" })
  if (typeof image.subfolder === "string" && image.subfolder) params.set("subfolder", image.subfolder)
  return `${baseUrl}/view?${params.toString()}`
}

export async function runComfyTextToImage(input: {
  config: LocalComfyConfig
  prompt: string
  negativePrompt?: string
  width?: number
  height?: number
  seed?: number
  fetchImpl?: typeof fetch
  wait?: (ms: number) => Promise<void>
}): Promise<{ promptId: string; imageUrl: string }> {
  if (!input.config.enabled) throw new ComfyConfigurationError("COMFY_DISABLED", `ComfyUI is unavailable: ${input.config.reason}`)
  const fetchImpl = input.fetchImpl ?? fetch
  const wait = input.wait ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)))
  const submitted = await fetchImpl(`${input.config.baseUrl}/prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: buildComfyTextToImageWorkflow({ checkpoint: input.config.checkpoint, prompt: input.prompt, negativePrompt: input.negativePrompt, width: input.width, height: input.height, seed: input.seed }) }),
  })
  if (!submitted.ok) throw new ComfyConfigurationError("COMFY_REQUEST_FAILED", `ComfyUI /prompt failed (${submitted.status})`)
  const submission = await submitted.json() as { prompt_id?: unknown }
  if (typeof submission.prompt_id !== "string" || !submission.prompt_id) throw new ComfyConfigurationError("COMFY_REQUEST_FAILED", "ComfyUI did not return prompt_id")

  const deadline = Date.now() + input.config.timeoutMs
  while (Date.now() < deadline) {
    const history = await fetchImpl(`${input.config.baseUrl}/history/${encodeURIComponent(submission.prompt_id)}`)
    if (!history.ok) throw new ComfyConfigurationError("COMFY_REQUEST_FAILED", `ComfyUI history failed (${history.status})`)
    const body = await history.json() as Record<string, { outputs?: Record<string, { images?: ComfyImage[] }> }>
    const output = body[submission.prompt_id]?.outputs
    const firstImage = output ? Object.values(output).flatMap((value) => value.images ?? [])[0] : undefined
    const resolvedUrl = firstImage ? imageUrl(input.config.baseUrl, firstImage) : null
    if (resolvedUrl) return { promptId: submission.prompt_id, imageUrl: resolvedUrl }
    await wait(input.config.pollIntervalMs)
  }
  throw new ComfyConfigurationError("COMFY_TIMEOUT", "ComfyUI did not produce an image before timeout")
}
