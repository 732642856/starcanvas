import type {
  VideoAnalysisResult,
  VideoEvent,
  VideoKeyframeRef,
  VideoSceneSegment,
} from "../types/video-analysis";

export interface FrameVisualStats {
  frameIndex: number;
  timestampMs: number;
  width: number;
  height: number;
  averageLuma: number;
  contrast: number;
  saturation: number;
  dominantColor: string;
  colorTemperature: "warm" | "neutral" | "cool";
}

export interface VideoAnalysisMetrics {
  frameCount: number;
  averageLuma: number;
  averageContrast: number;
  averageSaturation: number;
  motionScore: number;
  colorTemperature: "warm" | "neutral" | "cool";
  dominantColors: string[];
}

interface FrameTransitionScore {
  fromFrameIndex: number;
  toFrameIndex: number;
  timestampMs: number;
  score: number;
  lumaDelta: number;
  saturationDelta: number;
  contrastDelta: number;
  colorDelta: number;
}

export async function analyzeVideoKeyframes(
  keyframes: VideoKeyframeRef[],
): Promise<VideoAnalysisResult> {
  if (keyframes.length === 0) {
    return createEmptyVideoAnalysis();
  }

  try {
    const stats = await Promise.all(
      keyframes.map((frame) => extractFrameStats(frame)),
    );
    return buildVideoAnalysisFromFrameStats(keyframes, stats);
  } catch (error) {
    return {
      summary: `已收到 ${keyframes.length} 个关键帧，但浏览器无法读取帧像素（可能是跨域或图片解码限制）。`,
      keyframes,
      captions: [],
      events: [],
      objects: [],
      raw: {
        mode: "local-frame-analysis-error",
        frameCount: keyframes.length,
        error: error instanceof Error ? error.message : "unknown",
        sourceVideoIds: unique(keyframes.map((frame) => frame.sourceVideoId)),
      },
    };
  }
}

export function computeFrameVisualStats(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  meta: { frameIndex: number; timestampMs: number },
): FrameVisualStats {
  let lumaTotal = 0;
  let saturationTotal = 0;
  let warmCoolTotal = 0;
  let redTotal = 0;
  let greenTotal = 0;
  let blueTotal = 0;
  let sampleCount = 0;
  const lumas: number[] = [];
  const stride = Math.max(1, Math.floor((width * height) / 6000));

  for (let pixelIndex = 0; pixelIndex < width * height; pixelIndex += stride) {
    const offset = pixelIndex * 4;
    const alpha = pixels[offset + 3];
    if (alpha === 0) continue;

    const red = pixels[offset] / 255;
    const green = pixels[offset + 1] / 255;
    const blue = pixels[offset + 2] / 255;
    const luma = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    const max = Math.max(red, green, blue);
    const min = Math.min(red, green, blue);
    const saturation = max === 0 ? 0 : (max - min) / max;

    lumaTotal += luma;
    saturationTotal += saturation;
    warmCoolTotal += red - blue;
    redTotal += red;
    greenTotal += green;
    blueTotal += blue;
    lumas.push(luma);
    sampleCount++;
  }

  if (sampleCount === 0) {
    return {
      frameIndex: meta.frameIndex,
      timestampMs: meta.timestampMs,
      width,
      height,
      averageLuma: 0,
      contrast: 0,
      saturation: 0,
      dominantColor: "#000000",
      colorTemperature: "neutral",
    };
  }

  const averageLuma = lumaTotal / sampleCount;
  const contrast = Math.sqrt(
    lumas.reduce((sum, luma) => sum + (luma - averageLuma) ** 2, 0) /
      sampleCount,
  );
  const saturation = saturationTotal / sampleCount;
  const warmCool = warmCoolTotal / sampleCount;

  return {
    frameIndex: meta.frameIndex,
    timestampMs: meta.timestampMs,
    width,
    height,
    averageLuma: roundMetric(averageLuma),
    contrast: roundMetric(contrast),
    saturation: roundMetric(saturation),
    dominantColor: toHexColor(
      Math.round((redTotal / sampleCount) * 255),
      Math.round((greenTotal / sampleCount) * 255),
      Math.round((blueTotal / sampleCount) * 255),
    ),
    colorTemperature:
      warmCool > 0.06 ? "warm" : warmCool < -0.06 ? "cool" : "neutral",
  };
}

