import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { probeLocalServerReady, waitForLocalServerReady } from "./server-runtime.mjs";

describe("probeLocalServerReady", () => {
  it("checks the lightweight config endpoint by default", async () => {
    const calls = [];
    const result = await probeLocalServerReady({
      port: 3100,
      fetchImpl: async (url) => {
        calls.push(String(url));
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      },
    });

    assert.equal(result.ok, true);
    assert.equal(result.path, "/api/ai/config");
    assert.deepEqual(calls, ["http://127.0.0.1:3100/api/ai/config"]);
  });

  it("reports non-ok responses as not ready", async () => {
    const result = await probeLocalServerReady({
      port: 3100,
      fetchImpl: async () => new Response("busy", { status: 503 }),
    });

    assert.equal(result.ok, false);
    assert.equal(result.status, 503);
  });

  it("supports an explicit readiness predicate for routes that return validation errors", async () => {
    const result = await probeLocalServerReady({
      port: 3100,
      fetchImpl: async () => new Response("method not allowed", { status: 405 }),
      isReady: (response) => response.status < 500,
    });

    assert.equal(result.ok, true);
    assert.equal(result.status, 405);
  });

  it("returns a clean failure when the probe times out", async () => {
    const result = await probeLocalServerReady({
      port: 3100,
      fetchImpl: async () => {
        throw new Error("The operation was aborted due to timeout");
      },
    });

    assert.equal(result.ok, false);
    assert.match(result.error ?? "", /timeout/i);
  });
});

describe("waitForLocalServerReady", () => {
  it("returns once a later probe is healthy", async () => {
    let attempts = 0;
    const result = await waitForLocalServerReady({
      maxAttempts: 3,
      wait: async () => {},
      probe: async () => ({ ok: ++attempts === 2 }),
    });

    assert.equal(result.ok, true);
    assert.equal(attempts, 2);
  });

  it("returns the last failed probe after the attempt budget", async () => {
    let attempts = 0;
    const result = await waitForLocalServerReady({
      maxAttempts: 2,
      wait: async () => {},
      probe: async () => ({ ok: false, error: `attempt-${++attempts}` }),
    });

    assert.deepEqual(result, { ok: false, error: "attempt-2" });
  });
});
