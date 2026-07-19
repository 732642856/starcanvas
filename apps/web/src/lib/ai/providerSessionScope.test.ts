import assert from "node:assert/strict"
import test from "node:test"

import {
  hasExplicitProviderRouteHint,
  shouldApplySessionApiKeyForTask,
} from "./providerSessionScope.ts"

test("hasExplicitProviderRouteHint: bare session key w/o route hint is not a global override", () => {
  assert.equal(hasExplicitProviderRouteHint(null), false)
  assert.equal(hasExplicitProviderRouteHint({}), false)
})

test("hasExplicitProviderRouteHint: apiBaseUrl or local override fields count as explicit route hints", () => {
  assert.equal(hasExplicitProviderRouteHint(null, "https://relay.example.com/v1"), true)
  assert.equal(hasExplicitProviderRouteHint({ imageModel: "gpt-image-2" }), true)
  assert.equal(hasExplicitProviderRouteHint({ timeoutMs: 120000 }), true)
})

test("shouldApplySessionApiKeyForTask: bare session key is video-only", () => {
  assert.equal(
    shouldApplySessionApiKeyForTask({
      taskType: "text",
      sessionApiKey: "sk-session",
      routeHint: null,
    }),
    false,
  )
  assert.equal(
    shouldApplySessionApiKeyForTask({
      taskType: "image",
      sessionApiKey: "sk-session",
      routeHint: null,
    }),
    false,
  )
  assert.equal(
    shouldApplySessionApiKeyForTask({
      taskType: "video",
      sessionApiKey: "sk-session",
      routeHint: null,
    }),
    true,
  )
})

test("shouldApplySessionApiKeyForTask: explicit route hint makes text/image treat session key as BYOK", () => {
  assert.equal(
    shouldApplySessionApiKeyForTask({
      taskType: "text",
      sessionApiKey: "sk-session",
      apiBaseUrl: "https://relay.example.com/v1",
    }),
    true,
  )
  assert.equal(
    shouldApplySessionApiKeyForTask({
      taskType: "image",
      sessionApiKey: "sk-session",
      routeHint: { imageModel: "gpt-image-2" },
    }),
    true,
  )
})
