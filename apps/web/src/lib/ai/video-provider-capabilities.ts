import { resolveProviderTaskContract } from "./providerTaskRouting.ts";

export type VideoProviderId =
  | "vidu"
  | "seedance"
  | "kling"
  | "runway"
  | "openai-sora"
  | "ltx-video"
  | "mock";

export type VideoGenerationMode =
  | "text-to-video"
  | "image-to-video"
  | "video-to-video"
  | "extend-video"
  | "edit-video";

export type VideoProviderImplementationStatus =
  | "implemented"
  | "stub"
  | "dry-run-only"
  | "local-adapter-required"
  | "mock";

export type VideoProviderEvidenceLevel =
  | "official-doc"
  | "local-implementation"
  | "open-source-reference"
  | "needs-provider-recheck";

export type VideoProviderCapability = {
  id: VideoProviderId;
  displayName: string;
  provider: string;
  defaultModel: string;
  models: string[];
  modes: VideoGenerationMode[];
  implementationStatus: VideoProviderImplementationStatus;
  asyncJob: boolean;
  requiresApiKey: boolean;
  supportsBatch: boolean;
  supportsFirstFrame: boolean;
  supportsEndFrame: boolean;
  supportsCharacterReference: boolean;
  supportsAudioOutput: boolean;
  maxReferenceImages: number;
  maxReferenceVideos: number;
  maxCharacters: number;
  minDurationSeconds: number;
  maxDurationSeconds: number;
  durationsSeconds?: number[];
  aspectRatios: string[];
  resolutions: string[];
  promptMaxChars?: number;
  retryableErrorCodes: string[];
  evidenceLevel: VideoProviderEvidenceLevel;
  docs: Array<{
    label: string;
    url: string;
    checkedAt: string;
  }>;
  sourceNote: string;
};

export type VideoProviderDryRunRequest = {
  providerId?: string;
  model?: string;
  mode: VideoGenerationMode;
  prompt?: string;
  imageUrl?: string;
  startFrameUrl?: string;
  endFrameUrl?: string;
  referenceImageUrls?: string[];
  referenceVideoUrls?: string[];
  characterIds?: string[];
  durationSeconds?: number;
  aspectRatio?: string;
  resolution?: string;
  allowMock?: boolean;
};

export type VideoProviderDryRunIssueCode =
  | "unknown-provider"
  | "unsupported-mode"
  | "missing-prompt"
  | "weak-motion-prompt"
  | "missing-image"
  | "missing-video"
  | "unsupported-end-frame"
  | "too-many-reference-images"
  | "too-many-reference-videos"
  | "too-many-characters"
  | "unsupported-duration"
  | "unsupported-aspect-ratio"
  | "unsupported-resolution"
  | "unsupported-provider-route"
  | "mock-disabled"
  | "backend-not-implemented";

export type VideoProviderDryRunIssue = {
  code: VideoProviderDryRunIssueCode;
  severity: "info" | "warning" | "blocking";
  message: string;
};

export type VideoProviderDryRunPlan = {
  ok: boolean;
  provider?: VideoProviderCapability;
  normalized: {
    providerId?: VideoProviderId;
    model?: string;
    mode: VideoGenerationMode;
    prompt?: string;
    durationSeconds: number;
    aspectRatio: string;
    resolution: string;
    imageUrl?: string;
    startFrameUrl?: string;
    endFrameUrl?: string;
    referenceImageUrls: string[];
    referenceVideoUrls: string[];
    characterIds: string[];
  };
  issues: VideoProviderDryRunIssue[];
  execution: {
    dryRun: true;
    willCallNetwork: false;
    asyncJob: boolean;
    implementationStatus?: VideoProviderImplementationStatus;
    endpointHint?: string;
  };
};

const CHECKED_AT = "2026-06-22";

