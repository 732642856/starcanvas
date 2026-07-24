import { expect, test, type Page } from "@playwright/test";

import { createTestProjectId } from "./utils/project";
import { clearBrowserStorage } from "./utils/storage";

type StarCanvasE2EBridge = {
  getNodes: () => Array<{
    id?: string;
    type?: string;
    data?: {
      nodeKind?: string;
      shot?: {
        characterIdentities?: Array<{ id?: string; name?: string; referenceAssetId?: string; notes?: string }>;
      };
    };
  }>;
  setBibleCharactersForTest: (characters: Array<Record<string, unknown>>) => void;
};

const SCRIPT = "荆钗在御膳房发现一口黑锅。太子赵珩冲进来替她背锅。赵珩用黑锅挡下一把飞来的菜刀。";

async function waitForE2EBridge(page: Page): Promise<void> {
  await page.waitForFunction(
    () => Boolean((window as Window & { __starcanvasE2E?: unknown }).__starcanvasE2E),
    undefined,
    { timeout: 90_000 },
  );
}

async function seedScriptNode(page: Page, projectId: string): Promise<void> {
  const storageKey = `startrails_canvas_p:${encodeURIComponent(projectId)}`;
  const now = new Date().toISOString();
  const canvas = {
    version: 2,
    savedAt: Date.now(),
    nodes: [
      {
        id: "script-source",
        type: "content",
        position: { x: 180, y: 180 },
        width: 360,
        height: 260,
        measured: { width: 360, height: 260 },
        data: {
          title: "太子替我背黑锅",
          nodeKind: "text",
          content: SCRIPT,
          createdAt: now,
        },
      },
    ],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
  };
  await page.addInitScript(({ key, value }) => {
    localStorage.setItem(key, JSON.stringify(value));
  }, { key: storageKey, value: canvas });
}

async function setBibleCharacters(page: Page): Promise<void> {
  await page.evaluate(() => {
    const e2e = (window as Window & { __starcanvasE2E?: StarCanvasE2EBridge }).__starcanvasE2E;
    if (!e2e) throw new Error("__starcanvasE2E bridge is unavailable");
    e2e.setBibleCharactersForTest([
      {
        id: "char-zhaoheng",
        name: "赵珩",
        role: "太子",
        visualSignature: "young crown prince, calm eyes",
        costume: "ivory and gold robe",
        props: ["black wok"],
        referenceAssetIds: ["zhaoheng-reference.png"],
        frontViewUrl: "data:image/png;base64,emhhb2hlbmctZnJvbnQ=",
        sideViewUrl: "data:image/png;base64,emhhb2hlbmctc2lkZQ==",
        backViewUrl: "data:image/png;base64,emhhb2hlbmctYmFjaw==",
        createdAt: Date.now(),
      },
      {
        id: "char-jingchai",
        name: "荆钗",
        role: "宫女",
        visualSignature: "sharp eyes",
        costume: "pale blue robe",
        props: ["serving tray"],
        referenceAssetIds: ["jingchai-reference.png"],
        createdAt: Date.now(),
      },
    ]);
  });
}

