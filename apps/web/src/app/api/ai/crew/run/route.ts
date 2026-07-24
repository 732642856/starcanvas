// ============================================================================
// POST /api/ai/crew/run — 运行 7 Agent 影视创作剧组（SSE 流式输出）
// ============================================================================
// 基于 MIT 参考项目 agent-orchestration-dashboard 的 SSE 模式：
//   每个 Agent 的执行状态通过 SSE event stream 实时推送到前端
//   agent-orchestration-dashboard (MIT): pintarkristian/agent-orchestration-dashboard
// ============================================================================
// 前端订阅 SSE 后，实时接收每个 Agent 的 { agentId, status, output?, error?, trace[] }
// 事件类型: agent_start | agent_progress | agent_complete | agent_error | crew_complete
// ============================================================================

import { NextRequest } from "next/server"
import {
  orchestrateCrew,
  type AgentContext,
  type CrewAgentStatus,
} from "@/lib/agents"
import { normalizeCrewLocalSkillIds, resolveCrewLocalSkillContext } from "@/lib/local-skills/crew-local-skill-context"
import { getLocalSkillRegistry } from "@/lib/local-skills/local-skill-registry"

export const runtime = "nodejs"

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>

  try {
    body = await req.json()
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON body" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    )
  }

  const localSkillIds = normalizeCrewLocalSkillIds(body.localSkillIds)
  let localSkillResolution: Awaited<ReturnType<typeof resolveCrewLocalSkillContext>> = { prompt: "", audit: [] }
  try {
    localSkillResolution = await resolveCrewLocalSkillContext({
      skillIds: localSkillIds,
      includeContent: body.localSkillContent === true,
      host: req.headers.get("host"),
      registry: getLocalSkillRegistry(),
    })
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Local Skill resolution failed" }),
      { status: 403, headers: { "Content-Type": "application/json" } },
    )
  }

  const input: AgentContext = {
    script: typeof body.script === "string" ? body.script : "",
    characterRelations: typeof body.characterRelations === "string" ? body.characterRelations : undefined,
    genre: typeof body.genre === "string" ? body.genre : "drama",
    style: typeof body.style === "string" ? body.style : "cinematic",
    targetPlatform: (body.targetPlatform as AgentContext["targetPlatform"]) || "short-drama",
    shotDensity: (body.shotDensity as AgentContext["shotDensity"]) || "normal",
    additionalNotes: typeof body.additionalNotes === "string" ? body.additionalNotes : undefined,
    title: typeof body.title === "string" ? body.title : undefined,
    mode: (body.mode as AgentContext["mode"]) || "ask",
    canvasNodes: body.canvasNodes as AgentContext["canvasNodes"],
    localSkillContext: localSkillResolution.prompt || undefined,
    localSkillAudit: localSkillResolution.audit.length ? localSkillResolution.audit : undefined,
  }

  if (!input.script) {
    return new Response(
      JSON.stringify({ error: "请提供剧本内容 (script)" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    )
  }

  // ── SSE Stream ──────────────────────────────────────────────────────────
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (eventType: string, data: unknown) => {
        const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`
        controller.enqueue(encoder.encode(payload))
      }

      const onAgentProgress = (status: CrewAgentStatus) => {
        switch (status.status) {
          case "running":
            sendEvent("agent_start", {
              agentId: status.roleId,
              status: "running",
              startedAt: status.startedAt,
            })
            break
          case "done":
            sendEvent("agent_complete", {
              agentId: status.roleId,
              status: "done",
              output: status.output,
              startedAt: status.startedAt,
              completedAt: status.completedAt,
            })
            break
          case "error":
            sendEvent("agent_error", {
              agentId: status.roleId,
              status: "error",
              error: status.error,
              startedAt: status.startedAt,
              completedAt: status.completedAt,
            })
            break
        }
      }

      // 使用 AbortController 支持取消
      const abortController = new AbortController()

      // 当客户端断开连接时取消
      req.signal.addEventListener("abort", () => {
        abortController.abort()
        controller.close()
      })

      if (localSkillResolution.audit.length) {
        sendEvent("local_skill_context", { skills: localSkillResolution.audit })
      }

      try {
        const result = await orchestrateCrew(input, {
          onAgentProgress,
          signal: abortController.signal,
          apiBase: process.env.NEXT_PUBLIC_API_BASE_URL
            ? `${process.env.NEXT_PUBLIC_API_BASE_URL}/api/ai`
            : `${req.nextUrl.origin}/api/ai`,
        })

        sendEvent("crew_complete", {
          success: result.success,
          trace: result.executionTrace,
          agentCount: result.agentStatuses.length,
          finalOutput: result.finalOutput,
          localSkillAudit: result.localSkillAudit,
        })

        controller.close()
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error"
        sendEvent("crew_error", { error: message })
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  })
}
