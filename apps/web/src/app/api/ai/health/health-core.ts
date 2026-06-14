// ============================================================================
// /api/ai/health core logic — framework-independent for regression tests
// ============================================================================

import {
  getAiProviderConfig,
  getAiProviderConfigSafe,
  mergeProviderConfig,
} from "../../../../lib/ai/provider-config.ts"
import type { AiProviderOverrides } from "../../../../lib/ai/provider-config.ts"
import { normalizeUpstreamError } from "../../../../lib/ai/errors.ts"
import { fetchWithTimeout } from "../../../../lib/ai/server-fetch.ts"

export interface HealthResult {
  body: unknown
  status?: number
}

/**
 * 执行连接测试的核心逻辑。
 * 向配置的 Base URL 发最小 chat 请求验证连通性。
 */
async function runHealthCheck(baseUrl: string, apiKey: string, model: string) {
  const upstream = await fetchWithTimeout(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: "Reply with only: ok" }],
      temperature: 0,
      max_tokens: 5,
    }),
  }, 15000)

  const text = await upstream.text()

  return { ok: upstream.ok, status: upstream.status, text }
}

function toSafeConfig(config: { baseUrl: string; apiKey: string; defaultModel: string; defaultImageModel: string; videoModel?: string; timeoutMs: number; type?: string }) {
  return {
    type: config.type,
    baseUrl: config.baseUrl,
    hasApiKey: Boolean(config.apiKey),
    defaultModel: config.defaultModel,
    defaultImageModel: config.defaultImageModel,
    videoModel: config.videoModel,
    timeoutMs: config.timeoutMs,
  }
}

export async function handleHealthGet(): Promise<HealthResult> {
  let config

  try {
    config = getAiProviderConfig()
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI provider not configured"
    return { body: { ok: false, message, config: null }, status: 500 }
  }

  try {
    const { ok, status, text } = await runHealthCheck(
      config.baseUrl,
      config.apiKey,
      config.defaultModel,
    )

    if (!ok) {
      const error = normalizeUpstreamError(status, text, config.type)
      return {
        body: {
          ok: false,
          message: error.message,
          config: getAiProviderConfigSafe(),
        },
        status,
      }
    }

    return {
      body: {
        ok: true,
        message: `Connected to ${config.baseUrl} (model: ${config.defaultModel})`,
        config: getAiProviderConfigSafe(),
      },
    }
  } catch (error) {
    const message =
      error instanceof Error
        ? error.name === "AbortError"
          ? "Connection timed out. Check your Base URL and network."
          : `Connection failed: ${error.message}`
        : "Unknown error"

    return {
      body: {
        ok: false,
        message,
        config: toSafeConfig(config),
      },
      status: 500,
    }
  }
}

export async function handleHealthPost(overrides?: AiProviderOverrides): Promise<HealthResult> {
  let config: ReturnType<typeof mergeProviderConfig>

  try {
    config = mergeProviderConfig(overrides)
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI provider not configured"
    return { body: { ok: false, message, config: null }, status: 500 }
  }

  try {
    const { ok, status, text } = await runHealthCheck(
      config.baseUrl,
      config.apiKey,
      config.defaultModel,
    )

    if (!ok) {
      const error = normalizeUpstreamError(status, text, config.type)
      return {
        body: {
          ok: false,
          message: error.message,
          config: toSafeConfig(config),
        },
        status,
      }
    }

    const modeLabel = overrides ? " (local override)" : ""
    return {
      body: {
        ok: true,
        message: `Connected to ${config.baseUrl} (model: ${config.defaultModel})${modeLabel}`,
        config: toSafeConfig(config),
      },
    }
  } catch (error) {
    const message =
      error instanceof Error
        ? error.name === "AbortError"
          ? "Connection timed out. Check your Base URL and network."
          : `Connection failed: ${error.message}`
        : "Unknown error"

    return {
      body: {
        ok: false,
        message,
        config: toSafeConfig(config),
      },
      status: 500,
    }
  }
}
