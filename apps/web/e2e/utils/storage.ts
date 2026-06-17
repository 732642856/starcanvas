/**
 * E2E Storage helpers — clear browser state before each test.
 *
 * IMPORTANT: Call this via addInitScript BEFORE page.goto(), not via page.evaluate().
 * page.evaluate() on about:blank throws SecurityError for localStorage in modern Chromium.
 */
import type { Page } from "@playwright/test"

/**
 * Clear storage via addInitScript — safe to call in beforeEach before any navigation.
 * Runs before every page load in this context.
 */
export async function clearBrowserStorage(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.clear()
      sessionStorage.clear()
    } catch {
      // Storage not available on this origin — that's fine
    }
  })
}

/**
 * Clear storage via page.evaluate — requires page to be on a valid origin (already navigated).
 * Use this for mid-test cleanup.
 */
export async function clearBrowserStorageEvaluate(page: Page): Promise<void> {
  await page.evaluate(async () => {
    try {
      localStorage.clear()
      sessionStorage.clear()
    } catch {
      // Storage not available on this origin
    }

    // Clear IndexedDB databases
    if ("indexedDB" in window) {
      const databases = await (
        window.indexedDB as unknown as { databases?: () => Promise<Array<{ name: string }>> }
      ).databases?.()

      if (databases) {
        await Promise.all(
          databases
            .map((db) => db.name)
            .filter(Boolean)
            .map(
              (name) =>
                new Promise<void>((resolve) => {
                  const req = indexedDB.deleteDatabase(name)
                  req.onsuccess = () => resolve()
                  req.onerror = () => resolve()
                  req.onblocked = () => resolve()
                }),
            ),
        )
      }
    }
  })
}
