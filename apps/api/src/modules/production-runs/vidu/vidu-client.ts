export const DASHSCOPE_VIDEO_BASE_URL = "https://dashscope.aliyuncs.com/api/v1"
const VIDU_REQUEST_TIMEOUT_MS = 60_000

export interface ViduSubmission {
  providerJobId: string
}

export interface ViduTaskResult {
  status: "POLLING" | "COMPLETED" | "FAILED"
  videoUrl?: string
  errorMessage?: string
  raw: unknown
}

export interface ViduClient {
  submit(input: {
    apiKey: string
    model: string
    imageUrl: string
    prompt: string
    duration: number
    referenceImageUrls: string[]
  }): Promise<ViduSubmission>
  poll(input: { apiKey: string; providerJobId: string }): Promise<ViduTaskResult>
  cancel(input: { apiKey: string; providerJobId: string }): Promise<void>
}

export type ViduRawTask = {
  state?: string
  creations?: Array<{ url?: string }>
  output?: {
    task_id?: string
    task_status?: string
    video_url?: string
    code?: string
    message?: string
  }
  code?: string
  message?: string
}

export function normalizeViduTask(raw: ViduRawTask): Omit<ViduTaskResult, "raw"> {
  const status = String(raw.output?.task_status ?? raw.state ?? "").toUpperCase()
  const videoUrl = raw.output?.video_url ?? raw.creations?.find((creation) => creation.url)?.url
  if (["SUCCESS", "SUCCEEDED", "COMPLETED"].includes(status) && videoUrl) {
    return { status: "COMPLETED", videoUrl, errorMessage: undefined }
  }
  if (["FAIL", "FAILED", "CANCELED", "CANCELLED", "UNKNOWN"].includes(status) || raw.code || raw.output?.code) {
    return {
      status: "FAILED",
      errorMessage: raw.output?.message ?? raw.message ?? raw.output?.code ?? raw.code ?? `Vidu task failed with status ${status || "UNKNOWN"}`,
    }
  }
  return { status: "POLLING", errorMessage: undefined }
}

export class DashScopeViduClient implements ViduClient {
  private readonly options: {
    baseUrl?: string
    fetchImpl?: typeof fetch
  }

  constructor(options: { baseUrl?: string; fetchImpl?: typeof fetch } = {}) {
    this.options = options
  }

  async submit(input: {
    apiKey: string
    model: string
    imageUrl: string
    prompt: string
    duration: number
    referenceImageUrls: string[]
  }): Promise<ViduSubmission> {
    const response = await this.fetchWithTimeout(`${this.baseUrl}/services/aigc/video-generation/video-synthesis`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${input.apiKey}`,
        "X-DashScope-Async": "enable",
      },
      body: JSON.stringify({
        model: input.model,
        input: {
          prompt: input.prompt,
          media: [{ type: "image", url: input.imageUrl }, ...input.referenceImageUrls.map((url) => ({ type: "image", url }))],
        },
        parameters: {
          duration: input.duration,
          resolution: "720P",
        },
      }),
    })
    if (!response.ok) {
      throw new Error(`Vidu submit failed [${response.status}]: ${await response.text().catch(() => "")}`)
    }
    const data = await response.json() as { output?: { task_id?: string }; code?: string; message?: string }
    if (data.code) {
      throw new Error(`Vidu submit failed: ${data.message || data.code}`)
    }
    const providerJobId = data.output?.task_id
    if (!providerJobId) {
      throw new Error("Vidu submit did not return task_id")
    }
    return { providerJobId }
  }

  async poll(input: { apiKey: string; providerJobId: string }): Promise<ViduTaskResult> {
    const response = await this.fetchWithTimeout(`${this.baseUrl}/tasks/${encodeURIComponent(input.providerJobId)}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${input.apiKey}` },
    })
    if (!response.ok) {
      return {
        status: "FAILED",
        errorMessage: `Vidu poll failed [${response.status}]: ${await response.text().catch(() => "")}`,
        raw: { status: response.status },
      }
    }
    const raw = await response.json() as ViduRawTask
    return { ...normalizeViduTask(raw), raw }
  }

  async cancel(input: { apiKey: string; providerJobId: string }): Promise<void> {
    const response = await this.fetchWithTimeout(`${this.baseUrl}/tasks/${encodeURIComponent(input.providerJobId)}/cancel`, {
      method: "POST",
      headers: { Authorization: `Bearer ${input.apiKey}` },
    })
    if (response.ok || response.status === 404 || response.status === 405) {
      return
    }
    throw new Error(`Vidu cancel failed [${response.status}]: ${await response.text().catch(() => "")}`)
  }

  private get baseUrl() {
    return (this.options.baseUrl ?? DASHSCOPE_VIDEO_BASE_URL).replace(/\/+$/, "")
  }

  private async fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    const fetchImpl = this.options.fetchImpl ?? fetch
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), VIDU_REQUEST_TIMEOUT_MS)
    try {
      return await fetchImpl(url, { ...init, signal: controller.signal })
    } finally {
      clearTimeout(timeout)
    }
  }
}
