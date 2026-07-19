"use client";

import { persistImageDataUrl } from "../../../lib/assets/localImageStore.ts";
import { assetUrlToDataUrl } from "./providerMediaDataUrl.ts";

export const FOCUS_EDIT_CLIENT_TIMEOUT_MS = 150_000;
type ImageUrlToBase64Fn = (imageUrl: string, assetId?: string) => Promise<string>;

type FocusEditPayload = {
  ok?: boolean;
  imageUrl?: string;
  error?: string | { message?: string; userMessage?: string; detail?: string; code?: string };
  requestId?: string;
  attempts?: number;
  model?: string;
};

export type FocusEditResult = {
  imageUrl: string;
  assetId?: string;
  requestId?: string;
  attempts?: number;
  model?: string;
};

export class FocusEditError extends Error {
  status?: number;
  requestId?: string;
  attempts?: number;

  constructor(params: {
    message: string;
    status?: number;
    requestId?: string;
    attempts?: number;
  }) {
    super(params.message);
    this.name = "FocusEditError";
    this.status = params.status;
    this.requestId = params.requestId;
    this.attempts = params.attempts;
  }
}

function trimPrompt(prompt: string): string {
  return prompt.replace(/\s+/g, " ").trim();
}

function normalizeErrorMessage(payload: FocusEditPayload | null, status: number): string {
  const error = payload?.error;
  if (typeof error === "string" && error.trim()) return error.trim();
  if (error && typeof error === "object") {
    const userMessage = error.userMessage?.trim();
    const detail = error.detail?.trim();
    const message = error.message?.trim();
    if (userMessage && detail && userMessage !== detail) return `${userMessage}\n${detail}`;
    return userMessage || message || detail || `局部精修请求失败 (${status})`;
  }
  if (status === 401 || status === 403) return "局部精修认证失败，请检查 AI Provider 配置。";
  if (status === 500) return "局部精修服务暂不可用，请检查 API Key 或后端配置。";
  return `局部精修请求失败 (${status})`;
}

async function readJsonSafely(res: Response): Promise<FocusEditPayload | null> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

async function persistResultImage(
  imageUrl: string,
  persistImageDataUrlFn: typeof persistImageDataUrl,
): Promise<{ imageUrl: string; assetId?: string }> {
  if (!imageUrl.startsWith("data:image")) return { imageUrl };
  const persisted = await persistImageDataUrlFn(imageUrl, {
    fileName: `focus-edit-${Date.now()}.png`,
  });
  return { imageUrl: persisted.objectUrl, assetId: persisted.assetId };
}

async function defaultImageUrlToBase64(imageUrl: string, assetId?: string): Promise<string> {
  return assetUrlToDataUrl(imageUrl, { assetId, mediaKind: "image" });
}

export async function applyFocusEdit(input: {
  imageUrl: string;
  maskDataUrl: string;
  prompt: string;
  sourceAssetId?: string;
  requestId?: string;
  model?: string;
  size?: string;
  timeoutMs?: number;
}, deps?: {
  fetchImpl?: typeof fetch;
  imageUrlToBase64Fn?: ImageUrlToBase64Fn;
  persistImageDataUrlFn?: typeof persistImageDataUrl;
}): Promise<FocusEditResult> {
  const instruction = trimPrompt(input.prompt);
  if (!instruction) {
    throw new FocusEditError({ message: "请先描述要局部修改的内容。" });
  }
  if (!input.imageUrl) {
    throw new FocusEditError({ message: "缺少可编辑的角色正面图。" });
  }
  if (!input.maskDataUrl?.startsWith("data:image")) {
    throw new FocusEditError({ message: "请先在图片上涂抹要修改的区域。" });
  }

  const fetchImpl = deps?.fetchImpl ?? fetch;
  const imageUrlToBase64Fn = deps?.imageUrlToBase64Fn ?? defaultImageUrlToBase64;
  const persistImageDataUrlFn = deps?.persistImageDataUrlFn ?? persistImageDataUrl;
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    input.timeoutMs ?? FOCUS_EDIT_CLIENT_TIMEOUT_MS,
  );

  let res: Response;
  try {
    const sourceImageDataUrl = await imageUrlToBase64Fn(input.imageUrl, input.sourceAssetId);
    res = await fetchImpl("/api/ai/focus-edit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        imageUrl: sourceImageDataUrl,
        maskBase64: input.maskDataUrl,
        instruction,
        model: input.model ?? "gpt-image-2",
        size: input.size ?? "1024x1024",
        requestId: input.requestId,
      }),
    });
  } catch (error: any) {
    if (error?.name === "AbortError") {
      throw new FocusEditError({
        message: "局部精修超时，请稍后重试。",
      });
    }
    throw new FocusEditError({
      message: `局部精修请求失败：${error?.message || "网络异常"}`,
    });
  } finally {
    clearTimeout(timeout);
  }

  const payload = await readJsonSafely(res);
  if (!res.ok || payload?.ok === false) {
    throw new FocusEditError({
      message: normalizeErrorMessage(payload, res.status),
      status: res.status,
      requestId: payload?.requestId,
      attempts: payload?.attempts,
    });
  }

  if (!payload?.imageUrl || typeof payload.imageUrl !== "string") {
    throw new FocusEditError({
      message: "局部精修服务没有返回可用图片。",
      status: res.status,
      requestId: payload?.requestId,
      attempts: payload?.attempts,
    });
  }

  const persisted = await persistResultImage(payload.imageUrl, persistImageDataUrlFn);
  return {
    imageUrl: persisted.imageUrl,
    assetId: persisted.assetId,
    requestId: payload.requestId,
    attempts: payload.attempts,
    model: payload.model,
  };
}
