import type { Edge, Node } from "@xyflow/react";
import {
  computeFrameTimes,
} from "../../../features/reverse-storyboard/computeFrameTimes.ts";
import {
  computeSceneChangeFrameSelections,
  computeSceneChangeFrameTimes,
  type SceneChangeFrameSelection,
  type SceneSamplePoint,
} from "../../../features/reverse-storyboard/computeSceneChangeFrameTimes.ts";
import type { CanvasNodeData } from "../components/canvas/types";
import type { VideoKeyframeRef } from "../types/video-analysis";

export const MAX_REAL_VIDEO_FRAMES = 8;

export interface WorkflowVideoSource {
  nodeId: string;
  url: string;
  name?: string;
  durationMs?: number;
  width?: number;
  height?: number;
  mimeType?: string;
  thumbnailUrl?: string;
}

export interface ExtractWorkflowVideoFramesOptions {
  count?: number;
  maxFrames?: number;
  sceneDetection?: boolean;
  sceneSampleCount?: number;
  format?: "image/jpeg" | "image/png";
  quality?: number;
}

interface VideoMeta {
  width: number;
  height: number;
  durationSec: number;
}

interface CaptureFrameOptions {
  videoUrl: string;
  timeSec: number;
  frameIndex: number;
  totalFrames: number;
  format: "image/jpeg" | "image/png";
  quality: number;
  sourceWidth: number;
  sourceHeight: number;
}

type FrameSelectionPlan = Array<{
  timeSec: number;
  sceneIndex?: number;
  score?: number;
  reason?: VideoKeyframeRef["selectionReason"];
}>;

export function collectWorkflowVideoSources(
  node: Node<CanvasNodeData>,
  allNodes: Node<CanvasNodeData>[],
  edges: Edge[],
): WorkflowVideoSource[] {
  const incomingIds = edges
    .filter((edge) => edge.target === node.id)
    .map((edge) => edge.source);
  const nodeById = new Map(
    allNodes.map((candidate) => [candidate.id, candidate]),
  );
  const candidates = [
    ...incomingIds
      .map((id) => nodeById.get(id))
      .filter(
        (candidate): candidate is Node<CanvasNodeData> => Boolean(candidate),
      ),
    node,
  ];

  const seen = new Set<string>();
  const sources: WorkflowVideoSource[] = [];

  for (const candidate of candidates) {
    const source = getVideoSourceFromNode(candidate);
    if (!source || seen.has(source.url)) continue;
    seen.add(source.url);
    sources.push(source);
  }

  return sources;
}

export function getVideoSourceFromNode(
  node: Node<CanvasNodeData>,
): WorkflowVideoSource | undefined {
  const data = node.data;
  const url = firstString(
    data.assetUrl,
    data.resultUrl,
    data.nodeKind === "uploaded-video" ? data.imageUrl : undefined,
    findFirstStringArrayItem(data.generationOutput, "videos"),
    findFirstStringArrayItem(data.generationOutput, "videoUrls"),
  );

  if (!url || !looksLikeVideoUrl(url, data)) return undefined;

  return {
    nodeId: node.id,
    url,
    name: data.title ?? data.fileName,
    durationMs: data.videoDurationMs,
    width: data.videoWidth,
    height: data.videoHeight,
    mimeType: data.mimeType,
    thumbnailUrl: data.thumbnailUrl,
  };
}

