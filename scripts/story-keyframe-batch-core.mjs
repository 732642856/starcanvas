const characterLock = [
  "Character continuity constraints: Zhaoheng is a 22-year-old East Asian crown prince with black hair in a formal gold crown, a white silk Northern Song robe with blue-gray and gold embroidery, jade belt ornaments, and a restrained, dignified expression.",
  "Jingchai is a 17-year-old East Asian palace maid with black hair in a simple bun with a small white floral hairpin, a pale blue and white Northern Song maid robe, a warm face and a subtly calculating gaze.",
  "Keep the soot-black iron wok, its visible knife mark, costume palette, historical Northern Song setting, and each named character visually consistent. No text, no modern objects, no duplicate limbs.",
].join(" ")

function sourceImagesForShot(shot, references) {
  if (shot.reference === "zhaoheng") return [references.zhaoheng]
  if (shot.reference === "jingchai") return [references.jingchai]
  return [references.zhaoheng, references.jingchai]
}

function textOnlyPrompt(prompt) {
  const scenePrompt = prompt.replace(
    /^Use (?:both )?(?:(?:Zhaoheng and Jingchai)|Zhaoheng|Jingchai)? ?character references?\.\s*/i,
    "",
  )
  return `${characterLock}\n\n${scenePrompt}`
}

export function selectKeyframeBatchShots(shots, requestedIds) {
  if (requestedIds.length > 0) {
    return shots.filter((shot) => requestedIds.includes(shot.id))
  }
  return shots.filter((shot) => shot.status === "keyframe_pending_video_pending")
}

export function shouldDetachPaidImageBatch({ isLive, detachRequested, isDetachedChild }) {
  return isLive && detachRequested && !isDetachedChild
}

export function buildKeyframeBatchRequest({ shot, requestId, mode, references, size = "1024x1792" }) {
  const request = {
    prompt: mode === "text-only" ? textOnlyPrompt(shot.imagePrompt) : shot.imagePrompt,
    model: "gpt-image-2",
    size,
    requestId,
    retryAttempts: 1,
  }

  if (mode !== "text-only") request.sourceImage = sourceImagesForShot(shot, references)
  return request
}