const CAPABILITIES: VideoProviderCapability[] = [
  {
    id: "vidu",
    displayName: "Vidu / DashScope",
    provider: "DashScope",
    defaultModel: "viduq3-turbo",
    models: [
      "viduq3-turbo",
      "viduq3-pro",
      "viduq3-pro-fast",
      "viduq3",
      "viduq3-mix",
      "viduq2",
      "viduq2-pro",
      "viduq2-pro-fast",
      "viduq2-turbo",
      "viduq1",
      "viduq1-classic",
      "vidu2.0",
    ],
    modes: ["text-to-video", "image-to-video"],
    implementationStatus: "implemented",
    asyncJob: true,
    requiresApiKey: true,
    supportsBatch: false,
    supportsFirstFrame: true,
    supportsEndFrame: true,
    supportsCharacterReference: false,
    supportsAudioOutput: false,
    maxReferenceImages: 7,
    maxReferenceVideos: 0,
    maxCharacters: 0,
    minDurationSeconds: 1,
    maxDurationSeconds: 16,
    aspectRatios: ["16:9", "9:16", "1:1"],
    resolutions: ["540p", "720p", "1080p"],
    promptMaxChars: 2000,
    retryableErrorCodes: ["NETWORK_ERROR", "CLIENT_TIMEOUT", "API_ERROR", "RATE_LIMIT"],
    evidenceLevel: "local-implementation",
    docs: [
      {
        label: "StarCanvas Vidu SSE route",
        url: "/api/ai/generate-video-vidu",
        checkedAt: CHECKED_AT,
      },
    ],
    sourceNote: "StarCanvas 当前已接入的真实前端视频生成路径；2026-06-22 Vidu 官网 API 页返回浏览器挑战，外部官方参数仍需在接 provider route 前复核。",
  },
  {
    id: "seedance",
    displayName: "Seedance",
    provider: "ByteDance / Volcano Ark",
    defaultModel: "seedance-v1",
    models: ["seedance-v1", "doubao-seedance-1-0", "doubao-seedance-2-0"],
    modes: ["text-to-video", "image-to-video"],
    implementationStatus: "stub",
    asyncJob: true,
    requiresApiKey: true,
    supportsBatch: false,
    supportsFirstFrame: true,
    supportsEndFrame: true,
    supportsCharacterReference: false,
    supportsAudioOutput: false,
    maxReferenceImages: 9,
    maxReferenceVideos: 0,
    maxCharacters: 0,
    minDurationSeconds: 1,
    maxDurationSeconds: 10,
    durationsSeconds: [5, 10],
    aspectRatios: ["16:9", "9:16", "1:1"],
    resolutions: ["720p", "1080p"],
    promptMaxChars: 2000,
    retryableErrorCodes: ["NETWORK_ERROR", "CLIENT_TIMEOUT", "RATE_LIMIT"],
    evidenceLevel: "open-source-reference",
    docs: [
      {
        label: "StarCanvas TODO backend branch",
        url: "apps/web/src/app/canvas/utils/videoGenerationService.ts",
        checkedAt: CHECKED_AT,
      },
    ],
    sourceNote: "本地和 ArcReel 对标都显示 Seedance 需要 provider capability 合同；当前约束来自参考项目/本地 TODO，不是官方最终参数。",
  },
  {
    id: "kling",
    displayName: "Kling",
    provider: "Kuaishou",
    defaultModel: "kling-v1",
    models: ["kling-v1", "kling-v1-5", "kling-v2", "kling-v2-1", "kling-v3"],
    modes: ["text-to-video", "image-to-video"],
    implementationStatus: "stub",
    asyncJob: true,
    requiresApiKey: true,
    supportsBatch: false,
    supportsFirstFrame: true,
    supportsEndFrame: true,
    supportsCharacterReference: true,
    supportsAudioOutput: true,
    maxReferenceImages: 4,
    maxReferenceVideos: 1,
    maxCharacters: 2,
    minDurationSeconds: 1,
    maxDurationSeconds: 15,
    durationsSeconds: [5, 10, 15],
    aspectRatios: ["16:9", "9:16", "1:1"],
    resolutions: ["720p", "1080p", "4k"],
    promptMaxChars: 2500,
    retryableErrorCodes: ["NETWORK_ERROR", "CLIENT_TIMEOUT", "RATE_LIMIT"],
    evidenceLevel: "needs-provider-recheck",
    docs: [
      {
        label: "Kling official docs recheck required",
        url: "https://docs.klingai.com/",
        checkedAt: CHECKED_AT,
      },
    ],
    sourceNote: "2026-06-22 docs.klingai.com 在当前网络未解析；这些字段只用于 dry-run 草案，真实 API 接线前必须再次核验官方端点、模型和账号权限。",
  },
  {
    id: "runway",
    displayName: "Runway",
    provider: "Runway",
    defaultModel: "gen4_turbo",
    models: ["gen4_turbo", "gen4_aleph", "gen3a_turbo"],
    modes: ["text-to-video", "image-to-video", "video-to-video", "edit-video"],
    implementationStatus: "stub",
    asyncJob: true,
    requiresApiKey: true,
    supportsBatch: false,
    supportsFirstFrame: true,
    supportsEndFrame: false,
    supportsCharacterReference: true,
    supportsAudioOutput: false,
    maxReferenceImages: 3,
    maxReferenceVideos: 1,
    maxCharacters: 1,
    minDurationSeconds: 1,
    maxDurationSeconds: 10,
    durationsSeconds: [5, 10],
    aspectRatios: ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"],
    resolutions: ["720p", "1080p"],
    promptMaxChars: 1000,
    retryableErrorCodes: ["NETWORK_ERROR", "CLIENT_TIMEOUT", "RATE_LIMIT"],
    evidenceLevel: "official-doc",
    docs: [
      {
        label: "Runway API reference",
        url: "https://docs.dev.runwayml.com/api/",
        checkedAt: CHECKED_AT,
      },
    ],
    sourceNote: "Runway 官方 API 文档已确认存在 Start generating、Task management、Uploads 等 API 分组；具体模型参数接线时继续按官方 schema 复核。",
  },
  {
    id: "openai-sora",
    displayName: "OpenAI Sora",
    provider: "OpenAI",
    defaultModel: "sora-2",
    models: ["sora-2", "sora-2-pro"],
    modes: ["text-to-video", "image-to-video", "extend-video", "edit-video"],
    implementationStatus: "dry-run-only",
    asyncJob: true,
    requiresApiKey: true,
    supportsBatch: true,
    supportsFirstFrame: true,
    supportsEndFrame: false,
    supportsCharacterReference: true,
    supportsAudioOutput: true,
    maxReferenceImages: 1,
    maxReferenceVideos: 1,
    maxCharacters: 2,
    minDurationSeconds: 1,
    maxDurationSeconds: 20,
    durationsSeconds: [4, 8, 12, 16, 20],
    aspectRatios: ["16:9", "9:16"],
    resolutions: ["480p", "720p", "1080p"],
    promptMaxChars: 4000,
    retryableErrorCodes: ["NETWORK_ERROR", "CLIENT_TIMEOUT", "RATE_LIMIT", "server_error"],
    evidenceLevel: "official-doc",
    docs: [
      {
        label: "OpenAI Videos API / Sora",
        url: "https://developers.openai.com/api/docs/guides/video-generation",
        checkedAt: CHECKED_AT,
      },
    ],
    sourceNote: "OpenAI 官方 Videos API 支持 prompt、image reference、characters、extensions、edits、content download 和 Batch；StarCanvas 当前仅建立 dry-run 合同。",
  },
  {
    id: "ltx-video",
    displayName: "LTX-Video",
    provider: "Local / OSS",
    defaultModel: "ltx-video",
    models: ["ltx-video"],
    modes: ["text-to-video", "image-to-video", "video-to-video"],
    implementationStatus: "local-adapter-required",
    asyncJob: true,
    requiresApiKey: false,
    supportsBatch: true,
    supportsFirstFrame: true,
    supportsEndFrame: false,
    supportsCharacterReference: false,
    supportsAudioOutput: false,
    maxReferenceImages: 1,
    maxReferenceVideos: 1,
    maxCharacters: 0,
    minDurationSeconds: 1,
    maxDurationSeconds: 10,
    aspectRatios: ["16:9", "9:16", "1:1"],
    resolutions: ["480p", "720p"],
    promptMaxChars: 2000,
    retryableErrorCodes: ["LOCAL_WORKER_BUSY", "CLIENT_TIMEOUT"],
    evidenceLevel: "open-source-reference",
    docs: [
      {
        label: "Local adapter placeholder",
        url: "docs/reference/StarCanvas_全网开源与本地碎片复核_2026-06-22.md",
        checkedAt: CHECKED_AT,
      },
    ],
    sourceNote: "本地/开源视频模型适配位，后续需要 ComfyUI 或独立 worker 合同。",
  },
  {
    id: "mock",
    displayName: "Local Mock",
    provider: "StarCanvas",
    defaultModel: "mock-1.0",
    models: ["mock-1.0"],
    modes: ["image-to-video"],
    implementationStatus: "mock",
    asyncJob: false,
    requiresApiKey: false,
    supportsBatch: false,
    supportsFirstFrame: true,
    supportsEndFrame: false,
    supportsCharacterReference: false,
    supportsAudioOutput: false,
    maxReferenceImages: 1,
    maxReferenceVideos: 0,
    maxCharacters: 0,
    minDurationSeconds: 1,
    maxDurationSeconds: 60,
    aspectRatios: ["16:9", "9:16", "1:1", "4:3"],
    resolutions: ["480p", "720p", "1080p"],
    promptMaxChars: 2000,
    retryableErrorCodes: [],
    evidenceLevel: "local-implementation",
    docs: [
      {
        label: "StarCanvas local demo generator",
        url: "apps/web/src/app/canvas/utils/videoGenerationService.ts",
        checkedAt: CHECKED_AT,
      },
    ],
    sourceNote: "仅用于本地演示和测试，必须显式开启 mock。",
  },
];

