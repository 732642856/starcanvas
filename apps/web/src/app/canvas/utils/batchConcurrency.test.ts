import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_PROVIDER_BATCH_CONCURRENCY,
  MAX_PROVIDER_BATCH_CONCURRENCY,
  resolveProviderBatchConcurrency,
  runWithConcurrency,
} from "./batchConcurrency.ts";

describe("batchConcurrency", () => {
  it("defaults provider batch concurrency to one for real API keys", () => {
    assert.equal(resolveProviderBatchConcurrency(undefined), DEFAULT_PROVIDER_BATCH_CONCURRENCY);
    assert.equal(DEFAULT_PROVIDER_BATCH_CONCURRENCY, 1);
  });

  it("clamps configured concurrency into the supported range", () => {
    assert.equal(resolveProviderBatchConcurrency("0"), 1);
    assert.equal(resolveProviderBatchConcurrency("2"), 2);
    assert.equal(resolveProviderBatchConcurrency("999"), MAX_PROVIDER_BATCH_CONCURRENCY);
    assert.equal(resolveProviderBatchConcurrency("not-a-number"), 1);
  });

  it("never runs more workers than the requested limit", async () => {
    let active = 0;
    let maxActive = 0;

    const results = await runWithConcurrency([1, 2, 3, 4, 5], 2, async (item) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return item * 2;
    });

    assert.equal(maxActive, 2);
    assert.deepEqual(
      results.map((result) => result.status === "fulfilled" ? result.value : undefined),
      [2, 4, 6, 8, 10],
    );
  });
});