export function buildVideoAnalysisFromFrameStats(
  keyframes: VideoKeyframeRef[],
  stats: FrameVisualStats[],
): VideoAnalysisResult {
  if (keyframes.length === 0 || stats.length === 0) {
    return createEmptyVideoAnalysis();
  }

  const metrics = summarizeVideoMetrics(stats);
  const transitions = computeFrameTransitionScores(stats);
  const scenes = detectSceneSegments(stats, transitions);
  const enrichedKeyframes = keyframes.map((frame, index) => ({
    ...frame,
    description: describeFrame(
      stats[index] ?? stats[stats.length - 1],
      scenes.find((scene) => scene.frameIndexes.includes(frame.frameIndex)),
    ),
  }));
  const events = buildLocalAnalysisEvents(stats, metrics, scenes);
  const summary = [
    `真实视频分析：已基于 ${metrics.frameCount} 个关键帧完成本地像素分析。`,
    `画面整体${brightnessLabel(metrics.averageLuma)}，${contrastLabel(metrics.averageContrast)}，${saturationLabel(metrics.averageSaturation)}。`,
    `主色倾向为${temperatureLabel(metrics.colorTemperature)}，镜头/画面变化${motionLabel(metrics.motionScore)}。`,
    `检测到 ${scenes.length} 个候选场景/镜头段。`,
  ].join("");

  return {
    summary,
    keyframes: enrichedKeyframes,
    captions: [],
    events,
    scenes,
    objects: [],
    raw: {
      mode: "local-frame-analysis",
      frameCount: metrics.frameCount,
      sourceVideoIds: unique(keyframes.map((frame) => frame.sourceVideoId)),
      metrics,
      frameStats: stats,
      transitions,
      scenes,
      limitations: [
        "本地像素分析只能判断亮度、色彩、对比度和画面变化，不能可靠识别人物、物体或剧情语义。",
      ],
    },
  };
}

export function summarizeVideoMetrics(
  stats: FrameVisualStats[],
): VideoAnalysisMetrics {
  const frameCount = stats.length;
  const averageLuma = average(stats.map((item) => item.averageLuma));
  const averageContrast = average(stats.map((item) => item.contrast));
  const averageSaturation = average(stats.map((item) => item.saturation));
  const motionScore = calculateMotionProxy(stats);
  const warm = stats.filter((item) => item.colorTemperature === "warm").length;
  const cool = stats.filter((item) => item.colorTemperature === "cool").length;
  const colorTemperature =
    warm > cool && warm >= frameCount / 3
      ? "warm"
      : cool > warm && cool >= frameCount / 3
        ? "cool"
        : "neutral";

  return {
    frameCount,
    averageLuma: roundMetric(averageLuma),
    averageContrast: roundMetric(averageContrast),
    averageSaturation: roundMetric(averageSaturation),
    motionScore: roundMetric(motionScore),
    colorTemperature,
    dominantColors: unique(stats.map((item) => item.dominantColor)).slice(0, 6),
  };
}

function createEmptyVideoAnalysis(): VideoAnalysisResult {
  return {
    summary: "未检测到上游帧数据，请先连接视频素材并运行视频抽帧节点。",
    keyframes: [],
    captions: [],
    events: [],
    objects: [],
    raw: { mode: "local-frame-analysis", frameCount: 0 },
  };
}

function extractFrameStats(frame: VideoKeyframeRef): Promise<FrameVisualStats> {
  if (typeof document === "undefined" || typeof Image === "undefined") {
    return Promise.reject(new Error("视频帧分析需要浏览器 DOM 环境"));
  }

  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      try {
        const width = image.naturalWidth || frame.width || 320;
        const height = image.naturalHeight || frame.height || 180;
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) throw new Error("Canvas 2D context not available");
        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(image, 0, 0, width, height);
        const pixels = ctx.getImageData(0, 0, width, height).data;
        resolve(
          computeFrameVisualStats(pixels, width, height, {
            frameIndex: frame.frameIndex,
            timestampMs: frame.timestampMs,
          }),
        );
      } catch (error) {
        reject(error);
      }
    };
    image.onerror = () =>
      reject(new Error(`关键帧 ${frame.frameIndex + 1} 解码失败`));
    image.src = frame.imageUrl;
  });
}

