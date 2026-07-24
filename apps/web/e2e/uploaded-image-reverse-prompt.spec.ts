import { expect, test } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  collectConsoleErrors,
  dismissOnboardingIfPresent,
  gotoCanvas,
} from "./utils";
import { createTestProjectId } from "./utils/project";

type StarCanvasE2EState = {
  getEdges?: () => Array<{ source: string; target: string; type?: string }>;
  getNodes?: () => Array<{ id: string; type: string; data: Record<string, unknown> }>;
};

const PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

async function writeTinyPngFixture(): Promise<string> {
  const dir = path.join(os.tmpdir(), "starcanvas-e2e");
  await mkdir(dir, { recursive: true });
  const filePath = path.join(dir, `starcanvas-reverse-prompt-${Date.now()}.png`);
  const base64 = PNG_DATA_URL.replace(/^data:image\/png;base64,/, "");
  await writeFile(filePath, Buffer.from(base64, "base64"));
  return filePath;
}

test("user uploads a real image file and reverse-prompts it into a downstream prompt node", async ({ page }) => {
  test.setTimeout(240_000);
  const projectId = createTestProjectId("uploaded-image-reverse-prompt");
  const imagePath = await writeTinyPngFixture();
  const errors = collectConsoleErrors(page);
  const requests: Array<Record<string, unknown>> = [];

  await page.route("**/api/ai/reverse-prompt", async (route) => {
    requests.push(route.request().postDataJSON());
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        prompt: "cinematic close-up portrait with soft key light and shallow depth of field",
        negativePrompt: "text, watermark, blurry",
        qualityScore: 0.93,
        language: "en",
      }),
    });
  });

  await gotoCanvas(page, projectId);
  await dismissOnboardingIfPresent(page);

  const chooserPromise = page.waitForEvent("filechooser");
  await page.getByTestId("empty-guide-upload-image").click();
  const chooser = await chooserPromise;
  await chooser.setFiles(imagePath);

  const uploadedImageNode = page.locator("[data-id]").filter({
    has: page.getByLabel("反推提示词"),
  }).first();

  await expect(uploadedImageNode).toBeVisible({ timeout: 30_000 });
  await uploadedImageNode.getByTestId("image-node-reverse-prompt").click();

  await expect.poll(() => requests.length, { timeout: 15_000 }).toBe(1);
  expect(String(requests[0].imageUrl || "")).toMatch(/^data:image\/png;base64,/);

  await expect.poll(
    async () =>
      page.evaluate(() => {
        const e2eState = (window as Window & { __starcanvasE2E?: StarCanvasE2EState }).__starcanvasE2E;
        const nodes = e2eState?.getNodes?.() ?? [];
        const edges = e2eState?.getEdges?.() ?? [];

        const imageNode = nodes.find((node) => node.data?.nodeKind === "uploaded-image");
        const promptNode = nodes.find(
          (node) =>
            node.type === "content" &&
            node.data?.nodeKind === "prompt" &&
            node.data?.sourcePromptId === imageNode?.id,
        );
        const edge = edges.find(
          (candidate) => candidate.source === imageNode?.id && candidate.target === promptNode?.id,
        );

        return {
          imageNodeId: imageNode?.id,
          sourcePrompt: imageNode?.data?.prompt,
          promptNodePrompt: promptNode?.data?.prompt,
          promptNodeSummary: promptNode?.data?.summary,
          edgeType: edge?.type,
        };
      }),
    { timeout: 30_000 },
  ).toMatchObject({
    sourcePrompt: "cinematic close-up portrait with soft key light and shallow depth of field",
    promptNodePrompt: "cinematic close-up portrait with soft key light and shallow depth of field",
    edgeType: "creative",
  });

  const summary = await page.evaluate(() => {
    const e2eState = (window as Window & { __starcanvasE2E?: StarCanvasE2EState }).__starcanvasE2E;
    const nodes = e2eState?.getNodes?.() ?? [];
    const edges = e2eState?.getEdges?.() ?? [];

    const imageNode = nodes.find((node) => node.data?.nodeKind === "uploaded-image");
    const promptNode = nodes.find(
      (node) =>
        node.type === "content" &&
        node.data?.nodeKind === "prompt" &&
        node.data?.sourcePromptId === imageNode?.id,
    );
    const edge = edges.find(
      (candidate) => candidate.source === imageNode?.id && candidate.target === promptNode?.id,
    );

    return {
      imageNodeId: imageNode?.id,
      sourcePrompt: "cinematic close-up portrait with soft key light and shallow depth of field",
      promptNodePrompt: promptNode?.data?.prompt,
      promptNodeSummary: promptNode?.data?.summary,
      edgeType: edge?.type,
    };
  });

  expect(String(summary.promptNodeSummary)).toContain("Negative prompt: text, watermark, blurry");
  expect(errors.pageErrors).toEqual([]);
  expect(errors.consoleErrors).toEqual([]);
});
