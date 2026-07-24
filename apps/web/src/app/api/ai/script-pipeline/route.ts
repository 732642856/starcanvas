import { NextRequest, NextResponse } from "next/server"
import { mergeProviderConfig } from "@/lib/ai/provider-config"
import { normalizeUpstreamError, normalizeClientError } from "@/lib/ai/errors"
import { fetchWithTimeout } from "@/lib/ai/server-fetch"
import {
  buildScriptPipelineSystemPrompt,
  buildScriptPipelineUserPrompt,
  createDryRunScriptPipeline,
  normalizeScriptPipelineResult,
  type ScriptPipelineInput,
} from "@/lib/storyboard/scriptPipeline"

function parseJsonContent(content: string): any {
  const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/)
  return JSON.parse((jsonMatch ? jsonMatch[1] : content).trim())
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const input = body as ScriptPipelineInput & { dryRun?: boolean; _providerOverrides?: any }

    if (input.dryRun) {
      return NextResponse.json({ success: true, mode: "dryRun", pipeline: createDryRunScriptPipeline(input) })
    }

    const { _providerOverrides, ...pipelineInput } = input
    const config = mergeProviderConfig(_providerOverrides)
    const upstream = await fetchWithTimeout(
      `${config.baseUrl.replace(/\/+$/, "")}/chat/completions`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.defaultModel,
          messages: [
            { role: "system", content: buildScriptPipelineSystemPrompt() },
            { role: "user", content: buildScriptPipelineUserPrompt(pipelineInput) },
          ],
          temperature: 0.4,
          max_tokens: 6000,
        }),
      },
      config.timeoutMs || 120000,
    )

    if (!upstream.ok) {
      const errorText = await upstream.text().catch(() => "")
      return NextResponse.json({ error: normalizeUpstreamError(upstream.status, errorText, config.type) }, { status: upstream.status })
    }

    const data = await upstream.json()
    const content = data.choices?.[0]?.message?.content || ""
    let parsed: any
    try {
      parsed = parseJsonContent(content)
    } catch {
      return NextResponse.json(
        { error: { code: "invalid_ai_json", message: "AI did not return valid JSON", raw: content.slice(0, 2000) } },
        { status: 502 },
      )
    }

    return NextResponse.json({
      success: true,
      mode: "ai",
      pipeline: normalizeScriptPipelineResult(parsed, pipelineInput),
      meta: { model: config.defaultModel, usage: data.usage },
    })
  } catch (error: unknown) {
    return NextResponse.json({ error: normalizeClientError(error, "script-pipeline") }, { status: 500 })
  }
}