async function routeScriptPipeline(page: Page): Promise<void> {
  await page.route("**/api/ai/script-pipeline", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        mode: "e2e",
        pipeline: {
          projectTitle: "太子替我背黑锅",
          logline: "御膳房黑锅误会引发太子救场。",
          shots: [
            {
              id: "shot-01",
              order: 1,
              title: "御膳房黑锅",
              beat: "荆钗发现黑锅",
              textStoryboard: "荆钗在御膳房发现一口黑锅，神情紧张。",
              storyboardPrompt: "润色后的文字分镜：御膳房内，荆钗发现黑锅。",
              visualPrompt: "cinematic palace kitchen, Jingchai finds a black wok",
              imagePrompt: "荆钗，御膳房，黑锅，电影感分镜图，角色一致",
              videoPrompt: "荆钗后退半步，镜头缓慢推近黑锅。",
              characters: ["荆钗"],
              characterBindings: [
                {
                  characterId: "char-jingchai",
                  name: "荆钗",
                  referenceAssetIds: ["jingchai-reference.png"],
                  consistencyLock: true,
                  faceLock: true,
                  costumeLock: true,
                },
              ],
              shotType: "medium",
              cameraMovement: "push-in",
              durationSeconds: 4,
              negativePrompt: "identity drift, costume change",
            },
            {
              id: "shot-02",
              order: 2,
              title: "太子背锅",
              beat: "赵珩冲入替荆钗承担误会",
              textStoryboard: "赵珩冲进御膳房，挡在荆钗前面。",
              storyboardPrompt: "润色后的文字分镜：太子冲入画面替荆钗背锅。",
              visualPrompt: "crown prince Zhao Heng protects Jingchai in palace kitchen",
              imagePrompt: "赵珩与荆钗，御膳房，黑锅，连续分镜，角色一致",
              videoPrompt: "赵珩一步上前举起黑锅，镜头轻微横移。",
              characters: ["赵珩", "荆钗"],
              characterBindings: [
                {
                  characterId: "char-zhaoheng",
                  name: "赵珩",
                  referenceAssetIds: ["zhaoheng-reference.png"],
                  viewSetId: "zhaoheng-reference.png",
                  consistencyLock: true,
                  faceLock: true,
                  costumeLock: true,
                },
                {
                  characterId: "char-jingchai",
                  name: "荆钗",
                  referenceAssetIds: ["jingchai-reference.png"],
                  consistencyLock: true,
                  faceLock: true,
                  costumeLock: true,
                },
              ],
              shotType: "wide",
              cameraMovement: "pan",
              durationSeconds: 5,
              negativePrompt: "identity drift, costume change",
            },
          ],
          nineGridPrompt: "连续 9 宫格分镜图，固定赵珩与荆钗角色，黑锅道具贯穿。",
          continuityRules: ["赵珩脸部与白金色太子服固定", "荆钗浅蓝宫女服固定", "黑锅道具贯穿"],
          nextActions: ["generate-nine-grid", "generate-shot-images", "generate-videos"],
        },
      }),
    });
  });
}

test.describe("Script pipeline role binding", () => {
  test.beforeEach(async ({ page }) => {
    await clearBrowserStorage(page);
  });

  test("converts script into shot nodes, nine-grid node, and locked character bindings", async ({ page }) => {
    const projectId = createTestProjectId("script-pipeline-role-binding");
    await seedScriptNode(page, projectId);
    await routeScriptPipeline(page);

    await page.goto(`/canvas?projectId=${encodeURIComponent(projectId)}`, {
      waitUntil: "domcontentloaded",
      timeout: 180_000,
    });
    await expect(page.locator(".react-flow").first()).toBeVisible({ timeout: 90_000 });
    await waitForE2EBridge(page);
    await setBibleCharacters(page);

    await page.getByRole("textbox", { name: "在这里输入你的想法，或输入 / 调用 AI 命令..." }).click();
    await page.getByRole("button", { name: "生成分镜流水线" }).click();

    await expect(page.locator(".react-flow__node").filter({ hasText: "御膳房黑锅" }).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.locator(".react-flow__node").filter({ hasText: "太子背锅" }).first()).toBeVisible();
    await expect(page.getByText("角色锁定").first()).toBeVisible();
    await expect(page.getByText("荆钗 · 锁定").first()).toBeVisible();

    const generated = await page.evaluate(() => {
      const e2e = (window as Window & { __starcanvasE2E?: StarCanvasE2EBridge }).__starcanvasE2E;
      if (!e2e) throw new Error("__starcanvasE2E bridge is unavailable");
      const nodes = e2e.getNodes();
      return {
        shotCount: nodes.filter((node) => node.type === "shot").length,
        hasGrid: nodes.some((node) => node.type === "storyboardGrid" && node.data?.nodeKind === "storyboard-grid"),
        hasZhaoHengIdentity: nodes.some((node) =>
          node.data?.shot?.characterIdentities?.some(
            (identity) =>
              identity.id === "char-zhaoheng" &&
              identity.name === "赵珩" &&
              identity.referenceAssetId === "zhaoheng-reference.png" &&
              identity.notes?.includes("脸部锁定"),
          ),
        ),
        hasJingchaiIdentity: nodes.some((node) =>
          node.data?.shot?.characterIdentities?.some(
            (identity) =>
              identity.id === "char-jingchai" &&
              identity.name === "荆钗" &&
              identity.referenceAssetId === "jingchai-reference.png" &&
              identity.notes?.includes("服装锁定"),
          ),
        ),
      };
    });
    expect(generated).toEqual({
      shotCount: 2,
      hasGrid: true,
      hasZhaoHengIdentity: true,
      hasJingchaiIdentity: true,
    });
  });
});