const PROVIDER_ALIASES: Record<string, VideoProviderId> = {
  sora: "openai-sora",
  "sora-2": "openai-sora",
  "sora-2-pro": "openai-sora",
  openai: "openai-sora",
  "openai-sora": "openai-sora",
  dashscope: "vidu",
  vidu: "vidu",
  "vidu-q3-turbo-i2v": "vidu",
  "vidu-q3-pro-i2v": "vidu",
  "vidu-q2-turbo-i2v": "vidu",
  "vidu-q2-pro-i2v": "vidu",
  "vidu-q3-turbo-t2v": "vidu",
  "vidu-q3-pro-t2v": "vidu",
  "vidu-q2-turbo-t2v": "vidu",
  "vidu-q2-pro-t2v": "vidu",
  "vidu/viduq3-turbo_img2video": "vidu",
  "vidu/viduq3-pro_img2video": "vidu",
  "vidu/viduq2-turbo_img2video": "vidu",
  "vidu/viduq2-pro_img2video": "vidu",
  "vidu/viduq3-turbo_text2video": "vidu",
  "vidu/viduq3-pro_text2video": "vidu",
  "vidu/viduq2-turbo_text2video": "vidu",
  "vidu/viduq2-pro_text2video": "vidu",
  "viduq3-turbo": "vidu",
  "viduq3-pro": "vidu",
  "viduq3-pro-fast": "vidu",
  "viduq3": "vidu",
  "viduq3-mix": "vidu",
  "viduq2": "vidu",
  "viduq2-pro": "vidu",
  "viduq2-pro-fast": "vidu",
  "viduq2-turbo": "vidu",
  "viduq1": "vidu",
  "viduq1-classic": "vidu",
  "vidu2.0": "vidu",
  seedance: "seedance",
  "doubao-seedance-1-0": "seedance",
  "doubao-seedance-2-0": "seedance",
  kling: "kling",
  runway: "runway",
  "gen4_turbo": "runway",
  "gen4": "runway",
  ltx: "ltx-video",
  "ltx-video": "ltx-video",
  mock: "mock",
};

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function normalizeId(value: string | undefined): string {
  return cleanText(value).toLowerCase();
}

