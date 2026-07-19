export type ResourceScheme = "asset" | "bible" | "run" | "node" | "review" | "quality"
export type ResourceRef = `${ResourceScheme}://${string}`

const RESOURCE_REF_PATTERN = /^(asset|bible|run|node|review|quality):\/\/.+$/

export function isResourceRef(value: unknown): value is ResourceRef {
  return typeof value === "string" && RESOURCE_REF_PATTERN.test(value)
}
