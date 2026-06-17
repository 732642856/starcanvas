import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createShotPlanningBoardFromStoryboard,
  updateShotPlanningItemStatus,
} from "../shotPlanningCore.ts";
import { exportShotPlanningBoardToMarkdown } from "../shotPlanningExport.ts";

function makeBoardWithStatuses(
  statuses: Array<"todo" | "ready" | "shooting" | "done" | "blocked">,
) {
  let board = createShotPlanningBoardFromStoryboard({
    projectId: "proj-export",
    projectTitle: "Export Test",
    nodes: statuses.map((_, i) => ({
      id: `node-${i}`,
      title: `Shot ${i + 1}`,
      description: i === 0 ? "First shot description" : undefined,
      shotPresetId: i === 0 ? "preset-wide" : undefined,
      stylePresetId: i === 1 ? "style-noir" : undefined,
      durationSec: i === 0 ? 5 : i === 1 ? 3 : undefined,
    })),
    now: new Date("2026-06-17T00:00:00Z"),
  });

  for (let i = 0; i < statuses.length; i++) {
    board = updateShotPlanningItemStatus(board, board.items[i].id, statuses[i]);
  }
  return board;
}

describe("exportShotPlanningBoardToMarkdown", () => {
  it("exports empty board with header and zero stats", () => {
    const board = createShotPlanningBoardFromStoryboard({
      projectId: "proj-empty",
      nodes: [],
      now: new Date("2026-06-17T00:00:00Z"),
    });
    const md = exportShotPlanningBoardToMarkdown(board);

    assert.ok(md.includes("# Shot Plan"));
    assert.ok(md.includes("| Total Shots | 0 |"));
    assert.ok(md.includes("| Progress | 0% |"));
    assert.ok(md.includes("## Shot List"));
  });

  it("includes title with project name", () => {
    const board = makeBoardWithStatuses([]);
    const md = exportShotPlanningBoardToMarkdown(board);
    assert.ok(md.includes("# Export Test · Shot Plan"));
  });

  it("includes all summary metrics in Markdown table", () => {
    const board = makeBoardWithStatuses(["done", "ready", "blocked"]);
    const md = exportShotPlanningBoardToMarkdown(board);

    assert.ok(md.includes("| Total Shots | 3 |"));
    assert.ok(md.includes("| Todo | 0 |"));
    assert.ok(md.includes("| Ready | 1 |"));
    assert.ok(md.includes("| Shooting | 0 |"));
    assert.ok(md.includes("| Done | 1 |"));
    assert.ok(md.includes("| Blocked | 1 |"));
    assert.ok(md.includes("| Total Duration | 8s |"));
    assert.ok(md.includes("| Progress | 33% |"));
  });

  it("includes all shot items with title, status, sourceNodeId, duration", () => {
    const board = makeBoardWithStatuses(["done", "ready", "todo"]);
    const md = exportShotPlanningBoardToMarkdown(board);

    // All 3 shots present with numbering
    assert.ok(md.includes("### 1. Shot 1"));
    assert.ok(md.includes("### 2. Shot 2"));
    assert.ok(md.includes("### 3. Shot 3"));

    // Status labels with emoji
    assert.ok(md.includes("✔️ Done"));
    assert.ok(md.includes("✅ Ready"));
    assert.ok(md.includes("📋 Todo"));

    // Source node IDs (sourceNodeId is the original node.id, not the planning item id)
    assert.ok(md.includes("`node-0`"));
    assert.ok(md.includes("`node-1`"));
    assert.ok(md.includes("`node-2`"));

    // Durations
    assert.ok(md.includes("- **Duration**: 5s"));
    assert.ok(md.includes("- **Duration**: 3s"));
  });

  it("includes optional fields: description, shotPresetId, stylePresetId", () => {
    // Need 2 shots: Shot 1 has description + shotPresetId, Shot 2 has stylePresetId
    const board = makeBoardWithStatuses(["done", "todo"]);
    const md = exportShotPlanningBoardToMarkdown(board);

    assert.ok(md.includes("- **Description**: First shot description"));
    assert.ok(md.includes("- **Shot Preset**: `preset-wide`"));
    assert.ok(md.includes("- **Style Preset**: `style-noir`"));
  });

  it("does not include absent optional fields", () => {
    const board = makeBoardWithStatuses(["todo", "ready", "done"]);
    const md = exportShotPlanningBoardToMarkdown(board);

    // Shot 3 has no duration/description/preset
    const shot3Section = md.split("### 3.")[1];
    assert.ok(!shot3Section.includes("Duration"));
    assert.ok(!shot3Section.includes("Description"));
    assert.ok(!shot3Section.includes("Shot Preset"));
  });

  it("includes notes when present", () => {
    let board = makeBoardWithStatuses(["todo"]);
    // Set notes on first item
    board = {
      ...board,
      items: board.items.map((item) =>
        item.id === board.items[0].id
          ? { ...item, notes: "Needs sunset lighting" }
          : item,
      ),
    };
    const md = exportShotPlanningBoardToMarkdown(board);
    assert.ok(md.includes("- **Notes**: Needs sunset lighting"));
  });

  it("sorts items by order field", () => {
    let board = makeBoardWithStatuses(["todo", "ready", "done"]);
    // Manually reverse orders to verify export sorts correctly
    board = {
      ...board,
      items: board.items.map((item, i) => ({
        ...item,
        order: 2 - i,
      })),
    };
    const md = exportShotPlanningBoardToMarkdown(board);

    // After sorting by order: order 0 (Shot 3) first, order 1 (Shot 2), order 2 (Shot 1)
    const idx1 = md.indexOf("### 1");
    const idx2 = md.indexOf("### 2", idx1 + 1);
    const idx3 = md.indexOf("### 3", idx2 + 1);

    const block1 = md.slice(idx1, idx2);
    const block2 = md.slice(idx2, idx3);
    const block3 = md.slice(idx3);

    assert.ok(block1.includes("Shot 3")); // order 0 → first
    assert.ok(block2.includes("Shot 2")); // order 1 → second
    assert.ok(block3.includes("Shot 1")); // order 2 → third
  });

  it("includes projectId in header table", () => {
    const board = makeBoardWithStatuses([]);
    const md = exportShotPlanningBoardToMarkdown(board);
    assert.ok(md.includes("| Project | proj-export |"));
  });
});