function normalizeAspectRatio(value: string | undefined, fallback: string): string {
  const text = cleanText(value).replace(/\s+/g, "");
  if (!text) return fallback;
  return text.replace("x", ":");
}

function normalizeResolution(value: string | undefined, fallback: string): string {
  const text = cleanText(value).toLowerCase();
  if (!text) return fallback;
  if (/^\d+p$/.test(text)) return text;
  if (text === "4k" || text === "uhd") return "4k";
  return text;
}

function normalizeDuration(value: number | undefined, capability?: VideoProviderCapability): number {
  if (Number.isFinite(value) && value != null && value > 0) {
    return Math.round(value);
  }
  if (capability?.durationsSeconds?.length) {
    return capability.durationsSeconds[0];
  }
  return capability?.minDurationSeconds ?? 5;
}

function hasBlockingIssue(issues: VideoProviderDryRunIssue[]): boolean {
  return issues.some((issue) => issue.severity === "blocking");
}

function isWeakMotionPrompt(prompt: string): boolean {
  if (!prompt) return false;
  if (/[\u4e00-\u9fff]/.test(prompt)) return cleanText(prompt).length < 6;
  return cleanText(prompt).split(/\s+/).filter(Boolean).length < 4;
}

function pushIssue(
  issues: VideoProviderDryRunIssue[],
  code: VideoProviderDryRunIssueCode,
  severity: VideoProviderDryRunIssue["severity"],
  message: string,
): void {
  issues.push({ code, severity, message });
}

