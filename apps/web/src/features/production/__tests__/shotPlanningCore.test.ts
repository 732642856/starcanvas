import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createShotPlanningBoardFromStoryboard,
  updateShotPlanningItemStatus,
  updateShotPlanningItemNotes,
  getShotPlanningSummary,
} from "../shotPlanningCore.ts";
import type {
  ShotPlanningBoard,
  ShotPlanningItem,
  CreateShotPlanningBoardInput,
} from "../shotPlanningTypes.ts";

const NODES_3 = [
  {
    id: "node-a",
    title: "Opening Wide Shot",
    description: "Establish the city skyline at dusk",
    shotPresetId: "preset-wide",
    stylePresetId: "style-noir",
    durationSec: 5,
  },
  {
    id: "node-b",
    title: "  Close Reaction  ",
    description: "Protagonist's face, slow zoom",
    shotPresetId: "preset-closeup",
    durationSec: 3,
  },
  {
    id: "node-c",
    title: "",
    description: "",
    durationSec: 0,
  },
];

function makeBoard(
  overrides?: Partial<CreateShotPlanningBoardInput>,
): ShotPlanningBoard {
  return createShotPlanningBoardFromStoryboard({
    projectId: "proj-test",
    projectTitle: "Test Project",
    nodes: NODES_3,
    now: new Date("2026-06-17T00:00:00Z"),
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// createShotPlanningBoardFromStoryboard
// ---------------------------------------------------------------------------
describe("createShotPlanningBoardFromStoryboard", () => {
  it("generates empty board when storyboard has no nodes", () => {
    const board = createShotPlanningBoardFromStoryboard({
      projectId: "proj-empty",
      nodes: [],
      now: new Date("2026-06-17T00:00:00Z"),
    });
    assert.equal(board.projectId, "proj-empty");
    assert.equal(board.items.length, 0);
    assert.equal(board.title, "Shot Plan");
    assert.equal(board.createdAt, "2026-06-17T00:00:00.000Z");
  });

  it("generates 3 planning items from 3 storyboard nodes", () => {
    const board = makeBoard();
    assert.equal(board.items.length, 3);
    assert.equal(board.title, "Test Project · Shot Plan");
  });

  it("preserves node fields: description, shotPresetId, stylePresetId, durationSec", () => {
    const board = makeBoard();
    const first = board.items[0];
    assert.equal(first.description, "Establish the city skyline at dusk");
    assert.equal(first.shotPresetId, "preset-wide");
    assert.equal(first.stylePresetId, "style-noir");
    assert.equal(first.durationSec, 5);
  });

  it("preserves reference-video source fields", () => {
    const board = makeBoard({
      nodes: [
        {
          id: "node-ref",
          title: "Reference Shot",
          sourceType: "reference-video",
          sourceTimeSec: 12.5,
          referenceImageUrl: "data:image/jpeg;base64,frame",
        },
      ],
    });

    assert.equal(board.items[0].sourceType, "reference-video");
    assert.equal(board.items[0].sourceTimeSec, 12.5);
    assert.equal(board.items[0].referenceImageUrl, "data:image/jpeg;base64,frame");
  });

  it("trims title whitespace", () => {
    const board = makeBoard();
    const second = board.items[1];
    assert.equal(second.title, "Close Reaction");
  });

  it("falls back to 'Shot 1' / 'Shot 2' when title is empty/whitespace", () => {
    const board = makeBoard();
    const third = board.items[2];
    assert.equal(third.title, "Shot 3");
  });

  it("sets correct order for each item", () => {
    const board = makeBoard();
    assert.equal(board.items[0].order, 0);
    assert.equal(board.items[1].order, 1);
    assert.equal(board.items[2].order, 2);
  });

  it("all new items start with status 'todo'", () => {
    const board = makeBoard();
    for (const item of board.items) {
      assert.equal(item.status, "todo");
    }
  });

  it("generates deterministic id based on projectId", () => {
    const board = makeBoard();
    assert.equal(board.id, "plan-board-proj-test");
    assert.equal(board.items[0].id, "plan-item-node-a");
  });

  it("uses custom now timestamp", () => {
    const board = makeBoard({
      now: new Date("2026-01-01T12:00:00Z"),
    });
    assert.equal(board.createdAt, "2026-01-01T12:00:00.000Z");
    assert.equal(board.updatedAt, "2026-01-01T12:00:00.000Z");
    for (const item of board.items) {
      assert.equal(item.createdAt, "2026-01-01T12:00:00.000Z");
    }
  });
});

// ---------------------------------------------------------------------------
// updateShotPlanningItemStatus
// ---------------------------------------------------------------------------
describe("updateShotPlanningItemStatus", () => {
  it("updates only the target item status (immutable)", () => {
    const board = makeBoard();
    const now = new Date("2026-06-18T00:00:00Z");
    const updated = updateShotPlanningItemStatus(
      board,
      board.items[0].id,
      "ready",
      now,
    );

    // Target item changed
    assert.equal(updated.items[0].status, "ready");
    // Other items unchanged
    assert.equal(updated.items[1].status, "todo");
    assert.equal(updated.items[2].status, "todo");
    // Original board not mutated
    assert.equal(board.items[0].status, "todo");
    // updatedAt bumped
    assert.equal(updated.updatedAt, "2026-06-18T00:00:00.000Z");
    assert.equal(updated.items[0].updatedAt, "2026-06-18T00:00:00.000Z");
  });

  it("supports all 5 status transitions", () => {
    const board = makeBoard();
    const id = board.items[0].id;
    const statuses = ["todo", "ready", "shooting", "done", "blocked"] as const;
    for (const s of statuses) {
      const updated = updateShotPlanningItemStatus(board, id, s);
      assert.equal(updated.items[0].status, s);
    }
  });

  it("leaves board unchanged when itemId not found", () => {
    const board = makeBoard();
    const updated = updateShotPlanningItemStatus(
      board,
      "nonexistent",
      "done",
    );
    assert.deepEqual(updated.items, board.items);
    assert.equal(updated.updatedAt > board.updatedAt, true); // updatedAt still bumped
  });
});

// ---------------------------------------------------------------------------
// updateShotPlanningItemNotes
// ---------------------------------------------------------------------------
describe("updateShotPlanningItemNotes", () => {
  it("updates notes of the target item", () => {
    const board = makeBoard();
    const now = new Date("2026-06-18T00:00:00Z");
    const updated = updateShotPlanningItemNotes(
      board,
      board.items[0].id,
      "Need better lighting reference",
      now,
    );

    assert.equal(updated.items[0].notes, "Need better lighting reference");
    assert.equal(updated.items[1].notes, "");
    assert.equal(board.items[0].notes, ""); // immutable
    assert.equal(updated.items[0].updatedAt, "2026-06-18T00:00:00.000Z");
  });

  it("leaves board unchanged when itemId not found", () => {
    const board = makeBoard();
    const updated = updateShotPlanningItemNotes(
      board,
      "nonexistent",
      "notes",
    );
    assert.deepEqual(updated.items, board.items);
  });
});

// ---------------------------------------------------------------------------
// getShotPlanningSummary
// ---------------------------------------------------------------------------
describe("getShotPlanningSummary", () => {
  it("counts all zero for empty board", () => {
    const board = makeBoard({ nodes: [] });
    const summary = getShotPlanningSummary(board);
    assert.equal(summary.total, 0);
    assert.equal(summary.todo, 0);
    assert.equal(summary.ready, 0);
    assert.equal(summary.shooting, 0);
    assert.equal(summary.done, 0);
    assert.equal(summary.blocked, 0);
    assert.equal(summary.totalDurationSec, 0);
    assert.equal(summary.progress, 0);
  });

  it("counts correctly with mixed statuses", () => {
    const board = makeBoard();
    let b = board;
    b = updateShotPlanningItemStatus(b, b.items[0].id, "done");
    b = updateShotPlanningItemStatus(b, b.items[1].id, "ready");
    b = updateShotPlanningItemStatus(b, b.items[2].id, "blocked");

    const s = getShotPlanningSummary(b);
    assert.equal(s.total, 3);
    assert.equal(s.done, 1);
    assert.equal(s.ready, 1);
    assert.equal(s.blocked, 1);
    assert.equal(s.todo, 0);
    assert.equal(s.shooting, 0);
    assert.equal(s.progress, 33); // 1/3 = 33%
  });

  it("calculates totalDurationSec correctly", () => {
    const board = makeBoard();
    // durations: 5 + 3 + 0 = 8
    const s = getShotPlanningSummary(board);
    assert.equal(s.totalDurationSec, 8);
  });

  it("progress is 100 when all done", () => {
    let b = makeBoard();
    for (const item of b.items) {
      b = updateShotPlanningItemStatus(b, item.id, "done");
    }
    const s = getShotPlanningSummary(b);
    assert.equal(s.progress, 100);
  });

  it("progress rounds to integer", () => {
    let b = makeBoard();
    // 1 out of 3 done = 33%
    b = updateShotPlanningItemStatus(b, b.items[0].id, "done");
    const s = getShotPlanningSummary(b);
    assert.equal(s.progress, 33);
  });
});
