# E2E Stability Conventions

StarCanvas e2e tests run via Playwright against the local Next.js dev server.
These conventions ensure tests are deterministic, isolated, and maintainable.

## Project Isolation

- Every test MUST use a unique `projectId` generated via `createTestProjectId()`
- `projectId` format: `e2e-{testname}-{timestamp}-{random}`
- Never reuse the default canvas (`/canvas` without projectId) across tests
- Unicode projectIds (Chinese, emoji) have dedicated helper: `createUnicodeProjectId()`

```ts
import { createTestProjectId } from "../utils/project"

const projectId = createTestProjectId("my-test")
await page.goto(`/canvas?projectId=${encodeURIComponent(projectId)}`)
```

## Storage Cleanup

- Use `clearBrowserStorage(page)` before every test to wipe IndexedDB and localStorage
- Each Playwright test gets a fresh browser context on a single worker — no cross-test
  IDB pollution, but explicit cleanup prevents flakiness from previous failed runs
- Supermemory (`supermemory`) and StarCanvasDB databases are cleaned automatically
- localStorage keys matching `startrails_canvas*` are removed

```ts
import { clearBrowserStorage } from "../utils/storage"

test.beforeEach(async ({ page }) => {
  await clearBrowserStorage(page)
})
```

## Selectors

Priority order for targeting elements:

1. **`data-testid`** — always preferred. Unique, stable, internationalization-proof
2. **`role` / `name`** — works well for buttons, links, form controls
3. **`.react-flow__node`** — acceptable for React Flow nodes, but prefer testid on custom nodes
4. **Avoid** CSS class chains, dynamic text content, computed styles

```ts
// ✅ Good
await page.locator("[data-testid='toolbar-ai-script']").click()
await expect(page.locator("[data-testid='ai-script-panel']")).toBeVisible()

// ❌ Bad
await page.locator(".left-toolbar button:nth-child(7)").click()
await expect(page.locator("text=AI 剧本生成")).toBeVisible()
```

### Required Test IDs

Every **toolbar button** and **panel root** MUST have a `data-testid`:

| Component | testid |
|-----------|--------|
| AI Script toolbar button | `toolbar-ai-script` |
| Shot Library toolbar button | `toolbar-shot-library` |
| Reverse Storyboard toolbar button | `toolbar-reverse-storyboard` |
| Color Grade toolbar button | `toolbar-color-grade` |
| Cinematic Params toolbar button | `toolbar-cinematic-params` |
| AI Script panel | `ai-script-panel` |
| Shot Library panel | `shot-library-panel` |
| Reverse Storyboard panel | `reverse-storyboard-panel` |
| Color Grade panel | `color-grade-panel` |
| Cinematic Params panel | `cinematic-param-panel` |
| Generate AI Script button | `ai-script-generate-button` |
| Import AI Script button | `ai-script-import-button` |
| Apply Shot Library button | `shot-library-apply-button` |

## Waiting

- **NEVER** use bare `waitForTimeout()` for synchronization
- Use `expect(locator).toBeVisible({ timeout })` for UI appearance
- Use `expect.poll(() => condition, { timeout })` for async state (e.g. IndexedDB persistence)
- Use `page.waitForLoadState()` only as a navigation helper, not as a business signal

```ts
// ✅ Good
await expect(page.locator("[data-testid='ai-script-panel']")).toBeVisible({ timeout: 15000 })

// ✅ Good
await expect.poll(() => page.locator(".react-flow__node").count(), { timeout: 10000 }).toBeGreaterThan(0)

// ❌ Bad
await page.waitForTimeout(5000)
await expect(page.locator(".react-flow__node").first()).toBeVisible()
```

If a wait is unavoidable (e.g., debounced interaction in canvas), document it:

```ts
// Intentional: rgb-curve debounce requires 100ms settle time.
// Replace with expect.poll when component exposes a stable end state.
await page.waitForTimeout(100)
```

But aim to eliminate all bare `waitForTimeout` calls from the test suite.

## Canvas / React Flow

React Flow nodes rely on DOM measurement. When asserting canvas state:

```ts
// ✅ Assert node visibility
await expect(page.locator(".react-flow__node")).toHaveCount(3)

// ✅ Assert node content
await expect(page.locator(".react-flow__node").filter({ hasText: "分镜 1" })).toBeVisible()

// ✅ Assert canvas is ready
await expect(page.locator(".react-flow").first()).toBeVisible()

// ❌ Avoid coordinate assertions unless unavoidable
await expect(page.locator(".react-flow__node").first()).toHaveCSS("transform", "...")
```

## Toolbar / Panels

- Toolbar buttons open panels. Verify the panel is visible after click.
- Panel close buttons close panels. Verify the panel is hidden after click.
- Panel import/generate actions produce canvas nodes. Assert node count after action.

```ts
// Open AI Script panel
await page.locator("[data-testid='toolbar-ai-script']").click()
await expect(page.locator("[data-testid='ai-script-panel']")).toBeVisible()

// Generate script
await page.locator("[data-testid='ai-script-brief']").fill("a story about courage")
await page.locator("[data-testid='ai-script-generate-button']").click()
await expect(page.locator("[data-testid='ai-script-draft-preview']")).toBeVisible()

// Import to canvas
await page.locator("[data-testid='ai-script-import-button']").click()
await expect.poll(() => page.locator(".react-flow__node").count()).toBeGreaterThan(0)

// Close panel
await page.locator("[data-testid='ai-script-panel'] button[aria-label='Close']").click()
await expect(page.locator("[data-testid='ai-script-panel']")).not.toBeVisible()
```

## Navigation

- Use `page.goto()` with `waitUntil: "domcontentloaded"` then wait for `.react-flow`
  to appear. On dev server cold start, `load` event may be delayed by non-critical assets.
- Navigate between projectIds with `page.goto()` rather than router.push.

```ts
await page.goto(`/canvas?projectId=${encodeURIComponent(projectId)}`, { waitUntil: "domcontentloaded" })
await expect(page.locator(".react-flow").first()).toBeVisible({ timeout: 90000 })
```

## File Organization

```
apps/web/e2e/
  core-workflow-smoke.spec.ts
  project-canvas-isolation.spec.ts
  storyboard-direct-only.spec.ts
  create-flow.spec.ts          # cross-feature smoke flow
  utils/
    project.ts                  # createTestProjectId, createUnicodeProjectId
    storage.ts                  # clearBrowserStorage
    selectors.ts                # testId constants
```
