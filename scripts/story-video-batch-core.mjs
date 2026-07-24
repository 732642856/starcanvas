import { basename, join } from "node:path"

const characterLock = [
  "Northern Song historical comedy, vertical cinematic composition.",
  "Zhaoheng is a 22-year-old East Asian crown prince with black hair in a formal gold crown, a white silk robe with blue-gray and gold embroidery, jade belt ornaments, and a restrained, dignified expression.",
  "Jingchai is a 17-year-old East Asian palace maid with black hair in a simple bun with a small white floral hairpin, a pale blue and white maid robe, a warm face and a subtly calculating gaze.",
  "Keep costumes, the soot-black iron wok with its visible knife mark, named characters, and locations consistent. Keep the primary character's full face inside the frame. No text, no split screen, no modern objects, no duplicate limbs, no character swap.",
].join(" ")

export function buildStoryVideoRequest(shot, imageUrl, referenceImageUrls) {
  const request = {
    mode: referenceImageUrls?.length ? "r2v" : imageUrl ? "i2v" : "t2v",
    model: "viduq3-turbo",
    prompt: `${characterLock}\n\n${shot.videoPrompt}`,
    duration: 3,
    resolution: "720P",
    size: "720*1280",
    watermark: false,
    audio: false,
  }
  if (imageUrl) request.imageUrl = imageUrl
  if (referenceImageUrls?.length) request.referenceImageUrls = referenceImageUrls
  return request
}

export function buildReplacementArchiveEntry({ shot, videoDir, receiptDir, archiveDir }) {
  const filename = `${shot.id}-${shot.title}.mp4`
  return {
    shotId: shot.id,
    archivedVideo: `${archiveDir}/videos/${filename}`,
    archivedReceipt: `${archiveDir}/receipts/${shot.id}.video.json`,
  }
}

export function buildRollbackOperations({ outputDir, replacements }) {
  return replacements.map((replacement) => ({
    shotId: replacement.shotId,
    fromVideo: replacement.archivedVideo,
    toVideo: join(outputDir, "videos", basename(replacement.archivedVideo)),
    fromReceipt: replacement.archivedReceipt,
    toReceipt: join(outputDir, "receipts", basename(replacement.archivedReceipt)),
  }))
}

export function mergeVideoBatchResults({ existingResults = [], updatedResults = [], shotOrder = [] }) {
  const byShotId = new Map()
  const add = (result, replaceCompleted) => {
    if (!result || typeof result.shotId !== "string") return
    const existing = byShotId.get(result.shotId)
    if (existing?.status === "completed_video" && result.status !== "completed_video" && !replaceCompleted) return
    byShotId.set(result.shotId, result)
  }

  for (const result of existingResults) add(result, true)
  for (const result of updatedResults) add(result, false)

  const order = new Map(shotOrder.map((shotId, index) => [shotId, index]))
  return [...byShotId.values()].sort((left, right) => {
    const leftIndex = order.get(left.shotId) ?? Number.MAX_SAFE_INTEGER
    const rightIndex = order.get(right.shotId) ?? Number.MAX_SAFE_INTEGER
    return leftIndex - rightIndex || left.shotId.localeCompare(right.shotId)
  })
}

export function parseViduSseResult(sseText) {
  for (const block of sseText.split(/\r?\n\r?\n/)) {
    const event = block.match(/^event:\s*(.+)$/m)?.[1]?.trim()
    const rawData = block.match(/^data:\s*(.+)$/m)?.[1]
    if (!event || !rawData) continue

    let data
    try {
      data = JSON.parse(rawData)
    } catch {
      continue
    }

    if (event === "error") throw new Error(data.message || "Vidu generation failed")
    if (event === "result" && typeof data.videoUrl === "string") {
      return {
        videoUrl: data.videoUrl,
        taskId: typeof data.taskId === "string" ? data.taskId : undefined,
        usage: data.usage,
      }
    }
  }

  throw new Error("Vidu response ended without a result event")
}
