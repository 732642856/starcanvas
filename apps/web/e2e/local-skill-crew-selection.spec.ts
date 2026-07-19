import { expect, test } from "@playwright/test";
import { dismissOnboardingIfPresent, gotoCanvas, waitForCanvasReady } from "./utils";
import { createTestProjectId } from "./utils/project";

test.describe("Crew local Skill selection", () => {
  test("shows metadata-only local Skills and lets the user cancel a selection", async ({ page }) => {
    await page.route("**/api/ai/local-skills", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          enabled: true,
          contentInjectionEnabled: false,
          skills: [{
            skillId: "local:codex:director",
            name: "Director Craft",
            description: "Camera blocking and scene direction.",
            source: "codex",
            relativePath: "director/SKILL.md",
            tags: ["codex", "director"],
            updatedAt: "2026-07-14T00:00:00.000Z",
            updatedAtMs: 0,
            sizeBytes: 128,
            contentHash: "sha256:test",
            riskFlags: [],
          }],
        }),
      });
    });

    await gotoCanvas(page, createTestProjectId("crew-local-skills"));
    await dismissOnboardingIfPresent(page);
    await waitForCanvasReady(page);
    await page.getByTestId("toolbar-crew-agent").click();

    const panel = page.getByTestId("crew-local-skills");
    await expect(panel).toBeVisible();
    await expect(panel).toContainText("Director Craft");
    await expect(panel).toContainText("codex");
    await expect(panel).toContainText("默认仅摘要");

    const checkbox = panel.locator('input[type="checkbox"]').first();
    await expect(checkbox).not.toBeChecked();
    await checkbox.check();
    await expect(checkbox).toBeChecked();
    await checkbox.uncheck();
    await expect(checkbox).not.toBeChecked();
    await page.locator("textarea").fill("Camera blocking scene");
    await expect(checkbox).not.toBeChecked();
    await expect(panel).not.toContainText("允许发送受限 Skill 正文");
  });
});
