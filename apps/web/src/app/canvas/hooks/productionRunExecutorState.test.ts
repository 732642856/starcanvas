import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { ProductionRunQueueTask } from "../../../lib/storyboard/productionRunQueue.ts";
import {
  buildInitialProductionRunExecState,
  selectRunnableProductionRunTasks,
} from "./productionRunExecutorState.ts";

function makeTask(
  id: string,
  status: ProductionRunQueueTask["status"] = "queued",
): ProductionRunQueueTask {
  return {
    id,
    shotId: id.split(":")[0] ?? id,
    order: 1,
    title: id,
    action: "generate-storyboard-image",
    status,
    progress: status === "completed" || status === "skipped" ? 1 : 0,
  };
}

describe("productionRunExecutorState", () => {
  it("preserves completed and skipped runtime tasks when a queue run restarts", () => {
    const tasks = [
      makeTask("shot-1:generate-storyboard-image"),
      makeTask("shot-1:generate-video-clip"),
      makeTask("shot-1:generate-voice-track"),
    ];

    const state = buildInitialProductionRunExecState(tasks, {
      "shot-1:generate-storyboard-image": { status: "completed" },
      "shot-1:generate-video-clip": { status: "skipped", error: "manual replacement" },
      "shot-1:generate-voice-track": { status: "failed", error: "tts timeout" },
    });

    assert.deepEqual(state, {
      "shot-1:generate-storyboard-image": { status: "completed", error: undefined },
      "shot-1:generate-video-clip": { status: "skipped", error: "manual replacement" },
      "shot-1:generate-voice-track": { status: "queued", error: undefined },
    });
  });

  it("resumes paused runtime tasks as queued work", () => {
    const tasks = [makeTask("shot-1:generate-storyboard-image")];

    const state = buildInitialProductionRunExecState(tasks, {
      "shot-1:generate-storyboard-image": { status: "paused" },
    });

    assert.deepEqual(state, {
      "shot-1:generate-storyboard-image": { status: "queued", error: undefined },
    });
  });

  it("selects only unfinished runnable work", () => {
    const tasks = [
      makeTask("shot-1:generate-storyboard-image"),
      makeTask("shot-1:generate-video-clip"),
      makeTask("shot-1:generate-voice-track"),
      makeTask("shot-1:create-subtitle-track", "completed"),
    ];

    const runnable = selectRunnableProductionRunTasks(tasks, {
      "shot-1:generate-storyboard-image": { status: "completed" },
      "shot-1:generate-video-clip": { status: "skipped" },
      "shot-1:generate-voice-track": { status: "queued" },
      "shot-1:create-subtitle-track": { status: "completed" },
    });

    assert.deepEqual(
      runnable.map((task) => task.id),
      ["shot-1:generate-voice-track"],
    );
  });
});
