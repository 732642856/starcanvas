import type { Edge, Node } from "@xyflow/react";
import type { CanvasNodeData, CanvasNodeKind } from "../components/canvas/types";
import { createIdleRunMeta } from "./nodeRunMeta.ts";

type VideoWorkflowTemplateItem = {
  kind: CanvasNodeKind;
  x: number;
  y: number;
  type?: "content" | "workflow";
  overrides?: Partial<CanvasNodeData>;
};

export type VideoWorkflowTemplateId =
  | "tapnow_preproduction"
  | "arc_reel_agent"
  | "video_preproduction"
  | "grid_storyboard_video"
  | "character_turnaround_video";

export type BuildVideoWorkflowTemplateInput = {
  basePosition: { x: number; y: number };
  generateId: () => string;
  edgeStyle?: Edge["style"];
  template?: VideoWorkflowTemplateId;
};

export type BuildVideoWorkflowTemplateResult = {
  nodes: Node<CanvasNodeData>[];
  edges: Edge[];
};

function getVideoWorkflowDefaults(nodeKind: CanvasNodeKind): CanvasNodeData {
  const idleMeta = createIdleRunMeta();
  const defaults: Partial<Record<CanvasNodeKind, CanvasNodeData>> = {
    script: {
      title: "灵感碎片",
      workflowRole: "灵感提炼",
      status: "draft",
      runMeta: idleMeta,
      summary: "粘贴新闻、文章、链接、资料摘录或随手想法，让 AI 提炼成可继续创作的故事种子。",
      model: "GPT-5.5",
      inputs: [{ label: "新闻 / 文章 / 想法 / 链接" }],
      outputs: [{ label: "故事种子", type: "text" }],
    },
    storyboard: {
      title: "分镜草稿",
      workflowRole: "Storyboard",
      status: "ready",
      runMeta: idleMeta,
      summary: "按创意拆出镜头草稿，先确定画面重点、景别、构图和调度意图。",
      inputs: [{ label: "前期文本" }],
      outputs: [{ label: "镜头草稿", type: "storyboard" }],
    },
    "image-generation": {
      title: "关键画面设计",
      workflowRole: "Text to Image",
      status: "ready",
      runMeta: idleMeta,
      summary: "根据分镜提示词生成角色、场景、首帧或风格板图片。",
      model: "Banana Pro",
      inputs: [{ label: "分镜提示词" }],
      outputs: [{ label: "关键画面", type: "image" }],
    },
    "image-result": {
      title: "关键画面结果",
      nodeKind: "image-result",
      runMeta: idleMeta,
      workflowRole: "Image Output",
      summary: "这里承接生成后的角色、场景、首帧或风格板图片。",
    },
    "video-generation": {
      title: "动效预演",
      workflowRole: "Image to Video",
      status: "draft",
      runMeta: idleMeta,
      summary: "只做前期预演：用关键帧验证动作、机位和氛围，不负责最终节奏精剪。",
      model: "Seedance 2.0",
      duration: "5s",
      inputs: [{ label: "关键画面" }, { label: "运动提示" }],
      outputs: [{ label: "预演片段", type: "video" }],
    },
    audio: {
      title: "声音意图",
      workflowRole: "Audio Brief",
      status: "draft",
      runMeta: idleMeta,
      summary: "记录旁白、环境声、音乐情绪和声音参考，供后期继续制作。",
      inputs: [{ label: "脚本/情绪" }],
      outputs: [{ label: "声音说明", type: "audio" }],
    },
    subtitle: {
      title: "对白/旁白草稿",
      workflowRole: "Dialogue Draft",
      status: "draft",
      runMeta: idleMeta,
      summary: "沉淀对白、旁白和字幕意图，后期再做时间轴校准。",
      inputs: [{ label: "前期文本" }],
      outputs: [{ label: "文案草稿", type: "subtitle" }],
    },
    composition: {
      title: "前期项目包",
      workflowRole: "Handoff JSON",
      status: "draft",
      runMeta: idleMeta,
      summary: "汇总创意、分镜、关键画面、参考素材和声音意图，整理为 startrails-project.json。",
      inputs: [{ label: "镜头草稿" }, { label: "关键画面" }, { label: "声音说明" }],
      outputs: [{ label: "startrails-project.json", type: "file" }],
    },
    "video-result": {
      title: "交给后期",
      workflowRole: "Post Handoff",
      status: "draft",
      runMeta: idleMeta,
      summary: "把前期项目包交给星轨画布（后期），继续做节奏、字幕、声音和成片精修。",
      inputs: [{ label: "前期项目包" }],
      outputs: [{ label: "后期任务", type: "video" }],
    },
  };

  return {
    title: "工作流节点",
    status: "draft",
    ...defaults[nodeKind],
    nodeKind,
    createdAt: Date.now(),
  };
}

