import assert from "node:assert/strict"
import test from "node:test"

import { buildAiConfigResponsePayload } from "./config-response.ts"
import { resetProviderRegistry } from "../../../../lib/ai/provider-config.ts"

const AI_ENV_PREFIXES = [
  "AI_",
  "NEXT_PUBLIC_API_BASE_URL",
  "OPENAI_API_KEY",
  "IDEOGRAM_API_KEY",
  "DASHSCOPE_API_KEY",
  "KLING_API_KEY",
  "SEEDANCE_API_KEY",
]

function snapshotAiEnv(): Record<string, string | undefined> {
  const snapshot: Record<string, string | undefined> = {}
  for (const key of Object.keys(process.env)) {
    if (AI_ENV_PREFIXES.some((prefix) => key.startsWith(prefix))) {
      snapshot[key] = process.env[key]
    }
  }
  return snapshot
}

function clearAiEnv() {
  for (const key of Object.keys(process.env)) {
    if (AI_ENV_PREFIXES.some((prefix) => key.startsWith(prefix))) {
      delete process.env[key]
    }
  }
  resetProviderRegistry()
}

function restoreAiEnv(snapshot: Record<string, string | undefined>) {
  clearAiEnv()
  for (const [key, value] of Object.entries(snapshot)) {
    if (value !== undefined) process.env[key] = value
  }
  resetProviderRegistry()
}

test("GET /api/ai/config returns a safe unconfigured payload instead of 500 in empty CI env", async () => {
  const snapshot = snapshotAiEnv()
  clearAiEnv()
  try {
    const response = buildAiConfigResponsePayload()

    assert.equal(response.status, 200)
    assert.equal(response.body.configured, false)
    assert.equal(response.body.hasApiKey, false)
    assert.deepEqual(response.body.providers, [])
    assert.equal(response.body.baseUrl, "")
  } finally {
    restoreAiEnv(snapshot)
  }
})
