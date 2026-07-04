export type SlashCommandId =
  // ── 文本操作 ──
  | "summarize"
  | "expand"
  | "rewrite"
  | "continue-storyboard-assistant"
  | "generate-storyboard-text"
  | "split-storyboard"
  | "generate-image"
  // ── 视觉创作（对标 TapNow "/" 快捷命令）──
  | "three-view"              // 角色三视图
  | "nine-grid"               // 九宫格分镜
  | "cinematic-lighting"      // 电影级光影
  | "multi-angle"             // 多角度控制
  | "pose-reference"          // 姿势参考
  | "focus-edit"              // 焦点编辑
  | "remove-bg"               // 去背景
  | "upscale"                 // 放大方案
  // ── 视频创作 ──
  | "image-to-video"          // 图生视频
  | "chain-video"             // 链式视频生成
  | "add-bgm"                 // 添加背景音乐
  | "add-voiceover"           // 添加配音
  | "add-subtitle"            // 添加字幕
  // ── 画布操作 ──
  | "clone-node"              // 克隆节点
  | "create-storyboard"       // 创建故事板
  | "compose-all"             // 合成全集
  | "export-jianying"         // 导出剪映草稿
  | "export-composition"
  | "generate-with-pose";     // 姿态参考生图

export type SlashCommandTargetType = "text" | "shot" | "image" | "video" | "canvas";
export type SlashCommandCategory = "generation" | "editing" | "canvas" | "storyboard" | "asset" | "workflow";
export type SlashCommandModelType = "text" | "image" | "video" | "none";

export type SlashCommand = {
  id: SlashCommandId;
  label: string;
  description: string;
  targets: SlashCommandTargetType[];
  icon?: string;
  category?: SlashCommandCategory;
  modelType?: SlashCommandModelType;
  minSelection?: number;
  isCostly?: boolean;
};

export type SlashCommandGroup = {
  category: SlashCommandCategory;
  label: string;
  commands: SlashCommand[];
};

export type SlashQueryRange = {
  start: number;
  end: number;
};

export type SlashQuery = {
  query: string;
  range: SlashQueryRange;
};

export const SLASH_COMMANDS: SlashCommand[] = [
  {
    id: "summarize",
    label: "总结",
    description: "将当前内容总结为更短版本",
    targets: ["text", "shot"],
  },
  {
    id: "expand",
    label: "扩写",
    description: "扩写当前内容，增加画面细节",
    targets: ["text", "shot"],
  },
  {
    id: "rewrite",
    label: "改写",
    description: "改写为更清晰的影视分镜描述",
    targets: ["text", "shot"],
  },
  {
    id: "continue-storyboard-assistant",
    label: "继续故事分镜",
    description: "按当前阶段继续：想法成故事，故事成分镜，分镜拆 Shot",
    targets: ["text"],
  },
  {
    id: "split-storyboard",
    label: "拆成分镜",
    description: "将已有文字分镜拆分为多个镜头",
    targets: ["text"],
  },
  {
    id: "generate-image",
    label: "生成图片",
    description: "为当前镜头生成一张图片",
    targets: ["shot"],
  },
  // ── 视觉创作（对标 TapNow "/" 快捷命令系统）──
  {
    id: "three-view",
    label: "角色三视图",
    description: "生成角色正面/侧面/背面三视图",
    targets: ["image", "shot"],
  },
  {
    id: "nine-grid",
    label: "九宫格分镜",
    description: "一键生成九宫格分镜预览",
    targets: ["text", "shot"],
  },
  {
    id: "cinematic-lighting",
    label: "电影级光影",
    description: "应用电影级光影效果（逆光/侧光/柔光/硬光）",
    targets: ["image", "shot"],
  },
  {
    id: "multi-angle",
    label: "多角度控制",
    description: "拖拽调整角色朝向和画面角度",
    targets: ["image", "shot"],
  },
  {
    id: "pose-reference",
    label: "姿势参考",
    description: "使用姿势参考图或火柴人自定义动作",
    targets: ["image", "shot"],
  },
  {
    id: "focus-edit",
    label: "焦点编辑",
    description: "选择局部元素进行精修（魔法棒）",
    targets: ["image", "shot"],
  },
  {
    id: "remove-bg",
    label: "去背景",
    description: "一键移除图片背景",
    targets: ["image"],
  },
  {
    id: "upscale",
    label: "放大方案",
    description: "记录 2x/4x 超分、降噪和保细节参数",
    targets: ["image", "video"],
  },
  {
    id: "generate-with-pose",
    label: "姿态生图",
    description: "使用 OpenPose 骨架图 + 参考图生成指定姿态图片",
    targets: ["image", "shot"],
  },
  // ── 视频创作 ──
  {
    id: "image-to-video",
    label: "图生视频",
    description: "将当前图片转为动态视频",
    targets: ["image", "shot"],
  },
  {
    id: "chain-video",
    label: "链式视频",
    description: "多镜头连续视频生成",
    targets: ["shot", "canvas"],
  },
  {
    id: "add-bgm",
    label: "添加BGM",
    description: "为当前视频添加背景音乐",
    targets: ["video", "shot"],
  },
  {
    id: "add-voiceover",
    label: "添加配音",
    description: "为当前镜头生成AI配音",
    targets: ["shot"],
  },
  {
    id: "add-subtitle",
    label: "添加字幕",
    description: "为当前镜头自动生成字幕",
    targets: ["video", "shot"],
  },
  // ── 画布操作 ──
  {
    id: "clone-node",
    label: "克隆节点",
    description: "复制当前节点到画布",
    targets: ["text", "image", "shot", "video"],
  },
  {
    id: "create-storyboard",
    label: "创建故事板",
    description: "基于当前内容创建故事板节点",
    targets: ["text"],
  },
  {
    id: "compose-all",
    label: "合成全集",
    description: "一键合成所有分镜为完整视频",
    targets: ["canvas"],
  },
  {
    id: "export-jianying",
    label: "导出剪映",
    description: "导出为剪映草稿文件",
    targets: ["canvas"],
  },
  {
    id: "export-composition",
    label: "导出合成脚本",
    description: "导出FFmpeg视频合成脚本",
    targets: ["canvas"],
  },
  {
    id: "generate-storyboard-text",
    label: "生成分镜文本",
    description: "从文本/大纲生成完整分镜描述",
    targets: ["text", "shot"],
  },
];

