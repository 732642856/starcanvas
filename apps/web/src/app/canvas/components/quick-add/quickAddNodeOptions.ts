// ============================================================================
// Quick Add Node Options — ComfyUI 风格快速节点搜索候选列表
// ============================================================================
import type { CanvasNodeKind } from "../canvas/types";

export type QuickAddNodeOption = {
  /** 唯一标识 */
  id: string;
  /** 显示标签 */
  label: string;
  /** 简要描述 */
  description: string;
  /** 搜索关键词（含中文） */
  keywords: string[];
  /** handleAddNode type 参数 */
  nodeType: "content" | "image" | "workflow" | "agent" | "sketch";
  /** CanvasNodeKind（创建 content/workflow 节点时用于决定标题和内容结构） */
  nodeKind?: CanvasNodeKind;
};

export const QUICK_ADD_NODE_OPTIONS: QuickAddNodeOption[] = [
  // ── 文本 / 分镜类 ──────────────────────────────────────────
  {
    id: "content-text",
    label: "写作文本",
    description: "自由书写提示词或笔记",
    keywords: ["text", "文本", "提示词", "prompt", "note", "笔记"],
    nodeType: "content",
    nodeKind: "text",
  },
  {
    id: "content-storyboard",
    label: "故事分镜",
    description: "创建分镜助手节点，按节奏展开视觉叙事",
    keywords: ["storyboard", "分镜", "镜头", "shot", "叙事", "节奏"],
    nodeType: "content",
    nodeKind: "storyboard",
  },

  // ── 图片类 ──────────────────────────────────────────────────
  {
    id: "image",
    label: "图片",
    description: "拖入或上传图片素材",
    keywords: ["image", "图片", "素材", "上传", "upload"],
    nodeType: "image",
  },

  // ── 手绘分镜 ────────────────────────────────────────────────
  {
    id: "sketch",
    label: "手绘分镜",
    description: "用手绘快速确定构图和动作节奏",
    keywords: ["sketch", "手绘", "草图", "构图", "故事板", "draw"],
    nodeType: "sketch",
  },

  // ── Agent ───────────────────────────────────────────────────
  {
    id: "agent",
    label: "Director Agent",
    description: "智能导演 Agent，分析画布上下文创建创作流水线",
    keywords: ["agent", "导演", "AI", "智能", "编排", "orchestrator"],
    nodeType: "agent",
  },

  // ── 工作流类（常用 VideoWorkflowNodeKind）────────────────────────
  {
    id: "workflow-script",
    label: "工作流 — 剧本",
    description: "剧本 / 文案分析节点",
    keywords: ["script", "剧本", "脚本", "文案", "文本分析"],
    nodeType: "workflow",
    nodeKind: "script",
  },
  {
    id: "workflow-image-gen",
    label: "工作流 — 图片生成",
    description: "AI 图片生成节点",
    keywords: ["image generation", "图片生成", "生图", "AI绘画", "gen"],
    nodeType: "workflow",
    nodeKind: "image-generation",
  },
  {
    id: "workflow-video-gen",
    label: "工作流 — 视频生成",
    description: "AI 视频生成节点",
    keywords: ["video generation", "视频生成", "生视频", "AI视频", "gen"],
    nodeType: "workflow",
    nodeKind: "video-generation",
  },
  {
    id: "workflow-audio",
    label: "工作流 — 音频",
    description: "音频处理 / 录音节点",
    keywords: ["audio", "音频", "录音", "声音", "bgm", "音效"],
    nodeType: "workflow",
    nodeKind: "audio",
  },
  {
    id: "workflow-tts",
    label: "工作流 — 语音合成",
    description: "文本转语音 (TTS) 节点",
    keywords: ["tts", "语音合成", "配音", "朗读", "语音"],
    nodeType: "workflow",
    nodeKind: "tts",
  },
  {
    id: "workflow-composition",
    label: "工作流 — 合成",
    description: "音视频合成 / 导出节点",
    keywords: ["composition", "合成", "导出", "混音", "剪辑"],
    nodeType: "workflow",
    nodeKind: "composition",
  },
  {
    id: "workflow-subtitle",
    label: "工作流 — 字幕",
    description: "字幕生成 / 嵌入节点",
    keywords: ["subtitle", "字幕", "SRT", "字幕生成"],
    nodeType: "workflow",
    nodeKind: "subtitle",
  },
];
