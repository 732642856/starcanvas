// ============================================================================
// 剪映 (JianYing Pro) 草稿导出服务
// ============================================================================
// 功能：
// 1. 将 StarCanvas 中的视频/音频/字幕节点导出为剪映 draft_content.json 格式
// 2. 生成剪映兼容格式的 ZIP 包（视频 + SRT 字幕 + 音频）
// ============================================================================
//
// 参考文档：docs/剪映草稿导出格式逆向与参考视频分析实现方案.md
// 所有时间单位均为微秒（1 秒 = 1,000,000 微秒）
//
// ============================================================================

import { generateId } from "./generateId.ts";

// 剪映草稿要求 UUID v4 格式的 ID（草稿 ID、素材 ID），使用 generateUuid() 生成。
// 轨道/片段等内部 ID 使用项目中已有的 generateId()。

// ============================================================================
// 类型定义 —— 剪映草稿 JSON Schema
// ============================================================================

/** 时间范围（微秒） */
export interface JianyingTimerange {
  /** 起始时间（微秒） */
  start: number;
  /** 持续时间（微秒） */
  duration: number;
}

/** 片段剪辑属性 */
export interface JianyingClipSettings {
  speed: number;
  volume: number;
  alpha: number;
  transformX: number;
  transformY: number;
  scale: number;
  rotation: number;
  /** 画面翻转 */
  flip?: {
    horizontal: boolean;
    vertical: boolean;
  };
  /** 画面裁剪 */
  crop?: {
    left: number;
    top: number;
    right: number;
    bottom: number;
  };
}

/** 素材引用 */
export interface JianyingExtraMaterialRef {
  id: string;
  type: string;
}

/** 轨道片段 */
export interface JianyingSegment {
  id: string;
  materialId: string;
  targetTimerange: JianyingTimerange;
  sourceTimerange: JianyingTimerange;
  clip: JianyingClipSettings;
  renderIndex: number;
  extraMaterialRefs: JianyingExtraMaterialRef[];
}

/** 轨道 */
export interface JianyingTrack {
  id: string;
  type: "video" | "audio" | "text" | "image" | "sticker" | "effect" | "subtitle" | "filter";
  name: string;
  flag: number;
  segments: JianyingSegment[];
}

/** 视频素材 */
export interface JianyingVideoMaterial {
  id: string;
  type: "video";
  /** 素材文件绝对路径 */
  path: string;
  /** 素材时长（微秒） */
  duration: number;
  /** 视频宽度 */
  width: number;
  /** 视频高度 */
  height: number;
  /** 文件格式 */
  format: string;
  /** 是否包含音频轨道 */
  hasAudio?: boolean;
  /** 是否为 AI 生成内容 */
  isAiGenerateContent?: boolean;
  /** 是否为版权素材 */
  isCopyright?: boolean;
}

/** 音频素材 */
export interface JianyingAudioMaterial {
  id: string;
  type: "audio";
  path: string;
  duration: number;
  format: string;
  /** 是否为 AI 克隆音色 */
  isAiCloneTone?: boolean;
}

/** 文本素材 */
export interface JianyingTextMaterial {
  id: string;
  type: "text";
  /** 双重编码的 JSON 字符串：内层 JSON 包含 text/font/size/color */
  content: string;
  /** 素材时长（微秒） */
  duration: number;
}

/** 素材库 */
export interface JianyingMaterials {
  videos: Record<string, JianyingVideoMaterial>;
  audios: Record<string, JianyingAudioMaterial>;
  texts: Record<string, JianyingTextMaterial>;
  stickers: Record<string, unknown>;
  videoEffects: Record<string, unknown>;
  materialAnimations: Record<string, unknown>;
  transitions: Record<string, unknown>;
  masks: Record<string, unknown>;
  canvases: Record<string, unknown>;
}

/** 平台信息 */
export interface JianyingPlatform {
  appSource: "JianYing Pro" | "CapCut";
}

/** 画布配置 */
export interface JianyingCanvasConfig {
  width: number;
  height: number;
  backgroundColor: string;
}

/**
 * 剪映 draft_content.json 核心结构
 */
export interface JianyingDraftContent {
  id: string;
  name: string;
  /** 总时长（微秒） */
  duration: number;
  fps: number;
  canvasConfig: JianyingCanvasConfig;
  /** 色彩空间 (0=SDR, 1=HDR) */
  colorSpace?: number;
  /** 最后修改平台信息 */
  lastModifiedPlatform?: JianyingPlatform & { appVersion?: string };
  tracks: JianyingTrack[];
  materials: JianyingMaterials;
  platform: JianyingPlatform;
}

/**
 * 剪映 draft_meta_info.json 结构
 */
export interface JianyingDraftMeta {
  draftId: string;
  createTime: string;
  version: string;
  resolution: string;
  frameRate: number;
  /** 总时长（微秒） */
  duration: number;
}

// ============================================================================
// 输入类型 —— StarCanvas 节点数据
// ============================================================================

