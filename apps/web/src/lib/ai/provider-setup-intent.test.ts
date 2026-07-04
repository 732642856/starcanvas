import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { parseProviderSetupIntent } from "./provider-setup-intent.ts"

describe("parseProviderSetupIntent", () => {
  it("parses explicit relay setup requests locally", () => {
    const result = parseProviderSetupIntent(
      "帮助我把 https://api.example.com/v1 的 key sk-1234567890abcdef 设置到星轨画布的模型里，文本模型用 gpt-4.1，图片模型用 flux-dev，视频模型用 kling-v2，并打开设置页",
    )

    assert.equal(result.shouldHandleLocally, true)
    assert.equal(result.openSettings, true)
    assert.equal(result.updates.baseUrl, "https://api.example.com/v1")
    assert.equal(result.updates.sessionApiKey, "sk-1234567890abcdef")
    assert.equal(result.updates.defaultModel, "gpt-4.1")
    assert.equal(result.updates.imageModel, "flux-dev")
    assert.equal(result.updates.videoModel, "kling-v2")
    assert.match(result.redactedMessage, /sk-1…cdef/)
    assert.doesNotMatch(result.redactedMessage, /sk-1234567890abcdef/)
  })

  it("opens settings without requiring updates when user explicitly asks", () => {
    const result = parseProviderSetupIntent("请帮我打开星轨画布的模型设置")

    assert.equal(result.shouldHandleLocally, true)
    assert.equal(result.openSettings, true)
    assert.deepEqual(result.updates, {})
  })

  it("infers well-known relay providers from natural language", () => {
    const result = parseProviderSetupIntent(
      "帮我把 OpenRouter 的 key sk-or-v1-abcdefghijklmn 配到星轨画布里，文本模型用 openai/gpt-4.1-mini，图片模型用 black-forest-labs/flux.1-dev，并打开设置页",
    )

    assert.equal(result.shouldHandleLocally, true)
    assert.equal(result.openSettings, true)
    assert.equal(result.detectedProviderLabel, "OpenRouter")
    assert.equal(result.updates.baseUrl, "https://openrouter.ai/api/v1")
    assert.equal(result.updates.defaultModel, "openai/gpt-4.1-mini")
    assert.equal(result.updates.imageModel, "black-forest-labs/flux.1-dev")
    assert.equal(result.updates.sessionApiKey, "sk-or-v1-abcdefghijklmn")
  })

  it("does not hijack ordinary product discussion about models", () => {
    const result = parseProviderSetupIntent("我在想星轨画布的中转站模型体验还可以怎么优化")

    assert.equal(result.shouldHandleLocally, false)
    assert.equal(result.openSettings, false)
    assert.deepEqual(result.updates, {})
  })
})
