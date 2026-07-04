"use client";

export const TALKING_PHOTO_CLIENT_TIMEOUT_MS = 120_000;
type ImageUrlToBase64Fn = (imageUrl: string, assetId?: string) => Promise<string>;

export type TalkingPhotoMode = "lip-sync" | "full-head" | "avatar";
export type TalkingPhotoAudioSource = "text-to-speech" | "upload" | "clone";

type TalkingPhotoPayload = {
  status?: string;
  message?: string;
  videoUrl?: string;
  videoBase64?: string;
  durationMs?: number;
  guide?: string;
  recommendedNextSteps?: string[];
  error?: string | { message?: string; userMessage?: string; detail?: string; code?: string };
};

export type TalkingPhotoResult =
  | {
      status: "ready";
      videoUrl: string;
      durationMs?: number;
      message?: string;
    }
  | {
      status: "not_ready";
      message: string;
      guide?: string;
      recommendedNextSteps?: string[];
    };

export class TalkingPhotoError extends Error {
  status?: number;

  constructor(params: { message: string; status?: number }) {
    super(params.message);
    this.name = "TalkingPhotoError";
    this.status = params.status;
  }
}

function normalizeErrorMessage(payload: TalkingPhotoPayload | null, status: number): string {
  const error = payload?.error;
  if (typeof error === "string" && error.trim()) return error.trim();
  if (error && typeof error === "object") {
    return error.userMessage?.trim() || error.message?.trim() || error.detail?.trim() || `数字人请求失败 (${status})`;
  }
  return payload?.message?.trim() || `数字人请求失败 (${status})`;
}

async function readJsonSafely(res: Response): Promise<TalkingPhotoPayload | null> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function resolveVideoUrl(payload: TalkingPhotoPayload): string | undefined {
  const video = payload.videoUrl || payload.videoBase64;
  if (!video || typeof video !== "string") return undefined;
  if (video.startsWith("data:video")) return video;
  if (payload.videoBase64 && !payload.videoBase64.startsWith("data:")) {
    return `data:video/mp4;base64,${payload.videoBase64}`;
  }
  return video;
}

async function defaultImageUrlToBase64(imageUrl: string, assetId?: string): Promise<string> {
  const { imageUrlToBase64 } = await import("./imagePromptReverser.ts");
  return imageUrlToBase64(imageUrl, assetId);
}

export async function requestTalkingPhoto(input: {
  imageUrl: string;
  imageAssetId?: string;
  text?: string;
  audioUrl?: string;
  mode?: TalkingPhotoMode;
  audioSource?: TalkingPhotoAudioSource;
  voiceId?: string;
  language?: string;
  emotion?: "neutral" | "happy" | "sad" | "angry" | "surprised";
  headMovement?: boolean;
  eyeContact?: boolean;
  background?: "transparent" | "blur" | "original";
  timeoutMs?: number;
}, deps?: {
  fetchImpl?: typeof fetch;
  imageUrlToBase64Fn?: ImageUrlToBase64Fn;
  audioUrlToBase64Fn?: (audioUrl: string) => Promise<string>;
}): Promise<TalkingPhotoResult> {
  if (!input.imageUrl) {
    throw new TalkingPhotoError({ message: "缺少角色头像图片，请连接图片节点。" });
  }

  const text = input.text?.trim();
  const audioSource: TalkingPhotoAudioSource = input.audioUrl ? "upload" : input.audioSource ?? "text-to-speech";
  if (audioSource === "upload" && !input.audioUrl) {
    throw new TalkingPhotoError({ message: "数字人上传音频模式缺少音频输入。" });
  }
  if (audioSource !== "upload" && !text) {
    throw new TalkingPhotoError({ message: "缺少口播台词，请在数字人节点或上游文本节点输入文案。" });
  }

  const fetchImpl = deps?.fetchImpl ?? fetch;
  const imageUrlToBase64Fn = deps?.imageUrlToBase64Fn ?? defaultImageUrlToBase64;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs ?? TALKING_PHOTO_CLIENT_TIMEOUT_MS);

  let res: Response;
  try {
    const image = await imageUrlToBase64Fn(input.imageUrl, input.imageAssetId);
    if (!image.startsWith("data:image")) {
      throw new TalkingPhotoError({ message: "数字人当前只支持图片头像输入。" });
    }

    const audio = input.audioUrl && deps?.audioUrlToBase64Fn
      ? await deps.audioUrlToBase64Fn(input.audioUrl)
      : input.audioUrl;

    res = await fetchImpl("/api/ai/talking-photo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        image,
        audio,
        text,
        mode: input.mode ?? "lip-sync",
        audioSource,
        voiceId: input.voiceId,
        language: input.language ?? "zh",
        emotion: input.emotion ?? "neutral",
        headMovement: input.headMovement ?? true,
        eyeContact: input.eyeContact ?? true,
        background: input.background ?? "original",
      }),
    });
  } catch (error: any) {
    if (error instanceof TalkingPhotoError) throw error;
    if (error?.name === "AbortError") {
      throw new TalkingPhotoError({ message: "数字人请求超时，请稍后重试。" });
    }
    throw new TalkingPhotoError({ message: `数字人请求失败：${error?.message || "网络异常"}` });
  } finally {
    clearTimeout(timeout);
  }

  const payload = await readJsonSafely(res);
  if (!res.ok) {
    throw new TalkingPhotoError({
      message: normalizeErrorMessage(payload, res.status),
      status: res.status,
    });
  }

  if (payload?.status === "not_ready") {
    return {
      status: "not_ready",
      message: payload.message?.trim() || "数字人服务尚未部署",
      guide: payload.guide,
      recommendedNextSteps: payload.recommendedNextSteps,
    };
  }

  const videoUrl = payload ? resolveVideoUrl(payload) : undefined;
  if (!videoUrl) {
    throw new TalkingPhotoError({ message: "数字人服务没有返回可用视频。", status: res.status });
  }

  return {
    status: "ready",
    videoUrl,
    durationMs: payload?.durationMs,
    message: payload?.message,
  };
}
