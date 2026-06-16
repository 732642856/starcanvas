/**
 * E2E Project helpers — generate unique project IDs for test isolation.
 */

export function createTestProjectId(prefix = "e2e"): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function createUnicodeProjectId(prefix = "项目"): string {
  return `${prefix}-${Date.now()}-中文-🚀`
}
