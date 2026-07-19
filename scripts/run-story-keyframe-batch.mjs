import { openSync, closeSync } from "node:fs"
import { spawn } from "node:child_process"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { basename, join } from "node:path"
import {
  buildKeyframeBatchRequest,
  selectKeyframeBatchShots,
  shouldDetachPaidImageBatch,
} from "./story-keyframe-batch-core.mjs"
import { resolveLocalApiBase } from "./local-api-base.mjs"

const root = process.cwd()
const planPath = join(root, "artifacts/太子替我背黑锅-full-production-plan.json")
const outputDir = join(root, "artifacts/太子替我背黑锅-full-production")
const keyframeDir = join(outputDir, "keyframes")
const receiptDir = join(outputDir, "receipts")
const requestedIds = process.argv.slice(2).filter((value) => value.startsWith("shot-"))
const isLive = process.env.STARCANVAS_ALLOW_PAID_IMAGE_BATCH === "1"
const mode = process.env.STARCANVAS_KEYFRAME_MODE === "text-only" ? "text-only" : "reference"
const requestedSize = process.env.STARCANVAS_KEYFRAME_SIZE || "1024x1792"
const allowedSizes = new Set(["1024x1024", "1024x1792", "1792x1024"])
if (!allowedSizes.has(requestedSize)) throw new Error(`Unsupported keyframe size: ${requestedSize}`)
const apiBase = resolveLocalApiBase(process.env)
const isDetachedChild = process.env.STARCANVAS_DETACHED_IMAGE_BATCH_CHILD === "1"

const plan = JSON.parse(await readFile(planPath, "utf8"))
const shots = selectKeyframeBatchShots(plan.shots, requestedIds)

if (shots.length === 0) throw new Error("No pending shots matched the requested batch")

await mkdir(keyframeDir, { recursive: true })
await mkdir(receiptDir, { recursive: true })

if (shouldDetachPaidImageBatch({
  isLive,
  detachRequested: process.env.STARCANVAS_DETACH_PAID_IMAGE_RUN === "1",
  isDetachedChild,
})) {
  const logDir = join(outputDir, "logs")
  await mkdir(logDir, { recursive: true })
  const logPath = join(logDir, `keyframe-batch-${Date.now()}.log`)
  const logFd = openSync(logPath, "a")
  const child = spawn(process.execPath, [process.argv[1], ...process.argv.slice(2)], {
    detached: true,
    stdio: ["ignore", logFd, logFd],
    env: { ...process.env, STARCANVAS_DETACHED_IMAGE_BATCH_CHILD: "1" },
  })
  child.unref()
  closeSync(logFd)
  console.log(JSON.stringify({ mode: "detached", pid: child.pid, logPath, shots: shots.map((shot) => shot.id) }))
  process.exit(0)
}

const planSummary = shots.map((shot) => ({
  shotId: shot.id,
  title: shot.title,
  reference: shot.reference,
  mode,
  promptLength: shot.imagePrompt.length,
}))

if (!isLive) {
  console.log(JSON.stringify({ mode: "dry-run", apiBase, shots: planSummary }, null, 2))
  process.exit(0)
}

const references = mode === "reference"
  ? {
      zhaoheng: `data:image/png;base64,${(await readFile(plan.references.zhaoheng)).toString("base64")}`,
      jingchai: `data:image/png;base64,${(await readFile(plan.references.jingchai)).toString("base64")}`,
    }
  : {}
const results = []

for (const shot of shots) {
  const requestId = `story-${shot.id}-${Date.now()}`
    const request = buildKeyframeBatchRequest({ shot, requestId, mode, references, size: requestedSize })
  const receiptPath = join(receiptDir, `${shot.id}.json`)
  const startedAt = new Date().toISOString()
  const requestedReceipt = {
    shotId: shot.id,
    requestId,
    status: "requested_image",
    startedAt,
    mode,
    model: request.model,
    referenceFiles: mode === "reference"
      ? shot.reference.split("+").map((reference) => basename(plan.references[reference]))
      : [],
    prompt: request.prompt,
    retryAttempts: request.retryAttempts,
  }
  await writeFile(receiptPath, `${JSON.stringify(requestedReceipt, null, 2)}\n`)

  const controller = new AbortController()
  // The route may make two 180s upstream attempts; leave enough room for both.
  const timeout = setTimeout(() => controller.abort(), 450_000)
  try {
    const response = await fetch(`${apiBase}/api/ai/generate-image`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal: controller.signal,
    })
    const payload = await response.json().catch(async () => ({ error: await response.text() }))
    if (!response.ok || !payload.ok || typeof payload.imageUrl !== "string") {
      throw new Error(typeof payload.error === "string" ? payload.error : `image route failed (${response.status})`)
    }
    const match = payload.imageUrl.match(/^data:image\/(png|jpeg|webp);base64,(.+)$/)
    if (!match) throw new Error("image route returned a non-data image URL")
    const extension = match[1] === "jpeg" ? "jpg" : match[1]
    const filename = `${shot.id}-${shot.title}.${extension}`
    await writeFile(join(keyframeDir, filename), Buffer.from(match[2], "base64"))
    const receipt = {
      ...requestedReceipt,
      status: "completed_image",
      finishedAt: new Date().toISOString(),
      provider: payload.provider,
      model: payload.model,
      endpoint: payload.endpoint,
      attempts: payload.attempts,
      outputFile: `keyframes/${filename}`,
    }
    await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`)
    results.push(receipt)
    console.log(JSON.stringify({ shotId: shot.id, status: receipt.status, outputFile: receipt.outputFile }))
  } catch (error) {
    const receipt = {
      ...requestedReceipt,
      status: "failed_image",
      finishedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error),
    }
    await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`)
    results.push(receipt)
    console.log(JSON.stringify({ shotId: shot.id, status: receipt.status, error: receipt.error }))
    break
  } finally {
    clearTimeout(timeout)
  }
}

await writeFile(join(outputDir, "batch-a-summary.json"), `${JSON.stringify({
  project: plan.project,
  batch: "A-keyframes",
  completedAt: new Date().toISOString(),
  requested: shots.map((shot) => shot.id),
  results,
}, null, 2)}\n`)

if (results.some((result) => result.status === "failed_image")) process.exitCode = 1
