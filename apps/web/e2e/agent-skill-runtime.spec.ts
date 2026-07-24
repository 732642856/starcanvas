import { expect, test } from "@playwright/test"

import { createTestProjectId } from "./utils/project"
import { dismissOnboardingIfPresent, gotoCanvas, waitForCanvasReady } from "./utils"

test.describe("AgentNode SkillRuntime", () => {
  test("runs the explicit Film Crew Skill through mocked chat SSE", async ({ page }) => {
    let chatRequests = 0
    await page.route("**/api/ai/chat/stream", async (route) => {
      chatRequests += 1
      await route.fulfill({
        contentType: "text/event-stream",
        body: 'data: {"content":"mock crew output"}\n\n',
      })
    })

    await gotoCanvas(page, createTestProjectId("agent-skill-runtime"))
    await dismissOnboardingIfPresent(page)
    await waitForCanvasReady(page)

    await page.locator(".react-flow__pane").first().dispatchEvent("dblclick", {
      bubbles: true,
      cancelable: true,
      detail: 2,
      clientX: 320,
      clientY: 240,
      button: 0,
    })
    const search = page.getByTestId("quick-add-node-search-input")
    await expect(search).toBeVisible()
    await search.fill("导演")
    await search.press("Enter")

    const runButton = page.locator('[data-testid^="agent-node-run-"]')
    await expect(runButton).toBeVisible()
    await page.getByPlaceholder("粘贴剧本或故事想法...").fill("雨夜宫门前的重逢")
    await runButton.click()

    await expect.poll(() => chatRequests).toBe(7)
    await expect(runButton).toContainText("运行 Crew")
  })
})
