import assert from "node:assert/strict";
import test from "node:test";

import {
  buildTaskReadinessSummary,
  getTaskReadinessPrimaryBlockingReason,
  getTaskReadinessPrimaryFixHint,
  truncateReadinessHint,
} from "./taskReadiness.ts";
import type { ProviderHealthSummary } from "./provider-health-summary.ts";
import type { ProviderSmokeReport } from "./providerSmoke.ts";

function makeHealthSummary(
  statuses: Partial<Record<"text" | "image" | "video", "ready" | "warning" | "blocked">>,
  details?: Partial<Record<"text" | "image" | "video", string[]>>,
): ProviderHealthSummary {
  return {
    input: {
      serverConfig: null,
      sessionApiKey: "",
      useLocalOverride: false,
      useMock: false,
      defaultModel: "",
      imageModel: "",
      videoModel: "",
      timeoutMs: "120000",
      providers: [],
    },
    items: [
      {
        id: "text",
        label: "文本 / 剧本",
        status: statuses.text ?? "ready",
        message: `text:${statuses.text ?? "ready"}`,
        details: details?.text ?? [],
      },
      {
        id: "image",
        label: "图片生成",
        status: statuses.image ?? "ready",
        message: `image:${statuses.image ?? "ready"}`,
        details: details?.image ?? [],
      },
      {
        id: "video",
        label: "视频生成",
        status: statuses.video ?? "ready",
        message: `video:${statuses.video ?? "ready"}`,
        details: details?.video ?? [],
      },
      {
        id: "tts",
        label: "配音",
        status: "ready",
        message: "tts:ready",
      },
      {
        id: "voice-clone",
        label: "声线克隆",
        status: "warning",
        message: "voice-clone:warning",
      },
    ],
    blockingCount: Object.values(statuses).filter((status) => status === "blocked").length,
    warningCount: Object.values(statuses).filter((status) => status === "warning").length,
  };
}

function makeSmokeReport(
  statuses: Partial<Record<"text" | "image" | "video", "ready" | "warning" | "blocked">>,
  details?: Partial<Record<"text" | "image" | "video", string[]>>,
): ProviderSmokeReport {
  return {
    mode: "dry-run",
    overallStatus: "ready",
    readyCount: 0,
    warningCount: 0,
    blockedCount: 0,
    items: [
      {
        target: "text",
        label: "文本 / Chat",
        status: statuses.text ?? "ready",
        summary: `text:${statuses.text ?? "ready"}`,
        details: details?.text ?? [],
        realSmokeSupported: true,
        realSmokeRequiresConsent: true,
        mayConsumeQuota: true,
      },
      {
        target: "image",
        label: "图片生成",
        status: statuses.image ?? "ready",
        summary: `image:${statuses.image ?? "ready"}`,
        details: details?.image ?? [],
        realSmokeSupported: true,
        realSmokeRequiresConsent: true,
        mayConsumeQuota: true,
      },
      {
        target: "video",
        label: "视频生成",
        status: statuses.video ?? "ready",
        summary: `video:${statuses.video ?? "ready"}`,
        details: details?.video ?? [],
        realSmokeSupported: true,
        realSmokeRequiresConsent: true,
        mayConsumeQuota: true,
      },
      {
        target: "tts-browser",
        label: "TTS（浏览器）",
        status: "ready",
        summary: "tts-browser:ready",
        details: [],
        realSmokeSupported: false,
        realSmokeRequiresConsent: false,
        mayConsumeQuota: false,
      },
      {
        target: "tts-server",
        label: "TTS（服务端）",
        status: "ready",
        summary: "tts-server:ready",
        details: [],
        realSmokeSupported: true,
        realSmokeRequiresConsent: true,
        mayConsumeQuota: true,
      },
    ],
  };
}

test("task readiness blocks chat and production when smoke shows text/image unavailable", () => {
  const summary = buildTaskReadinessSummary({
    providerHealthSummary: makeHealthSummary({ text: "blocked", image: "blocked", video: "blocked" }),
    providerSmokeReport: makeSmokeReport({ text: "blocked", image: "blocked", video: "blocked" }),
  });

  assert.equal(summary.items.find((item) => item.taskId === "chat-create")?.status, "blocked");
  assert.equal(summary.items.find((item) => item.taskId === "auto-agent-project-bootstrap")?.status, "blocked");
  assert.equal(summary.items.find((item) => item.taskId === "image-production")?.status, "blocked");
  assert.equal(summary.items.find((item) => item.taskId === "production-run")?.status, "blocked");
  assert.equal(summary.blockingCount, 4);
});

