import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildProviderHealthSummary } from "./provider-health-summary.ts";

describe("buildProviderHealthSummary", () => {
  it("blocks image generation when neither server nor session key is available", () => {
    const summary = buildProviderHealthSummary({
      serverConfig: {
        baseUrl: "https://relay.example.com/v1",
        hasApiKey: false,
        defaultModel: "gpt-5.5",
        defaultImageModel: "gpt-image-2",
        timeoutMs: 120000,
      },
      sessionApiKey: "",
      useLocalOverride: false,
      useMock: false,
      defaultModel: "gpt-5.5",
      imageModel: "gpt-image-2",
      videoModel: "vidu",
      timeoutMs: "120000",
      providers: [],
    });

    const image = summary.items.find((item) => item.id === "image");
    assert.equal(image?.status, "blocked");
    assert.match(image?.message ?? "", /API Key/);
    assert.equal(summary.blockingCount, 3);
  });

  it("reports Vidu video as blocked unless a DashScope-capable provider key exists or mock is enabled", () => {
    const blocked = buildProviderHealthSummary({
      serverConfig: {
        baseUrl: "https://relay.example.com/v1",
        hasApiKey: true,
        defaultModel: "gpt-5.5",
        defaultImageModel: "gpt-image-2",
        videoModel: "vidu",
        timeoutMs: 120000,
      },
      sessionApiKey: "",
      useLocalOverride: false,
      useMock: false,
      defaultModel: "gpt-5.5",
      imageModel: "gpt-image-2",
      videoModel: "vidu",
      timeoutMs: "120000",
      providers: [
        {
          id: "default",
          name: "Default",
          capabilities: ["text", "image"],
          hasApiKey: true,
        },
      ],
    });

    const video = blocked.items.find((item) => item.id === "video");
    assert.equal(video?.status, "blocked");
    assert.match(video?.message ?? "", /DASHSCOPE_API_KEY|DashScope/);

    const ready = buildProviderHealthSummary({
      ...blocked.input,
      providers: [
        {
          id: "dashscope",
          name: "DashScope",
          capabilities: ["video", "image", "text"],
          hasApiKey: true,
        },
      ],
    });
    assert.equal(ready.items.find((item) => item.id === "video")?.status, "ready");
    assert.match(
      ready.items.find((item) => item.id === "video")?.message ?? "",
      /vidu\/viduq3-turbo_text2video/,
    );

    const mockReady = buildProviderHealthSummary({
      ...blocked.input,
      useMock: true,
      providers: [],
    });
    assert.equal(mockReady.items.find((item) => item.id === "video")?.status, "ready");
  });

  it("blocks non-DashScope video provider from claiming vidu route support", () => {
    const summary = buildProviderHealthSummary({
      serverConfig: {
        baseUrl: "https://relay.example.com/v1",
        hasApiKey: true,
        defaultModel: "gpt-5.5",
        defaultImageModel: "gpt-image-2",
        videoModel: "vidu",
        timeoutMs: 120000,
      },
      sessionApiKey: "",
      useLocalOverride: false,
      useMock: false,
      defaultModel: "gpt-5.5",
      imageModel: "gpt-image-2",
      videoModel: "vidu",
      timeoutMs: "120000",
      providers: [
        {
          id: "openai-relay",
          name: "OpenAI Relay",
          capabilities: ["text", "image", "video"],
          hasApiKey: true,
        },
      ],
    });

    const video = summary.items.find((item) => item.id === "video");
    assert.equal(video?.status, "blocked");
    assert.match(video?.message ?? "", /DashScope|Vidu/);
    assert.match(video?.details?.[0] ?? "", /DashScope|Vidu/);
  });

  it("warns that a session key can run the dedicated DashScope Vidu route only when it is a DashScope key", () => {
    const summary = buildProviderHealthSummary({
      serverConfig: {
        baseUrl: "https://relay.example.com/v1",
        hasApiKey: false,
        defaultModel: "gpt-5.5",
        defaultImageModel: "gpt-image-2",
        videoModel: "vidu",
        timeoutMs: 120000,
      },
      sessionApiKey: "sk-session-dashscope",
      useLocalOverride: false,
      useMock: false,
      defaultModel: "gpt-5.5",
      imageModel: "gpt-image-2",
      videoModel: "vidu",
      timeoutMs: "120000",
      providers: [],
    });

    const video = summary.items.find((item) => item.id === "video");
    assert.equal(video?.status, "warning");
    assert.match(video?.message ?? "", /会话 Key|DashScope/);
  });

  it("marks browser Kokoro TTS ready while warning that voice cloning needs a service", () => {
    const summary = buildProviderHealthSummary({
      serverConfig: null,
      sessionApiKey: "",
      useLocalOverride: false,
      useMock: false,
      defaultModel: "",
      imageModel: "",
      videoModel: "",
      timeoutMs: "120000",
      providers: [],
      voiceCloneBaseUrl: "",
      voxcpmBaseUrlConfigured: false,
    });

    const tts = summary.items.find((item) => item.id === "tts");
    assert.equal(tts?.status, "ready");
    assert.match(tts?.message ?? "", /Kokoro/);
    assert.equal(
      summary.items.some((item) => item.id === "voice-clone" && item.status === "warning"),
      true,
    );
  });
});
