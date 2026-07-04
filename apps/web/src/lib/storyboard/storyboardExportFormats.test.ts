/**
 * Tests for storyboardExportFormats.ts — Markdown screenplay, Character CSV, Storyboard CSV.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  generateScreenplayMarkdown,
  screenplayFilename,
  generateCharacterTableCsv,
  characterTableFilename,
  generateStoryboardTableCsv,
  storyboardTableFilename,
  generateExportBundle,
} from "./storyboardExportFormats.ts";
import type { ShotProductionBrief } from "./shotProductionBrief.ts";
import type { CharacterIdentityAsset } from "@/app/canvas/components/canvas/types.ts";

// ── Test fixtures ──

function makeBrief(overrides: Partial<ShotProductionBrief> = {}): ShotProductionBrief {
  return {
    shotId: "shot-001",
    order: 1,
    title: "测试镜头",
    visual: {
      prompt: "一个男人站在雨中",
      shotType: "中景",
      cameraMovement: "固定",
      duration: "3s",
      characterIdentities: [],
    },
    voice: {},
    subtitle: {},
    handoff: {},
    ...overrides,
  };
}

function makeCharacter(overrides: Partial<CharacterIdentityAsset> = {}): CharacterIdentityAsset {
  return {
    id: "char-001",
    name: "张三",
    role: "主角",
    visualSignature: "高个子，短发",
    ...overrides,
  };
}

// ============================================================================
// Markdown Screenplay
// ============================================================================

describe("generateScreenplayMarkdown", () => {
  it("包含标题和生成日期", () => {
    const md = generateScreenplayMarkdown("测试项目", [makeBrief()]);
    assert.ok(md.includes("# 测试项目"));
    assert.ok(md.includes("自动生成于"));
  });

  it("按 order 排序分镜", () => {
    const briefs = [
      makeBrief({ shotId: "s2", order: 2, title: "第二镜" }),
      makeBrief({ shotId: "s1", order: 1, title: "第一镜" }),
    ];
    const md = generateScreenplayMarkdown("项目", briefs);
    const idx1 = md.indexOf("第一镜");
    const idx2 = md.indexOf("第二镜");
    assert.ok(idx1 < idx2);
  });

  it("包含景别和运镜信息", () => {
    const md = generateScreenplayMarkdown("项目", [makeBrief()]);
    assert.ok(md.includes("中景"));
    assert.ok(md.includes("固定"));
  });

  it("包含角色列表", () => {
    const briefs = [
      makeBrief({
        visual: {
          prompt: "测试",
          characterIdentities: [
            { id: "c1", name: "张三" },
            { id: "c2", name: "李四" },
          ],
        },
      }),
    ];
    const md = generateScreenplayMarkdown("项目", briefs);
    assert.ok(md.includes("张三"));
    assert.ok(md.includes("李四"));
  });

  it("正确解析对白中的角色前缀", () => {
    const briefs = [
      makeBrief({
        voice: { dialogue: "张三：你好\n李四：你好吗" },
      }),
    ];
    const md = generateScreenplayMarkdown("项目", briefs);
    assert.ok(md.includes("**张三**"));
    assert.ok(md.includes("**李四**"));
    assert.ok(md.includes(": 你好"));
    assert.ok(md.includes(": 你好吗"));
  });

  it("无角色前缀的对白作为旁白处理", () => {
    const briefs = [
      makeBrief({
        voice: { dialogue: "夜色深沉，大雨滂沱" },
      }),
    ];
    const md = generateScreenplayMarkdown("项目", briefs);
    assert.ok(md.includes(": 夜色深沉"));
  });

  it("包含视觉提示词", () => {
    const md = generateScreenplayMarkdown("项目", [makeBrief()], { includeVisual: true });
    assert.ok(md.includes("一个男人站在雨中"));
  });

  it("可以排除视觉提示词", () => {
    const md = generateScreenplayMarkdown("项目", [makeBrief()], { includeVisual: false });
    assert.ok(!md.includes("一个男人站在雨中"));
  });

  it("包含声音意图和音效", () => {
    const briefs = [
      makeBrief({
        voice: { voiceIntent: "低沉缓慢", soundCue: "雷声" },
      }),
    ];
    const md = generateScreenplayMarkdown("项目", briefs);
    assert.ok(md.includes("低沉缓慢"));
    assert.ok(md.includes("雷声"));
  });

  it("以项目标题结尾", () => {
    const md = generateScreenplayMarkdown("测试项目", [makeBrief()]);
    assert.ok(md.includes("测试项目 — 分镜剧本 终"));
  });

  it("空分镜列表生成最小文档", () => {
    const md = generateScreenplayMarkdown("空项目", []);
    assert.ok(md.includes("# 空项目"));
    assert.ok(md.includes("0 个分镜"));
  });
});

describe("screenplayFilename", () => {
  it("替换空格为下划线", () => {
    assert.equal(screenplayFilename("我的项目"), "我的项目_剧本.md");
  });

  it("移除不安全的文件名字符", () => {
    const name = screenplayFilename("项目/测试:test");
    assert.ok(!name.includes("/"));
    assert.ok(!name.includes(":"));
    assert.ok(name.endsWith("_剧本.md"));
  });
});

// ============================================================================
// Character CSV
// ============================================================================

describe("generateCharacterTableCsv", () => {
  it("包含 BOM 头（Excel 兼容）", () => {
    const csv = generateCharacterTableCsv([makeCharacter()]);
    assert.ok(csv.startsWith("\uFEFF"));
  });

  it("包含表头行", () => {
    const csv = generateCharacterTableCsv([makeCharacter()]);
    const lines = csv.split("\n");
    assert.ok(lines[0].includes("名称"));
    assert.ok(lines[0].includes("角色"));
    assert.ok(lines[0].includes("视觉特征"));
  });

  it("包含角色数据", () => {
    const csv = generateCharacterTableCsv([makeCharacter()]);
    assert.ok(csv.includes("张三"));
    assert.ok(csv.includes("主角"));
  });

  it("多个道具用分号连接", () => {
    const csv = generateCharacterTableCsv([
      makeCharacter({ props: ["帽子", "眼镜"] }),
    ]);
    assert.ok(csv.includes("帽子；眼镜"));
  });

  it("空角色列表生成仅表头", () => {
    const csv = generateCharacterTableCsv([]);
    const lines = csv.trim().split("\n");
    assert.equal(lines.length, 1); // header only
  });

  it("包含声线档案字段", () => {
    const csv = generateCharacterTableCsv([
      makeCharacter({ voiceProfileId: "vp-001", voiceProfileStatus: "ready" }),
    ]);
    assert.ok(csv.includes("vp-001"));
    assert.ok(csv.includes("ready"));
  });
});

describe("characterTableFilename", () => {
  it("生成正确的文件名", () => {
    assert.equal(characterTableFilename("星轨"), "星轨_角色表.csv");
  });
});

// ============================================================================
// Storyboard Table CSV
// ============================================================================

describe("generateStoryboardTableCsv", () => {
  it("包含 BOM 头", () => {
    const csv = generateStoryboardTableCsv([makeBrief()]);
    assert.ok(csv.startsWith("\uFEFF"));
  });

  it("包含 15 列表头", () => {
    const csv = generateStoryboardTableCsv([makeBrief()]);
    const header = csv.split("\n")[0];
    const cols = header.split(",");
    assert.equal(cols.length, 15);
  });

  it("按 order 排序", () => {
    const briefs = [
      makeBrief({ shotId: "s2", order: 2, title: "第二" }),
      makeBrief({ shotId: "s1", order: 1, title: "第一" }),
    ];
    const csv = generateStoryboardTableCsv(briefs);
    const lines = csv.split("\n");
    assert.ok(lines[1].includes("1"));  // order 1 first
    assert.ok(lines[2].includes("2"));  // order 2 second
  });

  it("包含所有镜头数据", () => {
    const briefs = [
      makeBrief({
        shotId: "s1",
        voice: { dialogue: "你好", voiceIntent: "温柔", soundCue: "鸟鸣" },
        subtitle: { text: "你好" },
        handoff: { notes: "后期加特效", warnings: ["注意光线"] },
      }),
    ];
    const csv = generateStoryboardTableCsv(briefs);
    assert.ok(csv.includes("你好"));
    assert.ok(csv.includes("温柔"));
    assert.ok(csv.includes("鸟鸣"));
    assert.ok(csv.includes("后期加特效"));
    assert.ok(csv.includes("注意光线"));
  });

  it("导出来源类型、来源时间码和参考帧", () => {
    const csv = generateStoryboardTableCsv([
      makeBrief({
        handoff: {
          source: {
            type: "reference-video",
            timeSec: 12.5,
            referenceImageUrl: "data:image/jpeg;base64,frame",
          },
        },
      }),
    ]);

    assert.ok(csv.includes("reference-video"));
    assert.ok(csv.includes("12.5s"));
    assert.ok(csv.includes("data:image/jpeg;base64,frame"));
  });

  it("空分镜列表仅有表头", () => {
    const csv = generateStoryboardTableCsv([]);
    const lines = csv.trim().split("\n");
    assert.equal(lines.length, 1);
  });

  it("CSV 值正确转义", () => {
    const briefs = [makeBrief({ title: 'has "quotes" inside' })];
    const csv = generateStoryboardTableCsv(briefs);
    // CSV escapes " → "" inside quoted fields
    assert.ok(csv.includes('""quotes""'));
  });
});

describe("storyboardTableFilename", () => {
  it("生成正确的文件名", () => {
    assert.equal(storyboardTableFilename("星轨"), "星轨_分镜表.csv");
  });
});

// ============================================================================
// Unified Bundle
// ============================================================================

describe("generateExportBundle", () => {
  it("返回完整的导出包", () => {
    const bundle = generateExportBundle("项目", [makeBrief()], [makeCharacter()]);
    assert.ok(bundle.markdown.includes("# 项目"));
    assert.ok(bundle.characterCsv.includes("张三"));
    assert.ok(bundle.storyboardCsv.includes("测试镜头"));
    assert.ok(bundle.markdownFilename.endsWith("_剧本.md"));
    assert.ok(bundle.characterCsvFilename.endsWith("_角色表.csv"));
    assert.ok(bundle.storyboardCsvFilename.endsWith("_分镜表.csv"));
  });
});
