import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DASHSCOPE_VIDEO_BASE_URL, resolveViduAuth } from "./vidu-auth.ts";

describe("resolveViduAuth", () => {
  it("allows a session DashScope key without a configured server provider", () => {
    const auth = resolveViduAuth({
      sessionApiKey: " sk-session-dashscope ",
      provider: null,
    });

    assert.deepEqual(auth, {
      apiKey: "sk-session-dashscope",
      baseUrl: DASHSCOPE_VIDEO_BASE_URL,
      source: "session",
    });
  });

  it("prefers the session key over a configured provider key", () => {
    const auth = resolveViduAuth({
      sessionApiKey: "sk-session-dashscope",
      provider: {
        apiKey: "sk-provider-dashscope",
        baseUrl: "https://dashscope.example/api/v1",
      },
    });

    assert.deepEqual(auth, {
      apiKey: "sk-session-dashscope",
      baseUrl: DASHSCOPE_VIDEO_BASE_URL,
      source: "session",
    });
  });

  it("falls back to the provider key when no session key is present", () => {
    const auth = resolveViduAuth({
      sessionApiKey: "",
      provider: {
        apiKey: "sk-provider-dashscope",
        baseUrl: "https://dashscope.example/api/v1",
      },
    });

    assert.deepEqual(auth, {
      apiKey: "sk-provider-dashscope",
      baseUrl: "https://dashscope.example/api/v1",
      source: "provider",
    });
  });

  it("returns null when neither session nor provider key is available", () => {
    assert.equal(resolveViduAuth({ provider: null }), null);
    assert.equal(resolveViduAuth({ provider: { apiKey: " " } }), null);
  });
});
