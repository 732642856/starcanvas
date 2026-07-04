import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { ShotProductionBrief } from "./shotProductionBrief.ts";
import {
  buildProductionPreflightReport,
  buildShotProductionPreflight,
} from "./productionPreflight.ts";

function makeBrief(overrides: Partial<ShotProductionBrief> = {}): ShotProductionBrief {
  const base: ShotProductionBrief = {
    shotId: "shot-1",
    order: 1,
    title: "镜头 1",
    visual: {
      prompt: "cinematic wide shot of a woman entering a neon corridor",
      shotType: "wide",
      cameraMovement: "push-in",
      duration: "4s",
      characterIdentities: [],
    },
    voice: {},
    subtitle: {},
    handoff: {
      source: {
        type: "reference-video",
        timeSec: 1.2,
        referenceImageUrl: "data:image/jpeg;base64,frame",
      },
    },
  };

  return {
    ...base,
    ...overrides,
    visual: { ...base.visual, ...overrides.visual },
    voice: { ...base.voice, ...overrides.voice },
    subtitle: { ...base.subtitle, ...overrides.subtitle },
    handoff: { ...base.handoff, ...overrides.handoff },
  };
}

describe("productionPreflight", () => {
  it("marks a complete shot as ready", () => {
    const preflight = buildShotProductionPreflight(makeBrief());

    assert.equal(preflight.status, "ready");
    assert.equal(preflight.score, 100);
    assert.deepEqual(preflight.issues, []);
  });

  it("blocks shots without a visual prompt", () => {
    const preflight = buildShotProductionPreflight(
      makeBrief({
        visual: { prompt: "" },
      }),
    );

    assert.equal(preflight.status, "blocked");
    assert.ok(preflight.score < 70);
    assert.ok(preflight.issues.some((issue) => issue.code === "missing-visual-prompt"));
    assert.ok(preflight.requiredActions.includes("strengthen-visual-prompt"));
  });

  it("warns when character anchors are incomplete", () => {
    const preflight = buildShotProductionPreflight(
      makeBrief({
        visual: {
          characterIdentities: [
            {
              id: "char-1",
              name: "林夏",
              role: "主角",
            },
          ],
        },
      }),
    );

    assert.equal(preflight.status, "blocked");
    assert.ok(preflight.issues.some((issue) => issue.code === "missing-character-anchor"));
    assert.ok(preflight.requiredActions.includes("complete-character-anchor"));
  });

  it("warns about dialogue without voice intent", () => {
    const preflight = buildShotProductionPreflight(
      makeBrief({
        voice: { dialogue: "别回头。" },
      }),
    );

    assert.equal(preflight.status, "needs-review");
    assert.ok(preflight.issues.some((issue) => issue.code === "missing-voice-intent"));
  });

  it("summarizes ready, review, and blocked shots", () => {
    const report = buildProductionPreflightReport([
      makeBrief({ shotId: "ready", order: 1 }),
      makeBrief({
        shotId: "review",
        order: 2,
        voice: { dialogue: "快走。" },
      }),
      makeBrief({
        shotId: "blocked",
        order: 3,
        visual: { prompt: "" },
      }),
    ]);

    assert.equal(report.summary.totalShots, 3);
    assert.equal(report.summary.readyShots, 1);
    assert.equal(report.summary.reviewShots, 1);
    assert.equal(report.summary.blockedShots, 1);
    assert.equal(report.shots.map((shot) => shot.shotId).join(","), "ready,review,blocked");
  });
});
