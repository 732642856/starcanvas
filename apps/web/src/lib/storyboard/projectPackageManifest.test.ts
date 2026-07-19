import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { ShotProductionBrief } from "./shotProductionBrief.ts";
import { buildProjectPackageManifest } from "./projectPackageManifest.ts";

function makeBrief(
  order: number,
  overrides: Partial<ShotProductionBrief> = {},
): ShotProductionBrief {
  const base: ShotProductionBrief = {
    shotId: `shot-${order}`,
    order,
    title: `镜头 ${order}`,
    visual: {
      prompt: `visual prompt ${order}`,
      shotType: "close-up",
      cameraMovement: "push-in",
      duration: "4s",
      characterIdentities: [],
    },
    voice: {},
    subtitle: {},
    handoff: {},
  };

  return {
    ...base,
    ...overrides,
    visual: {
      ...base.visual,
      ...overrides.visual,
    },
    voice: {
      ...base.voice,
      ...overrides.voice,
    },
    subtitle: {
      ...base.subtitle,
      ...overrides.subtitle,
    },
    handoff: {
      ...base.handoff,
      ...overrides.handoff,
    },
  };
}

describe("buildProjectPackageManifest", () => {
  it("exports partial R2V reference usage and schedules its handoff review", () => {
    const manifest = buildProjectPackageManifest({
      shots: [{ id: "shot-node-1", order: 1, title: "镜头 1" }],
      productionBriefs: [makeBrief(1, {
        handoff: {
          videoReferenceAudit: {
            mode: "r2v",
            configuredCount: 3,
            usedCount: 2,
            skippedCount: 1,
            reason: "角色参考图部分不可读：已使用 2/3 张，其余 1 张未恢复或桥接失败。",
          },
          warnings: ["视频参考审计：R2V，已使用 2/3 张，跳过 1 张。"],
        },
      })],
    });

    assert.deepEqual(manifest.productionRunPlan[0]?.videoReferenceAudit, {
      mode: "r2v",
      configuredCount: 3,
      usedCount: 2,
      skippedCount: 1,
      reason: "角色参考图部分不可读：已使用 2/3 张，其余 1 张未恢复或桥接失败。",
    });
    assert.ok(manifest.productionRunPlan[0]?.nextActions.includes("review-handoff-warnings"));
    assert.ok(manifest.handoffWarnings.some((item) => item.warning.includes("跳过 1 张")));
  });

  it("builds a sound-picture production run manifest with counts and ordered shot index", () => {
    const manifest = buildProjectPackageManifest({
      shots: [
        { id: "shot-node-1", order: 1, title: "镜头 1" },
        { id: "shot-node-2", order: 2, title: "镜头 2" },
      ],
      productionBriefs: [
        makeBrief(2, {
          voice: { dialogue: "我听见声音了。", voiceIntent: "low whisper" },
          subtitle: { text: "我听见声音了。" },
          visual: {
            characterIdentities: [
              {
                id: "char-linxia",
                name: "林夏",
                visualSignature: "short black bob haircut and anxious eyes",
                costume: "red wool coat",
                referenceAssetId: "asset-linxia",
              },
              {
                id: "char-shadow",
                name: "黑影",
                visualSignature: "tall silhouette with wet black coat",
                costume: "dark raincoat",
                referenceAssetId: "asset-shadow",
              },
            ],
          },
        }),
        makeBrief(1, {
          visual: {
            characterIdentities: [
              {
                id: "char-linxia",
                name: "林夏",
                visualSignature: "short black bob haircut and anxious eyes",
                costume: "red wool coat",
                referenceAssetId: "asset-linxia",
              },
            ],
          },
        }),
      ],
      visualReferences: [{ id: "image-1", title: "走廊参考" }],
      audioIntent: [{ id: "audio-1", title: "环境音" }],
      handoffNotes: [{ id: "handoff-1", title: "剪辑说明" }],
    });

    assert.equal(manifest.version, "1.2");
    assert.equal(manifest.workflow.model, "sound-picture-production-run");
    assert.equal(manifest.workflow.orchestrationHint, "queue-by-shot");
    assert.deepEqual(manifest.workflow.stages, [
      "script",
      "storyboard",
      "visual",
      "video",
      "voice",
      "subtitle",
      "composition",
      "handoff",
    ]);
    assert.deepEqual(manifest.counts, {
      shots: 2,
      productionBriefs: 2,
      visualReferences: 1,
      audioIntent: 1,
      handoffNotes: 1,
      warnings: 0,
      previsPlans: 0,
    });
    assert.equal(manifest.productionPreflight.summary.totalShots, 2);
    assert.equal(manifest.productionPreflight.summary.blockedShots, 0);
    assert.equal(manifest.videoProviderDryRun.providerId, "vidu");
    assert.equal(manifest.videoProviderDryRun.summary.totalShots, 2);
    assert.ok(
      manifest.videoProviderDryRun.shots.every((shot) =>
        shot.issues.some((issue) => issue.code === "missing-image" && issue.severity === "info"),
      ),
    );
    assert.deepEqual(
      manifest.shotBriefIndex.map((item) => item.shotId),
      ["shot-1", "shot-2"],
    );
    assert.equal(manifest.shotBriefIndex[0]?.characterCount, 1);
    assert.equal(manifest.shotBriefIndex[1]?.hasVoice, true);
    assert.equal(manifest.shotBriefIndex[1]?.hasSubtitle, true);
    assert.deepEqual(manifest.assetLinks, {
      visualReferenceIds: ["image-1"],
      audioIntentIds: ["audio-1"],
      handoffNoteIds: ["handoff-1"],
    });
  });

  it("creates per-shot next actions for visual, voice, subtitle, and warning review", () => {
    const manifest = buildProjectPackageManifest({
      shots: [{ id: "shot-node-1", order: 1, title: "镜头 1" }],
      productionBriefs: [
        makeBrief(1, {
          voice: {
            suggestedText: "别出声。",
            suggestedInstruct: "female, restrained panic",
          },
          subtitle: { text: "别出声。" },
          handoff: {
            warnings: ["红色外套必须跨镜头保持一致"],
          },
        }),
      ],
    });

    assert.deepEqual(manifest.productionRunPlan[0]?.requiredAssets, [
      "visual",
      "video",
      "voice",
      "subtitle",
      "handoff-review",
    ]);
    assert.deepEqual(manifest.productionRunPlan[0]?.nextActions, [
      "generate-storyboard-image",
      "generate-video-clip",
      "generate-voice-track",
      "create-subtitle-track",
      "review-handoff-warnings",
    ]);
    assert.deepEqual(manifest.handoffWarnings, [
      {
        shotId: "shot-1",
        order: 1,
        title: "镜头 1",
        warning: "红色外套必须跨镜头保持一致",
      },
    ]);
  });

  it("marks missing visual prompt as an add-visual-prompt action", () => {
    const manifest = buildProjectPackageManifest({
      shots: [{ id: "shot-node-1", order: 1, title: "镜头 1" }],
      productionBriefs: [
        makeBrief(1, {
          visual: { prompt: "" },
        }),
      ],
    });

    assert.equal(manifest.shotBriefIndex[0]?.hasVisualPrompt, false);
    assert.deepEqual(manifest.productionRunPlan[0]?.requiredAssets, []);
    assert.deepEqual(manifest.productionRunPlan[0]?.nextActions, ["add-visual-prompt"]);
    assert.equal(manifest.productionPreflight.summary.blockedShots, 1);
    assert.ok(
      manifest.productionPreflight.shots[0]?.issues.some(
        (issue) => issue.code === "missing-visual-prompt",
      ),
    );
  });

  it("preserves per-shot source references for production handoff", () => {
    const manifest = buildProjectPackageManifest({
      shots: [{ id: "shot-node-1", order: 1, title: "镜头 1" }],
      productionBriefs: [
        makeBrief(1, {
          handoff: {
            source: {
              type: "reference-video",
              videoName: "reference.webm",
              timeSec: 8.2,
              timestampMs: 8200,
              frameIndex: 2,
              sourceVideoId: "video-node-1",
              referenceImageUrl: "data:image/jpeg;base64,frame",
            },
          },
        }),
      ],
    });

    assert.deepEqual(manifest.sourceReferences, [
      {
        shotId: "shot-1",
        order: 1,
        title: "镜头 1",
        type: "reference-video",
        videoName: "reference.webm",
        timeSec: 8.2,
        timestampMs: 8200,
        frameIndex: 2,
        sourceVideoId: "video-node-1",
        referenceImageUrl: "data:image/jpeg;base64,frame",
      },
    ]);
    assert.equal(manifest.videoProviderDryRun.summary.readyShots, 1);
    assert.equal(manifest.videoProviderDryRun.shots[0]?.ok, true);
    assert.equal(
      manifest.videoProviderDryRun.shots[0]?.sourceImageUrl,
      "data:image/jpeg;base64,frame",
    );
  });

  it("exports recommended whitebox previs plans", () => {
    const manifest = buildProjectPackageManifest({
      shots: [{ id: "shot-node-1", order: 1, title: "镜头 1" }],
      productionBriefs: [makeBrief(1, {
        handoff: { previs: { status: "recommended", pose: true, depth: true, splitShotRecommended: true } },
      })],
    });

    assert.equal(manifest.counts.previsPlans, 1);
    assert.deepEqual(manifest.previsPlans, [{
      shotId: "shot-1",
      order: 1,
      title: "镜头 1",
      status: "recommended",
      pose: true,
      depth: true,
      splitShotRecommended: true,
    }]);
  });
});
