import assert from "node:assert/strict"
import test from "node:test"

import {
  isTaskSupportedByContract,
  resolveProviderTaskContract,
  resolveRuntimeProviderTaskContract,
  resolveTaskModelAlias,
} from "./providerTaskRouting.ts"

test("resolveTaskModelAlias: gpt-image model stays image model", () => {
  assert.equal(resolveTaskModelAlias("image", "gpt-image-1"), "gpt-image-1")
  assert.equal(resolveTaskModelAlias("image", " gpt-image-2 "), "gpt-image-2")
})

test("resolveTaskModelAlias: vidu aliases normalize to DashScope Vidu concrete model", () => {
  assert.equal(resolveTaskModelAlias("video", "vidu"), "vidu/viduq3-turbo_text2video")
  assert.equal(
    resolveTaskModelAlias("video", "vidu-q3-turbo-i2v"),
    "vidu/viduq3-turbo_text2video",
  )
  assert.equal(
    resolveTaskModelAlias("video", "vidu/viduq2-pro_img2video"),
    "vidu/viduq2-pro_text2video",
  )
})

test("resolveProviderTaskContract: openai-compatible relay can support image task for gpt-image model", () => {
  const contract = resolveProviderTaskContract({
    taskType: "image",
    providerId: "default",
    providerLabel: "OpenAI Relay",
    providerType: "openai-compatible",
    providerCapabilities: ["text", "image"],
    requestedModel: "gpt-image-1",
  })

  assert.equal(contract.supported, true)
  assert.equal(contract.resolvedModel, "gpt-image-1")
  assert.equal(isTaskSupportedByContract("image", contract), true)
})

test("resolveProviderTaskContract: vidu model is rejected for image task before request is sent", () => {
  const contract = resolveProviderTaskContract({
    taskType: "image",
    providerId: "default",
    providerType: "openai-compatible",
    requestedModel: "vidu",
  })

  assert.equal(contract.supported, false)
  assert.equal(contract.routeFamily, "vidu")
  assert.match(contract.reason ?? "", /Vidu|视频专用路由/)
})

test("resolveProviderTaskContract: openai-compatible relay does not claim generic vidu alias as supported video task", () => {
  const contract = resolveProviderTaskContract({
    taskType: "video",
    providerId: "default",
    providerLabel: "OpenAI Relay",
    providerType: "openai-compatible",
    providerCapabilities: ["text", "image", "video"],
    requestedModel: "vidu",
  })

  assert.equal(contract.supported, false)
  assert.match(contract.reason ?? "", /DashScope|Vidu/)
  assert.equal(isTaskSupportedByContract("video", contract), false)
})

test("resolveProviderTaskContract: DashScope video provider accepts normalized Vidu route", () => {
  const contract = resolveProviderTaskContract({
    taskType: "video",
    providerId: "dashscope",
    providerLabel: "DashScope",
    providerType: "openai-compatible",
    providerCapabilities: ["text", "image", "video"],
    requestedModel: "vidu-q3-turbo-i2v",
  })

  assert.equal(contract.supported, true)
  assert.equal(contract.resolvedModel, "vidu/viduq3-turbo_text2video")
  assert.equal(contract.routeFamily, "vidu")
})
test("resolveRuntimeProviderTaskContract: uses override providerId before usageProvider", () => {
  const contract = resolveRuntimeProviderTaskContract(
    "video",
    {
      usageProvider: "openai",
      overrides: { providerId: "dashscope" },
    } as any,
    "vidu",
  )
  assert.equal(contract.supported, true)
  assert.equal(contract.providerId, "dashscope")
  assert.equal(contract.resolvedModel, "vidu/viduq3-turbo_text2video")
})
