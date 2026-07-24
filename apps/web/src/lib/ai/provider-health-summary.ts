import type { ProviderCapability } from "./provider-registry";
import { resolveProviderTaskContract } from "./providerTaskRouting.ts";
import { shouldApplySessionApiKeyForTask } from "./providerSessionScope.ts";

export type ProviderHealthItemId = "text" | "image" | "video" | "tts" | "voice-clone";
export type ProviderHealthStatus = "ready" | "warning" | "blocked";

export interface ProviderHealthServerConfig {
  baseUrl?: string;
  hasApiKey?: boolean;
  defaultModel?: string;
  defaultImageModel?: string;
  videoModel?: string;
  timeoutMs?: number;
}

export interface ProviderHealthProvider {
  id: string;
  name?: string;
  capabilities?: ProviderCapability[];
  hasApiKey?: boolean;
}

export interface ProviderHealthSummaryInput {
  serverConfig: ProviderHealthServerConfig | null;
  apiBaseUrl?: string;
  sessionApiKey: string;
  useLocalOverride: boolean;
  useMock: boolean;
  defaultModel: string;
  imageModel: string;
  videoModel: string;
  timeoutMs: string;
  providers: ProviderHealthProvider[];
  voiceCloneBaseUrl?: string;
  voxcpmBaseUrlConfigured?: boolean;
}

export interface ProviderHealthItem {
  id: ProviderHealthItemId;
  label: string;
  status: ProviderHealthStatus;
  message: string;
  details?: string[];
}

export interface ProviderHealthSummary {
  input: ProviderHealthSummaryInput;
  items: ProviderHealthItem[];
  blockingCount: number;
  warningCount: number;
}

function hasSessionKey(input: ProviderHealthSummaryInput): boolean {
  return Boolean(input.sessionApiKey.trim());
}

function hasScopedTextOrImageSessionKey(input: ProviderHealthSummaryInput): boolean {
  return shouldApplySessionApiKeyForTask({
    taskType: "image",
    sessionApiKey: input.sessionApiKey,
    apiBaseUrl: input.apiBaseUrl,
    routeHint: input.useLocalOverride
      ? {
          baseUrl: input.apiBaseUrl,
          defaultModel: input.defaultModel,
          imageModel: input.imageModel,
          videoModel: input.videoModel,
          timeoutMs: input.timeoutMs ? Number(input.timeoutMs) : undefined,
        }
      : null,
  });
}

function hasServerKey(input: ProviderHealthSummaryInput): boolean {
  return Boolean(input.serverConfig?.hasApiKey);
}

function hasAnyTextOrImageKey(input: ProviderHealthSummaryInput): boolean {
  return hasScopedTextOrImageSessionKey(input) || hasServerKey(input);
}

function hasDashScopeVideoKey(input: ProviderHealthSummaryInput): boolean {
  return input.providers.some((provider) => {
    const isDashScope =
      provider.id === "dashscope" ||
      /dashscope|百炼/i.test(provider.name || "");
    return (
      Boolean(provider.hasApiKey) &&
      isDashScope &&
      (provider.capabilities || []).includes("video")
    );
  });
}

function findVideoProvider(input: ProviderHealthSummaryInput): ProviderHealthProvider | null {
  return (
    input.providers.find((provider) => {
      const capabilities = provider.capabilities || [];
      return Boolean(provider.hasApiKey) && capabilities.includes("video");
    }) || null
  );
}

function buildTextItem(input: ProviderHealthSummaryInput): ProviderHealthItem {
  if (!input.defaultModel.trim() && !input.serverConfig?.defaultModel) {
    return {
      id: "text",
      label: "文本 / 剧本",
      status: "warning",
      message: "未指定文本模型，将使用系统默认值；建议在设置里确认聊天/分镜模型。",
    };
  }
  if (!hasAnyTextOrImageKey(input)) {
    return {
      id: "text",
      label: "文本 / 剧本",
      status: "blocked",
      message: "缺少 API Key，聊天、剧本和分镜文本生成无法调用真实模型。",
    };
  }
  return {
    id: "text",
    label: "文本 / 剧本",
    status: "ready",
    message: `将使用 ${input.defaultModel || input.serverConfig?.defaultModel}。`,
  };
}

function buildImageItem(input: ProviderHealthSummaryInput): ProviderHealthItem {
  if (input.useMock) {
    return {
      id: "image",
      label: "图片生成",
      status: "ready",
      message: "调试模式已开启，生图链路可用 mock 结果验证 UI。",
    };
  }
  if (!hasAnyTextOrImageKey(input)) {
    return {
      id: "image",
      label: "图片生成",
      status: "blocked",
      message: "缺少 API Key，分镜图、角色图和参考图生成无法调用真实模型。",
    };
  }
  if (!input.imageModel.trim() && !input.serverConfig?.defaultImageModel) {
    return {
      id: "image",
      label: "图片生成",
      status: "warning",
      message: "未指定图片模型，将使用默认模型；建议确认它支持 images/generations。",
    };
  }
  return {
    id: "image",
    label: "图片生成",
    status: "ready",
    message: `将使用 ${input.imageModel || input.serverConfig?.defaultImageModel}。`,
  };
}

