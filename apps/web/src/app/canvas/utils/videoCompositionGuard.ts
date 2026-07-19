export const BROWSER_COMPOSITION_MAX_INPUT_BYTES = 64 * 1024 * 1024

export function assertBrowserCompositionInputSize(totalInputBytes: number) {
  if (totalInputBytes <= BROWSER_COMPOSITION_MAX_INPUT_BYTES) return
  const sizeMb = Math.ceil(totalInputBytes / 1024 / 1024)
  throw new Error(`浏览器合成仅支持总计 ${Math.floor(BROWSER_COMPOSITION_MAX_INPUT_BYTES / 1024 / 1024)} MB 以内素材（当前 ${sizeMb} MB）；请导出剪映交接包继续合成。`)
}