export function getSlashCommandsForTarget(
  target: SlashCommandTargetType,
  query: string,
): SlashCommand[] {
  const normalizedQuery = query.trim().toLowerCase();

  return SLASH_COMMANDS.filter((command) => {
    if (!command.targets.includes(target)) return false;
    if (!normalizedQuery) return true;

    return (
      command.id.includes(normalizedQuery) ||
      command.label.toLowerCase().includes(normalizedQuery) ||
      command.description.toLowerCase().includes(normalizedQuery)
    );
  });
}

export function parseSlashQuery(
  text: string,
  cursorPosition: number,
): SlashQuery | null {
  const safeCursor = Math.max(0, Math.min(cursorPosition, text.length));
  const beforeCursor = text.slice(0, safeCursor);
  const slashIndex = beforeCursor.lastIndexOf("/");
  if (slashIndex < 0) return null;

  const beforeSlash = slashIndex > 0 ? beforeCursor[slashIndex - 1] : "";
  if (beforeSlash && !/\s/.test(beforeSlash)) return null;

  const query = beforeCursor.slice(slashIndex + 1);
  if (/\s/.test(query)) return null;

  return {
    query,
    range: {
      start: slashIndex,
      end: safeCursor,
    },
  };
}

export function removeSlashCommandFromText(
  text: string,
  range: SlashQueryRange,
): string {
  const start = Math.max(0, Math.min(range.start, text.length));
  const end = Math.max(start, Math.min(range.end, text.length));
  const before = text.slice(0, start);
  const after = text.slice(end);

  if (!before && after.startsWith(" ")) return after.slice(1);
  if (before.endsWith(" ") && after.startsWith(" ")) return `${before}${after.slice(1)}`;
  return `${before}${after}`;
}

export function buildSlashCommandPrompt(input: {
  commandId: Extract<SlashCommandId, "summarize" | "expand" | "rewrite" | "generate-storyboard-text">;
  nodeText: string;
}): string {
  const sourceText = input.nodeText.trim();
  switch (input.commandId) {
    case "summarize":
      return [
        "请将以下内容总结为更短、更清晰的版本。",
        "保留关键信息，不要加入新情节。",
        "只输出改写后的正文，不要解释。",
        sourceText,
      ].join("\n\n");
    case "expand":
      return [
        "请扩写以下内容，增加影视画面、动作、情绪、环境细节。",
        "保持原意，不要改变人物关系和事件走向。",
        "只输出扩写后的正文，不要解释。",
        sourceText,
      ].join("\n\n");
    case "rewrite":
      return [
        "请改写以下内容，使其更清晰、更适合影视分镜描述。",
        "突出画面、动作、镜头感和可执行性。",
        "只输出改写后的正文，不要解释。",
        sourceText,
      ].join("\n\n");
    case "generate-storyboard-text":
      return [
        "请根据以下创意或剧情，生成一份可直接拆分为 Shot 节点的文字分镜。",
        "输出 4-8 个镜头，严格使用以下格式：",
        "镜头 1：一句简短标题",
        "画面描述：写清画面、人物动作、情绪和环境。",
        "生图提示词：写成适合文生图的中文提示词，包含景别、构图、光线、风格。",
        "不要输出解释、前言或 Markdown 代码块。",
        sourceText || "请基于一个短片开场生成文字分镜。",
      ].join("\n\n");
  }
}
