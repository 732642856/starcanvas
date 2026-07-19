import assert from "node:assert/strict";
import test from "node:test";

import { buildProviderSmokeReport } from "./providerSmoke.ts";

test("provider smoke reports video as warning when only a session DashScope key is present", () => {
  const report = buildProviderSmokeReport({
    overrides: { sessionApiKey: "sk-session-dashscope" },
    resolveMergedConfig: () => ({
      id: "default",
      name: "默认中转站",
      type: "openai-compatible",
      baseUrl: "https://relay.example/v1",
      apiKey: "sk-env",
      mode: "server-env",
      capabilities: ["text", "image"],
      defaultModel: "gpt-5.5",
      defaultImageModel: "gpt-image-2",
      videoModel: undefined,
      imageModels: new Set(["gpt-image-2"]),
      videoModels: new Set(),
      audioModels: new Set(),
      timeoutMs: 120000,
      enabled: true,
    }),
    resolveDashScopeVideoProvider: () => {
      throw new Error('No provider with "video" capability configured.');
    },
  });

  const video = report.items.find((item) => item.target === "video");
  assert.ok(video);
  assert.equal(video.status, "warning");
  assert.equal(video.realSmokeSupported, true);
  assert.equal(video.realSmokeRequiresConsent, true);

  const referenceEdit = report.items.find((item) => item.target === "image-edit");
  assert.ok(referenceEdit);
  assert.equal(referenceEdit.status, "warning");
  assert.equal(referenceEdit.realSmokeSupported, true);
  assert.equal(referenceEdit.realSmokeRequiresConsent, true);
  assert.match(referenceEdit.details.join("\n"), /不会把普通生图 smoke 当成参考图编辑已验证/);
});

test("provider smoke blocks image when no merged provider config is available", () => {
  const report = buildProviderSmokeReport({
    resolveMergedConfig: () => {
      throw new Error("Missing required config.");
    },
    resolveDashScopeVideoProvider: () => {
      throw new Error('No provider with "video" capability configured.');
    },
  });

  const image = report.items.find((item) => item.target === "image");
  const text = report.items.find((item) => item.target === "text");
  assert.ok(image);
  assert.ok(text);
  assert.equal(image.status, "blocked");
  assert.equal(text.status, "blocked");
  assert.equal(report.overallStatus, "blocked");
});

test("provider smoke marks server TTS as ready when VOXCPM is configured", () => {
  const report = buildProviderSmokeReport({
    voxcpmBaseUrl: "http://voxcpm.internal:9000",
    resolveMergedConfig: () => ({
      id: "default",
      name: "默认中转站",
      type: "openai-compatible",
      baseUrl: "https://relay.example/v1",
      apiKey: "sk-env",
      mode: "server-env",
      capabilities: ["text", "image"],
      defaultModel: "gpt-5.5",
      defaultImageModel: "gpt-image-2",
      videoModel: undefined,
      imageModels: new Set(["gpt-image-2"]),
      videoModels: new Set(),
      audioModels: new Set(),
      timeoutMs: 120000,
      enabled: true,
    }),
    resolveDashScopeVideoProvider: () => ({
      id: "dashscope",
      name: "DashScope",
      type: "openai-compatible",
      baseUrl: "https://dashscope.aliyuncs.com/api/v1",
      apiKey: "sk-dashscope",
      mode: "server-env",
      capabilities: ["video"],
      defaultModel: "qwen-plus",
      defaultImageModel: "wan2.1-t2i",
      videoModel: "vidu-q3-turbo-i2v",
      imageModels: new Set(),
      videoModels: new Set(["vidu-q3-turbo-i2v"]),
      audioModels: new Set(),
      timeoutMs: 120000,
      enabled: true,
    }),
  });

  const ttsServer = report.items.find((item) => item.target === "tts-server");
  assert.ok(ttsServer);
  assert.equal(ttsServer.status, "ready");
});
