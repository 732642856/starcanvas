import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { ImageGenerationError, generateImageFromPrompt, IMAGE_GENERATION_CLIENT_TIMEOUT_MS, retryWithBackoff } from "./imageGeneration.ts"

const originalFetch = globalThis.fetch

function mockFetch(response: Response) {
  globalThis.fetch = async () => response
}

describe("generateImageFromPrompt", () => {
  it("keeps the client timeout longer than the API route timeout", () => {
    assert.equal(IMAGE_GENERATION_CLIENT_TIMEOUT_MS, 150_000)
  })

  it("surfaces structured API error details", async () => {
    mockFetch(new Response(JSON.stringify({
      ok: false,
      requestId: "req-1",
      attempts: 2,
      error: {
        code: "PROVIDER_BAD_GATEWAY",
        userMessage: "图片生成服务暂时不可用，请稍后重试。",
        detail: "上游服务返回 502 Bad Gateway，可能是服务超时。",
        retryable: true,
        status: 502,
      },
    }), { status: 502 }))

    try {
      await generateImageFromPrompt({ prompt: "一只猫", requestId: "req-1" })
      assert.fail("Expected generateImageFromPrompt to throw")
    } catch (error) {
      assert.ok(error instanceof ImageGenerationError)
      assert.equal(error.code, "PROVIDER_BAD_GATEWAY")
      assert.equal(error.status, 502)
      assert.equal(error.requestId, "req-1")
      assert.equal(error.attempts, 2)
      assert.match(error.message, /图片生成服务暂时不可用/)
      assert.match(error.message, /502 Bad Gateway/)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it("passes sourceImage in the request body when provided", async () => {
    let requestBody: Record<string, unknown> | null = null
    globalThis.fetch = async (url, opts) => {
      requestBody = JSON.parse((opts?.body as string) ?? "{}")
      return new Response(JSON.stringify({
        imageUrl: "blob:mock",
        prompt: "test",
        model: "gpt-image-2",
      }), { status: 200 })
    }

    await generateImageFromPrompt({
      prompt: "a character",
      sourceImage: "data:image/png;base64,mockref",
    })

    assert.ok(requestBody, "fetch was called")
    assert.equal(requestBody?.sourceImage, "data:image/png;base64,mockref")
    assert.equal(requestBody?.prompt, "a character")
    globalThis.fetch = originalFetch
  })

  it("passes multiple source images for reference-image generation", async () => {
    let requestBody: Record<string, unknown> | null = null
    globalThis.fetch = async (_url, opts) => {
      requestBody = JSON.parse((opts?.body as string) ?? "{}")
      return new Response(JSON.stringify({
        imageUrl: "blob:mock",
        prompt: "test",
        model: "gpt-image-2",
      }), { status: 200 })
    }

    const sourceImages = [
      "data:image/png;base64,sketch",
      "data:image/png;base64,character",
    ]
    await generateImageFromPrompt({
      prompt: "turn sketch into cinematic key frame",
      sourceImage: sourceImages,
    })

    assert.deepEqual(requestBody?.sourceImage, sourceImages)
    globalThis.fetch = originalFetch
  })

  it("fails before fetch when requested model is not compatible with image generation contract", async () => {
    const requestedUrls: string[] = []
    globalThis.fetch = async (url) => {
      requestedUrls.push(String(url))
      if (String(url).includes("/api/ai/config")) {
        return new Response(JSON.stringify({ baseUrl: "", hasApiKey: false, defaultModel: "gpt-5.5", defaultImageModel: "gpt-image-2", timeoutMs: 120000 }), { status: 200 })
      }
      return new Response(JSON.stringify({ imageUrl: "blob:should-not-happen" }), { status: 200 })
    }

    try {
      await generateImageFromPrompt({
        prompt: "a frame",
        model: "vidu",
      })
      assert.fail("Expected generateImageFromPrompt to throw")
    } catch (error) {
      assert.ok(error instanceof ImageGenerationError)
      assert.equal(error.code, "UNSUPPORTED_PROVIDER_CAPABILITY")
      assert.match(error.message, /Vidu|模型|路由/)
      assert.equal(
        requestedUrls.some((url) => url.includes("/api/ai/generate-image")),
        false,
      )
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})

describe("retryWithBackoff", () => {
  it("returns the result on first successful attempt without retrying", async () => {
    const start = Date.now()
    const result = await retryWithBackoff(
      async () => "success",
      { maxRetries: 2, baseDelayMs: 10, maxDelayMs: 50 },
    )
    const elapsed = Date.now() - start

    assert.equal(result, "success")
    // Should complete almost instantly (no delay on success)
    assert.ok(elapsed < 100, `Expected <100ms but took ${elapsed}ms`)
  })

  it("retries on retryable ImageGenerationError", async () => {
    let calls = 0
    const result = await retryWithBackoff(
      async () => {
        calls++
        if (calls < 2) {
          throw new ImageGenerationError({
            message: "rate limited",
            code: "PROVIDER_RATE_LIMITED",
            status: 429,
            retryable: true,
          })
        }
        return "ok"
      },
      { maxRetries: 2, baseDelayMs: 10, maxDelayMs: 50 },
    )

    assert.equal(result, "ok")
    assert.equal(calls, 2)
  })

  it("does NOT retry on non-retryable errors", async () => {
    let calls = 0
    try {
      await retryWithBackoff(
        async () => {
          calls++
          throw new ImageGenerationError({
            message: "bad prompt",
            code: "INVALID_PROMPT",
            status: 400,
            retryable: false,
          })
        },
        { maxRetries: 2, baseDelayMs: 10, maxDelayMs: 50 },
      )
      assert.fail("Expected to throw")
    } catch (error) {
      assert.ok(error instanceof ImageGenerationError)
      assert.equal((error as ImageGenerationError).code, "INVALID_PROMPT")
    }
    assert.equal(calls, 1, "Should only attempt once for non-retryable error")
  })

  it("retries on generic Error (treated as retryable by default)", async () => {
    let calls = 0
    try {
      await retryWithBackoff(
        async () => {
          calls++
          throw new Error("network disconnected")
        },
        { maxRetries: 2, baseDelayMs: 10, maxDelayMs: 50 },
      )
      assert.fail("Expected to throw after max retries")
    } catch (error) {
      assert.ok(error instanceof Error)
      assert.match((error as Error).message, /network disconnected/)
    }
    assert.equal(calls, 3, "Should have 1 initial + 2 retry attempts")
  })

  it("respects custom shouldRetry predicate", async () => {
    let calls = 0
    try {
      await retryWithBackoff(
        async () => {
          calls++
          throw new Error("always fail")
        },
        {
          maxRetries: 2,
          baseDelayMs: 10,
          shouldRetry: () => false, // never retry
        },
      )
      assert.fail("Expected to throw")
    } catch {
      // expected
    }
    assert.equal(calls, 1, "shouldRetry=false should prevent any retries")
  })

  it("calls onRetry callback with attempt number and delay", async () => {
    const retryLogs: Array<{ attempt: number; delay: number }> = []
    let calls = 0
    try {
      await retryWithBackoff(
        async () => {
          calls++
          throw new Error("fail")
        },
        {
          maxRetries: 2,
          baseDelayMs: 10,
          maxDelayMs: 50,
          onRetry: (error, attempt, delay) => {
            retryLogs.push({ attempt, delay })
          },
        },
      )
    } catch {
      // expected after exhausting retries
    }
    assert.equal(retryLogs.length, 2, "Should log 2 retry attempts")
    assert.equal(retryLogs[0]!.attempt, 0)
    assert.equal(retryLogs[1]!.attempt, 1)
    // Delays should be positive
    assert.ok(retryLogs[0]!.delay > 0)
    assert.ok(retryLogs[1]!.delay > 0)
  })
})
