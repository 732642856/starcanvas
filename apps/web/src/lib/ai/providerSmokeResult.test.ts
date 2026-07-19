import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyProviderSmokeResult,
  clearStoredProviderSmokeResults,
  getStoredProviderSmokeReadinessStatus,
  loadStoredProviderSmokeResults,
  saveStoredProviderSmokeResult,
  summarizeProviderSmokeResult,
} from "./providerSmokeResult.ts";

test("classifies unauthorized smoke failures as api-key issues", () => {
  const result = classifyProviderSmokeResult({
    status: "failed",
    message: "API Key 无效或无权限: invalid api key",
    details: [],
  });

  assert.equal(result.category, "api-key");
  assert.equal(result.severity, "error");
  assert.match(result.title, /API Key/);
});

test("classifies rate-limited smoke failures as quota issues", () => {
  const result = classifyProviderSmokeResult({
    status: "failed",
    message: "请求频率超限或余额不足: quota exceeded",
    details: [],
  });

  assert.equal(result.category, "quota");
  assert.equal(result.severity, "warning");
});

test("classifies blocked confirmation failures as confirmation issues", () => {
  const result = classifyProviderSmokeResult({
    status: "blocked",
    message: "缺少更强的确认短语，当前不会执行真实 smoke。",
    details: ["请重新确认并提交指定短语：RUN_VIDEO_SMOKE"],
  });

  assert.equal(result.category, "confirmation");
  assert.equal(result.severity, "warning");
});

test("builds a user-facing summary with follow-up guidance", () => {
  const summary = summarizeProviderSmokeResult({
    status: "failed",
    message: "Base URL 或模型不存在: model missing",
    details: ["请检查 Image Model"],
  });

  assert.equal(summary.title, "模型或地址不匹配");
  assert.equal(summary.hints.length > 0, true);
});

test("persists stored real smoke results and maps timeout failures to blocked readiness", () => {
  const store = new Map<string, string>();
  const originalWindow = (globalThis as typeof globalThis & { window?: unknown }).window;
  (globalThis as typeof globalThis & { window?: unknown }).window = {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    },
    dispatchEvent: () => true,
  };

  try {
    const stored = saveStoredProviderSmokeResult("image", {
      status: "failed",
      message: "图片生成超时，请稍后重试。",
      details: ["上游服务响应时间过长，可能是服务繁忙或当前图片处理耗时过高。"],
    });
    const loaded = loadStoredProviderSmokeResults().image;

    assert.equal(stored.summaryCategory, "timeout");
    assert.equal(loaded?.summaryTitle, "请求超时");
    assert.equal(getStoredProviderSmokeReadinessStatus(loaded), "blocked");

    clearStoredProviderSmokeResults();
    assert.deepEqual(loadStoredProviderSmokeResults(), {});
  } finally {
    (globalThis as typeof globalThis & { window?: unknown }).window = originalWindow;
  }
});
