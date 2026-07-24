import { fetchWithTimeout } from "../../../../lib/ai/server-fetch.ts";
import { resolveViduModel, type ViduRouteMode } from "./vidu-model.ts";
import { uploadDataUrlToDashScopeOss } from "./vidu-oss.ts";

const DEFAULT_POLL_INTERVAL_MS = 8_000;
const DEFAULT_MAX_POLL_MINUTES = 10;
const VIDU_REQUEST_TIMEOUT_MS = 60_000;

export interface ViduTaskRequest {
  mode: ViduRouteMode | "start-end";
  model?: string;
  prompt: string;
  imageUrl?: string;
  referenceImageUrls?: string[];
  firstFrameUrl?: string;
  lastFrameUrl?: string;
  duration?: number;
  resolution?: "540P" | "720P" | "1080P";
  audio?: boolean;
  watermark?: boolean;
  seed?: number;
  size?: string;
}

function isDataImageUrl(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().startsWith("data:image/");
}

export interface ViduTaskQueryResult {
  output?: {
    task_id?: string;
    task_status?: "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELED" | "UNKNOWN";
    video_url?: string;
    code?: string;
    message?: string;
    orig_prompt?: string;
  };
  request_id?: string;
  usage?: {
    duration?: number;
    size?: string;
    fps?: number;
    video_count?: number;
    audio?: boolean;
  };
}

export interface WaitForViduTaskResultParams {
  taskId: string;
  apiKey: string;
  baseUrl: string;
  pollIntervalMs?: number;
  maxPollMinutes?: number;
}

export interface WaitForViduTaskResultDeps {
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  onProgress?: (progress: {
    taskId: string;
    status: "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELED" | "UNKNOWN";
    lastStatus: string;
    pollCount: number;
    elapsedMs: number;
    result: ViduTaskQueryResult;
  }) => void;
}

export type WaitForViduTaskResultOutcome =
  | {
      ok: true;
      taskId: string;
      status: "SUCCEEDED";
      videoUrl: string;
      result: ViduTaskQueryResult;
      pollCount: number;
      elapsedMs: number;
    }
  | {
      ok: false;
      taskId: string;
      status: "FAILED" | "CANCELED" | "TIMEOUT" | "UNKNOWN";
      error: string;
      code?: string;
      result?: ViduTaskQueryResult;
      pollCount: number;
      elapsedMs: number;
    };

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function createViduTask(
  params: ViduTaskRequest,
  apiKey: string,
  baseUrl: string,
) {
  const {
    mode,
    model,
    prompt,
    imageUrl,
    referenceImageUrls,
    firstFrameUrl,
    lastFrameUrl,
    duration,
    resolution,
    audio,
    watermark,
    seed,
    size,
  } = params;

  const resolvedModel = resolveViduModel(model, mode);
  const input: Record<string, unknown> = { prompt };
  const references = mode === "r2v" ? referenceImageUrls ?? [] : [];
  if (mode === "r2v" && (references.length < 1 || references.length > 7)) {
    throw new Error("Reference video requires between 1 and 7 reference images.");
  }
  const providerImageUrl =
    mode === "i2v" && isDataImageUrl(imageUrl)
      ? await uploadDataUrlToDashScopeOss({
          dataUrl: imageUrl,
          apiKey,
          baseUrl,
          fileNamePrefix: "starcanvas-vidu-i2v",
        })
      : imageUrl;
  const providerReferenceUrls = await Promise.all(references.map(async (url) => (
    isDataImageUrl(url)
      ? uploadDataUrlToDashScopeOss({
          dataUrl: url,
          apiKey,
          baseUrl,
          fileNamePrefix: "starcanvas-vidu-r2v",
        })
      : url
  )));
  const needsOssResolve =
    (mode === "i2v" && typeof providerImageUrl === "string" && providerImageUrl.startsWith("oss://")) ||
    (mode === "r2v" && providerReferenceUrls.some((url) => url.startsWith("oss://")));

  if (mode === "i2v" && providerImageUrl) {
    if (resolvedModel.toLowerCase().startsWith("happyhorse-")) {
      input.first_frame = providerImageUrl;
      input.media = [{ type: "first_frame", url: providerImageUrl }];
    } else {
      input.media = [{ type: "image", url: providerImageUrl }];
    }
  } else if (mode === "r2v") {
    input.media = providerReferenceUrls.map((url) => ({ type: "image", url }));
  } else if (mode === "start-end" && firstFrameUrl && lastFrameUrl) {
    input.media = [
      { type: "image", url: firstFrameUrl },
      { type: "image", url: lastFrameUrl },
    ];
  }

  const parameters: Record<string, unknown> = {
    duration: duration ?? 5,
    resolution: resolution ?? "720P",
  };
  if (audio !== undefined) parameters.audio = audio;
  if (watermark !== undefined) parameters.watermark = watermark;
  if (seed !== undefined) parameters.seed = seed;
  if (size) parameters.size = size;

  const res = await fetchWithTimeout(
    `${baseUrl}/services/aigc/video-generation/video-synthesis`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "X-DashScope-Async": "enable",
        ...(needsOssResolve ? { "X-DashScope-OssResourceResolve": "enable" } : {}),
      },
      body: JSON.stringify({
        model: resolvedModel,
        input,
        parameters,
      }),
    },
    VIDU_REQUEST_TIMEOUT_MS,
  );

  if (!res.ok) {
    const errorText = await res.text().catch(() => "Unknown error");
    let errorJson: { code?: string; message?: string } = {};
    try {
      errorJson = JSON.parse(errorText);
    } catch {
      // ignore invalid upstream JSON
    }
    throw new Error(`Vidu API error [${res.status}]: ${errorJson.message || errorJson.code || errorText}`);
  }

  const data = await res.json() as {
    output?: { task_id?: string; task_status?: string };
    request_id?: string;
    code?: string;
    message?: string;
  };

  if (data.code) {
    throw new Error(`Vidu API error: ${data.message || data.code}`);
  }

  const taskId = data.output?.task_id;
  if (!taskId) {
    throw new Error("Vidu API did not return task_id");
  }

  return taskId;
}

