import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  ImageGenerationError,
  generateImageFromPrompt,
  IMAGE_GENERATION_CLIENT_TIMEOUT_BUFFER_MS,
  IMAGE_GENERATION_CLIENT_TIMEOUT_MS,
  resolveImageGenerationSize,
  resolveImageGenerationTimeoutMs,
  retryWithBackoff,
} from "./imageGeneration.ts"

const originalFetch = globalThis.fetch

function mockFetch(response: Response) {
  globalThis.fetch = async () => response
}

describe("generateImageFromPrompt", () => {
  it("maps aspect ratios to supported provider sizes", () => {
    assert.equal(resolveImageGenerationSize(undefined, "1:1"), "1024x1024")
    assert.equal(resolveImageGenerationSize(undefined, "9:16"), "1024x1792")
    assert.equal(resolveImageGenerationSize(undefined, "16:9"), "1792x1024")
    assert.equal(resolveImageGenerationSize("1024x1024", "16:9"), "1024x1024")
  })

  it("keeps the client timeout longer than the API route timeout", () => {
    assert.equal(IMAGE_GENERATION_CLIENT_TIMEOUT_MS, 150_000)
  })

  it("extends client timeout when provider config timeout is longer", async () => {
    mockFetch(
      new Response(JSON.stringify({
        type: "openai-compatible",
        baseUrl: "https://relay.example/v1",
        defaultModel: "gpt-5.5",
        defaultImageModel: "gpt-image-2",
        timeoutMs: 180_000,
        hasApiKey: true,
      }), { status: 200 }),
    )

    try {
      const timeoutMs = await resolveImageGenerationTimeoutMs()
      assert.equal(timeoutMs, 180_000 + IMAGE_GENERATION_CLIENT_TIMEOUT_BUFFER_MS)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it("prefers an explicit requested timeout over provider config", async () => {
    const timeoutMs = await resolveImageGenerationTimeoutMs({
      requestedTimeoutMs: 90_000,
      overrideTimeoutMs: 300_000,
    })
    assert.equal(timeoutMs, 90_000)
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

  it("marks 524 image generation errors as requiring manual confirmation", async () => {
    mockFetch(new Response(JSON.stringify({
      ok: false,
      requestId: "req-524",
      attempts: 2,
      error: {
        code: "PROVIDER_TIMEOUT",
        userMessage: "图片生成超时，请稍后重试。",
        detail: "上游服务返回 524 A Timeout Occurred。",
        retryable: true,
        status: 524,
      },
    }), { status: 524 }))

    try {
      await generateImageFromPrompt({ prompt: "雨夜旧影院", requestId: "req-524" })
      assert.fail("Expected generateImageFromPrompt to throw")
    } catch (error) {
      assert.ok(error instanceof ImageGenerationError)
      assert.equal(error.code, "PROVIDER_TIMEOUT")
      assert.equal(error.status, 524)
      assert.equal(error.retryable, false)
      assert.match(error.message, /524/)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it("keeps data URLs when browser asset persistence is unavailable", async () => {
    const dataUrl = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aY6sAAAAASUVORK5CYII="
    const originalIndexedDb = (globalThis as typeof globalThis & { indexedDB?: IDBFactory }).indexedDB
    const originalCreateObjectUrl = URL.createObjectURL
    globalThis.fetch = async () => new Response(JSON.stringify({
      imageUrl: dataUrl,
      prompt: "test",
    }), { status: 200 })

    ;(globalThis as typeof globalThis & { indexedDB?: IDBFactory }).indexedDB = undefined
    ;(URL as typeof URL & { createObjectURL?: typeof URL.createObjectURL }).createObjectURL = undefined

    try {
      const result = await generateImageFromPrompt({ prompt: "一只猫", requestId: "req-data-url" })
      assert.equal(result.imageUrl, dataUrl)
      assert.equal(result.assetId, undefined)
    } finally {
      globalThis.fetch = originalFetch
      ;(globalThis as typeof globalThis & { indexedDB?: IDBFactory }).indexedDB = originalIndexedDb
      ;(URL as typeof URL & { createObjectURL?: typeof URL.createObjectURL }).createObjectURL = originalCreateObjectUrl
    }
  })

  it("short-circuits to a mock image when useMock preference is enabled", async () => {
    const requestedUrls: string[] = []
    const originalWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window")
    globalThis.fetch = async (url) => {
      requestedUrls.push(String(url))
      throw new Error("fetch should not be called in mock mode")
    }
    Object.defineProperty(globalThis, "window", {
      value: {
        localStorage: {
          getItem(key: string) {
            return key === "startrails_use_mock" ? "true" : null
          },
        },
      },
      configurable: true,
    })

    try {
      const result = await generateImageFromPrompt({ prompt: "mock shot", requestId: "req-mock" })
      assert.match(result.imageUrl, /^data:image\/png;base64,/)
      assert.equal(result.assetId, undefined)
      assert.deepEqual(requestedUrls, [])
    } finally {
      globalThis.fetch = originalFetch
      if (originalWindowDescriptor) {
        Object.defineProperty(globalThis, "window", originalWindowDescriptor)
      } else {
        delete (globalThis as typeof globalThis & { window?: unknown }).window
      }
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

  it("polls an async image generation job and returns the completed image", async () => {
    const requestedUrls: string[] = []
    let requestBody: Record<string, unknown> | null = null
    globalThis.fetch = async (url, opts) => {
      requestedUrls.push(String(url))
      if (String(url).includes("/api/ai/config")) {
        return new Response(JSON.stringify({
          type: "openai-compatible",
          baseUrl: "https://relay.example/v1",
          defaultModel: "gpt-5.5",
          defaultImageModel: "gpt-image-2",
          timeoutMs: 120_000,
          hasApiKey: true,
        }), { status: 200 })
      }
      if (String(url).includes("/api/ai/generate-image?jobId=job-1")) {
        return new Response(JSON.stringify({
          ok: true,
          job: {
            id: "job-1",
            status: "completed",
            result: {
              imageUrl: "blob:async-result",
              prompt: "test",
              model: "gpt-image-1-mini",
            },
          },
        }), { status: 200 })
      }
      requestBody = JSON.parse((opts?.body as string) ?? "{}")
      return new Response(JSON.stringify({
        ok: true,
        async: true,
        jobId: "job-1",
        status: "queued",
      }), { status: 202 })
    }

    const result = await generateImageFromPrompt({ prompt: "async shot", requestId: "req-async" })

    assert.equal(result.imageUrl, "blob:async-result")
    assert.equal(requestBody?.async, true)
    assert.equal(requestBody?.mode, "draft")
    assert.ok(requestedUrls.some((url) => url.includes("/api/ai/generate-image?jobId=job-1")))
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

  it("routes the local Comfy model without remote provider config and rejects reference images", async () => {
    const originalFetch = globalThis.fetch
    const calls: Array<{ url: string; body?: Record<string, unknown> }> = []
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined })
      return new Response(JSON.stringify({
        ok: true,
        imageUrl: "http://127.0.0.1:8188/view?filename=shot.png&type=output",
        provider: "local-comfyui",
        model: "cinematic.safetensors",
      }), { status: 200 })
    }

    try {
      const result = await generateImageFromPrompt({
        prompt: "Northern Song palace courtyard",
        model: "comfyui-local",
        size: "1024x1024",
      })
      assert.equal(result.provider, "local-comfyui")
      assert.equal(calls[0]?.url, "/api/ai/generate-image-comfy")
      assert.deepEqual(calls[0]?.body, {
        prompt: "Northern Song palace courtyard",
        width: 1024,
        height: 1024,
      })
      await assert.rejects(
        () => generateImageFromPrompt({
          prompt: "must fail",
          model: "comfyui-local",
          sourceImage: "data:image/png;base64,reference",
        }),
        (error: unknown) => error instanceof ImageGenerationError && error.code === "UNSUPPORTED_IMAGE_TO_IMAGE",
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