function buildLocalAnalysisEvents(
  stats: FrameVisualStats[],
  metrics: VideoAnalysisMetrics,
  scenes: VideoSceneSegment[],
): VideoEvent[] {
  const startMs = stats[0]?.timestampMs ?? 0;
  const endMs = stats[stats.length - 1]?.timestampMs ?? startMs;

  return [
    {
      startMs,
      endMs,
      label: "visual-style",
      description: `整体${brightnessLabel(metrics.averageLuma)}，${contrastLabel(metrics.averageContrast)}，${saturationLabel(metrics.averageSaturation)}。`,
      confidence: 0.72,
    },
    {
      startMs,
      endMs,
      label: "shot-rhythm",
      description: `关键帧之间的画面变化${motionLabel(metrics.motionScore)}。`,
      confidence: 0.64,
    },
    ...scenes.map((scene) => ({
      startMs: scene.startMs,
      endMs: scene.endMs,
      label: "scene-boundary",
      description: scene.description,
      confidence: scene.confidence,
    })),
  ];
}

export function computeFrameTransitionScores(
  stats: FrameVisualStats[],
): FrameTransitionScore[] {
  const sorted = [...stats].sort((a, b) => a.timestampMs - b.timestampMs);
  const transitions: FrameTransitionScore[] = [];

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    const lumaDelta = Math.abs(curr.averageLuma - prev.averageLuma);
    const saturationDelta = Math.abs(curr.saturation - prev.saturation);
    const contrastDelta = Math.abs(curr.contrast - prev.contrast);
    const colorDelta = hexColorDistance(prev.dominantColor, curr.dominantColor);
    const score = Math.min(
      1,
      lumaDelta * 0.35 +
        saturationDelta * 0.18 +
        contrastDelta * 0.17 +
        colorDelta * 0.3,
    );

    transitions.push({
      fromFrameIndex: prev.frameIndex,
      toFrameIndex: curr.frameIndex,
      timestampMs: curr.timestampMs,
      score: roundMetric(score),
      lumaDelta: roundMetric(lumaDelta),
      saturationDelta: roundMetric(saturationDelta),
      contrastDelta: roundMetric(contrastDelta),
      colorDelta: roundMetric(colorDelta),
    });
  }

  return transitions;
}

export function detectSceneSegments(
  stats: FrameVisualStats[],
  transitions = computeFrameTransitionScores(stats),
): VideoSceneSegment[] {
  const sorted = [...stats].sort((a, b) => a.timestampMs - b.timestampMs);
  if (sorted.length === 0) return [];
  if (sorted.length === 1) {
    const only = sorted[0];
    return [{
      sceneIndex: 0,
      startMs: only.timestampMs,
      endMs: only.timestampMs,
      representativeFrameIndex: only.frameIndex,
      frameIndexes: [only.frameIndex],
      changeScore: 0,
      description: describeSceneSegment(0, [only], 0),
      confidence: 0.55,
    }];
  }

  const averageScore = average(transitions.map((item) => item.score));
  const threshold = Math.max(0.18, Math.min(0.42, averageScore * 1.45));
  const cutFrameIndexes = new Set<number>();
  let framesSinceCut = 1;

  for (const transition of transitions) {
    if (transition.score >= threshold && framesSinceCut >= 1) {
      cutFrameIndexes.add(transition.toFrameIndex);
      framesSinceCut = 1;
    } else {
      framesSinceCut++;
    }
  }

  const segments: FrameVisualStats[][] = [];
  let current: FrameVisualStats[] = [];

  for (const stat of sorted) {
    if (current.length > 0 && cutFrameIndexes.has(stat.frameIndex)) {
      segments.push(current);
      current = [];
    }
    current.push(stat);
  }
  if (current.length > 0) segments.push(current);

  return segments.map((segment, index) => {
    const start = segment[0];
    const end = segment[segment.length - 1];
    const representative = chooseRepresentativeFrame(segment);
    const changeScore = index === 0
      ? 0
      : transitions.find((transition) => transition.toFrameIndex === start.frameIndex)?.score ?? 0;

    return {
      sceneIndex: index,
      startMs: start.timestampMs,
      endMs: end.timestampMs,
      representativeFrameIndex: representative.frameIndex,
      frameIndexes: segment.map((item) => item.frameIndex),
      changeScore,
      description: describeSceneSegment(index, segment, changeScore),
      confidence: roundMetric(Math.min(0.86, 0.56 + changeScore * 0.7)),
    };
  });
}