const VIDEO_WORKFLOW_TEMPLATE: VideoWorkflowTemplateItem[] = [
  {
    kind: "text",
    type: "content",
    x: 0,
    y: 160,
    overrides: {
      title: "前期目标",
      content: "输入主题、类型、人物、情绪、画面风格和交付目标。",
      prompt: "输入主题、类型、人物、情绪、画面风格和交付目标。",
      nodeKind: "text",
      runMeta: createIdleRunMeta(),
    },
  },
  { kind: "script", x: 320, y: 40 },
  { kind: "storyboard", x: 640, y: 40 },
  { kind: "image-generation", x: 960, y: 40 },
  { kind: "image-result", x: 1280, y: 40 },
  { kind: "video-generation", x: 1600, y: 40 },
  { kind: "audio", x: 960, y: 280 },
  { kind: "subtitle", x: 1280, y: 280 },
  { kind: "composition", x: 1600, y: 280 },
  { kind: "video-result", x: 1920, y: 160 },
];

const VIDEO_WORKFLOW_EDGE_PAIRS: Array<[number, number]> = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [4, 5],
  [5, 8],
  [1, 6],
  [1, 7],
  [6, 8],
  [7, 8],
  [8, 9],
];

const GRID_STORYBOARD_VIDEO_TEMPLATE: VideoWorkflowTemplateItem[] = [
  {
    kind: "text",
    type: "content",
    x: 0,
    y: 140,
    overrides: {
      title: "场景与角色输入",
      content: "输入场景、角色、风格、时长和目标平台。适合先做 9 格合一分镜，再交给图生视频模型读成连续运动。",
      prompt: "场景：\n角色：\n风格：cinematic, 16:9\n目标：生成 3×3 分镜网格并动画化",
      nodeKind: "text",
      runMeta: createIdleRunMeta(),
    },
  },
  {
    kind: "storyboard",
    x: 340,
    y: 40,
    overrides: {
      title: "9 格镜头节奏",
      workflowRole: "Storyboard Beats",
      summary: "把故事拆成 9 个清晰画面节拍：每格只保留一个主体、一个动作意图、一个镜头变化。",
      prompt: "Break the scene into a 3x3 storyboard grid: 9 panels, one subject and one motion intent per panel, consistent character, consistent background, no text labels.",
    },
  },
  {
    kind: "image-generation",
    x: 680,
    y: 40,
    overrides: {
      title: "3×3 分镜网格生成",
      workflowRole: "Grid Storyboard Image",
      model: "gpt-image-2",
      summary: "生成单张 3×3 分镜网格图，作为视频模型的连续运动意图输入。",
      prompt: "Generate a single 3x3 storyboard grid image with 9 panels. Keep character design, costume, background, lighting and palette consistent. Each panel should be simple and readable. No text labels.",
      inputs: [{ label: "9 格镜头节奏" }, { label: "角色/场景约束" }],
      outputs: [{ label: "3×3 分镜网格图", type: "image" }],
    },
  },
  {
    kind: "image-result",
    x: 1020,
    y: 40,
    overrides: {
      title: "3×3 网格结果",
      summary: "承接生成后的 9 格分镜网格，后续直接作为图生视频参考。",
    },
  },
  {
    kind: "video-generation",
    x: 1360,
    y: 40,
    overrides: {
      title: "网格动效生成",
      workflowRole: "Grid Image to Video",
      model: "seedance-2.0-image-to-video",
      duration: "5s",
      summary: "让视频模型把 9 格网格当作一个连续运动序列来理解，降低逐格拼接的不连续感。",
      prompt: "Animate this 3x3 storyboard grid as one continuous motion sequence. Cinematic pacing, 24fps, coherent camera direction, no text overlays.",
      inputs: [{ label: "3×3 分镜网格图" }, { label: "运动提示" }],
      outputs: [{ label: "连续预演片段", type: "video" }],
    },
  },
  {
    kind: "composition",
    x: 1360,
    y: 300,
    overrides: {
      title: "网格视频交付",
      workflowRole: "Composition",
      summary: "把网格视频、字幕和声音意图打包为可交付预演版本。",
      outputs: [{ label: "预演 MP4 / 项目包", type: "file" }],
    },
  },
  {
    kind: "video-result",
    x: 1700,
    y: 170,
    overrides: {
      title: "3×3 分镜成片",
      summary: "保存网格分镜法生成的预演成片，供继续精修或导出。",
    },
  },
];

const GRID_STORYBOARD_VIDEO_EDGE_PAIRS: Array<[number, number]> = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [4, 5],
  [5, 6],
];

