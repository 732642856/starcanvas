import { mkdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"

import {
  ANCHOR_AUTHORIZATION,
  buildLowCostAnchorRequest,
  isLowCostAnchorAuthorized,
} from "./story-low-cost-anchor-core.mjs"
import { resolveLocalApiBase } from "./local-api-base.mjs"

const root = process.cwd()
const fallbackPath = join(root, "artifacts/太子替我背黑锅-low-cost-anchor-fallback.json")
const outputDir = join(root, "artifacts/太子替我背黑锅-full-production")
const keyframeDir = join(outputDir, "keyframes")
const receiptDir = join(outputDir, "receipts")
const apiBase = resolveLocalApiBase(process.env)
const fallback = JSON.parse(await readFile(fallbackPath, "utf8"))
const gate = fallback.gates.find((item) => item.id === "gate-1")
if (!gate) throw new Error("Gate 1 is missing from the fallback plan")

const isLive = isLowCostAnchorAuthorized(process.env)
if (!isLive) {
  console.log(JSON.stringify({
    mode: "dry-run",
    asset: gate.asset,
    sourceReference: gate.sourceReference,
    outputSize: gate.outputSize,
    referenceCount: gate.referenceCount,
    retryAttempts: 1,
    requires: [
      "STARCANVAS_ALLOW_PAID_IMAGE_ANCHOR=1",
      `STARCANVAS_IMAGE_ANCHOR_AUTHORIZATION=${ANCHOR_AUTHORIZATION}`,
    ],
  }, null, 2))
  process.exit(0)
}

await mkdir(keyframeDir, { recursive: true })
await mkdir(receiptDir, { recursive: true })
const requestId = `story-anchor-zhaoheng-${Date.now()}`
const receiptPath = join(receiptDir, "anchor-zhaoheng-square.json")
const sourceImage = `data:image/png;base64,${(await readFile(gate.sourceReference)).toString("base64")}`
const request = buildLowCostAnchorRequest({ requestId, sourceImage })
const requestedReceipt = {
  gate: "gate-1",
  asset: gate.asset,
  requestId,
  status: "requested_image",
  startedAt: new Date().toISOString(),
  sourceReference: gate.sourceReference,
  referenceCount: 1,
  size: request.size,
  retryAttempts: request.retryAttempts,
}
await writeFile(receiptPath, `${JSON.stringify(requestedReceipt, null, 2)}\n`)

const controller = new AbortController()
const timeout = setTimeout(() => controller.abort(), 240_000)
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
  const filename = `anchor-zhaoheng-square.${extension}`
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
  console.log(JSON.stringify({ gate: "gate-1", status: receipt.status, outputFile: receipt.outputFile }))
} catch (error) {
  const receipt = {
    ...requestedReceipt,
    status: "failed_image",
    finishedAt: new Date().toISOString(),
    error: error instanceof Error ? error.message : String(error),
  }
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`)
  console.log(JSON.stringify({ gate: "gate-1", status: receipt.status, error: receipt.error }))
  process.exitCode = 1
} finally {
  clearTimeout(timeout)
}
