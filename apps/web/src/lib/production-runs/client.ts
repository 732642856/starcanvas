export type ProductionRunStatus = "QUEUED" | "SUBMITTING" | "POLLING" | "COMPLETED" | "FAILED" | "CANCELED"

export type ProductionRunAsset = {
  id: string
  url: string
}

export type ProductionRunDto = {
  id: string
  projectId?: string
  shotId?: string
  status: ProductionRunStatus
  outputAsset?: ProductionRunAsset
  tasks?: Array<{
    attempts?: Array<{
      outputAsset?: ProductionRunAsset
    }>
  }>
}

export type CreateVideoProductionRunInput = {
  projectId: string
  shotId: string
  sourceAssetId: string
  prompt: string
  durationSeconds: number
  referenceAssetIds?: string[]
  idempotencyKey: string
}

export type ProductionRunClientOptions = {
  baseUrl?: string
  fetchImpl?: typeof fetch
  signal?: AbortSignal
}

const LOCAL_API_BASE_URL = "http://localhost:4000/api/v1"

function getApiBaseUrl(baseUrl?: string) {
  const configured = baseUrl || process.env.NEXT_PUBLIC_API_BASE_URL || LOCAL_API_BASE_URL
  return configured.replace(/\/+$/, "")
}

function normalizeRun(raw: ProductionRunDto): ProductionRunDto {
  return {
    ...raw,
    outputAsset: raw.outputAsset ?? raw.tasks?.flatMap((task) => task.attempts || []).find((attempt) => attempt.outputAsset)?.outputAsset,
  }
}

async function requestProductionRun(path: string, init: RequestInit, options: ProductionRunClientOptions): Promise<ProductionRunDto> {
  const fetchImpl = options.fetchImpl ?? fetch
  const response = await fetchImpl(`${getApiBaseUrl(options.baseUrl)}${path}`, {
    ...init,
    signal: options.signal,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  })
  if (!response.ok) {
    throw new Error(`Production run API failed [${response.status}]: ${await response.text().catch(() => "")}`)
  }
  const payload = await response.json() as { data?: ProductionRunDto } | ProductionRunDto
  return normalizeRun("data" in payload && payload.data ? payload.data : payload as ProductionRunDto)
}

export function createVideoProductionRun(input: CreateVideoProductionRunInput, options: ProductionRunClientOptions = {}) {
  return requestProductionRun("/production-runs", {
    method: "POST",
    body: JSON.stringify(input),
  }, options)
}

export function getProductionRun(runId: string, options: ProductionRunClientOptions = {}) {
  return requestProductionRun(`/production-runs/${encodeURIComponent(runId)}`, { method: "GET" }, options)
}

export function pollProductionRun(runId: string, options: ProductionRunClientOptions = {}) {
  return requestProductionRun(`/production-runs/${encodeURIComponent(runId)}/poll`, { method: "POST" }, options)
}

export function retryProductionRun(runId: string, options: ProductionRunClientOptions = {}) {
  return requestProductionRun(`/production-runs/${encodeURIComponent(runId)}/retry`, { method: "POST" }, options)
}

export function cancelProductionRun(runId: string, options: ProductionRunClientOptions = {}) {
  return requestProductionRun(`/production-runs/${encodeURIComponent(runId)}/cancel`, { method: "POST" }, options)
}

export async function waitForCompletedProductionRun(
  runId: string,
  options: ProductionRunClientOptions & { intervalMs?: number; timeoutMs?: number } = {},
) {
  const intervalMs = options.intervalMs ?? 5_000
  const timeoutMs = options.timeoutMs ?? 10 * 60_000
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    const run = await pollProductionRun(runId, options)
    if (run.status === "COMPLETED") {
      if (!run.outputAsset?.id || !run.outputAsset.url) {
        throw new Error("Production run completed without an output asset")
      }
      return run
    }
    if (run.status === "FAILED" || run.status === "CANCELED") {
      throw new Error(`Production run ended with status ${run.status}`)
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
  throw new Error(`Production run timed out: ${runId}`)
}
