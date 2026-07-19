import { expect, test } from "@playwright/test"
import { clearAppStorageInitScript, dismissOnboardingIfPresent, gotoCanvas } from "./utils"

test("expands a one-line production bible into director storyboard shots", async ({ page }) => {
  await page.route("**/api/ai/chat*", async (route) => {
    if (route.request().url().endsWith("/chat/stream")) {
      await route.fulfill({
        contentType: "text/event-stream",
        body: `data: ${JSON.stringify({ content: JSON.stringify({
          intent: "extract-production-assets",
          params: { script: "太子替我背黑锅。" },
          description: "拆成制作圣经",
          confidence: 0.95,
        }) })}\n\ndata: [DONE]\n\n`,
      })
      return
    }
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        content: [
          "1. 御膳房后院，荆钗发现铁锅被烧黑，近景，手持。",
          "2. 宫门前，赵珩替她接下罪名，大全景，推镜。",
        ].join("\n"),
      }),
    })
  })
  await page.addInitScript(clearAppStorageInitScript)
  await gotoCanvas(page, "auto-agent-director-storyboard")
  await dismissOnboardingIfPresent(page)

  const chatInput = page.getByTestId("chat-input")
  if (!await chatInput.isVisible().catch(() => false)) {
    await page.getByTestId("chat-toggle").click()
  }
  await page.getByRole("button", { name: "自动完成" }).click()
  await chatInput.fill("把太子替我背黑锅拆成制作圣经")
  await page.getByTitle("发送").click()

  await expect.poll(() => page.evaluate(() => {
    const bridge = (window as Window & {
      __starcanvasE2E?: { getNodes: () => Array<{ type?: string; data: { shot?: { description?: string } } }> }
    }).__starcanvasE2E
    const nodes = bridge?.getNodes() ?? []
    return nodes.filter((node) => node.type === "shot").map((node) => node.data.shot?.description)
  }), { timeout: 30_000 }).toEqual(expect.arrayContaining([
    expect.stringMatching(/荆钗发现铁锅/),
    expect.stringMatching(/赵珩替她接下罪名/),
  ]))
})
