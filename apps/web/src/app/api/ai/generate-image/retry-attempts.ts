export function resolveImageRetryAttempts(requested: unknown, configured: number): number {
  if (typeof requested !== "number" || !Number.isInteger(requested) || requested < 1 || requested > configured) {
    return configured
  }
  return requested
}
