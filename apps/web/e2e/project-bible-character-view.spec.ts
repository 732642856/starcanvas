import { expect, test, type Download, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

import { createTestProjectId } from "./utils/project";
import { clearBrowserStorage } from "./utils/storage";

async function getE2EState(page: Page): Promise<{
  assets: Array<{ id?: string; metadata?: { assetId?: string } }>;
  nodes: Array<{
    id?: string;
    data?: {
      assetId?: string;
      nodeKind?: string;
      source?: string;
      shot?: {
        generatedImageAssetId?: string;
        generatedImageNodeId?: string;
      };
    };
  }>;
}> {
  return page.evaluate(() => {
    const e2e = (window as Window & {
      __starcanvasE2E?: {
        getAssets: () => Array<{ id?: string; metadata?: { assetId?: string } }>;
        getNodes: () => Array<{
          id?: string;
          data?: {
            assetId?: string;
            nodeKind?: string;
            source?: string;
            shot?: {
              generatedImageAssetId?: string;
              generatedImageNodeId?: string;
            };
          };
        }>;
      };
    }).__starcanvasE2E;
    if (!e2e) throw new Error("__starcanvasE2E bridge is unavailable");
    return {
      assets: e2e.getAssets(),
      nodes: e2e.getNodes(),
    };
  });
}

async function exportProjectPackage(page: Page): Promise<Download> {
  await page.getByTestId("export-dropdown-toggle").click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出项目包" }).click();
  return downloadPromise;
}

test.describe("Project Bible character view entry", () => {
  test.beforeEach(async ({ page }) => {
    await clearBrowserStorage(page);
  });

  test("opens the real character view modal from Project Bible and writes generated views back", async ({ page }) => {
    const projectId = createTestProjectId("project-bible-character-view");
    const storageKey = `startrails_canvas_p:${encodeURIComponent(projectId)}`;
    const requestedViewTypes: string[] = [];
    const now = new Date().toISOString();
    const seededCanvas = {
      version: 2,
      savedAt: Date.now(),
      nodes: [
        {
          id: "shot-node-1",
          type: "shot",
          position: { x: 240, y: 180 },
          data: {
            title: "镜头 01",
            nodeKind: "shot",
            description: "雨夜旧影院门厅，林雾握着胶片盒回头。",
            createdAt: now,
            shot: {
              id: "shot-01",
              order: 1,
              title: "镜头 01",
              description: "雨夜旧影院门厅，林雾握着胶片盒回头。",
              visualPrompt: "rainy old cinema lobby, Lin Wu holding a film canister, cinematic lighting, moody atmosphere",
              shotType: "medium",
              cameraMovement: "static",
              duration: "4s",
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
    };

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

    await page.addInitScript(({ key, value }) => {
      localStorage.setItem(key, JSON.stringify(value));
      localStorage.setItem("startrails_use_mock", "true");
    }, { key: storageKey, value: seededCanvas });

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
    await page.getByRole("button", { name: "生成三视图" }).click();
    await expect.poll(() => requestedViewTypes.length).toBe(1);
    expect(requestedViewTypes).toEqual(["all"]);
    await page.getByRole("button", { name: "关闭三视图生成面板" }).click();
    await expect(page.getByText("角色三视图生成")).toHaveCount(0);
    await expect(biblePanel.getByAltText("林雾正面视图")).toBeVisible();
    await expect(biblePanel.getByAltText("林雾侧面视图")).toBeVisible();
    await expect(biblePanel.getByAltText("林雾背面视图")).toBeVisible();

    await expect
      .poll(async () => {
        return page.evaluate(() => {
          const e2e = (window as Window & {
            __starcanvasE2E?: { getNodeData?: (nodeId: string) => any };
          }).__starcanvasE2E;
          const identity = e2e?.getNodeData?.("shot-node-1")?.shot?.characterIdentities?.[0];
          return identity
            ? {
                frontViewUrl: identity.frontViewUrl,
                sideViewUrl: identity.sideViewUrl,
                backViewUrl: identity.backViewUrl,
                frontViewAssetId: identity.frontViewAssetId,
                sideViewAssetId: identity.sideViewAssetId,
                backViewAssetId: identity.backViewAssetId,
              }
            : null;
        });
      })
      .toMatchObject({
        frontViewUrl: expect.stringMatching(/^blob:/),
        sideViewUrl: expect.stringMatching(/^blob:/),
        backViewUrl: expect.stringMatching(/^blob:/),
        frontViewAssetId: expect.any(String),
        sideViewAssetId: expect.any(String),
        backViewAssetId: expect.any(String),
      });

    const reopenedPage = await page.context().newPage();
    await reopenedPage.addInitScript(() => {
      localStorage.setItem("startrails_use_mock", "true");
    });
    await reopenedPage.goto(`/canvas?projectId=${encodeURIComponent(projectId)}`, {
      waitUntil: "domcontentloaded",
      timeout: 180_000,
    });
    await expect(reopenedPage.locator(".react-flow").first()).toBeVisible({ timeout: 90_000 });
    await reopenedPage.waitForFunction(
      () => Boolean((window as typeof window & { __starcanvasE2E?: unknown }).__starcanvasE2E),
      undefined,
      { timeout: 90_000 },
    );
    await reopenedPage.getByTestId("bible-dropdown-toggle").click();
    await reopenedPage.getByRole("button", { name: /项目设定/ }).click();
    const reopenedBiblePanel = reopenedPage.getByTestId("project-bible-panel");
    await expect(reopenedBiblePanel).toBeVisible();
    await expect(reopenedBiblePanel.getByAltText("林雾正面视图")).toBeVisible();
    await expect(reopenedBiblePanel.getByAltText("林雾侧面视图")).toBeVisible();
    await expect(reopenedBiblePanel.getByAltText("林雾背面视图")).toBeVisible();

    await reopenedPage.locator("[data-testid='shot-planning-toggle']").click();
    const planningPanel = reopenedPage.locator("[data-testid='shot-planning-panel']");
    await expect(planningPanel).toBeVisible({ timeout: 10_000 });
    await reopenedPage.locator("[data-testid='shot-planning-generate']").click();
    await expect(planningPanel.locator("[data-planning-item]")).toHaveCount(1, { timeout: 10_000 });
    await planningPanel.locator("[data-planning-item]").first().locator("select").selectOption("ready");

    const createQueueButton = reopenedPage.locator("[data-testid='shot-planning-create-queue']");
    await expect(createQueueButton).toBeEnabled();
    await createQueueButton.click();

    const queuePanel = reopenedPage.getByTestId("production-run-queue-panel");
    await expect(queuePanel).toBeVisible({ timeout: 10_000 });
    await expect(reopenedPage.getByTestId("production-preflight-summary")).toContainText("0 阻塞", { timeout: 10_000 });
    const stateBeforeStart = await getE2EState(reopenedPage);
    const assetCountBeforeStart = stateBeforeStart.assets.length;
    const startButton = reopenedPage.getByTestId("production-run-queue-start");
    await expect(startButton).toBeEnabled({ timeout: 30_000 });
    await startButton.click();
    await expect(reopenedPage.getByTestId("production-run-queue-status")).toContainText("运行中", { timeout: 15_000 });
    await expect
      .poll(async () => {
        const stateAfterStart = await getE2EState(reopenedPage);
        const shotNode = stateAfterStart.nodes.find((node) => node.id === "shot-node-1");
        const generatedImageNodeId = shotNode?.data?.shot?.generatedImageNodeId;
        const generatedImageAssetId = shotNode?.data?.shot?.generatedImageAssetId;
        const generatedImageNode = stateAfterStart.nodes.find((node) => node.id === generatedImageNodeId);
        return {
          shotImageLinked: Boolean(generatedImageNodeId && generatedImageAssetId),
          assetCountIncreased: stateAfterStart.assets.length > assetCountBeforeStart,
          generatedImageNodeLinked: Boolean(
            generatedImageNode &&
              generatedImageNode.data?.nodeKind === "ai-generated-image" &&
              generatedImageNode.data?.assetId === generatedImageAssetId &&
              generatedImageNode.data?.source === "generated",
          ),
        };
      }, {
        timeout: 30_000,
        message: "restored queue should write the first storyboard image back into shot + image node + asset library",
      })
      .toEqual({
        shotImageLinked: true,
        assetCountIncreased: true,
        generatedImageNodeLinked: true,
      });

    const packageDownload = await exportProjectPackage(reopenedPage);
    expect(packageDownload.suggestedFilename()).toMatch(/^startrails-project-\d{4}-\d{2}-\d{2}\.json$/);
    const packagePath = await packageDownload.path();
    if (!packagePath) {
      throw new Error("project package download path unavailable");
    }
    const exportedPackage = JSON.parse(await readFile(packagePath, "utf8")) as {
      canvas?: {
        nodes?: Array<{
          id?: string;
          data?: {
            nodeKind?: string;
            assetId?: string;
            shot?: {
              generatedImageAssetId?: string;
              generatedImageNodeId?: string;
            };
          };
        }>;
      };
    };
    const exportedShotNode = exportedPackage.canvas?.nodes?.find((node) => node.id === "shot-node-1");
    const exportedGeneratedImageNodeId = exportedShotNode?.data?.shot?.generatedImageNodeId;
    const exportedGeneratedImageAssetId = exportedShotNode?.data?.shot?.generatedImageAssetId;
    const exportedGeneratedImageNode = exportedPackage.canvas?.nodes?.find(
      (node) => node.id === exportedGeneratedImageNodeId,
    );
    expect(exportedGeneratedImageNodeId).toEqual(expect.any(String));
    expect(exportedGeneratedImageAssetId).toEqual(expect.any(String));
    expect(exportedGeneratedImageNode).toMatchObject({
      data: {
        nodeKind: "ai-generated-image",
        assetId: exportedGeneratedImageAssetId,
      },
    });
  });
});
