// ============================================================================
// quickAddNodeOptions 单元测试
// ============================================================================
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { QUICK_ADD_NODE_OPTIONS, type QuickAddNodeOption } from "./quickAddNodeOptions.ts";

// ── 过滤辅助函数（与 QuickAddNodeSearch 相同的过滤逻辑） ──
function filterOptions(
  options: QuickAddNodeOption[],
  query: string,
): QuickAddNodeOption[] {
  if (!query.trim()) return options;
  const q = query.trim().toLowerCase();
  return options.filter(
    (opt) =>
      opt.label.toLowerCase().includes(q) ||
      opt.description.toLowerCase().includes(q) ||
      opt.keywords.some((kw) => kw.toLowerCase().includes(q)),
  );
}

describe("QUICK_ADD_NODE_OPTIONS", () => {
  it("contains all expected node types", () => {
    const ids = QUICK_ADD_NODE_OPTIONS.map((o) => o.id);
    assert.ok(ids.includes("content-text"));
    assert.ok(ids.includes("content-storyboard"));
    assert.ok(ids.includes("image"));
    assert.ok(ids.includes("sketch"));
    assert.ok(ids.includes("agent"));
    assert.ok(ids.includes("workflow-script"));
    assert.ok(ids.includes("workflow-image-gen"));
    assert.ok(ids.includes("workflow-video-gen"));
    assert.ok(ids.includes("workflow-audio"));
    assert.ok(ids.includes("workflow-tts"));
    assert.ok(ids.includes("workflow-composition"));
    assert.ok(ids.includes("workflow-subtitle"));
  });

  it("every option has required fields", () => {
    for (const opt of QUICK_ADD_NODE_OPTIONS) {
      assert.ok(opt.id, `option ${opt.id} missing id`);
      assert.ok(opt.label, `option ${opt.id} missing label`);
      assert.ok(opt.description, `option ${opt.id} missing description`);
      assert.ok(Array.isArray(opt.keywords), `option ${opt.id} keywords not array`);
      assert.ok(opt.keywords.length > 0, `option ${opt.id} has no keywords`);
      assert.ok(opt.nodeType, `option ${opt.id} missing nodeType`);
    }
  });

  it("has no duplicate ids", () => {
    const ids = QUICK_ADD_NODE_OPTIONS.map((o) => o.id);
    const uniqueIds = new Set(ids);
    assert.equal(uniqueIds.size, ids.length);
  });

  it("content nodes have nodeKind set", () => {
    const contentNodes = QUICK_ADD_NODE_OPTIONS.filter(
      (o) => o.nodeType === "content",
    );
    assert.ok(contentNodes.length > 0, "should have content nodes");
    for (const opt of contentNodes) {
      assert.ok(opt.nodeKind, `content node ${opt.id} missing nodeKind`);
    }
  });
});

describe("filterOptions", () => {
  it("returns all options for empty query", () => {
    const result = filterOptions(QUICK_ADD_NODE_OPTIONS, "");
    assert.equal(result.length, QUICK_ADD_NODE_OPTIONS.length);
  });

  it("returns all options for whitespace-only query", () => {
    const result = filterOptions(QUICK_ADD_NODE_OPTIONS, "   ");
    assert.equal(result.length, QUICK_ADD_NODE_OPTIONS.length);
  });

  it("matches by label (case-insensitive)", () => {
    // "写作文本" 是 content-text 独有的 label
    const result = filterOptions(QUICK_ADD_NODE_OPTIONS, "写作文本");
    assert.equal(result.length, 1);
    assert.equal(result[0].id, "content-text");
  });

  it("matches multiple nodes with shared keyword", () => {
    // "图片" 匹配 image 节点和 workflow-image-gen 节点（keywords 含 "图片生成"）
    const result = filterOptions(QUICK_ADD_NODE_OPTIONS, "图片");
    assert.equal(result.length, 2);
    const ids = result.map((o) => o.id);
    assert.ok(ids.includes("image"));
    assert.ok(ids.includes("workflow-image-gen"));
  });

  it("matches by Chinese keyword", () => {
    const result = filterOptions(QUICK_ADD_NODE_OPTIONS, "分镜");
    const ids = result.map((o) => o.id);
    assert.ok(ids.includes("content-storyboard"));
  });

  it("matches by English keyword", () => {
    const result = filterOptions(QUICK_ADD_NODE_OPTIONS, "sketch");
    const ids = result.map((o) => o.id);
    assert.ok(ids.includes("sketch"));
  });

  it("matches by description", () => {
    const result = filterOptions(QUICK_ADD_NODE_OPTIONS, "自由书写");
    assert.equal(result.length, 1);
    assert.equal(result[0].id, "content-text");
  });

  it("matches partial keyword substring", () => {
    const result = filterOptions(QUICK_ADD_NODE_OPTIONS, "生成");
    // 应匹配 image-generation, video-generation, 字幕生成 等
    assert.ok(result.length >= 3, `expected >=3, got ${result.length}`);
  });

  it("returns empty for no matches", () => {
    const result = filterOptions(QUICK_ADD_NODE_OPTIONS, "不存在的搜索词xyz");
    assert.equal(result.length, 0);
  });

  it("is case insensitive for English keywords", () => {
    const lower = filterOptions(QUICK_ADD_NODE_OPTIONS, "agent");
    const upper = filterOptions(QUICK_ADD_NODE_OPTIONS, "AGENT");
    const mixed = filterOptions(QUICK_ADD_NODE_OPTIONS, "AgEnT");
    assert.equal(lower.length, upper.length);
    assert.equal(lower.length, mixed.length);
    assert.ok(lower.length > 0);
  });
});
