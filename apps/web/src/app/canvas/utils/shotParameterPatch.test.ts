import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Node } from "@xyflow/react";
import type { CanvasNodeData } from "../components/canvas/types";
import { applyShotParameterPatchToNode } from "./shotParameterPatch.ts";

function createShotNode(): Node<CanvasNodeData> {
  return {
    id: "node-1",
    type: "shot",
    position: { x: 0, y: 0 },
    data: {
      title: "旧标题",
      nodeKind: "shot",
      content: "旧描述",
      duration: "3s",
      timelineDurationSeconds: 3,
      shot: {
        id: "shot-1",
        order: 1,
        title: "旧标题",
        description: "旧描述",
        duration: "3s",
        visualPrompt: "wide shot",
      },
    },
  };
}

describe("applyShotParameterPatchToNode", () => {
  it("syncs edited shot title and description to top-level node fields", () => {
    const node = createShotNode();

    const updated = applyShotParameterPatchToNode(node, {
      title: "新标题",
      description: "新描述",
    });

    assert.equal(updated.data.shot?.title, "新标题");
    assert.equal(updated.data.shot?.description, "新描述");
    assert.equal(updated.data.title, "新标题");
    assert.equal(updated.data.content, "新描述");
  });

  it("syncs edited duration to top-level duration and timeline seconds", () => {
    const node = createShotNode();

    const updated = applyShotParameterPatchToNode(node, {
      duration: "4.5s",
    });

    assert.equal(updated.data.shot?.duration, "4.5s");
    assert.equal(updated.data.duration, "4.5s");
    assert.equal(updated.data.timelineDurationSeconds, 4.5);
  });

  it("leaves timeline duration unchanged when duration text cannot be parsed", () => {
    const node = createShotNode();

    const updated = applyShotParameterPatchToNode(node, {
      duration: "fast",
    });

    assert.equal(updated.data.shot?.duration, "fast");
    assert.equal(updated.data.duration, "fast");
    assert.equal(updated.data.timelineDurationSeconds, 3);
  });
});
