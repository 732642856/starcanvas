/**
 * E2E Storage helpers — clear browser state before each test.
 */
import type { Page } from "@playwright/test"

export async function clearBrowserStorage(page: Page): Promise<void> {
  await page.evaluate(async () => {
    // Clear localStorage
    localStorage.clear()
    sessionStorage.clear()

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
