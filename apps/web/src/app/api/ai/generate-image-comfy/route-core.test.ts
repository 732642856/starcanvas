import assert from "node:assert/strict"
import test from "node:test"

import { getComfyImageResponse } from "./route-core.ts"

const enabledConfig = {
  enabled: true as const,
  baseUrl: "http://127.0.0.1:8188",
  checkpoint: "cinematic.safetensors",
  timeoutMs: 120_000,
  pollIntervalMs: 750,
}

test("rejects non-loopback callers before attempting a local Comfy request", async () => {
  const result = await getComfyImageResponse({
    host: "canvas.example.com",
    body: { prompt: "palace gate" },
    config: enabledConfig,
    run: async () => {
      throw new Error("must not run")
    },
  })

  assert.equal(result.status, 403)
  assert.equal(result.body.ok, false)
})

test("rejects when local Comfy is not explicitly configured", async () => {
  const result = await getComfyImageResponse({
    host: "127.0.0.1:3183",
    body: { prompt: "palace gate" },
    config: { enabled: false as const, reason: "missing-config" },
    run: async () => {
      throw new Error("must not run")
    },
  })

  assert.equal(result.status, 403)
  assert.match(result.body.error, /ComfyUI is unavailable/)
})

test("runs a local Comfy text-to-image request with bounded inputs", async () => {
  const calls: Array<Record<string, unknown>> = []
  const result = await getComfyImageResponse({
    host: "localhost:3183",
    body: { prompt: "Northern Song courtyard", negativePrompt: "text", width: 1024, height: 1024, seed: 42 },
    config: enabledConfig,
    run: async (input) => {
      calls.push(input as Record<string, unknown>)
      return { promptId: "comfy-job-1", imageUrl: "http://127.0.0.1:8188/view?filename=shot.png&type=output" }
    },
  })

  assert.equal(result.status, 200)
  assert.equal(result.body.ok, true)
  assert.equal(result.body.imageUrl, "http://127.0.0.1:8188/view?filename=shot.png&type=output")
  assert.deepEqual(calls, [{
    config: enabledConfig,
    prompt: "Northern Song courtyard",
    negativePrompt: "text",
    width: 1024,
    height: 1024,
    seed: 42,
  }])
})

test("rejects missing prompts and oversized dimensions without local execution", async () => {
  let calls = 0
  const run = async () => {
    calls += 1
    return { promptId: "unexpected", imageUrl: "http://127.0.0.1:8188/view?filename=unexpected.png" }
  }
  const missing = await getComfyImageResponse({ host: "localhost:3183", body: {}, config: enabledConfig, run })
  const oversized = await getComfyImageResponse({ host: "localhost:3183", body: { prompt: "x", width: 4096 }, config: enabledConfig, run })
  const nullSeed = await getComfyImageResponse({ host: "localhost:3183", body: { prompt: "x", seed: null }, config: enabledConfig, run })

  assert.equal(missing.status, 400)
  assert.equal(oversized.status, 400)
  assert.equal(nullSeed.status, 400)
  assert.equal(calls, 0)
})
