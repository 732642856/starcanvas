import { expect, test } from "@playwright/test";

import { createTestProjectId } from "./utils/project";
import { clearBrowserStorage } from "./utils/storage";

test.describe("Character view modal", () => {
  test.beforeEach(async ({ page }) => {
    await clearBrowserStorage(page);
  });

  test("submits a single all-view request for default three-view generation", async ({ page }) => {
    const projectId = createTestProjectId("character-view-all");
    const storageKey = `startrails_canvas_p:${encodeURIComponent(projectId)}`;
    const requestedViewTypes: string[] = [];

    await page.route("**/api/ai/generate-character-view", async (route) => {
      const payload = route.request().postDataJSON() as { viewType?: string } | null;
      requestedViewTypes.push(payload?.viewType ?? "unknown");

      await route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body:
          "event: result\n" +
          `data: ${JSON.stringify({
            frontViewUrl: "data:image/png;base64,ZmFrZS1mcm9udA==",
            sideViewUrl: "data:image/png;base64,ZmFrZS1zaWRl",
            backViewUrl: "data:image/png;base64,ZmFrZS1iYWNr",
          })}\n\n`,
      });
    });

    await page.addInitScript(({ storageKey }) => {
      const now = new Date().toISOString();
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          version: 2,
          savedAt: Date.now(),
          nodes: [
            {
              id: "character-view-all-seed-node",
              type: "content",
              position: { x: 180, y: 120 },
              data: {
                title: "角色三视图批量测试节点",
                nodeKind: "script",
                content: "用于激活非空画布工具栏的最小测试节点。",
                createdAt: now,
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

    await page.locator('button[title="角色三视图生成"]').click();
    await expect(page.getByText("角色三视图生成")).toBeVisible();

    await page.getByRole("button", { name: "生成三视图" }).click();

    await expect.poll(() => requestedViewTypes.length).toBe(1);
    expect(requestedViewTypes).toEqual(["all"]);
    await expect(page.locator('img[alt$=" view"]')).toHaveCount(3);
  });

  test("shows a visible error when character view generation fails", async ({ page }) => {
    const projectId = createTestProjectId("character-view-error");
    const storageKey = `startrails_canvas_p:${encodeURIComponent(projectId)}`;

    await page.route("**/api/ai/generate-character-view", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body:
          "event: error\n" +
          `data: ${JSON.stringify({ message: "角色三视图上游生成失败" })}\n\n`,
      });
    });

    await page.addInitScript(({ storageKey }) => {
      const now = new Date().toISOString();
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          version: 2,
          savedAt: Date.now(),
          nodes: [
            {
              id: "character-view-seed-node",
              type: "content",
              position: { x: 180, y: 120 },
              data: {
                title: "角色三视图测试节点",
                nodeKind: "script",
                content: "用于激活非空画布工具栏的最小测试节点。",
                createdAt: now,
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

    await page.locator('button[title="角色三视图生成"]').click();
    await expect(page.getByText("角色三视图生成")).toBeVisible();

    await page.getByRole("button", { name: "生成三视图" }).click();

    await expect(page.getByText("角色三视图上游生成失败")).toBeVisible();
  });
});
