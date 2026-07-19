import assert from "node:assert/strict"
import test from "node:test"

import {
  ComfyConfigurationError,
  buildComfyTextToImageWorkflow,
  getLocalComfyConfig,
  runComfyTextToImage,
} from "./comfy-client.ts"

test("Comfy is disabled unless explicitly enabled in a local runtime", () => {
  const config = getLocalComfyConfig({
    NODE_ENV: "development",
    COMFYUI_BASE_URL: "http://127.0.0.1:8188",
    COMFYUI_CHECKPOINT: "model.safetensors",
  })

  assert.equal(config.enabled, false)
  assert.equal(config.reason, "disabled")
})

test("Comfy remains disabled in cloud deployments", () => {
  const config = getLocalComfyConfig({
    NODE_ENV: "development",
    STARCANVAS_LOCAL_COMFYUI: "1",
    STARCANVAS_CLOUD_DEPLOYMENT: "1",
    COMFYUI_BASE_URL: "http://127.0.0.1:8188",
    COMFYUI_CHECKPOINT: "model.safetensors",
  })

  assert.equal(config.enabled, false)
  assert.equal(config.reason, "cloud-disabled")
})

test("Comfy rejects remote endpoints unless locally authorized", () => {
  const config = getLocalComfyConfig({
    NODE_ENV: "development",
    STARCANVAS_LOCAL_COMFYUI: "1",
    COMFYUI_BASE_URL: "https://comfy.example.test",
    COMFYUI_CHECKPOINT: "model.safetensors",
  })

  assert.equal(config.enabled, false)
  assert.equal(config.reason, "remote-endpoint-blocked")
})

test("Comfy builds a deterministic local text-to-image workflow", () => {
  const workflow = buildComfyTextToImageWorkflow({
    checkpoint: "model.safetensors",
    prompt: "rainy palace gate",
    negativePrompt: "text, watermark",
    width: 768,
    height: 512,
    seed: 42,
  })

  assert.equal(workflow["1"]?.class_type, "CheckpointLoaderSimple")
  assert.equal(workflow["3"]?.inputs.text, "rainy palace gate")
  assert.equal(workflow["4"]?.inputs.width, 768)
  assert.equal(workflow["5"]?.inputs.seed, 42)
  assert.equal(workflow["9"]?.class_type, "SaveImage")
})

test("Comfy submits, polls history, and resolves its first output URL", async () => {
  const calls: string[] = []
  const responses = [
    new Response(JSON.stringify({ prompt_id: "prompt-1" }), { status: 200 }),
    new Response(JSON.stringify({
      "prompt-1": {
        outputs: {
          "9": { images: [{ filename: "output.png", subfolder: "shots", type: "output" }] },
        },
      },
    }), { status: 200 }),
  ]
  const fetchImpl = async (input: string | URL) => {
    calls.push(String(input))
    return responses.shift() ?? new Response("missing", { status: 500 })
  }

  const result = await runComfyTextToImage({
    config: {
      enabled: true,
      baseUrl: "http://127.0.0.1:8188",
      checkpoint: "model.safetensors",
      timeoutMs: 1_000,
      pollIntervalMs: 0,
    },
    prompt: "rainy palace gate",
    fetchImpl: fetchImpl as typeof fetch,
    wait: async () => undefined,
  })

  assert.equal(result.promptId, "prompt-1")
  assert.equal(result.imageUrl, "http://127.0.0.1:8188/view?filename=output.png&type=output&subfolder=shots")
  assert.deepEqual(calls, [
    "http://127.0.0.1:8188/prompt",
    "http://127.0.0.1:8188/history/prompt-1",
  ])
})

test("Comfy execution rejects a disabled config before any network call", async () => {
  await assert.rejects(
    () => runComfyTextToImage({
      config: { enabled: false, reason: "disabled" },
      prompt: "scene",
    }),
    (error: unknown) => error instanceof ComfyConfigurationError && error.code === "COMFY_DISABLED",
  )
})