/** 视频节点输入 */
export interface JianyingVideoNodeInput {
  /** 节点 ID */
  id: string;
  /** 节点标题 */
  title: string;
  /** 视频 URL */
  videoUrl: string;
  /** 视频时长（秒） */
  durationSeconds: number;
  /** 视频宽度 */
  width: number;
  /** 视频高度 */
  height: number;
  /** 视频帧率 */
  fps?: number;
  /** 在时间轴上的起始偏移（秒） */
  startOffsetSeconds?: number;
  /** 音量 (0-1) */
  volume?: number;
  /** 缩放 */
  scale?: number;
  /** X 轴偏移（归一化坐标 -1~1） */
  transformX?: number;
  /** Y 轴偏移（归一化坐标 -1~1） */
  transformY?: number;
  /** 旋转角度 */
  rotation?: number;
  /** 文件名（用于导出） */
  fileName?: string;
}

/** 音频节点输入 */
export interface JianyingAudioNodeInput {
  /** 节点 ID */
  id: string;
  /** 节点标题 */
  title: string;
  /** 音频 URL */
  audioUrl: string;
  /** 音频时长（秒） */
  durationSeconds: number;
  /** 在时间轴上的起始偏移（秒） */
  startOffsetSeconds?: number;
  /** 音量 (0-1) */
  volume?: number;
  /** 淡入时长（秒） */
  fadeInSeconds?: number;
  /** 淡出时长（秒） */
  fadeOutSeconds?: number;
  /** 文件名（用于导出） */
  fileName?: string;
}

/** 字幕节点输入 */
export interface JianyingSubtitleNodeInput {
  /** 节点 ID */
  id: string;
  /** 节点标题 */
  title: string;
  /** 字幕时段列表 */
  segments: Array<{
    /** 起始时间（秒） */
    startSeconds: number;
    /** 结束时间（秒） */
    endSeconds: number;
    /** 字幕文本 */
    text: string;
  }>;
  /** SRT 原始内容（如果有则直接用） */
  srtContent?: string;
}

/** 导出选项 */
export interface JianyingExportOptions {
  /** 草稿名称 */
  draftName?: string;
  /** 目标平台 */
  appSource?: "JianYing Pro" | "CapCut";
  /** 帧率 */
  fps?: number;
  /** 画布宽度 */
  canvasWidth?: number;
  /** 画布高度 */
  canvasHeight?: number;
  /** 是否包含媒体文件（用于兼容包） */
  includeMedia?: boolean;
}

// ============================================================================
// 导出结果类型
// ============================================================================

/** 导出结果 */
export interface JianyingExportResult {
  /** draft_content.json 字符串 */
  draftContentJson: string;
  /** draft_meta_info.json 字符串 */
  draftMetaJson: string;
  /** 总时长（秒） */
  totalDurationSeconds: number;
  /** 总时长（微秒） */
  totalDurationMicroseconds: number;
  /** 轨道数量 */
  trackCount: number;
  /** 素材数量 */
  materialCount: number;
}

/** 剪映兼容包导出结果 */
export interface JianyingCompatiblePackage {
  /** ZIP 文件的 ArrayBuffer */
  zipBuffer: ArrayBuffer;
  /** 推荐的文件名 */
  fileName: string;
  /** 包中包含的文件列表 */
  files: Array<{
    path: string;
    size: number;
  }>;
}

// ============================================================================
// 常量
// ============================================================================

/** 微秒转换常量 */
const MICROSECONDS_PER_SECOND = 1_000_000;

/** 默认画布尺寸 */
const DEFAULT_CANVAS_WIDTH = 1080;
const DEFAULT_CANVAS_HEIGHT = 1920;

/** 默认帧率 */
const DEFAULT_FPS = 30;

/** 默认草稿名称 */
const DEFAULT_DRAFT_NAME = "星轨画布导出";

/** 剪映版本号 */
const JIANYING_VERSION = "7.5.0";

// ============================================================================
// 工具函数
// ============================================================================

/**
 * 将秒转换为微秒
 *
 * @param seconds - 秒数
 * @returns 微秒数
 */
export function secondsToMicroseconds(seconds: number): number {
  return Math.round(seconds * MICROSECONDS_PER_SECOND);
}

/**
 * 生成 UUID v4 格式的 ID
 *
 * @returns UUID 字符串
 */
export function generateUuid(): string {
  const hex = "0123456789abcdef";
  const pattern = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx";
  return pattern.replace(/[xy]/g, (char) => {
    const r = (Math.random() * 16) | 0;
    const v = char === "x" ? r : (r & 0x3) | 0x8;
    return hex[v];
  });
}

/**
 * 获取当前 ISO 时间字符串
 *
 * @returns ISO 8601 时间字符串
 */
export function getCurrentIsoTime(): string {
  return new Date().toISOString();
}

/**
 * 从 URL 中提取文件名
 *
 * @param url - 文件 URL
 * @returns 文件名
 */
export function extractFileName(url: string): string {
  if (/^(data|blob):/i.test(url)) return "";
  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname;
    const segments = pathname.split("/");
    const last = segments[segments.length - 1];
    if (last && last.includes(".")) return decodeURIComponent(last);
  } catch {
    // URL 解析失败，使用默认逻辑
  }
  // 使用时间戳生成唯一文件名
  return `media_${Date.now()}`;
}

