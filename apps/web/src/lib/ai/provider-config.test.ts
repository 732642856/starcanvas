import assert from "node:assert/strict"
import test from "node:test"

import {
  getAiProviderConfigSafe,
  mergeProviderConfig,
  resetProviderRegistry,
} from "./provider-config.ts"

const AI_ENV_KEYS = [
  "AI_BASE_URL",
  "NEXT_PUBLIC_API_BASE_URL",
  "AI_API_KEY",
  "OPENAI_API_KEY",
  "AI_DEFAULT_MODEL",
  "AI_DEFAULT_IMAGE_MODEL",
  "AI_VIDEO_MODEL",
  "AI_REQUEST_TIMEOUT_MS",
] as const

type AiEnvSnapshot = Partial<Record<(typeof AI_ENV_KEYS)[number], string>>

function snapshotEnv(): AiEnvSnapshot {
  const snapshot: AiEnvSnapshot = {}
  for (const key of AI_ENV_KEYS) {
    snapshot[key] = process.env[key]
  }
  return snapshot
}

function restoreEnv(snapshot: AiEnvSnapshot) {
  for (const key of AI_ENV_KEYS) {
    const value = snapshot[key]
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }
}

function clearAiEnv() {
  for (const key of AI_ENV_KEYS) {
    delete process.env[key]
  }
  // Also clear special provider keys that scanProviderEnvVars reads
  for (const key of ["IDEOGRAM_API_KEY", "DASHSCOPE_API_KEY", "KLING_API_KEY", "SEEDANCE_API_KEY"]) {
    delete process.env[key]
  }
}

function withAiEnv<T>(env: Record<string, string | undefined>, fn: () => T): T {
  const snapshot = snapshotEnv()
  clearAiEnv()
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined) process.env[key] = value
  }
  resetProviderRegistry() // 清除环境变量变更后的缓存

  try {
    return fn()
  } finally {
    restoreEnv(snapshot)
    resetProviderRegistry() // 恢复原始环境变量后清除缓存
  }
}

test("mergeProviderConfig: rejects Local Override without server API key", () => {
  withAiEnv({}, () => {
    assert.throws(
      () => mergeProviderConfig({
        baseUrl: "https://local.example/v1/",
        defaultModel: "local-text-model",
        imageModel: "local-image-model",
        videoModel: "local-video-model",
        timeoutMs: 34567,
      }),
      /Missing required config/,
    )
  })
})

test("mergeProviderConfig: maps Local Override imageModel to defaultImageModel", () => {
  withAiEnv({
    AI_BASE_URL: "https://env.example/v1",
    AI_API_KEY: "sk-env-secret",
    AI_DEFAULT_MODEL: "env-text-model",
    AI_DEFAULT_IMAGE_MODEL: "env-image-model",
  }, () => {
    const config = mergeProviderConfig({
      imageModel: "override-image-model",
    })

    assert.strictEqual(config.defaultModel, "env-text-model")
    assert.strictEqual(config.defaultImageModel, "override-image-model")
  })
})

test("mergeProviderConfig: Local Override defaultModel overrides env defaultModel", () => {
  withAiEnv({
    AI_BASE_URL: "https://env.example/v1",
    AI_API_KEY: "sk-env-secret",
    AI_DEFAULT_MODEL: "env-text-model",
    AI_DEFAULT_IMAGE_MODEL: "env-image-model",
  }, () => {
    const config = mergeProviderConfig({
      defaultModel: "override-text-model",
    })

    assert.strictEqual(config.defaultModel, "override-text-model")
    assert.strictEqual(config.defaultImageModel, "env-image-model")
  })
})

test("mergeProviderConfig: trims trailing slashes from Local Override baseUrl while using env API key", () => {
  withAiEnv({
    AI_BASE_URL: "https://env.example/v1",
    AI_API_KEY: "sk-env-secret",
    AI_DEFAULT_MODEL: "env-text-model",
  }, () => {
    const config = mergeProviderConfig({
      baseUrl: "https://proxy.example/v1///",
      defaultModel: "local-text-model",
    })

    assert.strictEqual(config.baseUrl, "https://proxy.example/v1")
    assert.strictEqual(config.apiKey, "sk-env-secret")
  })
})

test("mergeProviderConfig: throws when no env and no Local Override", () => {
  withAiEnv({}, () => {
    assert.throws(
      () => mergeProviderConfig(),
      /No server \.env config and no overrides provided/,
    )
  })
})

test("mergeProviderConfig: throws when required Local Override fields are missing", () => {
  withAiEnv({}, () => {
    assert.throws(
      () => mergeProviderConfig({
        baseUrl: "https://local.example/v1",
        defaultModel: "local-text-model",
      }),
      /Missing required config/,
    )
  })
})

test("getAiProviderConfigSafe: does not expose raw API key", () => {
  withAiEnv({
    AI_BASE_URL: "https://env.example/v1",
    AI_API_KEY: "sk-env-secret",
    AI_DEFAULT_MODEL: "env-text-model",
    AI_DEFAULT_IMAGE_MODEL: "env-image-model",
  }, () => {
    const safeConfig = getAiProviderConfigSafe()
    const serialized = JSON.stringify(safeConfig)

    assert.strictEqual(safeConfig.hasApiKey, true)
    assert.strictEqual(Object.hasOwn(safeConfig, "apiKey"), false)
    assert.equal(serialized.includes("sk-env-secret"), false)
  })
})
