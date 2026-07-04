import { mergeProviderConfig } from "./provider-config.ts";
import type { AiProviderOverrides } from "./provider-config.ts";
import { findProviderByCapability } from "./provider-registry.ts";

export type ProviderSmokeStatus = "ready" | "warning" | "blocked";

export type ProviderSmokeTarget =
  | "text"
  | "image"
  | "video"
  | "tts-browser"
  | "tts-server";

export type ProviderRealSmokeTarget = "text" | "tts-server" | "image" | "video";

const REAL_SMOKE_CONFIRMATION_TEXT: Partial<Record<ProviderRealSmokeTarget, string>> = {
  image: "RUN_IMAGE_SMOKE",
  video: "RUN_VIDEO_SMOKE",
};

export interface ProviderSmokeItem {
  target: ProviderSmokeTarget;
  label: string;
  status: ProviderSmokeStatus;
  summary: string;
  details: string[];
  realSmokeSupported: boolean;
  realSmokeRequiresConsent: boolean;
  mayConsumeQuota: boolean;
}

export interface ProviderSmokeReport {
  mode: "dry-run";
  overallStatus: ProviderSmokeStatus;
  readyCount: number;
  warningCount: number;
  blockedCount: number;
  items: ProviderSmokeItem[];
}

export function getProviderRealSmokeConfirmationText(target: ProviderRealSmokeTarget): string | null {
  return REAL_SMOKE_CONFIRMATION_TEXT[target] || null;
}

interface ProviderSmokeDeps {
  overrides?: AiProviderOverrides;
  voxcpmBaseUrl?: string;
  resolveMergedConfig?: typeof mergeProviderConfig;
  resolveDashScopeVideoProvider?: typeof findProviderByCapability;
}

function normalizeStatusCounts(items: ProviderSmokeItem[]) {
  const readyCount = items.filter((item) => item.status === "ready").length;
  const warningCount = items.filter((item) => item.status === "warning").length;
  const blockedCount = items.filter((item) => item.status === "blocked").length;
  const overallStatus: ProviderSmokeStatus =
    blockedCount > 0 ? "blocked" : warningCount > 0 ? "warning" : "ready";
  return { readyCount, warningCount, blockedCount, overallStatus };
}

function normalizeUrl(value: string | undefined): string {
  return (value || "").trim().replace(/\/+$/, "");
}