function sanitizePackageFileName(fileName: string, fallbackBase: string, fallbackExt: string): string {
  const trimmed = fileName
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "_")
    .replace(/^\.+/, "")
    .replace(/[. ]+$/g, "");
  const withExt = /\.[A-Za-z0-9]{2,8}$/.test(trimmed)
    ? trimmed
    : `${trimmed || fallbackBase}${fallbackExt}`;
  const dotIndex = withExt.lastIndexOf(".");
  const base = dotIndex > 0 ? withExt.slice(0, dotIndex) : withExt;
  const ext = dotIndex > 0 ? withExt.slice(dotIndex) : fallbackExt;
  const safeBase = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(base) ? `${base}_` : base;
  return `${safeBase}${ext}`;
}

function uniquePackageFileName(
  fileName: string | undefined,
  fallbackBase: string,
  fallbackExt: string,
  used: Set<string>,
): string {
  const safeName = sanitizePackageFileName(fileName ?? `${fallbackBase}${fallbackExt}`, fallbackBase, fallbackExt);
  const dotIndex = safeName.lastIndexOf(".");
  const base = dotIndex > 0 ? safeName.slice(0, dotIndex) : safeName;
  const ext = dotIndex > 0 ? safeName.slice(dotIndex) : fallbackExt;
  let candidate = safeName;
  let suffix = 2;
  while (used.has(candidate.toLowerCase())) {
    candidate = `${base}-${suffix}${ext}`;
    suffix += 1;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

// ============================================================================
// 核心导出函数
// ============================================================================

/**
 * 将 StarCanvas 中的视频节点、音频节点、字幕节点数据
 * 导出为剪映草稿 JSON 格式
 *
 * @param videoNodes - 视频节点列表
 * @param audioNodes - 音频节点列表
 * @param subtitleNodes - 字幕节点列表
 * @param options - 导出选项
 * @returns 导出结果，包含 draft_content.json 和 draft_meta_info.json
 */
export function exportToJianyingDraft(
  videoNodes: JianyingVideoNodeInput[],
  audioNodes: JianyingAudioNodeInput[],
  subtitleNodes: JianyingSubtitleNodeInput[],
  options?: JianyingExportOptions,
): JianyingExportResult {
  // 合并选项和默认值
  const opts: Required<JianyingExportOptions> = {
    draftName: options?.draftName ?? DEFAULT_DRAFT_NAME,
    appSource: options?.appSource ?? "JianYing Pro",
    fps: options?.fps ?? DEFAULT_FPS,
    canvasWidth: options?.canvasWidth ?? DEFAULT_CANVAS_WIDTH,
    canvasHeight: options?.canvasHeight ?? DEFAULT_CANVAS_HEIGHT,
    includeMedia: options?.includeMedia ?? false,
  };

  // 计算总时长（所有片段中的最大结束时间）
  let totalDurationMicroseconds = 0;

  // 初始化草稿结构
  const draft: JianyingDraftContent = {
    id: generateUuid(),
    name: opts.draftName,
    duration: 0, // 稍后计算
    fps: opts.fps,
    canvasConfig: {
      width: opts.canvasWidth,
      height: opts.canvasHeight,
      backgroundColor: "#000000",
    },
    colorSpace: 0, // SDR
    lastModifiedPlatform: {
      appSource: opts.appSource,
      appVersion: JIANYING_VERSION,
    },
    tracks: [],
    materials: {
      videos: {},
      audios: {},
      texts: {},
      stickers: {},
      videoEffects: {},
      materialAnimations: {},
      transitions: {},
      masks: {},
      canvases: {},
    },
    platform: {
      appSource: opts.appSource,
    },
  };

  // ── 视频轨道 ──
  if (videoNodes.length > 0) {
    const videoTrack: JianyingTrack = {
      id: generateId(),
      type: "video",
      name: "视频轨道 1",
      flag: 0,
      segments: [],
    };

    for (const videoNode of videoNodes) {
      const materialId = generateUuid();
      const sourceDurationMicros = secondsToMicroseconds(videoNode.durationSeconds);
      const targetStartMicros = secondsToMicroseconds(videoNode.startOffsetSeconds ?? 0);
      const targetDurationMicros = sourceDurationMicros;

      const segmentEndMicros = targetStartMicros + targetDurationMicros;
      if (segmentEndMicros > totalDurationMicroseconds) {
        totalDurationMicroseconds = segmentEndMicros;
      }

      // 添加视频素材
      draft.materials.videos[materialId] = {
        id: materialId,
        type: "video",
        path: `/absolute/path/to/${videoNode.fileName ?? extractFileName(videoNode.videoUrl)}`,
        duration: sourceDurationMicros,
        width: videoNode.width,
        height: videoNode.height,
        format: "mp4",
      };

      // 添加片段
      videoTrack.segments.push({
        id: generateId(),
        materialId,
        targetTimerange: {
          start: targetStartMicros,
          duration: targetDurationMicros,
        },
        sourceTimerange: {
          start: 0,
          duration: sourceDurationMicros,
        },
        clip: {
          speed: 1.0,
          volume: videoNode.volume ?? 1.0,
          alpha: 1.0,
          transformX: videoNode.transformX ?? 0,
          transformY: videoNode.transformY ?? 0,
          scale: videoNode.scale ?? 1.0,
          rotation: videoNode.rotation ?? 0,
        },
        renderIndex: videoTrack.segments.length,
        extraMaterialRefs: [],
      });
    }

    draft.tracks.push(videoTrack);
  }

  // ── 音频轨道 ──
  if (audioNodes.length > 0) {
    const audioTrack: JianyingTrack = {
      id: generateId(),
      type: "audio",
      name: "音频轨道 1",
      flag: 0,
      segments: [],
    };

    for (const audioNode of audioNodes) {
      const materialId = generateUuid();
      const sourceDurationMicros = secondsToMicroseconds(audioNode.durationSeconds);
      const targetStartMicros = secondsToMicroseconds(audioNode.startOffsetSeconds ?? 0);
      const targetDurationMicros = sourceDurationMicros;

      const segmentEndMicros = targetStartMicros + targetDurationMicros;
      if (segmentEndMicros > totalDurationMicroseconds) {
        totalDurationMicroseconds = segmentEndMicros;
      }

      // 添加音频素材
      draft.materials.audios[materialId] = {
        id: materialId,
        type: "audio",
        path: `/absolute/path/to/${audioNode.fileName ?? extractFileName(audioNode.audioUrl)}`,
        duration: sourceDurationMicros,
        format: "mp3",
      };

      // 添加片段
      audioTrack.segments.push({
        id: generateId(),
        materialId,
        targetTimerange: {
          start: targetStartMicros,
          duration: targetDurationMicros,
        },
        sourceTimerange: {
          start: 0,
          duration: sourceDurationMicros,
        },
        clip: {
          speed: 1.0,
          volume: audioNode.volume ?? 1.0,
          alpha: 1.0,
          transformX: 0,
          transformY: 0,
          scale: 1.0,
          rotation: 0,
        },
        renderIndex: audioTrack.segments.length,
        extraMaterialRefs: [],
      });
    }

    draft.tracks.push(audioTrack);
  }

  // ── 字幕轨道 ──
  if (subtitleNodes.length > 0) {
    const subtitleTrack: JianyingTrack = {
      id: generateId(),
      type: "subtitle",
      name: "字幕轨道 1",
      flag: 0,
      segments: [],
    };

    // 收集所有字幕片段
    const allSegments = subtitleNodes.flatMap((node) =>
      node.segments.map((seg) => ({
        startSeconds: seg.startSeconds,
        endSeconds: seg.endSeconds,
        text: seg.text,
        nodeTitle: node.title,
      })),
    );

    for (const seg of allSegments) {
      const materialId = generateUuid();
      const durationSeconds = seg.endSeconds - seg.startSeconds;
      const durationMicros = secondsToMicroseconds(durationSeconds);
      const startMicros = secondsToMicroseconds(seg.startSeconds);

      const segmentEndMicros = startMicros + durationMicros;
      if (segmentEndMicros > totalDurationMicroseconds) {
        totalDurationMicroseconds = segmentEndMicros;
      }

      // 文本素材需要双重编码
      const innerContent = JSON.stringify({
        text: seg.text,
        font: "文轩体",
        size: 10.0,
        color: "#FFFFFF",
      });

      draft.materials.texts[materialId] = {
        id: materialId,
        type: "text",
        content: innerContent,
        duration: durationMicros,
      };

      subtitleTrack.segments.push({
        id: generateId(),
        materialId,
        targetTimerange: {
          start: startMicros,
          duration: durationMicros,
        },
        sourceTimerange: {
          start: 0,
          duration: durationMicros,
        },
        clip: {
          speed: 1.0,
          volume: 1.0,
          alpha: 1.0,
          transformX: 0,
          transformY: 0,
          scale: 1.0,
          rotation: 0,
        },
        renderIndex: subtitleTrack.segments.length,
        extraMaterialRefs: [],
      });
    }

    draft.tracks.push(subtitleTrack);
  }

  // 设置总时长
  draft.duration = totalDurationMicroseconds;

  // ── 构建结果 ──
  const totalDurationSeconds = totalDurationMicroseconds / MICROSECONDS_PER_SECOND;
  const trackCount = draft.tracks.length;
  const materialCount =
    Object.keys(draft.materials.videos).length +
    Object.keys(draft.materials.audios).length +
    Object.keys(draft.materials.texts).length;

  return {
    draftContentJson: JSON.stringify(draft, null, 2),
    draftMetaJson: buildDraftMeta(draft, opts),
    totalDurationSeconds,
    totalDurationMicroseconds,
    trackCount,
    materialCount,
  };
}

/**
 * 构建 draft_meta_info.json 字符串
 *
 * @param draft - 草稿内容
 * @param opts - 导出选项
 * @returns 序列化的 JSON 字符串
 */
function buildDraftMeta(
  draft: JianyingDraftContent,
  opts: Required<JianyingExportOptions>,
): string {
  const meta: JianyingDraftMeta = {
    draftId: draft.id,
    createTime: getCurrentIsoTime(),
    version: JIANYING_VERSION,
    resolution: `${opts.canvasWidth}x${opts.canvasHeight}`,
    frameRate: opts.fps,
    duration: draft.duration,
  };
  return JSON.stringify(meta, null, 2);
}

// ============================================================================
// SRT 字幕生成
// ============================================================================

/**
 * 格式化 SRT 时间码
 *
 * @param totalSeconds - 总秒数
 * @returns 格式化的 SRT 时间码字符串 (HH:MM:SS,mmm)
 */
export function formatSrtTimecode(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const milliseconds = Math.round((totalSeconds - Math.floor(totalSeconds)) * 1000);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")},${String(milliseconds).padStart(3, "0")}`;
}

/**
 * 从字幕节点生成 SRT 字幕内容
 *
 * @param subtitleNodes - 字幕节点列表
 * @returns SRT 格式的字幕字符串
 */
export function generateSrtFromNodes(
  subtitleNodes: JianyingSubtitleNodeInput[],
): string {
  // 如果已有 SRT 内容，直接返回
  const srtContents = subtitleNodes
    .map((node) => node.srtContent)
    .filter((s): s is string => s !== undefined && s.trim().length > 0);

  if (srtContents.length > 0) {
    return srtContents.join("\n\n");
  }

  // 从 segments 构建 SRT
  let index = 1;
  const lines: string[] = [];

  for (const node of subtitleNodes) {
    for (const seg of node.segments) {
      if (!seg.text || seg.text.trim().length === 0) continue;

      lines.push(String(index));
      lines.push(
        `${formatSrtTimecode(seg.startSeconds)} --> ${formatSrtTimecode(seg.endSeconds)}`,
      );
      lines.push(seg.text);
      lines.push("");

      index++;
    }
  }

  return lines.join("\n");
}

function parseSrtSegments(
  srtContent: string,
): JianyingSubtitleNodeInput["segments"] {
  const normalized = srtContent.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];

  return normalized
    .split(/\n{2,}/)
    .map((block) => {
      const lines = block
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
      const timeLineIndex = lines.findIndex((line) => line.includes("-->"));
      if (timeLineIndex === -1) return null;

      const [startRaw, endRaw] = lines[timeLineIndex]!
        .split("-->")
        .map((part) => part.trim());
      const startSeconds = parseDurationString(startRaw ?? "");
      const endSeconds = parseDurationString(endRaw ?? "");
      const text = lines.slice(timeLineIndex + 1).join("\n").trim();

      if (
        startSeconds === null ||
        endSeconds === null ||
        endSeconds <= startSeconds ||
        text.length === 0
      ) {
        return null;
      }

      return { startSeconds, endSeconds, text };
    })
    .filter((segment): segment is JianyingSubtitleNodeInput["segments"][number] =>
      Boolean(segment),
    );
}

function readDurationSeconds(data: { duration?: string; durationSeconds?: number }): number {
  if (typeof data.durationSeconds === "number" && data.durationSeconds > 0) {
    return data.durationSeconds;
  }
  if (data.duration) {
    const parsed = parseDurationString(data.duration);
    if (parsed !== null && parsed > 0) return parsed;
  }
  return 5;
}

// ============================================================================
// ZIP 打包工具
// ============================================================================

async function createZipStore(entries: Array<{ path: string; data: Uint8Array }>): Promise<ArrayBuffer> {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();

  for (const entry of entries) {
    zip.file(entry.path, entry.data);
  }

  return zip.generateAsync({
    type: "arraybuffer",
    compression: "STORE",
  });
}

/**
 * 使用 Fetch API 下载远程文件到 Uint8Array
 *
 * @param url - 文件 URL
 * @returns 文件的 Uint8Array 数据
 */
async function fetchAsUint8Array(url: string): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`下载失败: ${url} (状态码: ${response.status})`);
  }
  const blob = await response.blob();
  const arrayBuffer = await blob.arrayBuffer();
  return new Uint8Array(arrayBuffer);
}

