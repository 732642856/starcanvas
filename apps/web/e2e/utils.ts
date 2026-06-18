/**
 * Shared e2e test utilities for StarCanvas.
 */

import { expect, type Page } from "@playwright/test"

/** Key prefixes used by the app in localStorage. */
const APP_KEY_PREFIXES = ["startrails_", "canvas_", "project_"]

/** Clear app-specific storage via addInitScript (runs before page load). */
export function clearAppStorageInitScript(prefixes: string[] = APP_KEY_PREFIXES): {
  content: string
} {
  return {
    content: `
      for (const key of Object.keys(localStorage)) {
        if ([${prefixes.map((p) => `"${p}"`).join(",")}].some((p) => key.startsWith(p))) {
          localStorage.removeItem(key)
        }
      }
      sessionStorage.clear()
    `,
  }
}

/** Dismiss the onboarding panel if it is visible. Safe to call in beforeEach. */
export async function dismissOnboardingIfPresent(page: Page): Promise<void> {
  const onboarding = page.locator("[data-testid='onboarding-panel']")
  try {
    await onboarding.waitFor({ state: "visible", timeout: 10_000 })
    await page.getByRole("button", { name: "跳过引导" }).click()
    await expect(onboarding).toBeHidden({ timeout: 10_000 })
  } catch {
    // Already dismissed or never appeared — fine
  }
}

/**
 * Navigate to the canvas page and wait for React Flow to be fully ready.
 * Uses `domcontentloaded` to avoid hanging on non-critical resources.
 */
export async function gotoCanvas(page: Page, projectId: string): Promise<void> {
  await page.goto(`/canvas?projectId=${encodeURIComponent(projectId)}`, {
    waitUntil: "domcontentloaded",
    timeout: 180_000,
  })
  await expect(page.locator(".react-flow").first()).toBeVisible({
    timeout: 90_000,
  })
  // Wait for React Flow onInit to complete + first node to appear
  await expect(page.locator(".react-flow__node").first()).toBeVisible({
    timeout: 30_000,
  }).catch(() => {
    // Canvas may be empty — that's fine
  })
}

/**
 * Wait for the canvas to be ready — React Flow rendered and hydrated.
 * Prefer this over `waitForTimeout` for canvas readiness.
 */
export async function waitForCanvasReady(
  page: Page,
  timeout = 90_000
): Promise<void> {
  await expect(page.locator(".react-flow").first()).toBeVisible({ timeout })
  // Wait for at least one node or the empty-state indicator to appear
  await expect(
    page.locator(".react-flow__node, .react-flow__background").first()
  ).toBeVisible({ timeout: 30_000 })
}

/**
 * Wait for canvas save to complete by polling for the save status indicator.
 * Falls back to a timeout if the status element is not available.
 */
export async function waitForCanvasSave(
  page: Page,
  timeout = 15_000
): Promise<void> {
  // Try to find the save status indicator
  const saveStatus = page.locator("[data-testid='canvas-save-status']")
  try {
    await expect(saveStatus).toHaveText(/已保存|saved/i, { timeout })
  } catch {
    // If the status element doesn't exist, wait for the save throttle window
    await page.waitForTimeout(6_000)
  }
}

/**
 * Collect page console errors and uncaught exceptions for final assertions.
 */
export function collectConsoleErrors(page: Page): {
  consoleErrors: Array<{ text: string; url: string }>
  pageErrors: Error[]
} {
  const consoleErrors: Array<{ text: string; url: string }> = []
  const pageErrors: Error[] = []

  const harmlessPatterns = [
    "favicon",
    "Failed to load resource",
    "ResizeObserver loop completed with undelivered notifications",
    "WebSocket",
    "ECONNREFUSED",
    "hot-update",
    "_next/static",
    "Next.js HMR",
  ]

  page.on("console", (message) => {
    if (message.type() !== "error") return
    const text = message.text()
    if (harmlessPatterns.some((h) => text.includes(h))) return
    consoleErrors.push({ text, url: page.url() })
  })

  page.on("pageerror", (err) => {
    pageErrors.push(err)
  })

  page.on("response", (response) => {
    if (response.status() >= 500) {
      consoleErrors.push({
        text: `HTTP ${response.status()}: ${response.url()}`,
        url: page.url(),
      })
    }
  })

  return { consoleErrors, pageErrors }
}
