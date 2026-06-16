/**
 * Project Canvas Isolation — e2e test
 *
 * Guards the rc.2 P0-6 fix: canvas storage keys are scoped by projectId.
 *
 * Behavioral contract verified:
 *   1. Default canvas (no projectId) is isolated from project-scoped canvas
 *   2. Project-scoped canvas with special-char projectId works correctly
 *   3. Project A canvas state does not appear in Project B
 *   4. Project B starts with an isolated canvas state
 *   5. Returning to Project A restores its own canvas state
 *   6. Two projects maintain separate canvas states simultaneously
 *   7. Distinct projectIds with special characters don't collide
 *   8. No projectId falls back to default canvas (backward compat)
 *   9. Chinese / Unicode projectId is isolated correctly
 *
 * Design notes:
 *   - Uses direct IndexedDB injection (injectCanvasStates) instead of UI
 *     interaction to create canvas data. This is more reliable than clicking
 *     through the AddNodePanel, which defaults to the Agent tab while
 *     "写作文本" is in the Text tab.
 *   - Each test navigates to the canvas page first (to ensure the IDB database
 *     exists), then injects test data, then navigates to the target canvas URL
 *     to trigger the restore logic.
 *   - Tests run serially (Playwright config: fullyParallel: false, workers: 1)
 *     to avoid cross-test IDB pollution.
 *   - No beforeEach addInitScript — Playwright creates a fresh browser context
 *     per test, so IDB is always clean at the start of each test.
 *
 * Related: Closes #5
 */

import { expect, test } from "@playwright/test"

test.setTimeout(300_000)

// ── Storage key logic (mirrors getCanvasStorageKey from useCanvasPersistence.ts) ──

const DEFAULT_STORAGE_KEY = "startrails_canvas"

function getCanvasStorageKey(projectId?: string): string {
  const normalized = projectId?.trim()
  if (!normalized) return DEFAULT_STORAGE_KEY
  return `startrails_canvas_p:${encodeURIComponent(normalized)}`
}

// ── Helpers: navigate and wait for canvas to be ready ──────────────────

async function gotoCanvas(page: import("@playwright/test").Page, url: string) {
  // The canvas page may keep loading non-critical browser assets (e.g. AI/TTS
  // chunks) during dev-server cold start. Waiting for the full load event makes
  // the first navigation flaky, so wait for DOM readiness and then assert the
  // actual app shell below.
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 180_000 })
}

async function waitForCanvas(page: import("@playwright/test").Page, timeout = 90_000) {
  await expect(page.locator(".react-flow").first()).toBeVisible({ timeout })
  await page.waitForTimeout(2000) // let hydration + restore complete
}

// ── Helper: verify node count on canvas ────────────────────────────────

async function getNodeCount(page: import("@playwright/test").Page): Promise<number> {
  return page.locator(".react-flow__node, [data-id^='e2e_node_']").count()
}

// ── Helper: verify marker text is visible somewhere in the canvas ───────

async function hasMarkerText(page: import("@playwright/test").Page, markerText: string): Promise<boolean> {
  // Content nodes render their body in a textarea, and textarea values are not
  // included in textContent. Check both visible text and form-control values.
  return page.evaluate((markerText) => {
    if (document.body.textContent?.includes(markerText)) return true

    const controls = Array.from(document.querySelectorAll("input, textarea")) as Array<
      HTMLInputElement | HTMLTextAreaElement
    >
    return controls.some((control) => control.value.includes(markerText))
  }, markerText)
}

async function expectMarkerVisible(page: import("@playwright/test").Page, markerText: string) {
  // Restoring canvas state is async. Poll for marker visibility instead of
  // taking a single snapshot immediately after the React Flow shell appears.
  await expect
    .poll(() => hasMarkerText(page, markerText), { timeout: 30_000 })
    .toBe(true)
}

async function expectMarkerHidden(page: import("@playwright/test").Page, markerText: string) {
  await expect.poll(() => hasMarkerText(page, markerText), { timeout: 5_000 }).toBe(false)
}

// ── Helper: inject canvas state(s) directly into IndexedDB ──────────────
//
// This bypasses the UI interaction (AddNodePanel) entirely and writes
// canvas data directly to the supermemory IndexedDB. This is more reliable
// than trying to click through the UI, especially since the AddNodePanel
// opens on the Agent tab by default, and "写作文本" is in the Text tab.
//
// Call this AFTER navigating to a canvas page (so the IDB database exists),
// then navigate to the target canvas URL to trigger the restore logic.
// ────────────────────────────────────────────────────────────────────────

