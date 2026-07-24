import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildProviderSmokeEnv,
  buildProviderSmokePlan,
  parseProviderSmokeEnvFile,
} from "./provider-smoke-plan.mjs";

describe("buildProviderSmokePlan", () => {
  it("blocks remote text, image, and video checks when no server config is available", () => {
    const plan = buildProviderSmokePlan({
      config: null,
      env: {},
    });

    assert.equal(plan.summary.blocked, 3);
    assert.equal(plan.summary.runnable, 0);
    assert.equal(plan.checks.find((check) => check.id === "text")?.status, "blocked");
    assert.equal(plan.checks.find((check) => check.id === "image")?.status, "blocked");
    assert.equal(plan.checks.find((check) => check.id === "video")?.status, "blocked");
    assert.equal(plan.checks.find((check) => check.id === "tts")?.status, "skipped");
  });

  it("skips paid real calls unless smoke opt-in flags are enabled", () => {
    const plan = buildProviderSmokePlan({
      config: {
        baseUrl: "https://relay.example.com/v1",
        hasApiKey: true,
        defaultModel: "gpt-5.5",
        defaultImageModel: "gpt-image-2",
        videoModel: "viduq3-turbo",
        timeoutMs: 120000,
        providers: [
          {
            id: "dashscope",
            name: "DashScope",
            capabilities: ["video", "image", "text"],
            hasApiKey: true,
          },
        ],
      },
      env: {},
    });

    assert.equal(plan.summary.skipped, 4);
    assert.equal(plan.summary.runnable, 0);
    assert.match(plan.checks.find((check) => check.id === "image")?.reason ?? "", /STARCANVAS_REAL_PROVIDER_SMOKE/);
    assert.match(plan.checks.find((check) => check.id === "video")?.reason ?? "", /STARCANVAS_REAL_VIDEO_SMOKE/);
  });

  it("marks text and image runnable with the general opt-in but keeps video behind its own flag", () => {
    const plan = buildProviderSmokePlan({
      config: {
        baseUrl: "https://relay.example.com/v1",
        hasApiKey: true,
        defaultModel: "gpt-5.5",
        defaultImageModel: "gpt-image-2",
        videoModel: "viduq3-turbo",
        timeoutMs: 120000,
        providers: [
          {
            id: "dashscope",
            name: "DashScope",
            capabilities: ["video"],
            hasApiKey: true,
          },
        ],
      },
      env: {
        STARCANVAS_REAL_PROVIDER_SMOKE: "1",
        STARCANVAS_REAL_IMAGE_SMOKE: "1",
      },
    });

    assert.equal(plan.checks.find((check) => check.id === "text")?.status, "runnable");
    assert.equal(plan.checks.find((check) => check.id === "image")?.status, "runnable");
    assert.equal(plan.checks.find((check) => check.id === "video")?.status, "skipped");
  });

  it("marks Vidu runnable only when DashScope video provider and video opt-in are present", () => {
    const plan = buildProviderSmokePlan({
      config: {
        baseUrl: "https://relay.example.com/v1",
        hasApiKey: true,
        defaultModel: "gpt-5.5",
        defaultImageModel: "gpt-image-2",
        videoModel: "viduq3-turbo",
        timeoutMs: 120000,
        providers: [
          {
            id: "dashscope",
            name: "阿里云百炼",
            capabilities: ["video"],
            hasApiKey: true,
          },
        ],
      },
      env: {
        STARCANVAS_REAL_PROVIDER_SMOKE: "1",
        STARCANVAS_REAL_VIDEO_SMOKE: "true",
      },
    });

    assert.equal(plan.checks.find((check) => check.id === "video")?.status, "runnable");
  });

  it("parses only smoke-related env values from .env.local content", () => {
    const parsed = parseProviderSmokeEnvFile(`
AI_API_KEY=sk-secret
DASHSCOPE_API_KEY=sk-dashscope
STARCANVAS_REAL_PROVIDER_SMOKE=1
STARCANVAS_REAL_IMAGE_SMOKE="true"
VOXCPM_BASE_URL=http://localhost:8092
`);

    assert.deepEqual(parsed, {
      STARCANVAS_REAL_PROVIDER_SMOKE: "1",
      STARCANVAS_REAL_IMAGE_SMOKE: "true",
      VOXCPM_BASE_URL: "http://localhost:8092",
    });
  });

  it("prefers shell env over .env.local values for smoke flags", () => {
    const env = buildProviderSmokeEnv(
      { STARCANVAS_REAL_IMAGE_SMOKE: "0" },
      { STARCANVAS_REAL_IMAGE_SMOKE: "1", STARCANVAS_REAL_VIDEO_SMOKE: "1" },
    );

    assert.equal(env.STARCANVAS_REAL_IMAGE_SMOKE, "0");
    assert.equal(env.STARCANVAS_REAL_VIDEO_SMOKE, "1");
    assert.equal("AI_API_KEY" in env, false);
  });
});
