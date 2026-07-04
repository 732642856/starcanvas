import { expect, test, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  collectConsoleErrors,
  dismissOnboardingIfPresent,
  gotoCanvas,
  waitForCanvasSave,
} from "./utils";
import { createTestProjectId } from "./utils/project";

type StarCanvasE2EBridge = {
  getEdges: () => Array<{ source: string; target: string }>;
  getNodes: () => Array<{ id: string; data: Record<string, unknown> }>;
};

async function writeProjectPackageFixture(): Promise<string> {
  const dir = path.join(os.tmpdir(), "starcanvas-e2e");
  await mkdir(dir, { recursive: true });
  const filePath = path.join(dir, `startrails-project-${Date.now()}.json`);
  await writeFile(
    filePath,
    JSON.stringify(
      {
        schema: "startrails-project-package/v1",
        projectName: "E2E 项目包导入",
        canvas: {
          viewport: { x: -80, y: -40, zoom: 0.9 },
          nodes: [
            {
              id: "e2e-import-script",
              type: "content",
              position: { x: 140, y: 120 },
              data: {
                title: "E2E 导入剧本",
                nodeKind: "document",
                content: "这是从项目包恢复的剧本节点。",
              },
            },
            {
              id: "e2e-import-video",
              type: "video",
              position: { x: 520, y: 120 },
              data: {
                title: "E2E 导入视频线索",
                nodeKind: "uploaded-video",
                assetId: "e2e-video-asset",
                persistence: "missing",
                loadError: "asset-not-found",
              },
            },
          ],
          edges: [
            {
              id: "e2e-import-edge",
              source: "e2e-import-script",
              target: "e2e-import-video",
              type: "smoothstep",
              animated: true,
            },
          ],
        },
      },
      null,
      2,
    ),
    "utf8",
  );
  return filePath;
}

async function readImportedSummary(page: Page) {
  return page.evaluate(() => {
    const e2e = (window as Window & { __starcanvasE2E?: StarCanvasE2EBridge }).__starcanvasE2E;
    const nodes = e2e?.getNodes() ?? [];
    const edges = e2e?.getEdges() ?? [];
    return {
      nodeIds: nodes.map((node) => node.id).sort(),
      titles: nodes.map((node) => String(node.data.title || "")).sort(),
      edgeCount: edges.length,
      hasImportedEdge: edges.some(
        (edge) => edge.source === "e2e-import-script" && edge.target === "e2e-import-video",
      ),
    };
  });
}

test.describe("project package import", () => {
  test("user imports a StarCanvas project package from the upload panel", async ({ page }) => {
    test.setTimeout(180_000);
    const projectId = createTestProjectId("project-package-import");
    const fixturePath = await writeProjectPackageFixture();
    const errors = collectConsoleErrors(page);

    await gotoCanvas(page, projectId);
    await dismissOnboardingIfPresent(page);

    await page.getByTestId("toolbar-file-upload").click();
    await expect(page.getByText("文件上传")).toBeVisible({ timeout: 15_000 });

    const chooserPromise = page.waitForEvent("filechooser");
    await page.getByText("拖拽文件到此处").click();
    const chooser = await chooserPromise;
    await chooser.setFiles(fixturePath);

    await expect(page.getByText("E2E 项目包导入")).toBeVisible({ timeout: 15_000 });
    await expect
      .poll(() => readImportedSummary(page), {
        timeout: 30_000,
        message: "project package import should restore canvas nodes and edges",
      })
      .toMatchObject({
        nodeIds: ["e2e-import-script", "e2e-import-video"],
        titles: ["E2E 导入剧本", "E2E 导入视频线索"],
        edgeCount: 1,
        hasImportedEdge: true,
      });

    await waitForCanvasSave(page);
    await gotoCanvas(page, projectId);
    await dismissOnboardingIfPresent(page);
    await expect
      .poll(() => readImportedSummary(page), {
        timeout: 30_000,
        message: "imported project package should persist after reload",
      })
      .toMatchObject({
        nodeIds: ["e2e-import-script", "e2e-import-video"],
        titles: ["E2E 导入剧本", "E2E 导入视频线索"],
        edgeCount: 1,
        hasImportedEdge: true,
      });

    expect(errors.pageErrors).toEqual([]);
    expect(errors.consoleErrors).toEqual([]);
  });
});
