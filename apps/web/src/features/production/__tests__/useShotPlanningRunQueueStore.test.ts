import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import type { Node } from "@xyflow/react";
import type { CanvasNodeData } from "../../../app/canvas/components/canvas/types";
import { useShotPlanningRunQueueStore } from "../useShotPlanningRunQueueStore.ts";
import type { ShotPlanningBoard, ShotPlanningItem } from "../shotPlanningTypes.ts";

function makeItem(id: string, order: number, status: ShotPlanningItem["status"] = "ready"): ShotPlanningItem {
  return {
    id,
    shotId: `shot-${id}`,
    sourceNodeId: `node-${id}`,
    title: `Shot ${order}`,
    order,
    status,
    createdAt: "2026-06-23T00:00:00.000Z",
    updatedAt: "2026-06-23T00:00:00.000Z",
  };
}

function makeBoard(): ShotPlanningBoard {
  return {
    id: "board-1",
    projectId: "project-1",
    title: "Planning Board",
    items: [makeItem("a", 1), makeItem("b", 2)],
    createdAt: "2026-06-23T00:00:00.000Z",
    updatedAt: "2026-06-23T00:00:00.000Z",
  };
}

function makeSourceNode(): Pick<Node<CanvasNodeData>, "id" | "data"> {
  return {
    id: "shot-a",
    data: {
      nodeKind: "shot",
      title: "Shot 1",
      shot: {
        id: "shot-a",
        order: 1,
        title: "Shot 1",
        description: "desc",
        visualPrompt: "visual prompt",
        dialogue: "dialogue",
        sourceStoryboardNodeId: "storyboard-1",
      },
    } as CanvasNodeData,
  };
}

describe("useShotPlanningRunQueueStore", () => {
  beforeEach(() => {
    useShotPlanningRunQueueStore.getState().clear();
  });

  it("resets a failed planning queue task for retry", () => {
    const store = useShotPlanningRunQueueStore.getState();
    store.buildFromBoard(makeBoard(), "project-1");
    const taskId = "shot-a:generate-storyboard-image";

    store.markTaskFailed(taskId, "image timeout");
    assert.equal(useShotPlanningRunQueueStore.getState().queue?.status, "failed");

    useShotPlanningRunQueueStore.getState().retryTask(taskId);

    const queue = useShotPlanningRunQueueStore.getState().queue;
    assert.equal(queue?.status, "queued");
    assert.equal(queue?.failedTasks, 0);
    assert.equal(queue?.tasks[0]?.status, "queued");
    assert.equal(queue?.tasks[0]?.error, undefined);
  });

  it("skips a failed planning queue task and keeps remaining work queued", () => {
    const store = useShotPlanningRunQueueStore.getState();
    store.buildFromBoard(makeBoard(), "project-1");
    const taskId = "shot-a:generate-storyboard-image";

    store.markTaskFailed(taskId, "image timeout");
    useShotPlanningRunQueueStore.getState().skipTask(taskId, "manual replacement");

    const queue = useShotPlanningRunQueueStore.getState().queue;
    assert.equal(queue?.status, "queued");
    assert.equal(queue?.failedTasks, 0);
    assert.equal(queue?.skippedTasks, 1);
    assert.equal(queue?.tasks[0]?.status, "skipped");
    assert.equal(queue?.tasks[0]?.error, "manual replacement");
    assert.equal(queue?.tasks[1]?.status, "queued");
  });

  it("reports actual generated task count when source shots expand to full chain", () => {
    const store = useShotPlanningRunQueueStore.getState();
    store.buildFromBoard(
      {
        ...makeBoard(),
        items: [makeItem("a", 1)],
      },
      "project-1",
      [makeSourceNode()],
    );

    const state = useShotPlanningRunQueueStore.getState();
    assert.equal(state.queue?.tasks.length, 5);
    assert.equal(state.lastMessage, "Created 5 queue tasks");
  });
});