async function injectCanvasStates(
  page: import("@playwright/test").Page,
  states: Array<{ storageKey: string; markerText: string }>,
) {
  await page.evaluate((states) => {
    const now = Date.now()

    for (const key of Object.keys(window.localStorage)) {
      if (key === "startrails_canvas" || key.startsWith("startrails_canvas_p:")) {
        window.localStorage.removeItem(key)
      }
    }

    for (let i = 0; i < states.length; i++) {
      const { storageKey, markerText } = states[i]
      const payload = {
        version: 2,
        savedAt: now,
        nodes: [
          {
            id: `e2e_node_${now + i}`,
            type: "content",
            position: { x: 200, y: 200 + i * 300 },
            width: 320,
            height: 240,
            measured: { width: 320, height: 240 },
            data: {
              title: markerText,
              nodeKind: "text",
              content: markerText,
            },
          },
        ],
        edges: [],
        viewport: null,
      }

      window.localStorage.setItem(storageKey, JSON.stringify(payload))
    }
  }, states)
}

// ════════════════════════════════════════════════════════════════════════
// Test Suite
// ════════════════════════════════════════════════════════════════════════

test.describe("Project canvas isolation", () => {
  // ─── 1. Default canvas (no projectId) is isolated from project canvas ─
  test("Default canvas is isolated from project-scoped canvas", async ({ page }) => {
    const defaultMarker = `default_${Date.now()}`
    const defaultKey = getCanvasStorageKey() // "startrails_canvas"

    // Step 1: Navigate to canvas to ensure IDB exists
    await gotoCanvas(page, "/canvas")
    await waitForCanvas(page)

    // Step 2: Inject data into default canvas storage
    await injectCanvasStates(page, [{ storageKey: defaultKey, markerText: defaultMarker }])

    // Step 3: Navigate to project-scoped canvas (triggers fresh mount + restore)
    await gotoCanvas(page, "/canvas?projectId=project-x")
    await waitForCanvas(page)

    // Verify: project canvas should start empty (no nodes from default canvas)
    const nodeCount = await getNodeCount(page)
    expect(nodeCount).toBe(0)

    // Verify: default marker text should NOT appear
    await expectMarkerHidden(page, defaultMarker)

    // Step 4: Navigate back to default canvas to confirm data exists
    await gotoCanvas(page, "/canvas")
    await waitForCanvas(page)

    await expectMarkerVisible(page, defaultMarker)
  })

  // ─── 2. Special-char projectId works and is isolated from default ─────
  test("Special-char projectId is isolated from default canvas", async ({ page }) => {
    const projectMarker = `specialProj_${Date.now()}`
    const projectId = "test project/abc"
    const projectKey = getCanvasStorageKey(projectId)

    // Step 1: Navigate to project canvas to ensure IDB exists
    await gotoCanvas(page, `/canvas?projectId=${encodeURIComponent(projectId)}`)
    await waitForCanvas(page)

    // Step 2: Inject data into project-scoped storage
    await injectCanvasStates(page, [{ storageKey: projectKey, markerText: projectMarker }])

    // Step 3: Navigate to default canvas (no projectId)
    await gotoCanvas(page, "/canvas")
    await waitForCanvas(page)

    // Verify: default canvas should be empty
    const nodeCount = await getNodeCount(page)
    expect(nodeCount).toBe(0)

    // Verify: project marker should NOT appear in default canvas
    await expectMarkerHidden(page, projectMarker)

    // Step 4: Navigate back to project canvas to confirm data exists
    await gotoCanvas(page, `/canvas?projectId=${encodeURIComponent(projectId)}`)
    await waitForCanvas(page)

    await expectMarkerVisible(page, projectMarker)
  })

  // ─── 3. Project A canvas state does not appear in Project B ──────────
  test("Project A canvas is invisible to Project B", async ({ page }) => {
    const markerA = `projA_${Date.now()}`
    const keyA = getCanvasStorageKey("project-alpha")
    const keyB = getCanvasStorageKey("project-beta")

    // Step 1: Navigate to project A canvas to ensure IDB exists
    await gotoCanvas(page, "/canvas?projectId=project-alpha")
    await waitForCanvas(page)

    // Step 2: Inject data for project A only
    await injectCanvasStates(page, [{ storageKey: keyA, markerText: markerA }])

    // Step 3: Navigate to project B canvas (fresh mount + restore)
    await gotoCanvas(page, "/canvas?projectId=project-beta")
    await waitForCanvas(page)

    // Verify: project B canvas should be empty
    const nodeCountB = await getNodeCount(page)
    expect(nodeCountB).toBe(0)

    // Verify: project A marker should NOT appear in project B
    await expectMarkerHidden(page, markerA)
  })

  // ─── 4. Project B starts with an isolated canvas state ────────────────
  test("Project B starts with isolated empty canvas", async ({ page }) => {
    const markerA = `isolationA_${Date.now()}`
    const keyA = getCanvasStorageKey("isolation-test-a")
    const keyB = getCanvasStorageKey("isolation-test-b")

    // Step 1: Navigate to a canvas page to ensure IDB exists
    await gotoCanvas(page, "/canvas?projectId=isolation-test-a")
    await waitForCanvas(page)

    // Step 2: Inject data for project A
    await injectCanvasStates(page, [{ storageKey: keyA, markerText: markerA }])

    // Step 3: Navigate to project B canvas
    await gotoCanvas(page, "/canvas?projectId=isolation-test-b")
    await waitForCanvas(page)

    // Verify: project B canvas should have 0 nodes
    const nodeCountB = await getNodeCount(page)
    expect(nodeCountB).toBe(0)
  })

  // ─── 5. Returning to Project A restores its own canvas state ─────────
  test("Returning to Project A restores its own canvas state", async ({ page }) => {
    const markerA = `returnA_${Date.now()}`
    const keyA = getCanvasStorageKey("return-test-a")

    // Step 1: Navigate to project A to ensure IDB exists
    await gotoCanvas(page, "/canvas?projectId=return-test-a")
    await waitForCanvas(page)

    // Step 2: Inject data for project A
    await injectCanvasStates(page, [{ storageKey: keyA, markerText: markerA }])

    // Step 3: Navigate to project B (should be empty)
    await gotoCanvas(page, "/canvas?projectId=return-test-b")
    await waitForCanvas(page)

    // Verify: project B should have 0 nodes and NOT show project A's marker
    const nodeCountB = await getNodeCount(page)
    expect(nodeCountB).toBe(0)
    await expectMarkerHidden(page, markerA)

    // Step 4: Return to project A
    await gotoCanvas(page, "/canvas?projectId=return-test-a")
    await waitForCanvas(page)

    // Verify: project A should restore its content
    await expectMarkerVisible(page, markerA)
  })

  // ─── 6. Two projects maintain separate canvas states simultaneously ──
  test("Two projects maintain separate canvas states after round-trip", async ({ page }) => {
    const markerA = `roundtripA_${Date.now()}`
    const markerB = `roundtripB_${Date.now()}`
    const keyA = getCanvasStorageKey("roundtrip-a")
    const keyB = getCanvasStorageKey("roundtrip-b")

    // Step 1: Navigate to canvas to ensure IDB exists
    await gotoCanvas(page, "/canvas?projectId=roundtrip-a")
    await waitForCanvas(page)

    // Step 2: Inject data for BOTH projects
    await injectCanvasStates(page, [
      { storageKey: keyA, markerText: markerA },
      { storageKey: keyB, markerText: markerB },
    ])

    // Step 3: Navigate to project A (fresh mount + restore)
    await gotoCanvas(page, "/canvas?projectId=roundtrip-a")
    await waitForCanvas(page)

    // Verify: project A has its own marker, NOT project B's
    await expectMarkerVisible(page, markerA)
    await expectMarkerHidden(page, markerB)

    // Step 4: Navigate to project B (fresh mount + restore)
    await gotoCanvas(page, "/canvas?projectId=roundtrip-b")
    await waitForCanvas(page)

    // Verify: project B has its own marker, NOT project A's
    await expectMarkerHidden(page, markerA)
    await expectMarkerVisible(page, markerB)
  })

  // ─── 7. Distinct projectIds with special characters don't collide ────
  test("Distinct special-char projectIds don't collide", async ({ page }) => {
    // Two projectIds that could collide if encoding is broken:
    // "proj/a" → storageKey "startrails_canvas_p:proj%2Fa"
    // "proj-b" → storageKey "startrails_canvas_p:proj-b"
    // These are DIFFERENT storage keys and should be isolated.
    const id1 = "proj/a"
    const id2 = "proj-b"
    const marker1 = `special1_${Date.now()}`
    const marker2 = `special2_${Date.now()}`
    const key1 = getCanvasStorageKey(id1)
    const key2 = getCanvasStorageKey(id2)

    // Step 1: Navigate to canvas to ensure IDB exists
    await gotoCanvas(page, `/canvas?projectId=${encodeURIComponent(id1)}`)
    await waitForCanvas(page)

    // Step 2: Inject data for both projects
    await injectCanvasStates(page, [
      { storageKey: key1, markerText: marker1 },
      { storageKey: key2, markerText: marker2 },
    ])

    // Step 3: Navigate to project proj/a
    await gotoCanvas(page, `/canvas?projectId=${encodeURIComponent(id1)}`)
    await waitForCanvas(page)

    // Verify: proj/a has its own marker, NOT proj-b's
    await expectMarkerVisible(page, marker1)
    await expectMarkerHidden(page, marker2)

    // Step 4: Navigate to project proj-b
    await gotoCanvas(page, `/canvas?projectId=${id2}`)
    await waitForCanvas(page)

    // Verify: proj-b has its own marker, NOT proj/a's
    await expectMarkerHidden(page, marker1)
    await expectMarkerVisible(page, marker2)
  })

  // ─── 8. No projectId uses default storage key (backward compat) ───────
  test("No projectId falls back to default canvas (backward compat)", async ({ page }) => {
    const markerText = `default_compat_${Date.now()}`
    const defaultKey = getCanvasStorageKey() // "startrails_canvas"

    // Step 1: Navigate to canvas WITHOUT projectId to ensure IDB exists
    await gotoCanvas(page, "/canvas")
    await waitForCanvas(page)

    // Step 2: Inject data into default canvas storage
    await injectCanvasStates(page, [{ storageKey: defaultKey, markerText }])

    // Step 3: Navigate to the default canvas again (fresh mount + restore)
    await gotoCanvas(page, "/canvas")
    await waitForCanvas(page)

    // Verify: default canvas should restore the injected content
    await expectMarkerVisible(page, markerText)

    // Step 4: Reload the page to test persistence across reloads
    await page.reload()
    await waitForCanvas(page)

    // Verify: content should persist after reload
    await expectMarkerVisible(page, markerText)
  })

  // ─── 9. Chinese / Unicode projectId is isolated correctly ───────────
  test("Chinese and Unicode projectId is correctly isolated", async ({ page }) => {
    // Real-world case: "demo/project:中文 test" with mixed chars
    const idChinese = "demo/project:中文 test"
    const idAscii = "demo-project-en"
    const markerChinese = `chn_${Date.now()}`
    const markerAscii = `eng_${Date.now()}`
    const keyChinese = getCanvasStorageKey(idChinese)
    const keyAscii = getCanvasStorageKey(idAscii)

    // Sanity: storage keys should be different
    expect(keyChinese).not.toBe(keyAscii)

    // Step 1: Navigate to canvas to ensure IDB exists
    await gotoCanvas(page, `/canvas?projectId=${encodeURIComponent(idChinese)}`)
    await waitForCanvas(page)

    // Step 2: Inject data for both projects
    await injectCanvasStates(page, [
      { storageKey: keyChinese, markerText: markerChinese },
      { storageKey: keyAscii, markerText: markerAscii },
    ])

    // Step 3: Navigate to Chinese projectId canvas
    await gotoCanvas(page, `/canvas?projectId=${encodeURIComponent(idChinese)}`)
    await waitForCanvas(page)

    // Verify: Chinese project shows its own marker, NOT the ascii one
    await expectMarkerVisible(page, markerChinese)
    await expectMarkerHidden(page, markerAscii)

    // Step 4: Navigate to ascii projectId canvas
    await gotoCanvas(page, `/canvas?projectId=${idAscii}`)
    await waitForCanvas(page)

    // Verify: ascii project shows its own marker, NOT the Chinese one
    await expectMarkerHidden(page, markerChinese)
    await expectMarkerVisible(page, markerAscii)

    // Step 5: Return to Chinese project — verify state persists across navigation
    await gotoCanvas(page, `/canvas?projectId=${encodeURIComponent(idChinese)}`)
    await waitForCanvas(page)

    await expectMarkerVisible(page, markerChinese)
    await expectMarkerHidden(page, markerAscii)
  })
})
