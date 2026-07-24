import { expect, test } from "@playwright/test";

import { createTestProjectId } from "./utils/project";
import { clearBrowserStorage } from "./utils/storage";
import { waitForCanvasReady } from "./utils";

test.describe("Shot video direction", () => {
  test("shows the compiled I2V direction and whitebox recommendation before generation", async ({ page }) => {
    await clearBrowserStorage(page);
    const projectId = createTestProjectId("shot-video-direction");
    const storageKey = `startrails_canvas_p:${encodeURIComponent(projectId)}`;
    const now = new Date().toISOString();
    const seededCanvas = {
      version: 2,
      savedAt: Date.now(),
      nodes: [{
        id: "shot-node-1",
        type: "shot",
        position: { x: 260, y: 160 },
        data: {
          title: "荆钗藏锅",
          nodeKind: "shot",
          content: "荆钗把焦黑铁锅藏到身后。",
          createdAt: now,
          shot: {
            id: "shot-1",
            order: 1,
            title: "荆钗藏锅",
            description: "荆钗缓慢把焦黑铁锅藏到身后，然后警觉望向宫门。",
            visualPrompt: "period-drama palace kitchen, Jingchai holds a scorched wok",
            shotType: "medium close-up",
            cameraMovement: "slow push in",
            duration: "3s",
          },
        },
      }],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
    };

    await page.addInitScript(([key, value]) => {
      window.localStorage.setItem(key, JSON.stringify(value));
    }, [storageKey, seededCanvas]);
    await page.goto(`/canvas?projectId=${encodeURIComponent(projectId)}`);
    await waitForCanvasReady(page);
    await page.locator('[data-id="shot-node-1"]').click();

    const direction = page.getByTestId("shot-video-direction-shot-node-1");
    await expect(direction).toBeVisible();
    await expect(direction).toHaveValue(/one continuous medium close-up shot with no cuts/i);
    await expect(direction).toHaveValue(/Preserve the reference frame/i);
    await expect(direction).toHaveValue(/Primary action:/);
    await expect(direction).toHaveValue(/荆钗缓慢把焦黑铁锅藏到身后/);
    await expect(direction).not.toHaveValue(/警觉望向宫门/);
    await expect(direction).toHaveValue(/Camera movement: slow push in/i);
    await expect(page.getByText("建议拆镜 + 白模预演")).toBeVisible();
    await expect(page.getByText("姿态 + 深度 控制建议先走白模预演。")).toBeVisible();
    await expect(page.getByText("检测到连续动作，当前视频只保留第一个动作；后续动作建议拆成下一镜。")).toBeVisible();
  });
});
