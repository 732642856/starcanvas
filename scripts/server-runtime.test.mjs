import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { probeLocalServerReady } from "./server-runtime.mjs";

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
