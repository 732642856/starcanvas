export const ANCHOR_AUTHORIZATION = "RUN_LOW_COST_ANCHOR_GATE_1"

export function isLowCostAnchorAuthorized(env) {
  return env.STARCANVAS_ALLOW_PAID_IMAGE_ANCHOR === "1"
    && env.STARCANVAS_IMAGE_ANCHOR_AUTHORIZATION === ANCHOR_AUTHORIZATION
}

export function buildLowCostAnchorRequest({ requestId, sourceImage }) {
  return {
    prompt: "Use the supplied Zhao Heng character reference. Single young Northern Song crown prince, white-silver robe with blue-gray and gold trim, jade crown, holding a soot-black old iron wok with one fresh knife mark. Waist-up cinematic historical portrait, neutral palace courtyard background, realistic costume, no text, no watermark, no character sheet, no split screen.",
    model: "gpt-image-2",
    size: "1024x1024",
    requestId,
    sourceImage: [sourceImage],
    retryAttempts: 1,
  }
}
