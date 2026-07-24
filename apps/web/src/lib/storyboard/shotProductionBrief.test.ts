import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Node } from "@xyflow/react";
import type { CanvasNodeData } from "@/app/canvas/components/canvas/types";
import {
  buildShotProductionBrief,
  buildShotProductionBriefs,
} from "./shotProductionBrief.ts";

function makeShotNode(order: number, data: Partial<NonNullable<CanvasNodeData["shot"]>> = {}): Node<CanvasNodeData> {
  return {
    id: `shot-node-${order}`,
    type: "shot",
    position: { x: order * 100, y: 0 },
    data: {
      nodeKind: "shot",
      shot: {
        id: `shot-data-${order}`,
        order,
        title: `镜头 ${order}`,
        description: `镜头 ${order} 画面描述`,
        visualPrompt: `visual prompt ${order}`,
        sourceStoryboardNodeId: "storyboard-1",
        ...data,
      },
    },
  };
}

describe("shotProductionBrief", () => {
  it("builds one sound-and-picture production brief from a storyboard shot", () => {
    const brief = buildShotProductionBrief({
      id: "shot-1",
      order: 1,
      title: "门缝惊现黑影",
      description: "女主靠近旧门",
      visualPrompt: "fallback visual prompt",
      shotType: "medium shot",
      cameraMovement: "static",
      duration: "3s",
      dialogue: "谁在那里？",
      notes: "后期保持门轴吱呀声和呼吸声之间的停顿",
      characterIdentities: [
        {
          id: "char-linxia",
          name: "林夏",
          role: "protagonist",
          visualSignature: "short black bob haircut and anxious eyes",
          costume: "red wool coat",
        },
      ],
      voiceConfig: {
        mode: "design",
        text: "谁在那里？",
        instruct: "female, restrained panic, low whisper",
      },
    });

    assert.equal(brief.shotId, "shot-1");
    assert.equal(brief.order, 1);
    assert.equal(brief.title, "门缝惊现黑影");
    assert.equal(brief.visual.prompt, "fallback visual prompt");
    assert.equal(brief.visual.shotType, "medium shot");
    assert.equal(brief.visual.cameraMovement, "static");
    assert.equal(brief.visual.duration, "3s");
    assert.equal(brief.visual.characterIdentities[0]?.name, "林夏");
    assert.equal(brief.voice.dialogue, "谁在那里？");
    assert.equal(brief.voice.suggestedText, "谁在那里？");
    assert.equal(brief.voice.suggestedInstruct, "female, restrained panic, low whisper");
    assert.equal(brief.subtitle.text, "谁在那里？");
    assert.match(brief.handoff.notes ?? "", /后期保持门轴吱呀声/);
  });

  it("carries partial R2V reference usage into the handoff audit", () => {
    const brief = buildShotProductionBrief({
      id: "shot-r2v-audit",
      order: 1,
      title: "角色参考镜头",
      description: "赵珩回身。",
      visualPrompt: "period palace interior",
      videoReferenceAudit: {
        mode: "r2v",
        configuredCount: 3,
        usedCount: 2,
        skippedCount: 1,
        reason: "角色参考图部分不可读：已使用 2/3 张，其余 1 张未恢复或桥接失败。",
      },
    });

    assert.deepEqual(brief.handoff.videoReferenceAudit, {
      mode: "r2v",
      configuredCount: 3,
      usedCount: 2,
      skippedCount: 1,
      reason: "角色参考图部分不可读：已使用 2/3 张，其余 1 张未恢复或桥接失败。",
    });
    assert.ok(brief.handoff.warnings?.some((warning) => warning.includes("R2V") && warning.includes("跳过 1 张")));
  });

  it("prefers Director Agent cinematic metadata for visual, voice, subtitle, and handoff fields", () => {
    const brief = buildShotProductionBrief({
      id: "shot-2",
      order: 2,
      title: "半开门特写",
      description: "fallback description",
      visualPrompt: "fallback prompt should not dominate",
      dialogue: "fallback dialogue",
      cinematicShot: {
        order: 2,
        sceneId: "scene-1",
        shotId: "shot-2",
        dramaticBeat: "女主发现门后有人",
        shotPurpose: "制造悬疑并压缩观众注意力",
        emotionalState: "suspense",
        subtext: "她害怕但不愿退后",
        dramaticWeight: 8,
        shotSize: "close-up",
        cameraAngle: "eye-level",
        cameraMovement: "push-in",
        composition: "door frame splits the face in half",
        blocking: "actor freezes with hand on the handle",
        durationEstimate: 4,
        dialogue: "别躲了。",
        soundCue: "old hinge creaks before the line",
        voiceIntent: "low whisper, restrained panic",
        musicMood: "thin suspended strings",
        visualPrompt: "cinematic close-up through a half-open door",
        negativePrompt: "cartoon style",
        riskFlags: ["keep the red coat consistent"],
      },
      sceneAnalysis: {
        sceneId: "scene-1",
        sceneNumber: 1,
        location: "old apartment corridor",
        timeOfDay: "night",
        characters: ["女主"],
        sceneFunction: "revelation",
        emotionalArc: { start: "calm", peak: "suspense", end: "fear" },
        dramaticTension: 8,
        summary: "女主在旧公寓走廊发现门后的黑影",
      },
      continuityWarnings: [
        {
          type: "action-break",
          severity: "warning",
          shotIds: ["shot-1", "shot-2"],
          message: "红色外套必须跨镜头保持一致",
        },
      ],
    });

    assert.equal(brief.visual.prompt, "cinematic close-up through a half-open door");
    assert.equal(brief.visual.shotType, "close-up");
    assert.equal(brief.visual.cameraMovement, "push-in");
    assert.equal(brief.visual.duration, "4s");
    assert.equal(brief.voice.dialogue, "别躲了。\nfallback dialogue");
    assert.equal(brief.voice.voiceIntent, "low whisper, restrained panic");
    assert.match(brief.voice.soundCue ?? "", /old hinge creaks before the line/);
    assert.match(brief.voice.soundCue ?? "", /music mood: thin suspended strings/);
    assert.equal(brief.subtitle.text, "别躲了。\nfallback dialogue");
    assert.equal(brief.subtitle.intent, "low whisper, restrained panic");
    assert.match(brief.handoff.notes ?? "", /Scene summary: 女主在旧公寓走廊发现门后的黑影/);
    assert.match(brief.handoff.notes ?? "", /Dramatic beat: 女主发现门后有人/);
    assert.deepEqual(brief.handoff.warnings, [
      "keep the red coat consistent",
      "红色外套必须跨镜头保持一致",
      "建议白模预演：姿态 + 深度 控制图。",
    ]);
    assert.deepEqual(brief.handoff.previs, { status: "recommended", pose: true, depth: true, splitShotRecommended: false });
  });

  it("sorts shot briefs by shot order and ignores non-shot nodes", () => {
    const briefs = buildShotProductionBriefs([
      makeShotNode(3),
      {
        id: "text-node",
        type: "default",
        position: { x: 0, y: 0 },
        data: { nodeKind: "text", title: "说明" },
      },
      makeShotNode(1),
      makeShotNode(2),
    ]);

    assert.deepEqual(
      briefs.map((brief) => brief.order),
      [1, 2, 3],
    );
    assert.deepEqual(
      briefs.map((brief) => brief.shotId),
      ["shot-data-1", "shot-data-2", "shot-data-3"],
    );
  });

  it("adds a handoff warning when the visual prompt is missing", () => {
    const brief = buildShotProductionBrief({
      id: "shot-empty",
      order: 4,
      title: "空镜头",
      description: "",
      visualPrompt: "",
    });

    assert.equal(brief.visual.prompt, "");
    assert.deepEqual(brief.handoff.warnings, ["Missing visual prompt for shot generation"]);

    const missingPromptBrief = buildShotProductionBrief({
      id: "shot-missing",
      order: 5,
      title: "",
      description: "",
      visualPrompt: "",
    });

    assert.deepEqual(missingPromptBrief.handoff.warnings, ["Missing visual prompt for shot generation"]);
  });

  it("persists a whitebox previs plan for a dynamic camera shot", () => {
    const brief = buildShotProductionBrief({
      id: "shot-previs",
      order: 5,
      title: "藏锅",
      description: "荆钗缓慢把铁锅藏到身后，警觉望向宫门。",
      visualPrompt: "period drama kitchen",
      shotType: "medium close-up",
      cameraMovement: "slow push in",
    });

    assert.deepEqual(brief.handoff.previs, { status: "recommended", pose: true, depth: true, splitShotRecommended: false });
    assert.ok(brief.handoff.warnings?.includes("建议白模预演：姿态 + 深度 控制图。"));
  });

  it("persists a split-shot recommendation for sequential actions", () => {
    const brief = buildShotProductionBrief({
      id: "shot-split",
      order: 6,
      title: "藏锅后望向宫门",
      description: "荆钗缓慢把铁锅藏到身后，然后警觉望向宫门。",
      visualPrompt: "period drama kitchen",
      shotType: "medium close-up",
      cameraMovement: "slow push in",
    });

    assert.deepEqual(brief.handoff.previs, { status: "recommended", pose: true, depth: true, splitShotRecommended: true });
    assert.ok(brief.handoff.warnings?.includes("检测到连续动作，建议拆成多个单动作镜头后再生成视频。"));
  });

  it("preserves reference-video source metadata for handoff", () => {
    const brief = buildShotProductionBrief({
      id: "shot-reference",
      order: 6,
      title: "参考视频镜头",
      description: "基于参考视频关键帧",
      visualPrompt: "cinematic frame from reference",
      referenceImageUrl: "data:image/jpeg;base64,frame",
      sourceType: "reference-video",
      sourceMeta: {
        videoName: "reference.webm",
        timeSec: 12.5,
        timestampMs: 12500,
        frameIndex: 3,
        sourceVideoId: "video-node-1",
      },
    });

    assert.deepEqual(brief.handoff.source, {
      type: "reference-video",
      videoName: "reference.webm",
      timeSec: 12.5,
      timestampMs: 12500,
      frameIndex: 3,
      sourceVideoId: "video-node-1",
      referenceImageUrl: "data:image/jpeg;base64,frame",
    });
  });
});