const CHARACTER_TURNAROUND_VIDEO_TEMPLATE: VideoWorkflowTemplateItem[] = [
  {
    kind: "text",
    type: "content",
    x: 0,
    y: 150,
    overrides: {
      title: "角色设定输入",
      content: "输入角色外貌、服装、性格、道具和目标动作。先生成三视图设定表，再用它锁定后续首帧和动画。",
      prompt: "角色：\n服装：\n道具：\n动作目标：idle breathing / turntable / reveal\n风格：anime character sheet, clean linework",
      nodeKind: "text",
      runMeta: createIdleRunMeta(),
    },
  },
  {
    kind: "image-generation",
    x: 340,
    y: 40,
    overrides: {
      title: "角色三视图设定表",
      workflowRole: "Character Sheet",
      model: "gpt-image-2",
      summary: "生成正面、侧面、背面三视图，作为角色一致性的视觉锚点。",
      prompt: "Create a character three-view sheet: front view, side view, back view. White background, clean linework, consistent proportions, consistent costume details, no text labels.",
      inputs: [{ label: "角色设定输入" }],
      outputs: [{ label: "角色三视图", type: "image" }],
    },
  },
  {
    kind: "image-result",
    x: 680,
    y: 40,
    overrides: {
      title: "三视图参考图",
      summary: "承接角色三视图，用作后续动作首帧和图生视频参考。",
    },
  },
  {
    kind: "image-generation",
    x: 1020,
    y: 40,
    overrides: {
      title: "动作首帧生成",
      workflowRole: "Character Keyframe",
      model: "gpt-image-2",
      summary: "基于三视图生成动画首帧或动作姿态，继续保持角色比例和服装一致。",
      prompt: "Using the character sheet as identity reference, create a clean cinematic keyframe for the target action. Preserve face, hair, costume, proportions and props exactly.",
      inputs: [{ label: "三视图参考图" }, { label: "动作目标" }],
      outputs: [{ label: "动作首帧", type: "image" }],
    },
  },
  {
    kind: "image-result",
    x: 1360,
    y: 40,
    overrides: {
      title: "动作首帧结果",
      summary: "承接动作首帧，准备进入图生视频。",
    },
  },
  {
    kind: "video-generation",
    x: 1700,
    y: 40,
    overrides: {
      title: "角色自然转身动画",
      workflowRole: "Character Image to Video",
      model: "seedance-2.0-image-to-video",
      duration: "5s",
      summary: "用首帧和三视图约束生成角色呼吸、转身或展示动画，减少角色漂移。",
      prompt: "Animate the character with subtle idle breathing and a natural three-quarter turn. Preserve identity, costume and proportions. 24fps, clean motion, no text overlays.",
      inputs: [{ label: "动作首帧" }, { label: "三视图参考" }],
      outputs: [{ label: "角色动画", type: "video" }],
    },
  },
  {
    kind: "composition",
    x: 1700,
    y: 300,
    overrides: {
      title: "角色动画交付",
      workflowRole: "Composition",
      summary: "打包角色设定表、首帧、动画片段和提示词，方便后续镜头复用。",
      outputs: [{ label: "角色资产包 / MP4", type: "file" }],
    },
  },
  {
    kind: "video-result",
    x: 2040,
    y: 170,
    overrides: {
      title: "角色动画成片",
      summary: "保存三视图角色动画结果，供镜头库和角色资产库复用。",
    },
  },
];

const CHARACTER_TURNAROUND_VIDEO_EDGE_PAIRS: Array<[number, number]> = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [4, 5],
  [2, 5],
  [5, 6],
  [6, 7],
];

function getTemplateDefinition(template?: VideoWorkflowTemplateId): {
  items: VideoWorkflowTemplateItem[];
  edgePairs: Array<[number, number]>;
} {
  switch (template) {
    case "grid_storyboard_video":
      return { items: GRID_STORYBOARD_VIDEO_TEMPLATE, edgePairs: GRID_STORYBOARD_VIDEO_EDGE_PAIRS };
    case "character_turnaround_video":
      return { items: CHARACTER_TURNAROUND_VIDEO_TEMPLATE, edgePairs: CHARACTER_TURNAROUND_VIDEO_EDGE_PAIRS };
    default:
      return { items: VIDEO_WORKFLOW_TEMPLATE, edgePairs: VIDEO_WORKFLOW_EDGE_PAIRS };
  }
}

export function buildVideoWorkflowTemplate(
  input: BuildVideoWorkflowTemplateInput,
): BuildVideoWorkflowTemplateResult {
  const definition = getTemplateDefinition(input.template);
  const nodes = definition.items.map((item) => {
    const type = item.type ?? "workflow";
    return {
      id: input.generateId(),
      type,
      position: {
        x: input.basePosition.x + item.x,
        y: input.basePosition.y + item.y,
      },
      data: {
        ...(type === "workflow" ? getVideoWorkflowDefaults(item.kind) : {}),
        ...item.overrides,
      },
    } satisfies Node<CanvasNodeData>;
  });

  const edges = definition.edgePairs.map(([sourceIndex, targetIndex]) => ({
    id: input.generateId(),
    source: nodes[sourceIndex].id,
    target: nodes[targetIndex].id,
    type: "creative",
    animated: false,
    style: input.edgeStyle,
  })) satisfies Edge[];

  return { nodes, edges };
}
