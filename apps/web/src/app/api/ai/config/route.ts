// ============================================================================
// GET /api/ai/config — 获取 Provider 配置（不含 API Key）(P0-1 Multi-Provider)
// ============================================================================
// 前端 SettingsPanel 等组件调用此接口获取可展示的配置信息。
// 返回当前默认 Provider 的配置 + 所有已注册 Provider 的列表。
// ============================================================================

import { NextResponse } from "next/server"
import { getAiProviderConfigSafe, listProviders } from "@/lib/ai/provider-config"

export async function GET() {
  try {
    const config = getAiProviderConfigSafe()
    const providers = listProviders()
    return NextResponse.json({ ...config, providers })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Config unavailable"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