export function buildProviderSmokeReport(
  deps: ProviderSmokeDeps = {},
): ProviderSmokeReport {
  const resolveMergedConfig = deps.resolveMergedConfig ?? mergeProviderConfig;
  const resolveDashScopeVideoProvider =
    deps.resolveDashScopeVideoProvider ?? findProviderByCapability;
  const voxcpmBaseUrl = normalizeUrl(deps.voxcpmBaseUrl);
  const sessionApiKey = deps.overrides?.sessionApiKey?.trim() || "";

  let mergedConfig:
    | ReturnType<typeof mergeProviderConfig>
    | null = null;
  let mergedConfigError = "";

  try {
    mergedConfig = resolveMergedConfig(deps.overrides);
  } catch (error) {
    mergedConfigError =
      error instanceof Error ? error.message : "未检测到可用的文本/图片 Provider 配置。";
  }

  let dashScopeVideoProvider:
    | ReturnType<typeof findProviderByCapability>
    | null = null;
  let dashScopeVideoError = "";
  try {
    dashScopeVideoProvider = resolveDashScopeVideoProvider("video", "dashscope");
  } catch (error) {
    dashScopeVideoError =
      error instanceof Error ? error.message : "未检测到可用的 DashScope 视频 Provider。";
  }

  const items: ProviderSmokeItem[] = [];

  items.push(
    mergedConfig
      ? {
          target: "text",
          label: "文本 / Chat",
          status: "ready",
          summary: `已检测到文本模型 ${mergedConfig.defaultModel || "未命名模型"}。`,
          details: [
            `当前基座地址：${mergedConfig.baseUrl}`,
            "这一步只做就绪度预检，不会真实调用 chat/completions。",
          ],
          realSmokeSupported: true,
          realSmokeRequiresConsent: true,
          mayConsumeQuota: true,
        }
      : {
          target: "text",
          label: "文本 / Chat",
          status: "blocked",
          summary: "文本 Provider 未就绪。",
          details: [mergedConfigError || "请先配置 Base URL、API Key 和默认文本模型。"],
          realSmokeSupported: false,
          realSmokeRequiresConsent: true,
          mayConsumeQuota: true,
        },
  );

  items.push(
    mergedConfig?.defaultImageModel
      ? {
          target: "image",
          label: "图片生成",
          status: "ready",
          summary: `已检测到图片模型 ${mergedConfig.defaultImageModel}。`,
          details: [
            `当前基座地址：${mergedConfig.baseUrl}`,
            "预检不会真实调用 images/generations。",
            "真实生图 smoke 需要显式授权，因为会消耗图片额度。",
          ],
          realSmokeSupported: true,
          realSmokeRequiresConsent: true,
          mayConsumeQuota: true,
        }
      : {
          target: "image",
          label: "图片生成",
          status: "blocked",
          summary: "图片生成尚未就绪。",
          details: [
            mergedConfig
              ? "缺少默认图片模型，请在设置面板填写 Image Model。"
              : mergedConfigError || "请先配置图片 Provider。",
          ],
          realSmokeSupported: false,
          realSmokeRequiresConsent: true,
          mayConsumeQuota: true,
        },
  );

  if (dashScopeVideoProvider?.apiKey) {
    items.push({
      target: "video",
      label: "视频生成（Vidu / DashScope）",
      status: sessionApiKey ? "warning" : "ready",
      summary: sessionApiKey
        ? "已检测到会话 Key；视频链路将优先使用当前会话 Key。"
        : `已检测到视频 Provider ${dashScopeVideoProvider.name || dashScopeVideoProvider.id}。`,
      details: [
        "Vidu 路由固定使用 DashScope 官方端点，不接受任意 baseUrl 覆盖。",
        "真实生视频 smoke 必须显式授权，因为会消耗视频额度。",
        ...(sessionApiKey
          ? ["只有已开通 Vidu、且地域正确的 DashScope Key 才能真正跑通视频生成。"]
          : []),
      ],
      realSmokeSupported: true,
      realSmokeRequiresConsent: true,
      mayConsumeQuota: true,
    });
  } else if (sessionApiKey) {
    items.push({
      target: "video",
      label: "视频生成（Vidu / DashScope）",
      status: "warning",
      summary: "已检测到会话 Key，但未检测到服务端 DashScope 视频 Provider。",
      details: [
        "当前可以继续走会话级 DashScope Key。",
        "只有阿里云百炼已开通 Vidu、且地域正确的 Key 才能通过真实视频生成。",
        "真实生视频 smoke 必须显式授权，因为会消耗视频额度。",
      ],
      realSmokeSupported: true,
      realSmokeRequiresConsent: true,
      mayConsumeQuota: true,
    });
  } else {
    items.push({
      target: "video",
      label: "视频生成（Vidu / DashScope）",
      status: "blocked",
      summary: "视频生成尚未就绪。",
      details: [
        dashScopeVideoError || "未检测到 DashScope 视频 Provider。",
        "请填写 DashScope 会话 Key，或在服务端配置 DASHSCOPE_API_KEY。",
      ],
      realSmokeSupported: false,
      realSmokeRequiresConsent: true,
      mayConsumeQuota: true,
    });
  }

  items.push({
    target: "tts-browser",
    label: "TTS（浏览器本地 Kokoro）",
    status: "ready",
    summary: "浏览器本地 TTS 可作为零 Key 兜底方案。",
    details: [
      "Kokoro 在浏览器本地运行，不依赖服务端 API Key。",
      "首次使用可能需要下载模型文件，速度取决于本地网络和浏览器环境。",
    ],
    realSmokeSupported: false,
    realSmokeRequiresConsent: false,
    mayConsumeQuota: false,
  });

  items.push(
    voxcpmBaseUrl
      ? {
          target: "tts-server",
          label: "TTS（VoxCPM 服务端）",
          status: "ready",
          summary: "已检测到服务端 TTS 地址。",
          details: [
            `VOXCPM_BASE_URL: ${voxcpmBaseUrl}`,
            "真实服务端 TTS smoke 需要显式授权；虽然成本通常低于视频，但仍可能计费。",
          ],
          realSmokeSupported: true,
          realSmokeRequiresConsent: true,
          mayConsumeQuota: true,
        }
      : {
          target: "tts-server",
          label: "TTS（VoxCPM 服务端）",
          status: "warning",
          summary: "未检测到服务端 TTS，但你仍可使用浏览器本地 Kokoro。",
          details: [
            "如果你需要服务器侧 TTS / 更稳定批量配音，请配置 VOXCPM_BASE_URL。",
          ],
          realSmokeSupported: false,
          realSmokeRequiresConsent: true,
          mayConsumeQuota: true,
        },
  );

  return {
    mode: "dry-run",
    ...normalizeStatusCounts(items),
    items,
  };
}
