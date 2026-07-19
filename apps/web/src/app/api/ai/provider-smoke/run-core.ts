import { mergeProviderConfig } from "../../../../lib/ai/provider-config.ts";
import type { AiProviderOverrides } from "../../../../lib/ai/provider-config.ts";
import { fetchWithTimeout } from "../../../../lib/ai/server-fetch.ts";
import { findProviderByCapability } from "../../../../lib/ai/provider-registry.ts";
import { normalizeClientError, normalizeUpstreamError } from "../../../../lib/ai/errors.ts";
import {
  getProviderRealSmokeConfirmationText,
  type ProviderRealSmokeTarget,
} from "../../../../lib/ai/providerSmoke.ts";
import { buildImageEditFormData } from "../generate-image/image-edit-form.ts";
import { resolveViduAuth } from "../generate-video-vidu/vidu-auth.ts";
import {
  createViduTask,
  waitForViduTaskResult,
} from "../generate-video-vidu/vidu-task.ts";

export type { ProviderRealSmokeTarget } from "../../../../lib/ai/providerSmoke.ts";

export interface ProviderRealSmokeRequest {
  target: ProviderRealSmokeTarget;
  confirmCost?: boolean;
  confirmationText?: string;
  waitForResult?: boolean;
  _providerOverrides?: AiProviderOverrides;
}

export interface ProviderRealSmokeResult {
  ok: boolean;
  target: ProviderRealSmokeTarget;
  message: string;
  status: "passed" | "failed" | "blocked";
  details?: string[];
  artifact?: {
    type: "image" | "video";
    url: string;
    mimeType?: string;
  };
}

const REFERENCE_IMAGE_SMOKE_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLKOwAAAABJRU5ErkJggg==";

function blocked(target: ProviderRealSmokeTarget, message: string, details?: string[]): ProviderRealSmokeResult {
  return { ok: false, target, message, status: "blocked", details };
}

function failed(target: ProviderRealSmokeTarget, message: string, details?: string[]): ProviderRealSmokeResult {
  return { ok: false, target, message, status: "failed", details };
}

function passed(target: ProviderRealSmokeTarget, message: string, details?: string[]): ProviderRealSmokeResult {
  return { ok: true, target, message, status: "passed", details };
}

function hasRequiredConfirmation(input: ProviderRealSmokeRequest): boolean {
  const expected = getProviderRealSmokeConfirmationText(input.target);
  if (!expected) return true;
  return input.confirmationText?.trim() === expected;
}

