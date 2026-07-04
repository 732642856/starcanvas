import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { ProjectPackageProductionRunManifest } from "./projectPackageManifest.ts";
import {
  buildProductionRunQueue,
  completeProductionRunTask,
  failProductionRunTask,
  getNextQueuedTask,
  pauseProductionRunTask,
  prepareProductionRunTask,
  projectProductionRunQueueRuntimeState,
  resumeProductionRunQueue,
  retryProductionRunTask,
  skipProductionRunTask,
  startProductionRunTask,
  updateProductionRunTaskProgress,
} from "./productionRunQueue.ts";

function makeManifest(
  plan: ProjectPackageProductionRunManifest["productionRunPlan"],
  productionPreflight: ProjectPackageProductionRunManifest["productionPreflight"] = {
    summary: {
      totalShots: plan.length,
      readyShots: plan.length,
      reviewShots: 0,
      blockedShots: 0,
      blockingIssues: 0,
      warningIssues: 0,
      averageScore: 100,
    },
    shots: [],
  },
  videoProviderDryRun: ProjectPackageProductionRunManifest["videoProviderDryRun"] = {
    providerId: "vidu",
    providerName: "Vidu / DashScope",
    model: "viduq3-turbo",
    implementationStatus: "implemented",
    evidenceLevel: "local-implementation",
    summary: {
      totalShots: plan.length,
      readyShots: plan.length,
      blockedShots: 0,
      blockingIssues: 0,
      warningIssues: 0,
    },
    shots: plan.map((item) => ({
      shotId: item.shotId,
      order: item.order,
      title: item.title,
      ok: true,
      providerId: "vidu",
      providerName: "Vidu / DashScope",
      model: "viduq3-turbo",
      mode: "image-to-video",
      durationSeconds: 5,
      aspectRatio: "16:9",
      resolution: "720p",
      sourceImageUrl: "https://example.com/frame.png",
      implementationStatus: "implemented",
      evidenceLevel: "local-implementation",
      issues: [],
    })),
  },
): ProjectPackageProductionRunManifest {
  return {
    version: "1.2",
    workflow: {
      model: "sound-picture-production-run",
      orchestrationHint: "queue-by-shot",
      stages: ["script", "storyboard", "visual", "video", "voice", "subtitle", "composition", "handoff"],
    },
    counts: {
      shots: plan.length,
      productionBriefs: plan.length,
      visualReferences: 0,
      audioIntent: 0,
      handoffNotes: 0,
      warnings: 0,
    },
    shotBriefIndex: [],
    productionRunPlan: plan,
    handoffWarnings: [],
    productionPreflight,
    videoProviderDryRun,
    assetLinks: {
      visualReferenceIds: [],
      audioIntentIds: [],
      handoffNoteIds: [],
    },
  };
}

