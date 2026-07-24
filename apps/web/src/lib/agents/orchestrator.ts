// ============================================================================
// Crew Orchestrator — 7 Agent sequential execution engine
// 对接 StarCanvas 已有的 AI API (/api/ai/chat/stream)，不引入额外依赖
// ============================================================================

import {
  type AgentContext,
  type AgentOperationMode,
  type CrewAgentStatus,
  type CrewExecutionResult,
  type FilmCrewRoleId,
  AGENT_SYSTEM_PROMPTS,
  FILM_CREW_ROLES,
  buildCrewContext,
  determineCrewPlan,
} from "./film-crew-agents"

// ---------------------------------------------------------------------------
// Agent execution callback — called by the frontend to stream agent output
// ---------------------------------------------------------------------------

export type AgentProgressCallback = (status: CrewAgentStatus) => void

export interface CrewOrchestratorOptions {
  onAgentProgress?: AgentProgressCallback
  /** Base URL for AI API (defaults to /api/ai) */
  apiBase?: string
  /** AbortSignal for cancellation */
  signal?: AbortSignal
}

/**
 * Execute a single agent role by sending its prompt to the AI API.
 * Returns the agent's output text.
 */
async function executeAgent(
  roleId: FilmCrewRoleId,
  context: string,
  previousOutputs: Record<string, string>,
  options: CrewOrchestratorOptions,
): Promise<string> {
  const role = FILM_CREW_ROLES[roleId]
  const systemPrompt = AGENT_SYSTEM_PROMPTS[roleId]

  // Build the full prompt with context and previous agent outputs
  let fullPrompt = context

  // Add previous agent outputs as context for the next agent
  const prevKeys = Object.keys(previousOutputs)
  if (prevKeys.length > 0) {
    fullPrompt += "\n\n## 其他 Agent 的输出\n"
    for (const [key, output] of Object.entries(previousOutputs)) {
      const prevRole = FILM_CREW_ROLES[key as FilmCrewRoleId]
      fullPrompt += `\n### ${prevRole.name}\n${output.slice(0, 2000)}\n`
    }
  }

  // Use the existing AI chat stream API
  const apiBase = options.apiBase || "/api/ai"
  const response = await fetch(`${apiBase}/chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: fullPrompt,
      context: { systemOverride: systemPrompt },
    }),
    signal: options.signal,
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => "Unknown error")
    throw new Error(`Agent ${role.name} failed: ${response.status} ${errorText}`)
  }

  // Read SSE stream
  const reader = response.body?.getReader()
  if (!reader) throw new Error(`Agent ${role.name}: No response body`)

  const decoder = new TextDecoder()
  let buffer = ""
  let fullOutput = ""

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split("\n")
    buffer = lines.pop() || ""

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        try {
          const data = JSON.parse(line.slice(6))
          if (data.content) {
            fullOutput += data.content
          }
        } catch {
          // skip non-JSON lines
        }
      }
    }
  }

  return fullOutput
}

/**
 * Master orchestration function — executes agents in the determined order,
 * streaming progress back through the callback.
 */
export async function orchestrateCrew(
  input: AgentContext,
  options: CrewOrchestratorOptions = {},
): Promise<CrewExecutionResult> {
  const { onAgentProgress, signal } = options

  // Determine execution plan
  const crewPlan = determineCrewPlan(input)
  const context = buildCrewContext(input)

  const agentStatuses: CrewAgentStatus[] = []
  const previousOutputs: Record<string, string> = {}
  const executionTrace: string[] = []

  executionTrace.push(`🎬 Crew orchestration started with ${crewPlan.length} agents`)
  executionTrace.push(`   Mode: ${input.mode}, Plan: ${crewPlan.map((r) => FILM_CREW_ROLES[r].name).join(" → ")}`)
  if (input.localSkillAudit?.length) {
    executionTrace.push(`🔐 Local Skills: ${input.localSkillAudit.map((skill) => `${skill.skillId} (${skill.injection}${skill.truncated ? ", truncated" : ""})`).join(", ")}`)
  }

  for (let i = 0; i < crewPlan.length; i += 1) {
    const roleId = crewPlan[i]
    const role = FILM_CREW_ROLES[roleId]

    if (signal?.aborted) {
      executionTrace.push(`⏹️ Crew aborted before ${role.name}`)
      break
    }

    // Mark as running
    const runningStatus: CrewAgentStatus = {
      roleId,
      status: "running",
      startedAt: Date.now(),
    }
    agentStatuses.push(runningStatus)
    onAgentProgress?.(runningStatus)
    executionTrace.push(`▶️ [${i + 1}/${crewPlan.length}] ${role.name} — 开始执行`)

    try {
      const output = await executeAgent(roleId, context, previousOutputs, options)
      previousOutputs[roleId] = output

      const doneStatus: CrewAgentStatus = {
        roleId,
        status: "done",
        output,
        startedAt: runningStatus.startedAt,
        completedAt: Date.now(),
      }
      // Update the last status entry
      agentStatuses[agentStatuses.length - 1] = doneStatus
      onAgentProgress?.(doneStatus)

      const duration = doneStatus.completedAt && doneStatus.startedAt
        ? ((doneStatus.completedAt - doneStatus.startedAt) / 1000).toFixed(1)
        : "?"
      executionTrace.push(`✅ [${i + 1}/${crewPlan.length}] ${role.name} — 完成 (${duration}s, ${output.length} chars)`)
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      const errorStatus: CrewAgentStatus = {
        roleId,
        status: "error",
        error: errorMsg,
        startedAt: runningStatus.startedAt,
        completedAt: Date.now(),
      }
      agentStatuses[agentStatuses.length - 1] = errorStatus
      onAgentProgress?.(errorStatus)
      executionTrace.push(`❌ [${i + 1}/${crewPlan.length}] ${role.name} — 失败: ${errorMsg}`)

      // Continue with remaining agents even if one fails
    }
  }

  // Try to extract the storyboard agent's output as structured JSON
  let finalOutput: CrewExecutionResult["finalOutput"]
  try {
    const storyboardOutput = previousOutputs["storyboard-artist"]
    if (storyboardOutput) {
      // Extract JSON from agent output (may be wrapped in markdown)
      const jsonMatch = storyboardOutput.match(/```(?:json)?\s*([\s\S]*?)```/) ||
                        storyboardOutput.match(/(\{[\s\S]*\})/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[1])
        finalOutput = {
          scenes: parsed.scenes,
          shots: parsed.shots,
          emotionalCurve: parsed.emotionalCurve,
        }
      }
    }
  } catch {
    // JSON extraction failed — finalOutput remains undefined
  }

  const allSucceeded = agentStatuses.every((s) => s.status !== "error")
  executionTrace.push(
    allSucceeded
      ? `🎉 Crew orchestration complete — all ${agentStatuses.length} agents succeeded`
      : `⚠️ Crew orchestration complete with errors — ${agentStatuses.filter((s) => s.status === "error").length} failed`,
  )

  return {
    success: allSucceeded,
    agentStatuses,
    finalOutput,
    executionTrace,
    localSkillAudit: input.localSkillAudit,
  }
}

/**
 * Simplified execution — runs the crew but only returns the aggregate
 * storyboard output, matching the old DirectorAgent interface.
 */
export async function runFilmCrewPipeline(
  input: AgentContext,
  options?: CrewOrchestratorOptions,
): Promise<{
  output: string
  trace: string[]
  agentStatuses: CrewAgentStatus[]
}> {
  const result = await orchestrateCrew(input, options)

  // Build a comprehensive summary from all agent outputs
  const outputParts: string[] = []

  for (const status of result.agentStatuses) {
    if (status.status === "done" && status.output) {
      outputParts.push(
        `## ${FILM_CREW_ROLES[status.roleId].name}\n${status.output.slice(0, 3000)}`,
      )
    }
  }

  return {
    output: outputParts.join("\n\n"),
    trace: result.executionTrace,
    agentStatuses: result.agentStatuses,
  }
}
