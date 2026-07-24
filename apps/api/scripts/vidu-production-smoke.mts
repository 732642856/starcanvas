export type ViduProductionSmokeEnv = {
  STARCANVAS_RUN_REAL_VIDU_SMOKE?: string
  DASHSCOPE_API_KEY?: string
  STARCANVAS_SMOKE_SOURCE_ASSET_ID?: string
  STARCANVAS_SMOKE_PROJECT_ID?: string
  STARCANVAS_API_BASE_URL?: string
}

export type ViduProductionSmokeResult = {
  skipped: boolean
  status: string
  runId?: string
  outputAssetId?: string
  reason?: string
}

const REQUIRED_ENV = [
  "DASHSCOPE_API_KEY",
  "STARCANVAS_SMOKE_SOURCE_ASSET_ID",
  "STARCANVAS_SMOKE_PROJECT_ID",
] as const

export async function runSmoke(env: ViduProductionSmokeEnv = process.env): Promise<ViduProductionSmokeResult> {
  if (env.STARCANVAS_RUN_REAL_VIDU_SMOKE !== "1") {
    return { skipped: true, status: "skipped", reason: "STARCANVAS_RUN_REAL_VIDU_SMOKE is not 1" }
  }
  const missing = REQUIRED_ENV.filter((key) => !env[key]?.trim())
  if (missing.length > 0) {
    return { skipped: true, status: "skipped", reason: `Missing required env: ${missing.join(", ")}` }
  }
  const apiBaseUrl = (env.STARCANVAS_API_BASE_URL || "http://localhost:4000/api/v1").replace(/\/+$/, "")
  const createResponse = await fetch(`${apiBaseUrl}/production-runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      projectId: env.STARCANVAS_SMOKE_PROJECT_ID,
      shotId: `smoke-shot-${Date.now()}`,
      sourceAssetId: env.STARCANVAS_SMOKE_SOURCE_ASSET_ID,
      prompt: "A short cinematic camera push-in, safe production smoke.",
      durationSeconds: 3,
      referenceAssetIds: [],
      idempotencyKey: `vidu-smoke-${Date.now()}`,
    }),
  })
  if (!createResponse.ok) {
    return { skipped: false, status: `create_failed_${createResponse.status}` }
  }
  const created = await createResponse.json() as { data?: { run?: { id?: string }; id?: string } }
  const runId = created.data?.run?.id ?? created.data?.id
  if (!runId) {
    return { skipped: false, status: "create_failed_no_run_id" }
  }
  const deadline = Date.now() + 10 * 60_000
  while (Date.now() < deadline) {
    const pollResponse = await fetch(`${apiBaseUrl}/production-runs/${encodeURIComponent(runId)}/poll`, { method: "POST" })
    if (!pollResponse.ok) return { skipped: false, status: `poll_failed_${pollResponse.status}`, runId }
    const payload = await pollResponse.json() as {
      data?: {
        status?: string
        outputAsset?: { id?: string }
        tasks?: Array<{ attempts?: Array<{ outputAsset?: { id?: string } }> }>
      }
    }
    const data = payload.data
    const outputAssetId = data?.outputAsset?.id ?? data?.tasks?.flatMap((task) => task.attempts || []).find((attempt) => attempt.outputAsset)?.outputAsset?.id
    if (data?.status === "COMPLETED" && outputAssetId) {
      return { skipped: false, status: "completed", runId, outputAssetId }
    }
    if (data?.status === "FAILED" || data?.status === "CANCELED") {
      return { skipped: false, status: data.status, runId }
    }
    await new Promise((resolve) => setTimeout(resolve, 8_000))
  }
  return { skipped: false, status: "timeout", runId }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runSmoke()
    .then((result) => {
      console.log(JSON.stringify(result))
      process.exitCode = result.skipped || result.status === "completed" ? 0 : 1
    })
    .catch((error) => {
      console.error(JSON.stringify({ skipped: false, status: "error", message: error instanceof Error ? error.message : String(error) }))
      process.exitCode = 1
    })
}
