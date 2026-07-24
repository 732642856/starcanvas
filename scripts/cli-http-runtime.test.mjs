import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getApiGetTimeoutMs } from "./cli-http-runtime.mjs";

describe("getApiGetTimeoutMs", () => {
  it("uses a longer timeout for the health endpoint", () => {
    assert.equal(getApiGetTimeoutMs("/api/ai/health"), 15000);
  });

  it("keeps config endpoint fast", () => {
    assert.equal(getApiGetTimeoutMs("/api/ai/config"), 10000);
  });

  it("uses the default timeout for other GET endpoints", () => {
    assert.equal(getApiGetTimeoutMs("/api/ai/anything-else"), 10000);
  });
});
