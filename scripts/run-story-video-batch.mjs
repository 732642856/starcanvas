import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises"
import { basename, extname, join } from "node:path"
import { buildReplacementArchiveEntry, buildStoryVideoRequest, mergeVideoBatchResults, parseViduSseResult } from "./story-video-batch-core.mjs"
import { resolveLocalApiBase } from "./local-api-base.mjs"

const root = process.cwd()
const planPath = join(root, "artifacts/太子替我背黑锅-full-production-plan.json")
const outputDir = join(root, "artifacts/太子替我背黑锅-full-production")
const videoDir = join(outputDir, "videos")
const receiptDir = join(outputDir, "receipts")
const summaryPath = join(outputDir, "batch-b-videos-summary.json")
const requestedIds = process.argv.slice(2).filter((value) => value.startsWith("shot-"))
const isLive = process.env.STARCANVAS_ALLOW_PAID_VIDEO_BATCH === "1"
const useReferenceVideo = process.env.STARCANVAS_VIDEO_REFERENCE_MODE === "1"
const allowReferenceReplacement = useReferenceVideo && process.env.STARCANVAS_ALLOW_REFERENCE_REPLACEMENT === "1"
const batchName = useReferenceVideo ? "B-videos-reference" : "B-videos-text-only"
const replacementArchiveDir = allowReferenceReplacement
  ? join(outputDir, "archives", `video-replacement-${new Date().toISOString().replace(/[:.]/g, "")}`)
  : undefined
const apiBase = resolveLocalApiBase(process.env)

const plan = JSON.parse(await readFile(planPath, "utf8"))
const pendingShots = allowReferenceReplacement
  ? plan.shots
  : plan.shots.filter((shot) => shot.status !== "video_completed")
const shots = requestedIds.length === 0
  ? pendingShots
  : pendingShots.filter((shot) => requestedIds.includes(shot.id))

if (shots.length === 0) throw new Error("No pending video shots matched the requested batch")

await mkdir(videoDir, { recursive: true })
await mkdir(receiptDir, { recursive: true })

if (!isLive) {
  console.log(JSON.stringify({
    mode: "dry-run",
    apiBase,
    shots: shots.map((shot) => ({ shotId: shot.id, title: shot.title, duration: 3 })),
  }, null, 2))
  process.exit(0)
}

let existingResults = []
try {
  const previousSummary = JSON.parse(await readFile(summaryPath, "utf8"))
  if (!Array.isArray(previousSummary.results)) throw new Error("Existing video summary has no results array")
  existingResults = previousSummary.results
} catch (error) {
  if (error && typeof error === "object" && error.code === "ENOENT") {
    existingResults = []
  } else {
    throw error
  }
}

if (replacementArchiveDir) {
  await mkdir(join(replacementArchiveDir, "videos"), { recursive: true })
  await mkdir(join(replacementArchiveDir, "receipts"), { recursive: true })
}

const results = []
const replacementArchives = []

for (const shot of shots) {
  const requestId = `story-video-${shot.id}-${Date.now()}`
  const referenceIds = useReferenceVideo
    ? String(shot.reference ?? "").split("+").filter(Boolean)
    : []
  const referenceImageUrls = referenceIds.length > 0
    ? await Promise.all(referenceIds.map(async (referenceId) => {
        const referencePath = plan.references[referenceId]
        if (!referencePath) throw new Error(`Missing reference image: ${referenceId}`)
        return `data:image/${extname(referencePath).slice(1)};base64,${(await readFile(referencePath)).toString("base64")}`
      }))
    : undefined
  const keyframePath = referenceImageUrls?.length ? undefined : shot.videoKeyframe ?? shot.keyframe
  const imageUrl = keyframePath
    ? `data:image/${extname(keyframePath).slice(1)};base64,${(await readFile(keyframePath)).toString("base64")}`
    : undefined
  const request = buildStoryVideoRequest(shot, imageUrl, referenceImageUrls)
  const receiptPath = join(receiptDir, `${shot.id}.video.json`)
  const replacementArchive = replacementArchiveDir
    ? buildReplacementArchiveEntry({ shot, videoDir, receiptDir, archiveDir: replacementArchiveDir })
    : undefined
  let archivedReplacement
  if (replacementArchive) {
    let copiedVideo = false
    let copiedReceipt = false
    try { await copyFile(join(videoDir, `${shot.id}-${shot.title}.mp4`), replacementArchive.archivedVideo); copiedVideo = true } catch {}
    try { await copyFile(receiptPath, replacementArchive.archivedReceipt); copiedReceipt = true } catch {}
    if (copiedVideo && copiedReceipt) {
      archivedReplacement = replacementArchive
      replacementArchives.push(replacementArchive)
    }
  }
  const requestedReceipt = {
    shotId: shot.id,
    requestId,
    status: "requested_video",
    startedAt: new Date().toISOString(),
    mode: request.mode,
    model: request.model,
    duration: request.duration,
    prompt: request.prompt,
    referenceFiles: referenceIds.map((referenceId) => basename(plan.references[referenceId])),
    replacementArchive: archivedReplacement,
  }
  await writeFile(receiptPath, `${JSON.stringify(requestedReceipt, null, 2)}\n`)

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 660_000)
  try {
    const response = await fetch(`${apiBase}/api/ai/generate-video-vidu`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`video route failed (${response.status})`)

    const result = parseViduSseResult(await response.text())
    const videoResponse = await fetch(result.videoUrl, { signal: controller.signal })
    if (!videoResponse.ok) throw new Error(`video artifact download failed (${videoResponse.status})`)

    const filename = `${shot.id}-${shot.title}.mp4`
    await writeFile(join(videoDir, filename), Buffer.from(await videoResponse.arrayBuffer()))
    const receipt = {
      ...requestedReceipt,
      status: "completed_video",
      finishedAt: new Date().toISOString(),
      taskId: result.taskId,
      usage: result.usage,
      outputFile: `videos/${filename}`,
    }
    await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`)
    results.push(receipt)
    console.log(JSON.stringify({ shotId: shot.id, status: receipt.status, outputFile: receipt.outputFile }))
  } catch (error) {
    const receipt = {
      ...requestedReceipt,
      status: "failed_video",
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

if (replacementArchiveDir) {
  await writeFile(
    join(replacementArchiveDir, "rollback-index.json"),
    `${JSON.stringify({ createdAt: new Date().toISOString(), batchName, replacements: replacementArchives }, null, 2)}\n`,
  )
}

const summaryResults = mergeVideoBatchResults({
  existingResults,
  updatedResults: results,
  shotOrder: plan.shots.map((shot) => shot.id),
})
await writeFile(summaryPath, `${JSON.stringify({
  project: plan.project,
  batch: batchName,
  completedAt: new Date().toISOString(),
  requested: summaryResults.map((result) => result.shotId),
  results: summaryResults,
}, null, 2)}\n`)

if (results.some((result) => result.status === "failed_video")) process.exitCode = 1
