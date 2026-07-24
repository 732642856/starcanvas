export function shouldExposeStarCanvasE2EBridge(input: {
  nodeEnv?: string
  hasWindow: boolean
  webdriver?: boolean
}): boolean {
  if (!input.hasWindow) return false
  if (input.nodeEnv !== "production") return true
  return input.webdriver === true
}