export function listVideoProviderCapabilities(): VideoProviderCapability[] {
  return CAPABILITIES.map((capability) => ({
    ...capability,
    models: [...capability.models],
    modes: [...capability.modes],
    durationsSeconds: capability.durationsSeconds ? [...capability.durationsSeconds] : undefined,
    aspectRatios: [...capability.aspectRatios],
    resolutions: [...capability.resolutions],
    retryableErrorCodes: [...capability.retryableErrorCodes],
    docs: capability.docs.map((doc) => ({ ...doc })),
  }));
}

export function resolveVideoProviderId(providerId: string | undefined): VideoProviderId | undefined {
  const normalized = normalizeId(providerId);
  if (!normalized) return undefined;
  return PROVIDER_ALIASES[normalized] ?? (CAPABILITIES.some((capability) => capability.id === normalized)
    ? (normalized as VideoProviderId)
    : undefined);
}

export function getVideoProviderCapability(providerId: string | undefined): VideoProviderCapability | undefined {
  const resolved = resolveVideoProviderId(providerId);
  if (!resolved) return undefined;
  return CAPABILITIES.find((capability) => capability.id === resolved);
}

export function buildVideoProviderDryRunPlan(
  request: VideoProviderDryRunRequest,
): VideoProviderDryRunPlan {
  const capability = getVideoProviderCapability(request.providerId);
  const issues: VideoProviderDryRunIssue[] = [];

  if (!capability) {
    pushIssue(
      issues,
      "unknown-provider",
      "blocking",
      `不支持的视频生成供应商：${cleanText(request.providerId) || "未指定"}`,
    );
  }

  const defaultAspectRatio = capability?.aspectRatios[0] ?? "16:9";
  const defaultResolution = capability?.resolutions[0] ?? "720p";
  const prompt = cleanText(request.prompt);
  const durationSeconds = normalizeDuration(request.durationSeconds, capability);
  const aspectRatio = normalizeAspectRatio(request.aspectRatio, defaultAspectRatio);
  const resolution = normalizeResolution(request.resolution, defaultResolution);
  const imageUrl = cleanText(request.imageUrl || request.startFrameUrl);
  const startFrameUrl = cleanText(request.startFrameUrl || request.imageUrl);
  const endFrameUrl = cleanText(request.endFrameUrl);
  const referenceImageUrls = (request.referenceImageUrls ?? []).map(cleanText).filter(Boolean);
  const referenceVideoUrls = (request.referenceVideoUrls ?? []).map(cleanText).filter(Boolean);
  const characterIds = (request.characterIds ?? []).map(cleanText).filter(Boolean);
  const requestedModel = cleanText(request.model) || capability?.defaultModel;

  if (capability) {
    const taskContract = resolveProviderTaskContract({
      taskType: "video",
      providerId: capability.id,
      providerLabel: capability.displayName,
      providerCapabilities: ["video"],
      requestedModel,
    });
    if (!taskContract.supported) {
      pushIssue(
        issues,
        "unsupported-provider-route",
        "blocking",
        taskContract.reason || `${capability.displayName} 与当前视频模型路由不兼容。`,
      );
    }

    if (!capability.modes.includes(request.mode)) {
      pushIssue(
        issues,
        "unsupported-mode",
        "blocking",
        `${capability.displayName} 不支持 ${request.mode}。`,
      );
    }

    if (!prompt) {
      pushIssue(issues, "missing-prompt", "blocking", "缺少视频生成提示词。");
    } else if (isWeakMotionPrompt(prompt)) {
      pushIssue(issues, "weak-motion-prompt", "warning", "运动提示词过短，可能难以控制镜头动作。");
    }

    if (request.mode === "image-to-video" && !imageUrl) {
      pushIssue(issues, "missing-image", "blocking", "图生视频需要首帧或参考图。");
    }

    if ((request.mode === "video-to-video" || request.mode === "extend-video" || request.mode === "edit-video") && referenceVideoUrls.length === 0) {
      pushIssue(issues, "missing-video", "blocking", `${request.mode} 需要输入视频。`);
    }

    if (endFrameUrl && !capability.supportsEndFrame) {
      pushIssue(issues, "unsupported-end-frame", "blocking", `${capability.displayName} 当前能力表不支持尾帧约束。`);
    }

    if (referenceImageUrls.length > capability.maxReferenceImages) {
      pushIssue(
        issues,
        "too-many-reference-images",
        "blocking",
        `${capability.displayName} 最多支持 ${capability.maxReferenceImages} 张参考图，当前 ${referenceImageUrls.length} 张。`,
      );
    }

    if (referenceVideoUrls.length > capability.maxReferenceVideos) {
      pushIssue(
        issues,
        "too-many-reference-videos",
        "blocking",
        `${capability.displayName} 最多支持 ${capability.maxReferenceVideos} 个参考视频，当前 ${referenceVideoUrls.length} 个。`,
      );
    }

    if (characterIds.length > capability.maxCharacters) {
      pushIssue(
        issues,
        "too-many-characters",
        "blocking",
        `${capability.displayName} 最多支持 ${capability.maxCharacters} 个角色引用，当前 ${characterIds.length} 个。`,
      );
    }

    const durationIsInRange = durationSeconds >= capability.minDurationSeconds &&
      durationSeconds <= capability.maxDurationSeconds;
    const durationIsListed = !capability.durationsSeconds ||
      capability.durationsSeconds.includes(durationSeconds);
    if (!durationIsInRange || !durationIsListed) {
      const allowed = capability.durationsSeconds?.join(" / ") ||
        `${capability.minDurationSeconds}-${capability.maxDurationSeconds}`;
      pushIssue(issues, "unsupported-duration", "blocking", `${capability.displayName} 不支持 ${durationSeconds}s，允许值：${allowed}s。`);
    }

    if (!capability.aspectRatios.includes(aspectRatio)) {
      pushIssue(issues, "unsupported-aspect-ratio", "blocking", `${capability.displayName} 不支持画幅 ${aspectRatio}。`);
    }

    if (!capability.resolutions.includes(resolution)) {
      pushIssue(issues, "unsupported-resolution", "blocking", `${capability.displayName} 不支持分辨率 ${resolution}。`);
    }

    if (capability.id === "mock" && !request.allowMock) {
      pushIssue(issues, "mock-disabled", "blocking", "本地 mock 视频生成未显式开启。");
    }

    if (capability.implementationStatus === "stub" || capability.implementationStatus === "dry-run-only" || capability.implementationStatus === "local-adapter-required") {
      pushIssue(
        issues,
        "backend-not-implemented",
        "warning",
        `${capability.displayName} 当前只有 dry-run 合同，真实生成后端尚未完整接线。`,
      );
    }
  }

  return {
    ok: !hasBlockingIssue(issues),
    provider: capability ? { ...capability, docs: capability.docs.map((doc) => ({ ...doc })) } : undefined,
    normalized: {
      providerId: capability?.id,
      model: requestedModel,
      mode: request.mode,
      prompt: prompt || undefined,
      durationSeconds,
      aspectRatio,
      resolution,
      imageUrl: imageUrl || undefined,
      startFrameUrl: startFrameUrl || undefined,
      endFrameUrl: endFrameUrl || undefined,
      referenceImageUrls,
      referenceVideoUrls,
      characterIds,
    },
    issues,
    execution: {
      dryRun: true,
      willCallNetwork: false,
      asyncJob: capability?.asyncJob ?? true,
      implementationStatus: capability?.implementationStatus,
      endpointHint: capability?.docs[0]?.url,
    },
  };
}

export function formatVideoProviderDryRunIssues(issues: VideoProviderDryRunIssue[]): string {
  return issues.map((issue) => issue.message).join("；");
}
