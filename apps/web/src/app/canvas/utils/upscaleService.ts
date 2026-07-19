"use client";

import { assetUrlToDataUrl } from "./providerMediaDataUrl.ts";

export const UPSCALE_CLIENT_TIMEOUT_MS = 90_000;
type ImageUrlToBase64Fn = (imageUrl: string, assetId?: string) => Promise<string>;

type UpscalePayload = {
  status?: string;
  imageUrl?: string;
  message?: string;
  error?: string | { message?: string; userMessage?: string; detail?: string; code?: string };
  clientFallback?: {
    available?: boolean;
    method?: string;
    note?: string;
  };
  recommendedNextSteps?: string[];
};

export type UpscaleResult =
  | {
      status: "ready";
      imageUrl: string;
      message?: string;
    }
  | {
      status: "not_ready";
      message: string;
      clientFallback?: UpscalePayload["clientFallback"];
      recommendedNextSteps?: string[];
    };

export class UpscaleError extends Error {
  status?: number;

  constructor(params: { message: string; status?: number }) {
    super(params.message);
    this.name = "UpscaleError";
    this.status = params.status;
  }
}

function normalizeErrorMessage(payload: UpscalePayload | null, status: number): string {
  const error = payload?.error;
  if (typeof error === "string" && error.trim()) return error.trim();
  if (error && typeof error === "object") {
    return error.userMessage?.trim() || error.message?.trim() || error.detail?.trim() || `HD 增强请求失败 (${status})`;
  }
  return payload?.message?.trim() || `HD 增强请求失败 (${status})`;
}

async function readJsonSafely(res: Response): Promise<UpscalePayload | null> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

async function defaultImageUrlToBase64(imageUrl: string, assetId?: string): Promise<string> {
  return assetUrlToDataUrl(imageUrl, { assetId, mediaKind: "image" });
}

export async function requestImageUpscale(input: {
  imageUrl: string;
  assetId?: string;
  scale?: 2 | 4 | 8;
  denoise?: number;
  faceEnhance?: boolean;
  model?: "realesrgan" | "esrgan" | "sd-upscale";
  timeoutMs?: number;
}, deps?: {
  fetchImpl?: typeof fetch;
  imageUrlToBase64Fn?: ImageUrlToBase64Fn;
}): Promise<UpscaleResult> {
  if (!input.imageUrl) {
    throw new UpscaleError({ message: "缺少可增强的图片输入。" });
  }

  const fetchImpl = deps?.fetchImpl ?? fetch;
  const imageUrlToBase64Fn = deps?.imageUrlToBase64Fn ?? defaultImageUrlToBase64;
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    input.timeoutMs ?? UPSCALE_CLIENT_TIMEOUT_MS,
  );

  let res: Response;
  try {
    const image = await imageUrlToBase64Fn(input.imageUrl, input.assetId);
    if (!image.startsWith("data:image")) {
      throw new UpscaleError({ message: "HD 增强当前只支持图片输入，请先从视频抽帧或选择图片节点。" });
    }

    res = await fetchImpl("/api/ai/upscale", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        image,
        scale: input.scale ?? 2,
        denoise: input.denoise ?? 0.5,
        faceEnhance: input.faceEnhance ?? false,
        model: input.model ?? "realesrgan",
      }),
    });
  } catch (error: any) {
    if (error instanceof UpscaleError) throw error;
    if (error?.name === "AbortError") {
      throw new UpscaleError({ message: "HD 增强请求超时，请稍后重试。" });
    }
    throw new UpscaleError({
      message: `HD 增强请求失败：${error?.message || "网络异常"}`,
    });
  } finally {
    clearTimeout(timeout);
  }

  const payload = await readJsonSafely(res);
  if (!res.ok) {
    throw new UpscaleError({
      message: normalizeErrorMessage(payload, res.status),
      status: res.status,
    });
  }

  if (payload?.status === "not_ready") {
    return {
      status: "not_ready",
      message: payload.message?.trim() || "服务端高清放大模型尚未部署",
      clientFallback: payload.clientFallback,
      recommendedNextSteps: payload.recommendedNextSteps,
    };
  }

  if (!payload?.imageUrl || typeof payload.imageUrl !== "string") {
    throw new UpscaleError({ message: "HD 增强服务没有返回可用图片。", status: res.status });
  }

  return {
    status: "ready",
    imageUrl: payload.imageUrl,
    message: payload.message,
  };
}