export async function queryViduTask(taskId: string, apiKey: string, baseUrl: string) {
  const res = await fetchWithTimeout(
    `${baseUrl}/tasks/${taskId}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    },
    VIDU_REQUEST_TIMEOUT_MS,
  );

  if (!res.ok) {
    const errorText = await res.text().catch(() => "Unknown error");
    throw new Error(`Query error [${res.status}]: ${errorText}`);
  }

  return await res.json() as ViduTaskQueryResult;
}

export async function waitForViduTaskResult(
  params: WaitForViduTaskResultParams,
  deps: WaitForViduTaskResultDeps = {},
): Promise<WaitForViduTaskResultOutcome> {
  const sleepImpl = deps.sleep ?? sleep;
  const now = deps.now ?? (() => Date.now());
  const pollIntervalMs = params.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const maxPollMinutes = params.maxPollMinutes ?? DEFAULT_MAX_POLL_MINUTES;
  const startTime = now();
  const maxPollTime = maxPollMinutes * 60 * 1000;
  let lastStatus = "PENDING";
  let pollCount = 0;
  let consecutiveQueryErrors = 0;

  while (now() - startTime < maxPollTime) {
    pollCount += 1;
    await sleepImpl(pollIntervalMs);

    let result: ViduTaskQueryResult;
    try {
      result = await queryViduTask(params.taskId, params.apiKey, params.baseUrl);
      consecutiveQueryErrors = 0;
    } catch {
      consecutiveQueryErrors += 1;
      if (consecutiveQueryErrors >= 3) {
        return {
          ok: false,
          taskId: params.taskId,
          status: "UNKNOWN",
          error: `视频任务查询连续失败，请稍后通过 task_id 查询：${params.taskId}`,
          pollCount,
          elapsedMs: now() - startTime,
        };
      }
      continue;
    }
    const status = result.output?.task_status || "UNKNOWN";
    const elapsedMs = now() - startTime;

    deps.onProgress?.({
      taskId: params.taskId,
      status,
      lastStatus,
      pollCount,
      elapsedMs,
      result,
    });

    if (status === "SUCCEEDED") {
      const videoUrl = result.output?.video_url;
      if (!videoUrl) {
        return {
          ok: false,
          taskId: params.taskId,
          status: "FAILED",
          error: "Vidu 任务已完成，但未返回最终 video_url。",
          result,
          pollCount,
          elapsedMs,
        };
      }

      return {
        ok: true,
        taskId: params.taskId,
        status,
        videoUrl,
        result,
        pollCount,
        elapsedMs,
      };
    }

    if (status === "FAILED") {
      return {
        ok: false,
        taskId: params.taskId,
        status,
        error: result.output?.message || "视频生成失败",
        code: result.output?.code,
        result,
        pollCount,
        elapsedMs,
      };
    }

    if (status === "CANCELED") {
      return {
        ok: false,
        taskId: params.taskId,
        status,
        error: "任务已取消",
        result,
        pollCount,
        elapsedMs,
      };
    }

    lastStatus = status;
  }

  return {
    ok: false,
    taskId: params.taskId,
    status: "TIMEOUT",
    error: `视频生成超时（超过 ${maxPollMinutes} 分钟），请稍后通过 task_id 查询`,
    pollCount,
    elapsedMs: now() - startTime,
  };
}
