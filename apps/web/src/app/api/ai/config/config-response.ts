import { getAiProviderConfigSafe, listProviders } from "../../../../lib/ai/provider-config.ts"

export const UNCONFIGURED_PROVIDER_CONFIG = {
  type: "openai-compatible" as const,
  baseUrl: "",
  defaultModel: "",
  defaultImageModel: "",
  timeoutMs: 120000,
  hasApiKey: false,
  providers: [],
  configured: false,
}

function isMissingProviderConfigError(error: unknown): boolean {
  return error instanceof Error && error.message.includes("No AI Provider configured")
}

export function buildAiConfigResponsePayload() {
  try {
    const config = getAiProviderConfigSafe()
    const providers = listProviders()
    return { status: 200, body: { ...config, providers, configured: providers.length > 0 } }
  } catch (error) {
    if (isMissingProviderConfigError(error)) {
      return { status: 200, body: UNCONFIGURED_PROVIDER_CONFIG }
    }
    const message = error instanceof Error ? error.message : "Config unavailable"
    return { status: 500, body: { error: message } }
  }
}