export async function extractWorkflowVideoFrames(
  source: WorkflowVideoSource,
  options: ExtractWorkflowVideoFramesOptions = {},
): Promise<VideoKeyframeRef[]> {
  if (typeof document === "undefined") {
    throw new Error("真实视频抽帧需要浏览器 DOM 环境");
  }

  const count = Math.max(
    1,
    Math.min(options.count ?? 4, options.maxFrames ?? MAX_REAL_VIDEO_FRAMES),
  );
  const maxFrames = Math.max(
    1,
    Math.min(options.maxFrames ?? MAX_REAL_VIDEO_FRAMES, MAX_REAL_VIDEO_FRAMES),
  );
  const format = options.format ?? "image/jpeg";
  const quality = options.quality ?? 0.82;
  const meta = await loadVideoMeta(source.url);
  const selections = (options.sceneDetection ?? true)
    ? await computeSceneAwareSelections(source.url, meta.durationSec, {
        count,
        maxFrames,
        sampleCount: options.sceneSampleCount ?? Math.max(count * 3, 12),
      })
    : computeFrameTimes(meta.durationSec, { count, maxFrames }).map((timeSec, index) => ({
        timeSec,
        sceneIndex: index,
        score: 0,
        reason: "uniform-fallback" as const,
      }));

  const frames: VideoKeyframeRef[] = [];
  for (let i = 0; i < selections.length; i++) {
    const selection = selections[i];
    const frame = await captureFrame({
      videoUrl: source.url,
      timeSec: selection.timeSec,
      frameIndex: i,
      totalFrames: selections.length,
      format,
      quality,
      sourceWidth: meta.width,
      sourceHeight: meta.height,
    });
    frames.push({
      sourceVideoId: source.nodeId,
      sourceVideoUrl: source.url,
      timestampMs: Math.round(selection.timeSec * 1000),
      frameIndex: i,
      imageUrl: frame.imageUrl,
      width: meta.width,
      height: meta.height,
      selectionReason: selection.reason,
      sceneIndex: selection.sceneIndex,
      changeScore: selection.score,
    });
  }

  return frames;
}

function looksLikeVideoUrl(url: string, data: CanvasNodeData): boolean {
  if (data.nodeKind?.includes("video")) return true;
  if (data.mimeType?.startsWith("video/")) return true;
  if (url.startsWith("blob:") || url.startsWith("data:video/")) return true;
  return /\.(mp4|webm|mov|m4v|ogv)(?:[?#].*)?$/i.test(url);
}

function firstString(...values: Array<unknown>): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value;
  }
  return undefined;
}

function findFirstStringArrayItem(
  value: unknown,
  key: string,
): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = (value as Record<string, unknown>)[key];
  if (!Array.isArray(candidate)) return undefined;
  return candidate.find(
    (item): item is string =>
      typeof item === "string" && item.trim().length > 0,
  );
}

function loadVideoMeta(url: string): Promise<VideoMeta> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.crossOrigin = "anonymous";

    const cleanup = () => {
      video.removeEventListener("loadedmetadata", onLoad);
      video.removeEventListener("error", onError);
      video.remove();
    };

    const onLoad = () => {
      const meta = {
        width: video.videoWidth || 1280,
        height: video.videoHeight || 720,
        durationSec:
          Number.isFinite(video.duration) && video.duration > 0
            ? video.duration
            : 1,
      };
      cleanup();
      resolve(meta);
    };

    const onError = () => {
      cleanup();
      reject(new Error("无法加载视频文件，可能是格式不支持或跨域限制"));
    };

    video.addEventListener("loadedmetadata", onLoad);
    video.addEventListener("error", onError);
    video.src = url;
    video.load();
  });
}

async function computeSceneAwareSelections(
  videoUrl: string,
  durationSec: number,
  options: { count: number; maxFrames: number; sampleCount: number },
): Promise<FrameSelectionPlan> {
  try {
    const sampleTimes = computeFrameTimes(durationSec, {
      count: options.sampleCount,
      maxFrames: Math.max(options.sampleCount, options.maxFrames),
    });
    const samples: SceneSamplePoint[] = [];

    for (const timeSec of sampleTimes) {
      samples.push(
        await captureImageDataSample({
          videoUrl,
          timeSec,
          width: 96,
          height: 54,
        }),
      );
    }

    const selections = computeSceneChangeFrameSelections(durationSec, samples, {
      count: options.count,
      maxFrames: options.maxFrames,
    });
    return selections.length > 0
      ? selections.map(toFrameSelection)
      : computeUniformFallbackSelections(durationSec, options);
  } catch {
    return computeUniformFallbackSelections(durationSec, options);
  }
}

