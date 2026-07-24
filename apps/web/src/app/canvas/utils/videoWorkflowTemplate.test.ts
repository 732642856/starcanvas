import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildVideoWorkflowTemplate } from "./videoWorkflowTemplate.ts";

function createIdGenerator() {
  let index = 0;
  return () => `id-${++index}`;
}

describe("buildVideoWorkflowTemplate", () => {
  it("creates the full video workflow template without replacing existing canvas state", () => {
    const result = buildVideoWorkflowTemplate({
      basePosition: { x: 100, y: 200 },
      generateId: createIdGenerator(),
      edgeStyle: { stroke: "#999", strokeWidth: 2 },
    });

    assert.equal(result.nodes.length, 10);
    assert.equal(result.edges.length, 11);
    assert.equal(result.nodes[0].type, "content");
    assert.equal(result.nodes[0].data.title, "前期目标");
    assert.equal(result.nodes[0].position.x, 100);
    assert.equal(result.nodes[0].position.y, 360);
    assert.equal(result.nodes[9].data.nodeKind, "video-result");
  });

  it("connects the template nodes in the expected handoff chain", () => {
    const result = buildVideoWorkflowTemplate({
      basePosition: { x: 0, y: 0 },
      generateId: createIdGenerator(),
    });

    const nodeIdByKind = new Map(result.nodes.map((node) => [node.data.nodeKind, node.id]));
    const edgePairs = new Set(result.edges.map((edge) => `${edge.source}->${edge.target}`));

    assert.equal(
      edgePairs.has(`${nodeIdByKind.get("text")}->${nodeIdByKind.get("script")}`),
      true,
    );
    assert.equal(
      edgePairs.has(`${nodeIdByKind.get("script")}->${nodeIdByKind.get("storyboard")}`),
      true,
    );
    assert.equal(
      edgePairs.has(`${nodeIdByKind.get("image-result")}->${nodeIdByKind.get("video-generation")}`),
      true,
    );
    assert.equal(
      edgePairs.has(`${nodeIdByKind.get("composition")}->${nodeIdByKind.get("video-result")}`),
      true,
    );
  });

  it("creates the 3x3 grid storyboard workflow variant", () => {
    const result = buildVideoWorkflowTemplate({
      basePosition: { x: 10, y: 20 },
      generateId: createIdGenerator(),
      template: "grid_storyboard_video",
    });

    assert.equal(result.nodes.length, 7);
    assert.equal(result.edges.length, 6);
    assert.equal(result.nodes[2].data.title, "3×3 分镜网格生成");
    assert.equal(result.nodes[4].data.title, "网格动效生成");
    assert.equal(result.nodes[6].data.nodeKind, "video-result");
  });

  it("creates the character turnaround workflow variant", () => {
    const result = buildVideoWorkflowTemplate({
      basePosition: { x: 0, y: 0 },
      generateId: createIdGenerator(),
      template: "character_turnaround_video",
    });

    const titleByKind = result.nodes.map((node) => node.data.title);
    const nodeIdByTitle = new Map(result.nodes.map((node) => [node.data.title, node.id]));
    const edgePairs = new Set(result.edges.map((edge) => `${edge.source}->${edge.target}`));

    assert.equal(result.nodes.length, 8);
    assert.equal(result.edges.length, 8);
    assert.deepEqual(
      titleByKind.slice(1, 6),
      ["角色三视图设定表", "三视图参考图", "动作首帧生成", "动作首帧结果", "角色自然转身动画"],
    );
    assert.equal(
      edgePairs.has(`${nodeIdByTitle.get("三视图参考图")}->${nodeIdByTitle.get("角色自然转身动画")}`),
      true,
    );
  });
});