test("task readiness keeps auto-agent bootstrap warning-only when text is ready but image is blocked", () => {
  const summary = buildTaskReadinessSummary({
    providerHealthSummary: makeHealthSummary({ text: "ready", image: "ready", video: "warning" }),
    providerSmokeReport: makeSmokeReport(
      { text: "ready", image: "blocked", video: "warning" },
      { image: ["缺少默认图片模型，请在设置面板填写 Image Model。"] },
    ),
  });

  assert.equal(summary.items.find((item) => item.taskId === "chat-create")?.status, "ready");
  assert.equal(summary.items.find((item) => item.taskId === "auto-agent-project-bootstrap")?.status, "warning");
  assert.equal(summary.items.find((item) => item.taskId === "image-production")?.status, "blocked");
  assert.equal(summary.items.find((item) => item.taskId === "production-run")?.status, "blocked");
  assert.match(
    summary.items.find((item) => item.taskId === "image-production")?.recommendedFixes.join("\n") ?? "",
    /Image Model/,
  );
});

test("task readiness prefers provider health details as first blocking reason and fix", () => {
  const summary = buildTaskReadinessSummary({
    providerHealthSummary: makeHealthSummary(
      { text: "ready", image: "blocked", video: "blocked" },
      {
        image: ["缺少 API Key，请先在设置面板填写图片 Provider Key。"],
        video: ["当前 `vidu` 路由必须使用 DashScope / 百炼专用路由。"],
      },
    ),
    providerSmokeReport: makeSmokeReport({ text: "ready", image: "ready", video: "ready" }),
  });

  assert.equal(
    summary.items.find((item) => item.taskId === "image-production")?.blockingReasons[0],
    "缺少 API Key，请先在设置面板填写图片 Provider Key。",
  );
  assert.equal(
    summary.items.find((item) => item.taskId === "image-production")?.recommendedFixes[0],
    "缺少 API Key，请先在设置面板填写图片 Provider Key。",
  );
  assert.match(
    summary.items.find((item) => item.taskId === "image-production")?.summary ?? "",
    /缺少 API Key/,
  );
});

test("task readiness does not let ready-state model details override blocked smoke reasons", () => {
  const summary = buildTaskReadinessSummary({
    providerHealthSummary: makeHealthSummary(
      { text: "ready", image: "ready", video: "ready" },
      { image: ["将使用 gpt-image-2。"] },
    ),
    providerSmokeReport: makeSmokeReport(
      { text: "ready", image: "blocked", video: "ready" },
      { image: ["缺少 API Key，请先在设置面板填写图片 Provider Key。"] },
    ),
  });

  assert.equal(
    summary.items.find((item) => item.taskId === "image-production")?.blockingReasons[0],
    "image:blocked",
  );
  assert.match(
    summary.items.find((item) => item.taskId === "image-production")?.blockingReasons.join("\n") ?? "",
    /缺少 API Key/,
  );
});

test("task readiness falls back to provider health and marks production as warning when video is only a warning", () => {
  const summary = buildTaskReadinessSummary({
    providerHealthSummary: makeHealthSummary({ text: "ready", image: "ready", video: "warning" }),
    providerSmokeReport: null,
  });

  assert.equal(summary.items.find((item) => item.taskId === "chat-create")?.status, "ready");
  assert.equal(summary.items.find((item) => item.taskId === "auto-agent-project-bootstrap")?.status, "ready");
  assert.equal(summary.items.find((item) => item.taskId === "image-production")?.status, "ready");
  assert.equal(summary.items.find((item) => item.taskId === "production-run")?.status, "warning");
  assert.equal(summary.warningCount, 1);
});

test("task readiness treats the latest failed real image smoke as a production blocker", () => {
  const summary = buildTaskReadinessSummary({
    providerHealthSummary: makeHealthSummary({ text: "ready", image: "ready", video: "ready" }),
    providerSmokeReport: null,
    storedProviderSmokeResults: {
      image: {
        target: "image",
        status: "failed",
        message: "图片生成超时，请稍后重试。",
        details: ["上游服务响应时间过长，可能是服务繁忙或当前图片处理耗时过高。"],
        updatedAt: Date.now(),
        summaryCategory: "timeout",
        summarySeverity: "warning",
        summaryTitle: "请求超时",
        hints: ["可稍后重试，或切换到另一个可用 provider。"],
      },
    },
  });

  assert.equal(summary.items.find((item) => item.taskId === "auto-agent-project-bootstrap")?.status, "warning");
  assert.equal(summary.items.find((item) => item.taskId === "image-production")?.status, "blocked");
  assert.equal(summary.items.find((item) => item.taskId === "production-run")?.status, "blocked");
  assert.match(
    summary.items.find((item) => item.taskId === "image-production")?.blockingReasons.join("\n") ?? "",
    /最近一次真实 smoke：请求超时/,
  );
});

test("task readiness shared helpers expose stable primary hint order", () => {
  const item = {
    blockingReasons: ["图片生成尚未就绪。", "缺少 API Key。"],
    recommendedFixes: ["缺少默认图片模型，请在设置面板填写 Image Model。"],
  };

  assert.equal(getTaskReadinessPrimaryBlockingReason(item), "图片生成尚未就绪。");
  assert.equal(getTaskReadinessPrimaryFixHint(item), "缺少默认图片模型，请在设置面板填写 Image Model。");
  assert.equal(truncateReadinessHint("原因：缺少默认图片模型，请在设置面板填写 Image Model。", 10), "缺少默认图片模型，请...");
});
