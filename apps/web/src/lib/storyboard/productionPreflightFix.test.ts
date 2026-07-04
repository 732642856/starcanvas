import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { StoryboardShotData } from "@/app/canvas/components/canvas/types";
import {
  buildProductionPreflightFixDraft,
  buildProductionPreflightFixOutcome,
} from "./productionPreflightFix.ts";

function makeShot(overrides: Partial<StoryboardShotData> = {}): StoryboardShotData {
  return {
    id: "shot-1",
    order: 1,
    title: "门口回头",
    description: "女主在雨夜门口回头，看见远处有人影。",
    visualPrompt: "",
    shotType: "",
    cameraMovement: "",
    duration: "",
    dialogue: "谁在那里？",
    status: "ready",
    ...overrides,
  };
}

describe("productionPreflightFix", () => {
  it("creates an editable visual prompt draft from shot context", () => {
    const draft = buildProductionPreflightFixDraft(makeShot(), ["strengthen-visual-prompt"]);

    assert.match(draft.patch.visualPrompt ?? "", /女主在雨夜门口回头/);
    assert.match(draft.patch.visualPrompt ?? "", /cinematic lighting/);
    assert.deepEqual(draft.appliedActions, ["strengthen-visual-prompt"]);
  });

  it("fills conservative shot language and duration defaults", () => {
    const draft = buildProductionPreflightFixDraft(makeShot(), [
      "add-shot-language",
      "set-shot-duration",
    ]);

    assert.equal(draft.patch.shotType, "medium");
    assert.equal(draft.patch.cameraMovement, "static");
    assert.equal(draft.patch.duration, "3s");
  });

  it("adds editable character anchor placeholders without overwriting references", () => {
    const draft = buildProductionPreflightFixDraft(
      makeShot({
        characterIdentities: [
          {
            id: "char-1",
            name: "林夏",
            role: "protagonist",
          },
          {
            id: "char-2",
            name: "黑影",
            role: "antagonist",
            referenceAssetId: "asset-shadow",
          },
        ],
      }),
      ["complete-character-anchor"],
    );

    assert.match(draft.patch.characterIdentities?.[0]?.visualSignature ?? "", /待确认：林夏/);
    assert.match(draft.patch.characterIdentities?.[0]?.costume ?? "", /门口回头/);
    assert.equal(draft.patch.characterIdentities?.[1]?.referenceAssetId, "asset-shadow");
    assert.equal(draft.patch.characterIdentities?.[1]?.visualSignature, undefined);
  });

  it("adds a voice intent draft from dialogue", () => {
    const draft = buildProductionPreflightFixDraft(makeShot(), ["add-voice-intent"]);

    assert.equal(draft.patch.voiceConfig?.text, "谁在那里？");
    assert.match(draft.patch.voiceConfig?.instruct ?? "", /清晰咬字/);
  });

  it("rechecks preflight after a draft and reports remaining review work", () => {
    const outcome = buildProductionPreflightFixOutcome(makeShot(), [
      "strengthen-visual-prompt",
    ]);

    assert.equal(outcome.before.status, "blocked");
    assert.equal(outcome.after.status, "needs-review");
    assert.equal(outcome.resolvedBlockingIssues, 1);
    assert.equal(outcome.remainingBlockingIssues, 0);
    assert.ok(outcome.remainingWarningIssues > 0);
    assert.equal(outcome.notice.kind, "success");
    assert.match(outcome.notice.title, /阻塞已解除/);
  });

  it("reports ready when the draft clears the last issue", () => {
    const outcome = buildProductionPreflightFixOutcome(
      makeShot({
        visualPrompt: "woman turns around at the rainy doorway, distant silhouette, cinematic lighting",
        shotType: "medium",
        cameraMovement: "static",
        duration: "3s",
        referenceImageUrl: "https://example.com/reference.png",
        dialogue: "谁在那里？",
      }),
      ["add-voice-intent"],
    );

    assert.equal(outcome.before.status, "needs-review");
    assert.equal(outcome.after.status, "ready");
    assert.equal(outcome.notice.kind, "success");
    assert.match(outcome.notice.title, /预检通过/);
  });

  it("keeps blocking feedback when a draft cannot fix the primary blocker", () => {
    const outcome = buildProductionPreflightFixOutcome(makeShot(), [
      "attach-reference-frame",
    ]);

    assert.equal(outcome.before.status, "blocked");
    assert.equal(outcome.after.status, "blocked");
    assert.equal(outcome.remainingBlockingIssues, 1);
    assert.equal(outcome.notice.kind, "warning");
    assert.match(outcome.notice.title, /仍有阻塞/);
  });
});