/**
 * 将字符串转换为 Uint8Array
 *
 * @param text - 输入字符串
 * @returns Uint8Array
 */
export function stringToUint8Array(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

// ============================================================================
// 兼容包导出
// ============================================================================

/**
 * 构建剪映兼容包 —— 包含视频、SRT 字幕、音频的 ZIP 包
 *
 * 用户可以在剪映中直接导入视频文件和字幕文件手动编辑
 *
 * @param videoNodes - 视频节点列表
 * @param audioNodes - 音频节点列表
 * @param subtitleNodes - 字幕节点列表
 * @returns 兼容包数据和文件列表
 */
export async function buildJianyingCompatiblePackage(
  videoNodes: JianyingVideoNodeInput[],
  audioNodes: JianyingAudioNodeInput[],
  subtitleNodes: JianyingSubtitleNodeInput[],
): Promise<JianyingCompatiblePackage> {
  const usedVideoFileNames = new Set<string>();
  const usedAudioFileNames = new Set<string>();
  const packageVideoNodes = videoNodes.map((node, index) => ({
    ...node,
    fileName: uniquePackageFileName(
      node.fileName ?? extractFileName(node.videoUrl),
      `video_${index + 1}`,
      ".mp4",
      usedVideoFileNames,
    ),
  }));
  const packageAudioNodes = audioNodes.map((node, index) => ({
    ...node,
    fileName: uniquePackageFileName(
      node.fileName ?? extractFileName(node.audioUrl),
      `audio_${index + 1}`,
      ".mp3",
      usedAudioFileNames,
    ),
  }));
  const entries: Array<{ path: string; data: Uint8Array }> = [];
  const files: Array<{ path: string; size: number }> = [];
  const downloadFailures: string[] = [];
  const baseDir = "JianYingCompatible";

  // ── 添加 README ──
  const readmeContent = buildReadmeContent(packageVideoNodes, packageAudioNodes, subtitleNodes);
  entries.push({
    path: `${baseDir}/README.txt`,
    data: stringToUint8Array(readmeContent),
  });
  files.push({ path: `${baseDir}/README.txt`, size: readmeContent.length });

  // ── 添加 SRT 字幕文件 ──
  const srtContent = generateSrtFromNodes(subtitleNodes);
  entries.push({
    path: `${baseDir}/subtitles.srt`,
    data: stringToUint8Array(srtContent),
  });
  files.push({ path: `${baseDir}/subtitles.srt`, size: srtContent.length });

  // ── 添加视频文件 ──
  for (let i = 0; i < packageVideoNodes.length; i++) {
    const videoNode = packageVideoNodes[i];
    const fileName = videoNode.fileName ?? `video_${i + 1}.mp4`;
    try {
      const videoData = await fetchAsUint8Array(videoNode.videoUrl);
      entries.push({
        path: `${baseDir}/videos/${fileName}`,
        data: videoData,
      });
      files.push({ path: `${baseDir}/videos/${fileName}`, size: videoData.length });
    } catch (error) {
      downloadFailures.push(`视频「${videoNode.title}」: ${(error as Error).message}`);
    }
  }

  // ── 添加音频文件 ──
  for (let i = 0; i < packageAudioNodes.length; i++) {
    const audioNode = packageAudioNodes[i];
    const fileName = audioNode.fileName ?? `audio_${i + 1}.mp3`;
    try {
      const audioData = await fetchAsUint8Array(audioNode.audioUrl);
      entries.push({
        path: `${baseDir}/audios/${fileName}`,
        data: audioData,
      });
      files.push({ path: `${baseDir}/audios/${fileName}`, size: audioData.length });
    } catch (error) {
      downloadFailures.push(`音频「${audioNode.title}」: ${(error as Error).message}`);
    }
  }

  if (downloadFailures.length > 0) {
    throw new Error(`剪映兼容包素材下载失败：\n${downloadFailures.join("\n")}`);
  }

  // ── 添加剪映草稿 JSON ──
  const result = exportToJianyingDraft(packageVideoNodes, packageAudioNodes, subtitleNodes);
  entries.push({
    path: `${baseDir}/draft_content.json`,
    data: stringToUint8Array(result.draftContentJson),
  });
  files.push({
    path: `${baseDir}/draft_content.json`,
    size: result.draftContentJson.length,
  });

  // ── 创建 ZIP ──
  const zipBuffer = await createZipStore(entries);

  return {
    zipBuffer,
    fileName: `${DEFAULT_DRAFT_NAME}_JianYingCompatible.zip`,
    files,
  };
}

/**
 * 构建 README.txt 内容
 *
 * @param videoNodes - 视频节点列表
 * @param audioNodes - 音频节点列表
 * @param subtitleNodes - 字幕节点列表
 * @returns README 文本
 */
function buildReadmeContent(
  videoNodes: JianyingVideoNodeInput[],
  audioNodes: JianyingAudioNodeInput[],
  subtitleNodes: JianyingSubtitleNodeInput[],
): string {
  const lines: string[] = [
    "╔══════════════════════════════════════════════════════════╗",
    "║        星轨画布 (StarCanvas) - 剪映兼容导出包          ║",
    "╚══════════════════════════════════════════════════════════╝",
    "",
    "生成时间: " + getCurrentIsoTime(),
    "",
    "─── 使用说明 ───",
    "1. 解压本 ZIP 包",
    "2. 打开剪映 (JianYing Pro)",
    "3. 新建项目 -> 导入素材 -> 选择 videos/ 和 audios/ 目录下的文件",
    "4. 导入字幕文件 subtitles.srt",
    "5. 按时间轴排列素材，开始编辑",
    "",
    "─── 文件清单 ───",
    "",
  ];

  lines.push(`[视频] ${videoNodes.length} 个`);
  for (let i = 0; i < videoNodes.length; i++) {
    const v = videoNodes[i];
    lines.push(`  ${i + 1}. ${v.title} (${v.durationSeconds.toFixed(1)}s, ${v.width}x${v.height})`);
  }

  lines.push("");
  lines.push(`[音频] ${audioNodes.length} 个`);
  for (let i = 0; i < audioNodes.length; i++) {
    const a = audioNodes[i];
    lines.push(`  ${i + 1}. ${a.title} (${a.durationSeconds.toFixed(1)}s)`);
  }

  lines.push("");
  const totalSubtitles = subtitleNodes.reduce((sum, n) => sum + n.segments.length, 0);
  lines.push(`[字幕] ${totalSubtitles} 条`);
  for (const node of subtitleNodes) {
    lines.push(`  - ${node.title}: ${node.segments.length} 条字幕`);
  }

  lines.push("");
  lines.push("─── 技术说明 ───");
  lines.push("- 视频文件: MP4 格式");
  lines.push("- 字幕文件: SRT 格式 (UTF-8)");
  lines.push("- 音频文件: MP3 格式");
  lines.push("- 同时包含了 draft_content.json (剪映草稿格式，仅 JSON 描述)");
  lines.push("");
  lines.push("由 StarCanvas 自动生成");

  return lines.join("\n");
}

// ============================================================================
// 浏览器端下载工具
// ============================================================================

/**
 * 在浏览器中触发 JSON 文件下载
 *
 * @param jsonString - JSON 字符串
 * @param fileName - 下载文件名
 */
export function downloadJsonFile(jsonString: string, fileName: string): void {
  const blob = new Blob([jsonString], { type: "application/json;charset=utf-8" });
  downloadBlob(blob, fileName);
}

/**
 * 在浏览器中触发 ZIP 文件下载
 *
 * @param arrayBuffer - ZIP 文件的 ArrayBuffer
 * @param fileName - 下载文件名
 */
export function downloadZipBuffer(arrayBuffer: ArrayBuffer, fileName: string): void {
  const blob = new Blob([arrayBuffer], { type: "application/zip" });
  downloadBlob(blob, fileName);
}

/**
 * 在浏览器中触发 Blob 文件下载
 *
 * @param blob - 文件数据
 * @param fileName - 文件名
 */
function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

// ============================================================================
// 从 Canvas 节点提取数据的辅助函数
// ============================================================================

/**
 * 从 CanvasNodeData 中提取视频节点输入
 *
 * @param nodes - 画布节点列表
 * @returns 视频节点输入列表
 */
export const JIANYING_VIDEO_NODE_KINDS = new Set([
  "uploaded-video",
  "video",
  "video-generation",
  "video-result",
  "talking-photo",
]);

export function extractVideoNodesFromCanvas(
  nodes: Array<{
    id: string;
    data: {
      title?: string;
      nodeKind?: string;
      resultUrl?: string;
      assetUrl?: string;
      imageUrl?: string;
      duration?: string;
      videoDurationMs?: number;
      videoWidth?: number;
      videoHeight?: number;
      videoFps?: number;
      fileName?: string;
      shot?: { id?: string };
    };
  }>,
): JianyingVideoNodeInput[] {
  const result: JianyingVideoNodeInput[] = [];
  for (const node of nodes) {
    if (!JIANYING_VIDEO_NODE_KINDS.has(node.data.nodeKind ?? "")) continue;
    const videoUrl = node.data.resultUrl || node.data.assetUrl || node.data.imageUrl;
    if (!videoUrl) continue;

    // 优先使用 videoDurationMs（毫秒），然后尝试 duration（字符串），最后默认 5 秒
    let durationSeconds = 5;
    if (node.data.videoDurationMs !== undefined && node.data.videoDurationMs > 0) {
      durationSeconds = node.data.videoDurationMs / 1000;
    } else if (node.data.duration) {
      const parsed = parseDurationString(node.data.duration);
      if (parsed !== null) {
        durationSeconds = parsed;
      }
    }

    result.push({
      id: node.id,
      title: node.data.title ?? "视频节点",
      videoUrl,
      durationSeconds,
      width: node.data.videoWidth ?? DEFAULT_CANVAS_WIDTH,
      height: node.data.videoHeight ?? DEFAULT_CANVAS_HEIGHT,
      fps: node.data.videoFps,
      fileName: node.data.fileName,
      startOffsetSeconds: 0,
      volume: 1.0,
      scale: 1.0,
      transformX: 0,
      transformY: 0,
      rotation: 0,
    });
  }

  return result;
}

/**
 * 从 CanvasNodeData 中提取音频节点输入
 *
 * @param nodes - 画布节点列表
 * @returns 音频节点输入列表
 */
export function extractAudioNodesFromCanvas(
  nodes: Array<{
    id: string;
    data: {
      title?: string;
      nodeKind?: string;
      resultUrl?: string;
      assetUrl?: string;
      audioUrl?: string;
      voiceAudioUrl?: string;
      duration?: string;
      durationSeconds?: number;
      startOffsetSeconds?: number;
      timelineStartTimeSeconds?: number;
      fileName?: string;
      shot?: { voiceAudioUrl?: string; voiceConfig?: { text?: string } };
    };
  }>,
): JianyingAudioNodeInput[] {
  const result: JianyingAudioNodeInput[] = [];

  for (const node of nodes) {
    const shot = node.data.shot;
    const audioUrl =
      node.data.audioUrl ||
      node.data.resultUrl ||
      node.data.assetUrl ||
      node.data.voiceAudioUrl ||
      shot?.voiceAudioUrl;
    if (!audioUrl) continue;

    const nodeKind = node.data.nodeKind || "";
    const isAudioNode =
      nodeKind.includes("audio") ||
      nodeKind.includes("tts") ||
      nodeKind === "bgm" ||
      Boolean(shot?.voiceAudioUrl);
    if (!isAudioNode) continue;

    let durationSeconds = 5;
    if (typeof node.data.durationSeconds === "number" && node.data.durationSeconds > 0) {
      durationSeconds = node.data.durationSeconds;
    } else if (node.data.duration) {
      const parsed = parseDurationString(node.data.duration);
      if (parsed !== null && parsed > 0) {
        durationSeconds = parsed;
      }
    }

    const startOffsetCandidate = node.data.startOffsetSeconds ?? node.data.timelineStartTimeSeconds;
    const startOffsetSeconds =
      typeof startOffsetCandidate === "number" &&
      Number.isFinite(startOffsetCandidate) &&
      startOffsetCandidate >= 0
        ? startOffsetCandidate
        : 0;

    result.push({
      id: node.id,
      title: node.data.title ?? "音频节点",
      audioUrl,
      durationSeconds,
      startOffsetSeconds,
      volume: 1.0,
      fileName: node.data.fileName,
    });
  }

  return result;
}

/**
 * 从 CanvasNodeData 中提取字幕节点输入
 *
 * @param nodes - 画布节点列表
 * @returns 字幕节点输入列表
 */
export function extractSubtitleNodesFromCanvas(
  nodes: Array<{
    id: string;
    data: {
      title?: string;
      nodeKind?: string;
      text?: string;
      content?: string;
      duration?: string;
      durationSeconds?: number;
      shot?: {
        subtitleTimeline?: {
          startTimeSeconds?: number;
          durationSeconds?: number;
          segments?: Array<{ index: number; startSeconds: number; endSeconds: number; text: string }>;
          srtContent?: string;
        };
      };
      srtContent?: string;
      segments?: Array<{ index: number; start: number; end: number; text: string }>;
    };
  }>,
): JianyingSubtitleNodeInput[] {
  const result: JianyingSubtitleNodeInput[] = [];

  for (const node of nodes) {
    const shot = node.data.shot;

    // 优先使用 shot 中的字幕时间轴
    if (shot?.subtitleTimeline?.segments && shot.subtitleTimeline.segments.length > 0) {
      result.push({
        id: node.id,
        title: node.data.title ?? "字幕节点",
        segments: shot.subtitleTimeline.segments.map((seg) => ({
          startSeconds: seg.startSeconds,
          endSeconds: seg.endSeconds,
          text: seg.text,
        })),
      });
      continue;
    }

    // 其次使用节点自带的 segments 字段（SRT 字幕节点）
    if (node.data.segments && node.data.segments.length > 0) {
      result.push({
        id: node.id,
        title: node.data.title ?? "字幕节点",
        segments: node.data.segments.map((seg) => ({
          startSeconds: seg.start,
          endSeconds: seg.end,
          text: seg.text,
        })),
        srtContent: node.data.srtContent,
      });
      continue;
    }

    const srtContent = node.data.srtContent || shot?.subtitleTimeline?.srtContent;
    if (srtContent && srtContent.trim().length > 0) {
      result.push({
        id: node.id,
        title: node.data.title ?? "字幕节点",
        segments: parseSrtSegments(srtContent),
        srtContent,
      });
      continue;
    }

    const text = node.data.text || node.data.content;
    if (
      node.data.nodeKind?.includes("subtitle") &&
      text &&
      text.trim().length > 0
    ) {
      result.push({
        id: node.id,
        title: node.data.title ?? "字幕节点",
        segments: [
          {
            startSeconds: 0,
            endSeconds: readDurationSeconds(node.data),
            text: text.trim(),
          },
        ],
      });
      continue;
    }
  }

  return result;
}

/**
 * 解析时长字符串为秒数
 *
 * 支持的格式：
 * - "5s" → 5
 * - "1.5s" → 1.5
 * - "00:00:05,000" → 5
 * - "00:00:05" → 5
 *
 * @param duration - 时长字符串
 * @returns 秒数，解析失败返回 null
 */
function parseDurationString(duration: string | number): number | null {
  if (typeof duration === "number") {
    return Number.isFinite(duration) && duration > 0 ? duration : null;
  }
  // 尝试 ISO 时长格式 PT5S
  const isoMatch = duration.match(/^PT(\d+(?:\.\d+)?)S$/);
  if (isoMatch) return parseFloat(isoMatch[1]);

  // 尝试 SRT 时间码格式 00:00:05,000
  const srtMatch = duration.match(/^(\d+):(\d+):(\d+)[,.](\d+)$/);
  if (srtMatch) {
    const hours = parseInt(srtMatch[1], 10);
    const minutes = parseInt(srtMatch[2], 10);
    const seconds = parseInt(srtMatch[3], 10);
    const millis = parseInt(srtMatch[4], 10);
    return hours * 3600 + minutes * 60 + seconds + millis / 1000;
  }

  // 尝试 HH:MM:SS 格式
  const timeMatch = duration.match(/^(\d+):(\d+):(\d+)$/);
  if (timeMatch) {
    const hours = parseInt(timeMatch[1], 10);
    const minutes = parseInt(timeMatch[2], 10);
    const seconds = parseInt(timeMatch[3], 10);
    return hours * 3600 + minutes * 60 + seconds;
  }

  // 尝试 MM:SS 格式
  const shortMatch = duration.match(/^(\d+):(\d+)$/);
  if (shortMatch) {
    const minutes = parseInt(shortMatch[1], 10);
    const seconds = parseInt(shortMatch[2], 10);
    return minutes * 60 + seconds;
  }

  // 尝试纯数字
  const numMatch = duration.match(/^(\d+(?:\.\d+)?)/);
  if (numMatch) return parseFloat(numMatch[1]);

  return null;
}