describe("productionRunQueue", () => {
  it("builds queue tasks from executable production run actions and records blocked manual actions", () => {
    const queue = buildProductionRunQueue(
      makeManifest([
        {
          shotId: "shot-1",
          order: 1,
          title: "镜头 1",
          requiredAssets: ["visual", "video", "voice", "subtitle", "handoff-review"],
          nextActions: [
            "generate-storyboard-image",
            "generate-video-clip",
            "generate-voice-track",
            "create-subtitle-track",
            "review-handoff-warnings",
          ],
        },
        {
          shotId: "shot-2",
          order: 2,
          title: "镜头 2",
          requiredAssets: [],
          nextActions: ["add-visual-prompt"],
        },
      ]),
      { jobId: "job-1" },
    );

    assert.equal(queue.jobId, "job-1");
    assert.equal(queue.status, "queued");
    assert.equal(queue.totalTasks, 5);
    assert.equal(queue.progress, 0);
    assert.deepEqual(
      queue.tasks.map((task) => task.id),
      [
        "shot-1:generate-storyboard-image",
        "shot-1:generate-video-clip",
        "shot-1:generate-voice-track",
        "shot-1:create-subtitle-track",
        "shot-1:review-handoff-warnings",
      ],
    );
    assert.deepEqual(queue.blockedActions, [
      {
        shotId: "shot-2",
        order: 2,
        title: "镜头 2",
        action: "add-visual-prompt",
        reason: "Shot needs a visual prompt before automatic production can run.",
        severity: "blocking",
      },
    ]);
  });

  it("blocks executable tasks for shots that fail production preflight", () => {
    const queue = buildProductionRunQueue(
      makeManifest(
        [
          {
            shotId: "shot-1",
            order: 1,
            title: "镜头 1",
            requiredAssets: ["visual", "video"],
            nextActions: ["generate-storyboard-image", "generate-video-clip"],
          },
        ],
        {
          summary: {
            totalShots: 1,
            readyShots: 0,
            reviewShots: 0,
            blockedShots: 1,
            blockingIssues: 1,
            warningIssues: 0,
            averageScore: 55,
          },
          shots: [
            {
              shotId: "shot-1",
              order: 1,
              title: "镜头 1",
              status: "blocked",
              score: 55,
              issues: [
                {
                  code: "missing-character-anchor",
                  severity: "blocking",
                  message: "主角缺少视觉锚点或参考资产，跨镜头一致性风险很高。",
                },
              ],
              requiredActions: ["complete-character-anchor"],
            },
          ],
        },
      ),
    );

    assert.equal(queue.totalTasks, 0);
    assert.equal(queue.status, "completed");
    assert.equal(queue.blockedActions.length, 1);
    assert.equal(queue.blockedActions[0]?.action, "preflight:complete-character-anchor");
    assert.equal(queue.blockedActions[0]?.severity, "blocking");
    assert.match(queue.blockedActions[0]?.reason ?? "", /角色视觉锚点/);
  });

  it("surfaces video provider dry-run issues without blocking earlier executable assets", () => {
    const queue = buildProductionRunQueue(
      makeManifest(
        [
          {
            shotId: "shot-1",
            order: 1,
            title: "镜头 1",
            requiredAssets: ["visual", "video"],
            nextActions: ["generate-storyboard-image", "generate-video-clip"],
          },
        ],
        undefined,
        {
          providerId: "vidu",
          providerName: "Vidu / DashScope",
          model: "viduq3-turbo",
          implementationStatus: "implemented",
          evidenceLevel: "local-implementation",
          summary: {
            totalShots: 1,
            readyShots: 1,
            blockedShots: 0,
            blockingIssues: 0,
            warningIssues: 0,
          },
          shots: [
            {
              shotId: "shot-1",
              order: 1,
              title: "镜头 1",
              ok: true,
              providerId: "vidu",
              providerName: "Vidu / DashScope",
              model: "viduq3-turbo",
              mode: "image-to-video",
              durationSeconds: 5,
              aspectRatio: "16:9",
              resolution: "720p",
              implementationStatus: "implemented",
              evidenceLevel: "local-implementation",
              issues: [
                {
                  code: "missing-image",
                  severity: "info",
                  message: "首帧将由上游分镜图任务生成，视频任务会在同一队列中等待该结果。",
                },
              ],
            },
          ],
        },
      ),
    );

    assert.equal(queue.totalTasks, 2);
    assert.equal(queue.tasks[0]?.action, "generate-storyboard-image");
    assert.equal(queue.tasks[1]?.action, "generate-video-clip");
    assert.equal(queue.videoProviderDryRun?.summary.blockingIssues, 0);
    assert.equal(queue.blockedActions.length, 0);
  });

  it("moves the next queued task through preparing, running, and completed states", () => {
    let queue = buildProductionRunQueue(
      makeManifest([
        {
          shotId: "shot-1",
          order: 1,
          title: "镜头 1",
          requiredAssets: ["visual", "voice"],
          nextActions: ["generate-storyboard-image", "generate-voice-track"],
        },
      ]),
    );

    const firstTask = getNextQueuedTask(queue);
    assert.equal(firstTask?.id, "shot-1:generate-storyboard-image");

    queue = prepareProductionRunTask(queue);
    assert.equal(queue.status, "preparing");
    assert.equal(queue.activeTaskId, "shot-1:generate-storyboard-image");
    assert.equal(queue.tasks[0]?.status, "preparing");

    queue = startProductionRunTask(queue);
    assert.equal(queue.status, "running");
    assert.equal(queue.tasks[0]?.status, "running");

    queue = updateProductionRunTaskProgress(queue, "shot-1:generate-storyboard-image", 0.5);
    assert.equal(queue.tasks[0]?.progress, 0.5);
    assert.equal(queue.progress, 0.25);

    queue = completeProductionRunTask(queue, "shot-1:generate-storyboard-image");
    assert.equal(queue.status, "queued");
    assert.equal(queue.completedTasks, 1);
    assert.equal(queue.progress, 0.5);

    queue = startProductionRunTask(queue, "shot-1:generate-voice-track");
    queue = completeProductionRunTask(queue, "shot-1:generate-voice-track");
    assert.equal(queue.status, "completed");
    assert.equal(queue.completedTasks, 2);
    assert.equal(queue.failedTasks, 0);
    assert.equal(queue.progress, 1);
  });

  it("marks the queue failed when any task fails and preserves the task error", () => {
    let queue = buildProductionRunQueue(
      makeManifest([
        {
          shotId: "shot-1",
          order: 1,
          title: "镜头 1",
          requiredAssets: ["visual"],
          nextActions: ["generate-storyboard-image"],
        },
      ]),
    );

    queue = startProductionRunTask(queue);
    queue = updateProductionRunTaskProgress(queue, "shot-1:generate-storyboard-image", 0.7);
    queue = failProductionRunTask(queue, "shot-1:generate-storyboard-image", "image api timeout");

    assert.equal(queue.status, "failed");
    assert.equal(queue.completedTasks, 0);
    assert.equal(queue.failedTasks, 1);
    assert.equal(queue.progress, 0.7);
    assert.equal(queue.tasks[0]?.status, "failed");
    assert.equal(queue.tasks[0]?.error, "image api timeout");
  });

  it("pauses a running task and resumes it as the next queued task", () => {
    let queue = buildProductionRunQueue(
      makeManifest([
        {
          shotId: "shot-1",
          order: 1,
          title: "镜头 1",
          requiredAssets: ["visual", "video"],
          nextActions: ["generate-storyboard-image", "generate-video-clip"],
        },
      ]),
    );

    queue = startProductionRunTask(queue);
    queue = updateProductionRunTaskProgress(queue, "shot-1:generate-storyboard-image", 0.4);
    queue = pauseProductionRunTask(queue, "shot-1:generate-storyboard-image");

    assert.equal(queue.status, "paused");
    assert.equal(queue.activeTaskId, "shot-1:generate-storyboard-image");
    assert.equal(queue.tasks[0]?.status, "paused");
    assert.equal(queue.tasks[0]?.progress, 0.4);

    queue = resumeProductionRunQueue(queue);

    assert.equal(queue.status, "queued");
    assert.equal(queue.activeTaskId, undefined);
    assert.equal(queue.tasks[0]?.status, "queued");
    assert.equal(queue.tasks[0]?.progress, 0.4);
    assert.equal(getNextQueuedTask(queue)?.id, "shot-1:generate-storyboard-image");
  });

  it("resets a failed task for retry without losing completed work", () => {
    let queue = buildProductionRunQueue(
      makeManifest([
        {
          shotId: "shot-1",
          order: 1,
          title: "镜头 1",
          requiredAssets: ["visual", "voice"],
          nextActions: ["generate-storyboard-image", "generate-voice-track"],
        },
      ]),
    );

    queue = completeProductionRunTask(queue, "shot-1:generate-storyboard-image");
    queue = failProductionRunTask(queue, "shot-1:generate-voice-track", "tts timeout");

    assert.equal(queue.status, "failed");

    queue = retryProductionRunTask(queue, "shot-1:generate-voice-track");

    assert.equal(queue.status, "queued");
    assert.equal(queue.completedTasks, 1);
    assert.equal(queue.failedTasks, 0);
    assert.equal(queue.tasks[0]?.status, "completed");
    assert.equal(queue.tasks[1]?.status, "queued");
    assert.equal(queue.tasks[1]?.error, undefined);
    assert.equal(queue.tasks[1]?.progress, 0);
  });

  it("skips a failed task so the queue can settle or continue remaining work", () => {
    let queue = buildProductionRunQueue(
      makeManifest([
        {
          shotId: "shot-1",
          order: 1,
          title: "镜头 1",
          requiredAssets: ["visual", "video", "voice"],
          nextActions: [
            "generate-storyboard-image",
            "generate-video-clip",
            "generate-voice-track",
          ],
        },
      ]),
    );

    queue = completeProductionRunTask(queue, "shot-1:generate-storyboard-image");
    queue = failProductionRunTask(queue, "shot-1:generate-video-clip", "video timeout");
    queue = skipProductionRunTask(queue, "shot-1:generate-video-clip", "稍后手动补视频");

    assert.equal(queue.status, "queued");
    assert.equal(queue.completedTasks, 1);
    assert.equal(queue.failedTasks, 0);
    assert.equal(queue.skippedTasks, 1);
    assert.equal(queue.tasks[1]?.status, "skipped");
    assert.equal(queue.tasks[1]?.progress, 1);
    assert.equal(queue.tasks[1]?.error, "稍后手动补视频");
    assert.equal(getNextQueuedTask(queue)?.id, "shot-1:generate-voice-track");

    queue = completeProductionRunTask(queue, "shot-1:generate-voice-track");

    assert.equal(queue.status, "completed");
    assert.equal(queue.completedTasks, 2);
    assert.equal(queue.skippedTasks, 1);
    assert.equal(queue.progress, 1);
  });

  it("projects live executor state onto queue totals and status", () => {
    const queue = buildProductionRunQueue(
      makeManifest([
        {
          shotId: "shot-1",
          order: 1,
          title: "镜头 1",
          requiredAssets: ["visual", "voice", "subtitle"],
          nextActions: [
            "generate-storyboard-image",
            "generate-voice-track",
            "create-subtitle-track",
          ],
        },
      ]),
    );

    const projected = projectProductionRunQueueRuntimeState(queue, {
      "shot-1:generate-storyboard-image": { status: "completed" },
      "shot-1:generate-voice-track": { status: "running" },
      "shot-1:create-subtitle-track": { status: "queued" },
    });

    assert.equal(projected.status, "running");
    assert.equal(projected.completedTasks, 1);
    assert.equal(projected.failedTasks, 0);
    assert.equal(projected.activeTaskId, "shot-1:generate-voice-track");
    assert.equal(projected.tasks[0]?.status, "completed");
    assert.equal(projected.tasks[0]?.progress, 1);
    assert.equal(projected.tasks[1]?.status, "running");
    assert.ok(projected.progress > 0.3);
  });

  it("projects live executor failures onto queue failure state", () => {
    const queue = buildProductionRunQueue(
      makeManifest([
        {
          shotId: "shot-1",
          order: 1,
          title: "镜头 1",
          requiredAssets: ["visual", "voice"],
          nextActions: ["generate-storyboard-image", "generate-voice-track"],
        },
      ]),
    );

    const projected = projectProductionRunQueueRuntimeState(queue, {
      "shot-1:generate-storyboard-image": { status: "completed" },
      "shot-1:generate-voice-track": { status: "failed", error: "tts timeout" },
    });

    assert.equal(projected.status, "failed");
    assert.equal(projected.completedTasks, 1);
    assert.equal(projected.failedTasks, 1);
    assert.equal(projected.progress, 0.5);
    assert.equal(projected.tasks[1]?.error, "tts timeout");
  });

  it("returns a completed empty queue when manifest has no executable actions", () => {
    const queue = buildProductionRunQueue(
      makeManifest([
        {
          shotId: "shot-1",
          order: 1,
          title: "镜头 1",
          requiredAssets: [],
          nextActions: ["add-visual-prompt"],
        },
      ]),
    );

    assert.equal(queue.status, "completed");
    assert.equal(queue.totalTasks, 0);
    assert.equal(queue.progress, 1);
    assert.equal(getNextQueuedTask(queue), undefined);
    assert.equal(queue.blockedActions.length, 1);
  });
});