function calculateMotionProxy(stats: FrameVisualStats[]): number {
  if (stats.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < stats.length; i++) {
    const prev = stats[i - 1];
    const curr = stats[i];
    const lumaDelta = Math.abs(curr.averageLuma - prev.averageLuma);
    const saturationDelta = Math.abs(curr.saturation - prev.saturation);
    const colorDelta = hexColorDistance(prev.dominantColor, curr.dominantColor);
    total += lumaDelta * 0.45 + saturationDelta * 0.2 + colorDelta * 0.35;
  }
  return Math.min(1, total / (stats.length - 1));
}

function describeFrame(stat: FrameVisualStats, scene?: VideoSceneSegment): string {
  const sceneText = scene ? `，候选场景段 ${scene.sceneIndex + 1}` : "";
  return `${formatMs(stat.timestampMs)}，${brightnessLabel(stat.averageLuma)}，${temperatureLabel(stat.colorTemperature)}，${contrastLabel(stat.contrast)}${sceneText}`;
}

function chooseRepresentativeFrame(segment: FrameVisualStats[]): FrameVisualStats {
  const midpoint = (segment[0].timestampMs + segment[segment.length - 1].timestampMs) / 2;
  return segment.reduce((best, item) =>
    Math.abs(item.timestampMs - midpoint) < Math.abs(best.timestampMs - midpoint)
      ? item
      : best,
  segment[0]);
}

function describeSceneSegment(
  sceneIndex: number,
  segment: FrameVisualStats[],
  changeScore: number,
): string {
  const luma = average(segment.map((item) => item.averageLuma));
  const contrast = average(segment.map((item) => item.contrast));
  const saturation = average(segment.map((item) => item.saturation));
  const start = segment[0]?.timestampMs ?? 0;
  const end = segment[segment.length - 1]?.timestampMs ?? start;
  const entry = sceneIndex === 0
    ? "起始段"
    : `与上一段视觉差异 ${Math.round(changeScore * 100)}%`;

  return `场景段 ${sceneIndex + 1}（${formatMs(start)}-${formatMs(end)}）：${brightnessLabel(luma)}，${contrastLabel(contrast)}，${saturationLabel(saturation)}；${entry}。`;
}

function brightnessLabel(value: number): string {
  if (value < 0.28) return "偏暗";
  if (value > 0.68) return "偏亮";
  return "亮度适中";
}

function contrastLabel(value: number): string {
  if (value < 0.12) return "对比度较低";
  if (value > 0.28) return "对比强烈";
  return "对比度适中";
}

function saturationLabel(value: number): string {
  if (value < 0.22) return "色彩克制";
  if (value > 0.52) return "色彩饱和";
  return "色彩自然";
}

function motionLabel(value: number): string {
  if (value < 0.12) return "平稳";
  if (value > 0.32) return "明显";
  return "适中";
}

function temperatureLabel(value: "warm" | "neutral" | "cool"): string {
  if (value === "warm") return "暖色";
  if (value === "cool") return "冷色";
  return "中性色";
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function roundMetric(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function toHexColor(red: number, green: number, blue: number): string {
  return `#${[red, green, blue]
    .map((value) =>
      Math.max(0, Math.min(255, value)).toString(16).padStart(2, "0"),
    )
    .join("")}`;
}

function hexColorDistance(a: string, b: string): number {
  const first = parseHexColor(a);
  const second = parseHexColor(b);
  const distance = Math.sqrt(
    (first.red - second.red) ** 2 +
      (first.green - second.green) ** 2 +
      (first.blue - second.blue) ** 2,
  );
  return distance / Math.sqrt(255 ** 2 + 255 ** 2 + 255 ** 2);
}

function parseHexColor(color: string): {
  red: number;
  green: number;
  blue: number;
} {
  const normalized = color.replace("#", "");
  return {
    red: Number.parseInt(normalized.slice(0, 2), 16) || 0,
    green: Number.parseInt(normalized.slice(2, 4), 16) || 0,
    blue: Number.parseInt(normalized.slice(4, 6), 16) || 0,
  };
}

function formatMs(ms: number): string {
  const seconds = ms / 1000;
  return `${seconds.toFixed(seconds >= 10 ? 0 : 1)}s`;
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}
