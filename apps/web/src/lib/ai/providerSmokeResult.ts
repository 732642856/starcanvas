import type { ProviderRealSmokeTarget } from "./providerSmoke.ts";

export type ProviderSmokeRunStatus = "passed" | "failed" | "blocked";

export interface ProviderSmokeRunResultLike {
  status: ProviderSmokeRunStatus;
  message: string;
  details?: string[];
  artifact?: {
    type: "image" | "video";
    url: string;
    mimeType?: string;
  };
}

export type ProviderSmokeResultCategory =
  | "success"
  | "confirmation"
  | "api-key"
  | "quota"
  | "model"
  | "network"
  | "timeout"
  | "provider"
  | "unknown";

export interface ProviderSmokeResultSummary {
  category: ProviderSmokeResultCategory;
  severity: "success" | "warning" | "error";
  title: string;
  hints: string[];
}

export interface StoredProviderSmokeResult extends ProviderSmokeRunResultLike {
  target: ProviderRealSmokeTarget;
  updatedAt: number;
  summaryCategory: ProviderSmokeResultCategory;
  summarySeverity: "success" | "warning" | "error";
  summaryTitle: string;
  hints: string[];
}

const REAL_SMOKE_STORAGE_KEY = "startrails_provider_real_smoke_results";

function includesAny(input: string, patterns: string[]): boolean {
  return patterns.some((pattern) => input.includes(pattern));
}

export function classifyProviderSmokeResult(
  result: ProviderSmokeRunResultLike,
): ProviderSmokeResultSummary {
  const haystack = `${result.message}\n${(result.details || []).join("\n")}`.toLowerCase();

  if (result.status === "passed") {
    return {
      category: "success",
      severity: "success",
      title: "试跑通过",
      hints: result.details || ["真实 smoke 已通过。"],
    };
  }

  if (includesAny(haystack, ["确认短语", "显式授权"])) {
    return {
      category: "confirmation",
      severity: "warning",
      title: "缺少确认授权",
      hints: [
        "这次没有真正发出请求。",
        "请重新打开确认弹层，并按要求输入确认短语。",
      ],
    };
  }

  if (includesAny(haystack, ["api key 无效", "无权限", "dashscope_api_key"])) {
    return {
      category: "api-key",
      severity: result.status === "blocked" ? "warning" : "error",
      title: "API Key 或权限异常",
      hints: [
        "检查当前会话 Key / 服务端 Key 是否正确。",
        "确认该账号已开通对应模型权限。",
      ],
    };
  }

  if (includesAny(haystack, ["余额不足", "请求频率超限", "quota"])) {
    return {
      category: "quota",
      severity: "warning",
      title: "额度或频率受限",
      hints: [
        "检查 provider 余额、套餐和速率限制。",
        "稍后重试，或切换到成本更低的 smoke 路径。",
      ],
    };
  }

  if (includesAny(haystack, ["模型不存在", "base url", "image model", "video provider 未就绪"])) {
    return {
      category: "model",
      severity: result.status === "blocked" ? "warning" : "error",
      title: "模型或地址不匹配",
      hints: [
        "确认 Base URL 指向正确的 provider / relay。",
        "检查文本、图片、视频模型名是否和该 provider 兼容。",
      ],
    };
  }

  if (includesAny(haystack, ["超时", "timeout"])) {
    return {
      category: "timeout",
      severity: "warning",
      title: "请求超时",
      hints: [
        "可能是网络较慢、代理不稳定，或上游模型响应过久。",
        "可稍后重试，或改用更短更小的 smoke 路径。",
      ],
    };
  }

  if (includesAny(haystack, ["无法连接", "fetch", "网络"])) {
    return {
      category: "network",
      severity: "error",
      title: "网络或连接异常",
      hints: [
        "检查网络、代理、中转站或本地服务是否可达。",
      ],
    };
  }

  if (includesAny(haystack, ["上游服务异常", "http 5", "upstream"])) {
    return {
      category: "provider",
      severity: "error",
      title: "上游服务异常",
      hints: [
        "当前 provider 可能短时不可用。",
        "稍后重试，或切换到另一个可用 provider。",
      ],
    };
  }

  return {
    category: "unknown",
    severity: result.status === "blocked" ? "warning" : "error",
    title: result.status === "blocked" ? "试跑被阻止" : "试跑失败",
    hints: result.details?.length ? result.details : ["请根据返回信息继续排查 provider 配置。"],
  };
}

export function summarizeProviderSmokeResult(
  result: ProviderSmokeRunResultLike,
): ProviderSmokeResultSummary {
  return classifyProviderSmokeResult(result);
}

export function getStoredProviderSmokeReadinessStatus(
  result: StoredProviderSmokeResult | undefined,
): "ready" | "warning" | "blocked" {
  if (!result || result.status === "passed") return "ready";
  if (result.summaryCategory === "confirmation") return "warning";
  return "blocked";
}

export function loadStoredProviderSmokeResults(): Partial<Record<ProviderRealSmokeTarget, StoredProviderSmokeResult>> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(REAL_SMOKE_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Partial<Record<ProviderRealSmokeTarget, StoredProviderSmokeResult>>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function saveStoredProviderSmokeResult(
  target: ProviderRealSmokeTarget,
  result: ProviderSmokeRunResultLike,
): StoredProviderSmokeResult {
  const summary = summarizeProviderSmokeResult(result);
  const stored: StoredProviderSmokeResult = {
    target,
    status: result.status,
    message: result.message,
    details: result.details,
    updatedAt: Date.now(),
    summaryCategory: summary.category,
    summarySeverity: summary.severity,
    summaryTitle: summary.title,
    hints: summary.hints,
  };

  if (typeof window !== "undefined") {
    try {
      const prev = loadStoredProviderSmokeResults();
      window.localStorage.setItem(REAL_SMOKE_STORAGE_KEY, JSON.stringify({
        ...prev,
        [target]: stored,
      }));
      window.dispatchEvent(new CustomEvent("startrails-provider-updated"));
    } catch {
      // ignore storage failures
    }
  }

  return stored;
}

export function clearStoredProviderSmokeResults(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(REAL_SMOKE_STORAGE_KEY);
    window.dispatchEvent(new CustomEvent("startrails-provider-updated"));
  } catch {
    // ignore storage failures
  }
}