function computeUniformFallbackSelections(
  durationSec: number,
  options: { count: number; maxFrames: number },
): FrameSelectionPlan {
  return computeFrameTimes(durationSec, {
    count: options.count,
    maxFrames: options.maxFrames,
  }).map((timeSec, index) => ({
    timeSec,
    sceneIndex: index,
    score: 0,
    reason: "uniform-fallback",
  }));
}

function toFrameSelection(selection: SceneChangeFrameSelection): FrameSelectionPlan[number] {
  return {
    timeSec: selection.timeSec,
    sceneIndex: selection.sceneIndex,
    score: selection.score,
    reason: selection.reason,
  };
}

function captureImageDataSample(opts: {
  videoUrl: string;
  timeSec: number;
  width: number;
  height: number;
}): Promise<SceneSamplePoint> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    if (!ctx) {
      reject(new Error("Canvas 2D context not available"));
      return;
    }

    canvas.width = opts.width;
    canvas.height = opts.height;
    video.preload = "auto";
    video.muted = true;
    video.crossOrigin = "anonymous";

    const cleanup = () => {
      video.removeEventListener("loadedmetadata", onLoadedMetadata);
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
      video.remove();
    };

    const onLoadedMetadata = () => {
      video.currentTime = Math.min(opts.timeSec, video.duration || opts.timeSec);
    };

    const onSeeked = () => {
      try {
        ctx.drawImage(video, 0, 0, opts.width, opts.height);
        const sample = {
          timeSec: opts.timeSec,
          imageData: ctx.getImageData(0, 0, opts.width, opts.height),
        };
        cleanup();
        resolve(sample);
      } catch (error) {
        cleanup();
        reject(error instanceof Error ? error : new Error("视频帧采样失败"));
      }
    };

    const onError = () => {
      cleanup();
      reject(new Error(`场景采样失败: ${opts.timeSec}s`));
    };

    video.addEventListener("loadedmetadata", onLoadedMetadata);
    video.addEventListener("seeked", onSeeked);
    video.addEventListener("error", onError);
    video.src = opts.videoUrl;
    video.load();
  });
}

function captureFrame(opts: CaptureFrameOptions): Promise<{ imageUrl: string }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    if (!ctx) {
      reject(new Error("Canvas 2D context not available"));
      return;
    }

    canvas.width = opts.sourceWidth;
    canvas.height = opts.sourceHeight;
    video.preload = "auto";
    video.muted = true;
    video.crossOrigin = "anonymous";

    const cleanup = () => {
      video.removeEventListener("loadedmetadata", onLoadedMetadata);
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
      video.remove();
    };

    const onLoadedMetadata = () => {
      video.currentTime = Math.min(opts.timeSec, video.duration || opts.timeSec);
    };

    const onSeeked = () => {
      try {
        ctx.drawImage(video, 0, 0, opts.sourceWidth, opts.sourceHeight);
        const imageUrl = canvas.toDataURL(opts.format, opts.quality);
        cleanup();
        resolve({ imageUrl });
      } catch (error) {
        cleanup();
        reject(
          error instanceof Error
            ? error
            : new Error(
                `帧 ${opts.frameIndex + 1}/${opts.totalFrames} 提取失败`,
              ),
        );
      }
    };

    const onError = () => {
      cleanup();
      reject(new Error(`帧 ${opts.frameIndex + 1}/${opts.totalFrames} 提取失败`));
    };

    video.addEventListener("loadedmetadata", onLoadedMetadata);
    video.addEventListener("seeked", onSeeked);
    video.addEventListener("error", onError);
    video.src = opts.videoUrl;
    video.load();
  });
}
