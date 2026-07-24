import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  loadProviderSmokeConfigWithWarmup,
} from "./provider-smoke-runtime.mjs";

describe("loadProviderSmokeConfigWithWarmup", () => {
  void it("retries /api/ai/config after a cold-start timeout and returns config on the second attempt", async () => {
    const calls = [];
    const result = await loadProviderSmokeConfigWithWarmup({
      apiGet: async (path) => {
        calls.push(path);
        if (calls.length === 1) {
          return { ok: false, error: "The operation was aborted due to timeout" };
        }
        return {
          ok: true,
          data: {
            baseUrl: "https://relay.example.com/v1",
            hasApiKey: true,
            defaultModel: "gpt-5.5",
            defaultImageModel: "gpt-image-2",
            videoModel: "vidu",
            timeoutMs: 120000,
          },
        };
      },
      sleep: async () => {},
      attempts: 2,
    });

    assert.equal(calls.length, 2);
    assert.equal(result.ok, true);
    assert.equal(result.config?.defaultModel, "gpt-5.5");
    assert.equal(result.usedRetry, true);
  });

  void it("does not retry permanent 4xx-style failures", async () => {
    const calls = [];
    const result = await loadProviderSmokeConfigWithWarmup({
      apiGet: async (path) => {
        calls.push(path);
        return {
          ok: false,
          status: 404,
          data: { error: "Not found" },
        };
      },
      sleep: async () => {},
      attempts: 3,
    });

    assert.equal(calls.length, 1);
    assert.equal(result.ok, false);
    assert.equal(result.usedRetry, false);
  });

  void it("keeps the final error when every warmup attempt fails", async () => {
    let attempt = 0;
    const result = await loadProviderSmokeConfigWithWarmup({
      apiGet: async () => {
        attempt += 1;
        return { ok: false, error: `timeout-${attempt}` };
      },
      sleep: async () => {},
      attempts: 3,
    });

    assert.equal(attempt, 3);
    assert.equal(result.ok, false);
    assert.equal(result.error, "timeout-3");
    assert.equal(result.usedRetry, true);
  });
});
