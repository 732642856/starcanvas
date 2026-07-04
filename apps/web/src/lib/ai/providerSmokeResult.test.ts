import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyProviderSmokeResult,
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
