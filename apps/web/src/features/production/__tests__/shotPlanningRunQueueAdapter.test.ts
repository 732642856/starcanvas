/**
 * Tests for shotPlanningRunQueueAdapter.ts
 *
 * Run: node --experimental-strip-types --test apps/web/src/features/production/__tests__/shotPlanningRunQueueAdapter.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Node } from "@xyflow/react";
import type { CanvasNodeData } from "../../../app/canvas/components/canvas/types";
import {
  createRunQueueTasksFromReadyShots,
  createProductionRunQueueFromReadyShots,
} from "../shotPlanningRunQueueAdapter.ts";
import type { ShotPlanningBoard, ShotPlanningItem, ShotPlanningStatus } from "../shotPlanningTypes.ts";

// ============================================================================
// Helpers
// ============================================================================

function makeItem(
  overrides: Partial<ShotPlanningItem> & { id: string; order: number },
): ShotPlanningItem {
  return {
    shotId: overrides.shotId ?? `node-${overrides.id}`,
    sourceNodeId: overrides.sourceNodeId ?? `node-${overrides.id}`,
    title: overrides.title ?? `Shot ${overrides.order}`,
    description: overrides.description,
    shotPresetId: overrides.shotPresetId,
    stylePresetId: overrides.stylePresetId,
    durationSec: overrides.durationSec,
    status: overrides.status ?? "ready",
    notes: overrides.notes,
    createdAt: overrides.createdAt ?? "2026-06-17T00:00:00Z",
    updatedAt: overrides.updatedAt ?? "2026-06-17T00:00:00Z",
    ...overrides,
  } satisfies ShotPlanningItem;
}

function makeBoard(
  overrides: Partial<ShotPlanningBoard> & { items: ShotPlanningItem[] },
): ShotPlanningBoard {
  return {
    id: overrides.id ?? "board-1",
    projectId: overrides.projectId ?? "project-1",
    title: overrides.title ?? "Test Board",
    createdAt: overrides.createdAt ?? "2026-06-17T00:00:00Z",
    updatedAt: overrides.updatedAt ?? "2026-06-17T00:00:00Z",
    ...overrides,
  } satisfies ShotPlanningBoard;
}

function makeSourceNode(
  order: number,
  overrides: Partial<NonNullable<CanvasNodeData["shot"]>> = {},
): Pick<Node<CanvasNodeData>, "id" | "data"> {
  return {
    id: `node-shot-${order}`,
    data: {
      nodeKind: "shot",
      title: `Shot ${order}`,
      shot: {
        id: `node-shot-${order}`,
        order,
        title: `Shot ${order}`,
        description: `Shot ${order} desc`,
        visualPrompt: `visual prompt ${order}`,
        dialogue: `dialogue ${order}`,
        sourceStoryboardNodeId: "storyboard-1",
        ...overrides,
      },
    } as CanvasNodeData,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe("createRunQueueTasksFromReadyShots", () => {
  it("maps only ready shots (excludes todo/done/shooting/blocked)", () => {
    const board = makeBoard({
      items: [
        makeItem({ id: "a", order: 1, status: "ready" }),
        makeItem({ id: "b", order: 2, status: "todo" }),
        makeItem({ id: "c", order: 3, status: "ready" }),
        makeItem({ id: "d", order: 4, status: "done" }),
        makeItem({ id: "e", order: 5, status: "shooting" }),
        makeItem({ id: "f", order: 6, status: "blocked" }),
      ],
    });

    const tasks = createRunQueueTasksFromReadyShots({ board, projectId: "p1" });

    assert.equal(tasks.length, 2);
    assert.equal(tasks[0]!.title, "Shot 1");
    assert.equal(tasks[1]!.title, "Shot 3");
  });

  it("preserves board order", () => {
    const board = makeBoard({
      items: [
        makeItem({ id: "z", order: 99, status: "ready" }),
        makeItem({ id: "a", order: 1, status: "ready" }),
        makeItem({ id: "m", order: 50, status: "ready" }),
      ],
    });

    const tasks = createRunQueueTasksFromReadyShots({ board, projectId: "p1" });

    assert.deepEqual(
      tasks.map((t) => t.order),
      [1, 50, 99],
    );
  });

  it("includes shot/project identifiers and canonical shotId", () => {
    const board = makeBoard({
      items: [makeItem({ id: "plan-item-1", order: 1, shotId: "node-abc", sourceNodeId: "node-abc", title: "Hero Shot" })],
    });

    const tasks = createRunQueueTasksFromReadyShots({ board, projectId: "p1" });

    assert.equal(tasks.length, 1);
    assert.equal(tasks[0]!.shotId, "node-abc");
    assert.equal(tasks[0]!.title, "Hero Shot");
    // task.id now built from canonical shotId
    assert.match(tasks[0]!.id, /^node-abc:generate-storyboard-image$/);
  });

  it("expands matched shot source nodes into full production actions", () => {
    const board = makeBoard({
      items: [makeItem({ id: "a", order: 1, shotId: "node-shot-1", sourceNodeId: "node-shot-1" })],
    });

    const tasks = createRunQueueTasksFromReadyShots({
      board,
      projectId: "p1",
      sourceNodes: [makeSourceNode(1)],
    });

    assert.deepEqual(
      tasks.map((task) => task.action),
      [
        "generate-storyboard-image",
        "generate-video-clip",
        "generate-voice-track",
      "create-subtitle-track",
      "review-handoff-warnings",
      ],
    );
  });

  it("returns empty array when no ready shots", () => {
    const board = makeBoard({
      items: [
        makeItem({ id: "a", order: 1, status: "todo" }),
        makeItem({ id: "b", order: 2, status: "done" }),
        makeItem({ id: "c", order: 3, status: "blocked" }),
      ],
    });

    const tasks = createRunQueueTasksFromReadyShots({ board, projectId: "p1" });

    assert.equal(tasks.length, 0);
  });

  it("returns empty array for empty board", () => {
    const board = makeBoard({ items: [] });
    const tasks = createRunQueueTasksFromReadyShots({ board, projectId: "p1" });
    assert.equal(tasks.length, 0);
  });

  it("all tasks have default action and queued status", () => {
    const board = makeBoard({
      items: [
        makeItem({ id: "a", order: 1, status: "ready" }),
        makeItem({ id: "b", order: 2, status: "ready" }),
      ],
    });

    const tasks = createRunQueueTasksFromReadyShots({ board, projectId: "p1" });

    for (const task of tasks) {
      assert.equal(task.action, "generate-storyboard-image");
      assert.equal(task.status, "queued");
      assert.equal(task.progress, 0);
    }
  });
});

describe("createProductionRunQueueFromReadyShots", () => {
  it("returns null when no ready shots", () => {
    const board = makeBoard({
      items: [makeItem({ id: "a", order: 1, status: "todo" })],
    });

    const queue = createProductionRunQueueFromReadyShots({ board, projectId: "p1" });
    assert.equal(queue, null);
  });

  it("returns a full queue with correct jobId", () => {
    const board = makeBoard({
      id: "board-42",
      items: [
        makeItem({ id: "a", order: 1, status: "ready" }),
        makeItem({ id: "b", order: 2, status: "ready" }),
      ],
    });

    const queue = createProductionRunQueueFromReadyShots({ board, projectId: "p1" });
    assert.notEqual(queue, null);
    assert.equal(queue!.jobId, "shot-planning:board-42");
    assert.equal(queue!.status, "queued");
    assert.equal(queue!.totalTasks, 2);
    assert.equal(queue!.completedTasks, 0);
    assert.equal(queue!.failedTasks, 0);
    assert.equal(queue!.progress, 0);
    assert.equal(queue!.tasks.length, 2);
    assert.equal(queue!.blockedActions.length, 0);
  });

  it("keeps blocked actions when a ready shot lacks visual prompt", () => {
    const board = makeBoard({
      items: [makeItem({ id: "a", order: 1, shotId: "node-shot-1", sourceNodeId: "node-shot-1" })],
    });

    const queue = createProductionRunQueueFromReadyShots({
      board,
      projectId: "p1",
      sourceNodes: [makeSourceNode(1, { visualPrompt: "" })],
    });

    assert.ok(queue);
    assert.equal(queue.tasks.length, 0);
    assert.ok(queue.blockedActions.length > 0);
    assert.ok(queue.blockedActions.some((action) => action.action === "preflight:strengthen-visual-prompt"));
  });

  it("returns null for null board items", () => {
    const board = makeBoard({ items: [] });
    const queue = createProductionRunQueueFromReadyShots({ board, projectId: "p1" });
    assert.equal(queue, null);
  });
});