export async function runProviderRealSmoke(
  input: ProviderRealSmokeRequest,
  deps?: {
    voxcpmBaseUrl?: string;
    fetchImpl?: typeof fetch;
    sleepImpl?: (ms: number) => Promise<void>;
    nowImpl?: () => number;
    videoPollIntervalMs?: number;
    videoMaxPollMinutes?: number;
  },
): Promise<ProviderRealSmokeResult> {
  if (!input.confirmCost) {
    return blocked(input.target, "真实 smoke 需要用户显式授权后才会执行。", [
      "这一步会发送真实请求，可能产生少量费用或额度消耗。",
    ]);
  }

  if (!hasRequiredConfirmation(input)) {
    return blocked(input.target, "缺少更强的确认短语，当前不会执行真实 smoke。", [
      `请重新确认并提交指定短语：${getProviderRealSmokeConfirmationText(input.target) || "无需额外短语"}`,
    ]);
  }

  const fetchImpl = deps?.fetchImpl ?? fetch;

  if (input.target === "text") {
    let config: ReturnType<typeof mergeProviderConfig>;
    try {
      config = mergeProviderConfig(input._providerOverrides);
    } catch (error) {
      return blocked("text", error instanceof Error ? error.message : "文本 Provider 未配置。");
    }

    try {
      const response = await fetchWithTimeout(
        `${config.baseUrl}/chat/completions`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: config.defaultModel,
            messages: [{ role: "user", content: "Reply with only: ok" }],
            temperature: 0,
            max_tokens: 5,
          }),
        },
        15_000,
      );

      const text = await response.text();
      if (!response.ok) {
        const normalized = normalizeUpstreamError(response.status, text, config.type);
        return failed("text", normalized.message);
      }

      return passed("text", `文本 smoke 已通过（${config.defaultModel}）。`, [
        "这是一次最小真实调用，会产生极少量 token 消耗。",
      ]);
    } catch (error) {
      const normalized = normalizeClientError(error, config.type);
      return failed("text", normalized.message);
    }
  }

  if (input.target === "tts-server") {
    const voxcpmBaseUrl = (deps?.voxcpmBaseUrl || process.env.VOXCPM_BASE_URL || "").trim().replace(/\/+$/, "");
    if (!voxcpmBaseUrl) {
      return blocked("tts-server", "VOXCPM_BASE_URL 未配置，无法执行服务端 TTS smoke。", [
        "浏览器本地 Kokoro 不需要这个地址，但它不属于服务端真实 smoke。",
      ]);
    }

    try {
      const response = await fetchImpl(`${voxcpmBaseUrl}/audio/speech`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "openbmb/VoxCPM2",
          input: "你好",
          voice: "default",
          response_format: "wav",
          speed: 1,
        }),
      });

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        const normalized = normalizeUpstreamError(response.status, text, "voxcpm");
        return failed("tts-server", normalized.message);
      }

      await response.arrayBuffer();
      return passed("tts-server", "服务端 TTS smoke 已通过。", [
        "这是一次极短文本真实调用，通常只会消耗很少的服务端资源。",
      ]);
    } catch (error) {
      const normalized = normalizeClientError(error, "voxcpm");
      return failed("tts-server", normalized.message);
    }
  }

  if (input.target === "image") {
    let config: ReturnType<typeof mergeProviderConfig>;
    try {
      config = mergeProviderConfig(input._providerOverrides);
    } catch (error) {
      return blocked("image", error instanceof Error ? error.message : "图片 Provider 未配置。");
    }

    const model = input._providerOverrides?.imageModel || config.defaultImageModel;
    if (!model) {
      return blocked("image", "缺少图片模型，无法执行真实生图 smoke。", [
        "请先在设置面板填写 Image Model，或配置 AI_DEFAULT_IMAGE_MODEL。",
      ]);
    }

    try {
      const response = await fetchWithTimeout(
        `${config.baseUrl}/images/generations`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            prompt: "Minimal smoke test image, simple geometric poster, monochrome, no text.",
            n: 1,
            size: "1024x1024",
            response_format: "b64_json",
          }),
        },
        config.timeoutMs,
      );

      const text = await response.text();
      if (!response.ok) {
        const normalized = normalizeUpstreamError(response.status, text, config.type);
        return failed("image", normalized.message);
      }

      let artifact:
        | ProviderRealSmokeResult["artifact"]
        | undefined;
      try {
        const payload = JSON.parse(text) as {
          data?: Array<{ b64_json?: string; url?: string }>;
        };
        const firstImage = payload.data?.[0];
        if (firstImage?.b64_json) {
          artifact = {
            type: "image",
            url: `data:image/png;base64,${firstImage.b64_json}`,
            mimeType: "image/png",
          };
        } else if (firstImage?.url) {
          artifact = {
            type: "image",
            url: firstImage.url,
          };
        }
      } catch {
        artifact = undefined;
      }

      return {
        ...passed("image", `图片 smoke 已通过（${model}）。`, [
        "这是一次单张最小规格真实生图请求，会消耗少量图片额度。",
      ]),
        artifact,
      };
    } catch (error) {
      const normalized = normalizeClientError(error, config.type);
      return failed("image", normalized.message);
    }
  }

  if (input.target === "image-edit") {
    let config: ReturnType<typeof mergeProviderConfig>;
    try {
      config = mergeProviderConfig(input._providerOverrides);
    } catch (error) {
      return blocked("image-edit", error instanceof Error ? error.message : "图片 Provider 未配置。");
    }

    const model = input._providerOverrides?.imageModel || config.defaultImageModel;
    if (!model) return blocked("image-edit", "图片模型未配置。");

    try {
      const response = await fetchWithTimeout(
        `${config.baseUrl}/images/edits`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${config.apiKey}` },
          body: buildImageEditFormData({
            model,
            prompt: "Minimal reference image edit smoke. Preserve the source image identity and composition; add a subtle monochrome frame.",
            size: "1024x1024",
            sourceImageValues: [REFERENCE_IMAGE_SMOKE_DATA_URL],
          }),
        },
        config.timeoutMs,
      );
      const text = await response.text();
      if (!response.ok) {
        const normalized = normalizeUpstreamError(response.status, text, config.type);
        return failed("image-edit", normalized.message, [
          "这是 images/edits 合同，不等同于普通 images/generations 生图。",
        ]);
      }

      let artifact: ProviderRealSmokeResult["artifact"] | undefined;
      try {
        const payload = JSON.parse(text) as { data?: Array<{ b64_json?: string; url?: string }> };
        const firstImage = payload.data?.[0];
        if (firstImage?.b64_json) {
          artifact = {
            type: "image",
            url: `data:image/png;base64,${firstImage.b64_json}`,
            mimeType: "image/png",
          };
        } else if (firstImage?.url) {
          artifact = { type: "image", url: firstImage.url };
        }
      } catch {
        artifact = undefined;
      }

      return {
        ...passed("image-edit", `参考图编辑 smoke 已通过（${model}）。`, [
          "已验证 images/edits 请求合同；仍建议在首张关键帧上检查角色一致性。",
          "这是一次极小参考图编辑真实请求，会消耗少量图片额度。",
        ]),
        artifact,
      };
    } catch (error) {
      const normalized = normalizeClientError(error, config.type);
      return failed("image-edit", normalized.message, [
        "这是 images/edits 合同，不等同于普通 images/generations 生图。",
      ]);
    }
  }

  if (input.target === "video") {
    let provider = null;
    try {
      provider = findProviderByCapability("video", "dashscope");
    } catch {
      provider = null;
    }

    const auth = resolveViduAuth({
      sessionApiKey: input._providerOverrides?.sessionApiKey,
      provider,
    });

    if (!auth) {
      return blocked("video", "DashScope / Vidu 视频 Provider 未就绪。", [
        "请填写会话级 DashScope Key，或在服务端配置 DASHSCOPE_API_KEY。",
      ]);
    }

    try {
      const taskId = await createViduTask({
        mode: "t2v",
        model: input._providerOverrides?.videoModel,
        prompt: "Minimal smoke test video, single shape drifting slowly, no characters.",
        duration: 1,
        resolution: "540P",
        audio: false,
        watermark: false,
      }, auth.apiKey, auth.baseUrl);

      if (!input.waitForResult) {
        return passed("video", "视频 smoke 已提交最小 Vidu 任务。", [
          `任务 ID：${taskId}`,
          "这是一次最小时长真实视频请求，通常会消耗少量视频额度。",
        ]);
      }

      const waitResult = await waitForViduTaskResult({
        taskId,
        apiKey: auth.apiKey,
        baseUrl: auth.baseUrl,
        pollIntervalMs: deps?.videoPollIntervalMs,
        maxPollMinutes: deps?.videoMaxPollMinutes,
      }, {
        sleep: deps?.sleepImpl,
        now: deps?.nowImpl,
      });

      if (!waitResult.ok) {
        return failed("video", waitResult.error, [
          `任务 ID：${taskId}`,
          "任务已成功提交到 Vidu，但在等待最终视频结果时未完成。",
        ]);
      }

      return {
        ...passed("video", "视频 smoke 已通过（已拿到最终 Vidu 视频结果）。", [
          `任务 ID：${taskId}`,
          `最终视频地址：${waitResult.videoUrl}`,
          "已验证从任务提交到最终 videoUrl 回收的完整链路。",
        ]),
        artifact: {
          type: "video",
          url: waitResult.videoUrl,
        },
      };
    } catch (error) {
      const normalized = normalizeClientError(error, "dashscope");
      return failed("video", normalized.message);
    }
  }

  return blocked(input.target, "未知 smoke target。");
}