function buildVideoItem(input: ProviderHealthSummaryInput): ProviderHealthItem {
  if (input.useMock) {
    return {
      id: "video",
      label: "视频生成",
      status: "ready",
      message: "调试模式已开启，视频链路可用本地 mock 验证 UI，不会调用真实视频模型。",
    };
  }
  if (!input.videoModel.trim() && !input.serverConfig?.videoModel) {
    return {
      id: "video",
      label: "视频生成",
      status: "blocked",
      message: "未指定视频模型；真实图生视频默认走 Vidu，需要 DashScope 视频 provider。",
    };
  }
  if (hasSessionKey(input)) {
    return {
      id: "video",
      label: "视频生成",
      status: "warning",
      message: `已发现会话 Key；如果它是 DashScope Key，Vidu 可通过专用路由使用 ${input.videoModel || input.serverConfig?.videoModel || "vidu"}。若不是，请配置 DASHSCOPE_API_KEY。`,
    };
  }
  const requestedVideoModel = input.videoModel || input.serverConfig?.videoModel || "vidu";
  const videoProvider = findVideoProvider(input);
  if (!videoProvider || !hasDashScopeVideoKey(input)) {
    return {
      id: "video",
      label: "视频生成",
      status: "blocked",
      message: "Vidu 视频生成缺少 DashScope 视频 provider 或 DASHSCOPE_API_KEY；开启调试模式只能验证 mock。",
      details: ["当前 `vidu` 路由不走通用 openai-compatible video endpoint，必须走 DashScope / 百炼专用路由。"],
    };
  }
  const contract = resolveProviderTaskContract({
    taskType: "video",
    providerId: videoProvider.id,
    providerLabel: videoProvider.name,
    providerType: "openai-compatible",
    providerCapabilities: videoProvider.capabilities,
    requestedModel: requestedVideoModel,
  });
  if (!contract.supported) {
    return {
      id: "video",
      label: "视频生成",
      status: "blocked",
      message: contract.reason || "当前视频模型与 Provider 路由不兼容。",
      details: contract.reason ? [contract.reason] : undefined,
    };
  }
  return {
    id: "video",
    label: "视频生成",
    status: "ready",
    message: `已发现 DashScope 视频 provider，将使用 ${contract.resolvedModel || requestedVideoModel}。`,
    details: contract.resolvedModel
      ? [`已按专用路由解析到真实模型：${contract.resolvedModel}`]
      : undefined,
  };
}

function buildTtsItem(input: ProviderHealthSummaryInput): ProviderHealthItem {
  if (input.useMock) {
    return {
      id: "tts",
      label: "配音",
      status: "ready",
      message: "调试模式已开启，TTS 可用 mock 音频验证流程。",
    };
  }
  if (input.voxcpmBaseUrlConfigured) {
    return {
      id: "tts",
      label: "配音",
      status: "ready",
      message: "VoxCPM2 服务地址已配置，可走服务端 TTS；浏览器端 Kokoro 也可作为默认路径。",
    };
  }
  return {
    id: "tts",
    label: "配音",
    status: "ready",
    message: "浏览器端 Kokoro TTS 默认可用，无需 API Key；首次加载模型会较慢。",
  };
}

function buildVoiceCloneItem(input: ProviderHealthSummaryInput): ProviderHealthItem {
  if (input.voiceCloneBaseUrl?.trim()) {
    return {
      id: "voice-clone",
      label: "声线克隆",
      status: "ready",
      message: `声线克隆服务地址：${input.voiceCloneBaseUrl.trim()}。`,
    };
  }
  return {
    id: "voice-clone",
    label: "声线克隆",
    status: "warning",
    message: "未配置声线克隆服务；普通配音可用，角色声线注册/克隆需要启动本地 voice-clone 服务。",
  };
}

export function buildProviderHealthSummary(
  input: ProviderHealthSummaryInput,
): ProviderHealthSummary {
  const items = [
    buildTextItem(input),
    buildImageItem(input),
    buildVideoItem(input),
    buildTtsItem(input),
    buildVoiceCloneItem(input),
  ];

  return {
    input,
    items,
    blockingCount: items.filter((item) => item.status === "blocked").length,
    warningCount: items.filter((item) => item.status === "warning").length,
  };
}
