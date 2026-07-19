const RETRYABLE_IMAGE_UPSTREAM_STATUSES = new Set([429, 500, 502, 503, 504])

export function shouldRetryImageUpstreamStatus(status: number): boolean {
  return RETRYABLE_IMAGE_UPSTREAM_STATUSES.has(status)
}
