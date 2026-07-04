import { expect, test } from "@playwright/test";

import { createTestProjectId } from "./utils/project";
import { clearBrowserStorage } from "./utils/storage";

test.describe("Project Bible character view entry", () => {
  test.beforeEach(async ({ page }) => {
    await clearBrowserStorage(page);
  });

  test("opens the real character view modal from Project Bible", async ({ page }) => {
    const projectId = createTestProjectId("project-bible-character-view");
    const storageKey = `startrails_canvas_p:${encodeURIComponent(projectId)}`;

    await page.addInitScript(({ storageKey }) => {
      const now = new Date().toISOString();
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          version: 2,
          savedAt: Date.now(),
          nodes: [
            {
              id: "shot-node-1",
              type: "content",
              position: { x: 240, y: 180 },
              data: {
                title: "镜头 01",
                nodeKind: "storyboard",
                content: "雨夜旧影院门厅",
                createdAt: now,
                shot: {
                  id: "shot-01",
                  order: 1,
                  title: "镜头 01",
                  characterIdentities: [
                    {
                      id: "character-linwu",
                      name: "林雾",
                      role: "女主",
                      visualSignature: "短发，黑色风衣，冷白肤色",
                      costume: "黑色长风衣",
                      props: ["胶片盒"],
                    },
                  ],
                },
              },
            },
          ],
          edges: [],
          viewport: { x: 0, y: 0, zoom: 1 },
        }),
      );
    }, { storageKey });

    await page.goto(`/canvas?projectId=${encodeURIComponent(projectId)}`, {
      waitUntil: "domcontentloaded",
      timeout: 180_000,
    });
    await expect(page.locator(".react-flow").first()).toBeVisible({ timeout: 90_000 });
    await page.waitForFunction(
      () => Boolean((window as typeof window & { __starcanvasE2E?: unknown }).__starcanvasE2E),
      undefined,
      { timeout: 90_000 },
    );

    await page.getByTestId("add-node-button").click();
    await expect(page.getByTestId("add-node-panel")).toBeVisible();
    await page.locator('button[title="工具"]').click();
    await page.getByTestId("add-node-item-项目 Bible").click();

    const biblePanel = page.getByTestId("project-bible-panel");
    await expect(biblePanel).toBeVisible();
    await expect(biblePanel.getByRole("heading", { name: "林雾" })).toBeVisible();

    await biblePanel.getByTestId("project-bible-open-character-view").click();
    await expect(page.getByText("角色三视图生成")).toBeVisible();
    await expect(page.getByText("— 林雾")).toBeVisible();
    await expect(page.getByTestId("character-view-generate-button")).toBeVisible();
  });
});
