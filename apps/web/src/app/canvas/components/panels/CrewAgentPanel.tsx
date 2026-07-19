/**
 * CrewAgentPanel — 7 角色多 Agent 影视创作面板
 *
 * 对标 ArcReel 多智能体流水线 + ComfyUI 任务队列 + TapNow Agent 面板
 *
 * 参考开源项目：
 *   - agent-orchestration-dashboard (MIT): 顺序 Agent 执行 + React Flow + SSE 实时更新
 *   - ComfyUI Frontend (GPL v3): 任务队列 UI、进度预览、右键操作菜单（仅参考设计）
 *
 * 功能：
 *   - 展示 7 个影视创作 Agent 及其状态
 *   - "运行剧组" 一键启动全管线
 *   - SSE 实时流式推送每个 Agent 的进度
 *   - 每个 Agent 的产出可展开查看
 *   - 执行轨迹可视化
 *   - 支持取消正在运行的管线
 */
"use client"

import React, { useCallback, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import {
  X,
  Play,
  StopCircle,
  Square,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Clock,
  ChevronDown,
  ChevronRight,
  Route,
  Film,
  Palette,
  Wand2,
  PenLine,
  Layout,
  Clapperboard,
  ScrollText,
  AlertTriangle,
} from "lucide-react"
import { DESIGN_TOKENS, ICON_CONFIG } from "../../styles/designSystem"
import { FILM_CREW_ROLES } from "@/lib/agents/film-crew-agents"
import type { FilmCrewRoleId, CrewAgentStatus } from "@/lib/agents"
import { suggestLocalSkillsForCrew } from "@/lib/local-skills/crew-skill-selection"
import type { LocalSkillAuditRecord, LocalSkillMetadata } from "@/lib/local-skills/contracts"

// ── 类型 ──────────────────────────────────────────────

interface AgentRunState {
  roleId: FilmCrewRoleId
  status: "idle" | "running" | "done" | "error"
  output?: string
  error?: string
  startedAt?: number
  completedAt?: number
}

export interface CrewAgentPanelProps {
  isOpen: boolean
  onClose: () => void
  /** 当前选中节点的内容（作为剧本输入） */
  currentScript?: string
  /** 选中节点 ID */
  selectedNodeId?: string | null
  /** 完成后将结果写入画布 */
  onApplyResults?: (results: Record<string, string>) => void
}

// ── Agent 图标映射 ──────────────────────────────────────

const AGENT_ICONS: Record<string, React.ReactNode> = {
  director: <Clapperboard size={16} />,
  storyboardArtist: <Layout size={16} />,
  cinematographer: <Film size={16} />,
  productionDesigner: <Palette size={16} />,
  promptEngineer: <Wand2 size={16} />,
  writer: <PenLine size={16} />,
  router: <Route size={16} />,
}

const STATUS_CONFIG = {
  idle: { color: DESIGN_TOKENS.textMuted, icon: <Clock size={14} />, label: "等待" },
  running: { color: "#3b82f6", icon: <Loader2 size={14} className="animate-spin" />, label: "运行中" },
  done: { color: "#22c55e", icon: <CheckCircle2 size={14} />, label: "完成" },
  error: { color: "#ef4444", icon: <AlertCircle size={14} />, label: "失败" },
} as const

// ── 组件 ──────────────────────────────────────────────

export function CrewAgentPanel({
  isOpen,
  onClose,
  currentScript,
  selectedNodeId,
  onApplyResults,
}: CrewAgentPanelProps) {
  const [agents, setAgents] = useState<AgentRunState[]>(() =>
    Object.values(FILM_CREW_ROLES).map((role) => ({
      roleId: role.id as FilmCrewRoleId,
      status: "idle" as const,
    })),
  )
  const [isRunning, setIsRunning] = useState(false)
  const [isCancelling, setIsCancelling] = useState(false)
  const [trace, setTrace] = useState<string[]>([])
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null)
  const [script, setScript] = useState(currentScript || "")
  const [genre, setGenre] = useState("drama")
  const [style, setStyle] = useState("cinematic")
  const [localSkills, setLocalSkills] = useState<LocalSkillMetadata[]>([])
  const [selectedLocalSkillIds, setSelectedLocalSkillIds] = useState<string[]>([])
  const [localSkillContentEnabled, setLocalSkillContentEnabled] = useState(false)
  const [sendLocalSkillContent, setSendLocalSkillContent] = useState(false)
  const [lastLocalSkillAudit, setLastLocalSkillAudit] = useState<LocalSkillAuditRecord[]>([])
  const eventSourceRef = useRef<EventSource | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const traceEndRef = useRef<HTMLDivElement>(null)
  const localSkillSelectionInitializedRef = useRef(false)

  // 自动滚到最新 trace
  useEffect(() => {
    traceEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [trace])

  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    void fetch("/api/ai/local-skills")
      .then(async (response) => response.ok ? response.json() : null)
      .then((snapshot: { enabled?: boolean; contentInjectionEnabled?: boolean; skills?: LocalSkillMetadata[] } | null) => {
        if (cancelled || !snapshot?.enabled) return
        const skills = snapshot.skills || []
        setLocalSkills(skills)
        setLocalSkillContentEnabled(Boolean(snapshot.contentInjectionEnabled))
        if (!localSkillSelectionInitializedRef.current) {
          setSelectedLocalSkillIds(suggestLocalSkillsForCrew(skills, script))
          localSkillSelectionInitializedRef.current = true
        }
      })
      .catch(() => undefined)
    return () => { cancelled = true }
  }, [isOpen, script])

  useEffect(() => {
    if (!isOpen) localSkillSelectionInitializedRef.current = false
  }, [isOpen])

  // 清理 SSE 连接
  useEffect(() => {
    return () => {
      eventSourceRef.current?.close()
      abortControllerRef.current?.abort()
    }
  }, [])

  // 运行剧组
  const handleRunCrew = useCallback(async () => {
    if (!script.trim()) return

    setIsRunning(true)
    setTrace([])
    setLastLocalSkillAudit([])
    setAgents((prev) =>
      prev.map((a) => ({ ...a, status: "idle" as const, output: undefined, error: undefined })),
    )
    setExpandedAgent(null)

    // 关闭之前的 SSE 连接
    eventSourceRef.current?.close()
    abortControllerRef.current?.abort()
    const abortCtrl = new AbortController()
    abortControllerRef.current = abortCtrl

    try {
      const res = await fetch("/api/ai/crew/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          script,
          genre,
          style,
          targetPlatform: "short-drama",
          shotDensity: "normal",
          mode: "ask",
          localSkillIds: selectedLocalSkillIds,
          localSkillContent: localSkillContentEnabled && sendLocalSkillContent,
        }),
        signal: abortCtrl.signal,
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }))
        throw new Error(err.error || `API error: ${res.status}`)
      }

      // 读取 SSE 流
      const reader = res.body?.getReader()
      if (!reader) throw new Error("No response body")

      const decoder = new TextDecoder()
      let buffer = ""
      const outputByAgent: Record<string, string> = {}

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        // 解析 SSE 事件
        const eventRegex = /event: (\w+)\ndata: (.+?)\n\n/g
        let match
        let lastIndex = 0

        while ((match = eventRegex.exec(buffer)) !== null) {
          lastIndex = match.index + match[0].length
          const eventType = match[1]
          let data: Record<string, unknown>
          try {
            data = JSON.parse(match[2])
          } catch {
            continue
          }

          switch (eventType) {
            case "local_skill_context": {
              setLastLocalSkillAudit((data.skills as LocalSkillAuditRecord[]) || [])
              break
            }
            case "agent_start": {
              const agentId = data.agentId as string
              setAgents((prev) =>
                prev.map((a) =>
                  a.roleId === agentId
                    ? { ...a, status: "running" as const, startedAt: Date.now() }
                    : a,
                ),
              )
              break
            }
            case "agent_complete": {
              const agentId = data.agentId as string
              const outputStr = (data.output as string) || ""
              outputByAgent[agentId] = outputStr
              setAgents((prev) =>
                prev.map((a) =>
                  a.roleId === agentId
                    ? { ...a, status: "done" as const, output: outputStr, completedAt: Date.now() }
                    : a,
                ),
              )
              break
            }
            case "agent_error": {
              const errAgentId = data.agentId as string
              setAgents((prev) =>
                prev.map((a) =>
                  a.roleId === errAgentId
                    ? { ...a, status: "error" as const, error: (data.error as string) || "Unknown error" }
                    : a,
                ),
              )
              break
            }
            case "crew_complete": {
              const traceData = data.trace as string[]
              if (traceData) setTrace(traceData)
              if (Array.isArray(data.localSkillAudit)) setLastLocalSkillAudit(data.localSkillAudit as LocalSkillAuditRecord[])
              setIsRunning(false)
              // 将结果应用到画布
              onApplyResults?.(outputByAgent)
              break
            }
            case "crew_error": {
              setTrace((prev) => [...prev, `❌ ${(data.error as string) || "Unknown error"}`])
              setIsRunning(false)
              break
            }
          }
        }

        // 保留未处理部分的 buffer
        if (lastIndex > 0) {
          buffer = buffer.slice(lastIndex)
        }
      }
    } catch (error) {
      if (abortCtrl.signal.aborted) {
        setTrace((prev) => [...prev, "⏹️ 已取消"])
      } else {
        setTrace((prev) => [...prev, `❌ ${error instanceof Error ? error.message : "运行失败"}`])
      }
      setIsRunning(false)
    }
  }, [script, genre, style, onApplyResults])

  // 取消运行
  const handleCancel = useCallback(() => {
    abortControllerRef.current?.abort()
    eventSourceRef.current?.close()
    setIsRunning(false)
    setIsCancelling(true)
    setTimeout(() => setIsCancelling(false), 1000)
  }, [])

  // 重置
  const handleReset = useCallback(() => {
    setAgents(
      Object.values(FILM_CREW_ROLES).map((role) => ({
        roleId: role.id as FilmCrewRoleId,
        status: "idle" as const,
      })),
    )
    setTrace([])
    setExpandedAgent(null)
  }, [])

  if (!isOpen) return null

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.75)" }}
    >
      <div
        className="relative flex h-[85vh] w-[90vw] max-w-[1200px] flex-col overflow-hidden rounded-2xl border shadow-2xl"
        style={{
          backgroundColor: DESIGN_TOKENS.panel,
          borderColor: DESIGN_TOKENS.border,
          backdropFilter: "blur(20px)",
        }}
      >
        {/* ── 标题栏 ── */}
        <div
          className="flex items-center justify-between border-b px-5 py-3"
          style={{ borderColor: DESIGN_TOKENS.border }}
        >
          <div className="flex items-center gap-3">
            <Clapperboard size={20} style={{ color: DESIGN_TOKENS.accent }} />
            <span className="text-sm font-semibold" style={{ color: DESIGN_TOKENS.text }}>
              AI 影视创作剧组 — 7 Agent 全管线
            </span>
          </div>
          <div className="flex items-center gap-2">
            {isRunning ? (
              <button
                onClick={handleCancel}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs transition-all"
                style={{ backgroundColor: "rgba(239,68,68,0.15)", color: "#ef4444" }}
              >
                <Square size={14} />
                取消
              </button>
            ) : (
              <button
                onClick={handleReset}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs transition-all hover:bg-white/10"
                style={{ color: DESIGN_TOKENS.textSecondary }}
              >
                重置
              </button>
            )}
            <button
              onClick={onClose}
              className="flex h-7 w-7 items-center justify-center rounded-lg transition-all hover:bg-white/10"
              style={{ color: DESIGN_TOKENS.textMuted }}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* ── 主体 ── */}
        <div className="flex flex-1 overflow-hidden">
          {/* 左侧：剧本输入 + 设置 */}
          <div
            className="flex w-80 flex-col border-r"
            style={{ borderColor: DESIGN_TOKENS.border }}
          >
            {/* 剧本输入 */}
            <div className="flex-1 p-4">
              <label className="mb-1 block text-[11px]" style={{ color: DESIGN_TOKENS.textMuted }}>
                剧本内容
              </label>
              <textarea
                className="w-full resize-none rounded-xl border p-3 text-xs leading-relaxed outline-none"
                rows={12}
                style={{
                  backgroundColor: "rgba(255,255,255,0.04)",
                  borderColor: DESIGN_TOKENS.border,
                  color: DESIGN_TOKENS.text,
                }}
                value={script}
                onChange={(e) => setScript(e.target.value)}
                placeholder="粘贴剧本或故事想法..."
              />

              {/* 类型 */}
              <div className="mt-3">
                <label className="mb-1 block text-[11px]" style={{ color: DESIGN_TOKENS.textMuted }}>
                  类型
                </label>
                <select
                  className="w-full rounded-lg border px-3 py-1.5 text-xs outline-none"
                  style={{
                    backgroundColor: "rgba(255,255,255,0.04)",
                    borderColor: DESIGN_TOKENS.border,
                    color: DESIGN_TOKENS.text,
                  }}
                  value={genre}
                  onChange={(e) => setGenre(e.target.value)}
                >
                  <option value="drama">剧情</option>
                  <option value="comedy">喜剧</option>
                  <option value="action">动作</option>
                  <option value="thriller">悬疑</option>
                  <option value="sci-fi">科幻</option>
                  <option value="horror">恐怖</option>
                  <option value="romance">爱情</option>
                  <option value="fantasy">奇幻</option>
                </select>
              </div>

              {/* 风格 */}
              <div className="mt-3">
                <label className="mb-1 block text-[11px]" style={{ color: DESIGN_TOKENS.textMuted }}>
                  视觉风格
                </label>
                <select
                  className="w-full rounded-lg border px-3 py-1.5 text-xs outline-none"
                  style={{
                    backgroundColor: "rgba(255,255,255,0.04)",
                    borderColor: DESIGN_TOKENS.border,
                    color: DESIGN_TOKENS.text,
                  }}
                  value={style}
                  onChange={(e) => setStyle(e.target.value)}
                >
                  <option value="cinematic">电影感</option>
                  <option value="realistic">写实</option>
                  <option value="anime">动漫</option>
                  <option value="noir">黑白/黑色电影</option>
                  <option value="cyberpunk">赛博朋克</option>
                  <option value="vintage">复古</option>
                  <option value="minimalist">极简</option>
                </select>
              </div>

              {localSkills.length > 0 && (
                <div className="mt-3 rounded-lg border p-2.5" data-testid="crew-local-skills">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px]" style={{ color: DESIGN_TOKENS.textMuted }}>本机 Skill 参考</span>
                    <span className="text-[10px]" style={{ color: DESIGN_TOKENS.textMuted }}>
                      {selectedLocalSkillIds.length} 已选 · 默认仅摘要
                    </span>
                  </div>
                  <div className="mt-2 max-h-28 space-y-1 overflow-y-auto">
                    {localSkills.map((skill) => {
                      const selected = selectedLocalSkillIds.includes(skill.skillId)
                      return (
                        <label key={skill.skillId} className="flex cursor-pointer items-start gap-2 text-[11px]" style={{ color: DESIGN_TOKENS.text }}>
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => setSelectedLocalSkillIds((current) => selected
                              ? current.filter((skillId) => skillId !== skill.skillId)
                              : [...current, skill.skillId])}
                          />
                          <span className="min-w-0">
                            <span className="block truncate">{skill.name}</span>
                            <span className="block truncate text-[10px]" style={{ color: DESIGN_TOKENS.textMuted }}>
                              {skill.source} · {skill.riskFlags.length ? "正文已安全阻断" : "摘要参考"}
                            </span>
                          </span>
                        </label>
                      )
                    })}
                  </div>
                  {localSkillContentEnabled && selectedLocalSkillIds.length > 0 && (
                    <label className="mt-2 flex items-center gap-2 text-[10px]" style={{ color: DESIGN_TOKENS.textMuted }}>
                      <input
                        type="checkbox"
                        checked={sendLocalSkillContent}
                        onChange={(event) => setSendLocalSkillContent(event.target.checked)}
                      />
                      本次允许发送受限 Skill 正文
                    </label>
                  )}
                  {lastLocalSkillAudit.length > 0 && (
                    <div className="mt-2 space-y-1 text-[10px]" style={{ color: DESIGN_TOKENS.textMuted }}>
                      {lastLocalSkillAudit.map((skill) => (
                        <div key={`${skill.skillId}-${skill.contentHash}`}>
                          {skill.skillId} · {skill.injection === "content" ? "正文" : "摘要"}
                          {skill.truncated ? " · 已截断" : ""}
                          {skill.skillBodySent ? " · 正文已发送" : " · 正文未发送"}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 运行按钮 */}
            <div className="border-t p-4" style={{ borderColor: DESIGN_TOKENS.border }}>
              <button
                onClick={handleRunCrew}
                disabled={isRunning || !script.trim()}
                className="flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-medium transition-all"
                style={{
                  backgroundColor: isRunning
                    ? DESIGN_TOKENS.accentSoft
                    : DESIGN_TOKENS.accent,
                  color: isRunning ? DESIGN_TOKENS.textMuted : "#fff",
                  opacity: !script.trim() ? 0.5 : 1,
                }}
              >
                {isRunning ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    运行中...
                  </>
                ) : (
                  <>
                    <Play size={16} />
                    运行剧组 ({Object.values(FILM_CREW_ROLES).length} Agent)
                  </>
                )}
              </button>
              <p className="mt-2 text-[10px] text-center" style={{ color: DESIGN_TOKENS.textMuted }}>
                执行顺序：编剧→分镜师→摄影师→导演→Prompt工程师→美术指导→路由
              </p>
            </div>
          </div>

          {/* 右侧：Agent 状态 + 轨迹 */}
          <div className="flex flex-1 flex-col">
            {/* Agent 状态网格 */}
            <div
              className="grid grid-cols-4 gap-3 border-b p-4"
              style={{ borderColor: DESIGN_TOKENS.border }}
            >
              {agents.map((agent) => {
                const role = FILM_CREW_ROLES[agent.roleId]
                const statusCfg = STATUS_CONFIG[agent.status]
                const isExpanded = expandedAgent === agent.roleId

                return (
                  <button
                    key={agent.roleId}
                    onClick={() =>
                      setExpandedAgent(isExpanded ? null : agent.roleId)
                    }
                    className="flex flex-col gap-2 rounded-xl border p-3 text-left transition-all hover:bg-white/5"
                    style={{
                      borderColor:
                        agent.status === "running"
                          ? "#3b82f6"
                          : agent.status === "done"
                            ? "#22c55e"
                            : agent.status === "error"
                              ? "#ef4444"
                              : DESIGN_TOKENS.border,
                      opacity: agent.status === "idle" ? 0.6 : 1,
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span style={{ color: statusCfg.color }}>
                          {AGENT_ICONS[agent.roleId] || <Clapperboard size={16} />}
                        </span>
                        <span className="text-xs font-medium truncate" style={{ color: DESIGN_TOKENS.text }}>
                          {role.name.split(" ")[0]}
                        </span>
                      </div>
                      <span style={{ color: statusCfg.color }}>
                        {statusCfg.icon}
                      </span>
                    </div>
                    <span className="text-[10px]" style={{ color: DESIGN_TOKENS.textMuted }}>
                      {statusCfg.label}
                    </span>
                    <span className="text-[10px] leading-tight" style={{ color: DESIGN_TOKENS.textMuted }}>
                      {role.detail}
                    </span>
                    {agent.status === "done" && agent.output && (
                      <div className="flex items-center gap-1">
                        {isExpanded ? (
                          <ChevronDown size={12} style={{ color: DESIGN_TOKENS.textMuted }} />
                        ) : (
                          <ChevronRight size={12} style={{ color: DESIGN_TOKENS.textMuted }} />
                        )}
                        <span className="text-[10px]" style={{ color: "#22c55e" }}>
                          {agent.output.length > 50
                            ? `${agent.output.slice(0, 50)}...`
                            : agent.output.length}
                        </span>
                      </div>
                    )}
                    {agent.status === "error" && agent.error && (
                      <span className="text-[10px] truncate" style={{ color: "#ef4444" }}>
                        {agent.error}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>

            {/* 展开的 Agent 输出详情 */}
            {expandedAgent && (
              <div
                className="border-b p-4 max-h-48 overflow-y-auto"
                style={{
                  borderColor: DESIGN_TOKENS.border,
                  backgroundColor: DESIGN_TOKENS.panelSolid,
                }}
              >
                {(() => {
                  const agent = agents.find((a) => a.roleId === expandedAgent)
                  if (!agent) return null
                  const role = FILM_CREW_ROLES[agent.roleId]

                  return (
                    <div>
                      <div className="mb-2 flex items-center gap-2">
                        <span style={{ color: DESIGN_TOKENS.accent }}>
                          {AGENT_ICONS[agent.roleId]}
                        </span>
                        <span className="text-xs font-medium" style={{ color: DESIGN_TOKENS.text }}>
                          {role.name}
                        </span>
                        <span
                          className="rounded-full px-2 py-0.5 text-[10px]"
                          style={{
                            backgroundColor:
                              agent.status === "done"
                                ? "rgba(34,197,94,0.15)"
                                : agent.status === "error"
                                  ? "rgba(239,68,68,0.15)"
                                  : "rgba(59,130,246,0.15)",
                            color:
                              agent.status === "done"
                                ? "#22c55e"
                                : agent.status === "error"
                                  ? "#ef4444"
                                  : "#3b82f6",
                          }}
                        >
                          {STATUS_CONFIG[agent.status].label}
                        </span>
                      </div>
                      {agent.output && (
                        <pre
                          className="w-full whitespace-pre-wrap rounded-lg p-3 text-[11px] leading-relaxed"
                          style={{
                            backgroundColor: "rgba(255,255,255,0.04)",
                            color: DESIGN_TOKENS.textSecondary,
                          }}
                        >
                          {agent.output.slice(0, 3000)}
                          {agent.output.length > 3000 && "\n\n...（内容过长已截断）"}
                        </pre>
                      )}
                      {agent.error && (
                        <div
                          className="rounded-lg p-3 text-[11px]"
                          style={{
                            backgroundColor: "rgba(239,68,68,0.1)",
                            color: "#ef4444",
                          }}
                        >
                          <AlertTriangle size={12} className="inline mr-1" />
                          {agent.error}
                        </div>
                      )}
                    </div>
                  )
                })()}
              </div>
            )}

            {/* 执行轨迹 */}
            {trace.length > 0 && (
              <div className="flex-1 overflow-y-auto p-4">
                <div className="mb-2 flex items-center gap-2">
                  <ScrollText size={14} style={{ color: DESIGN_TOKENS.textMuted }} />
                  <span className="text-xs font-medium" style={{ color: DESIGN_TOKENS.textSecondary }}>
                    执行轨迹
                  </span>
                </div>
                <div className="space-y-1">
                  {trace.map((line, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="text-[10px] font-mono mt-0.5" style={{ color: DESIGN_TOKENS.textMuted }}>
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span
                        className="text-[11px] leading-relaxed"
                        style={{
                          color: line.startsWith("❌")
                            ? "#ef4444"
                            : line.startsWith("✅")
                              ? "#22c55e"
                              : line.startsWith("▶️")
                                ? "#3b82f6"
                                : line.startsWith("⏹️")
                                  ? "#f59e0b"
                                  : DESIGN_TOKENS.textSecondary,
                        }}
                      >
                        {line}
                      </span>
                    </div>
                  ))}
                  <div ref={traceEndRef} />
                </div>
              </div>
            )}

            {/* 空状态 */}
            {trace.length === 0 && !expandedAgent && (
              <div
                className="flex flex-1 items-center justify-center"
                style={{ color: DESIGN_TOKENS.textMuted }}
              >
                <div className="text-center">
                  <Clapperboard size={48} strokeWidth={1} className="mx-auto mb-3 opacity-30" />
                  <p className="text-sm">输入剧本并运行剧组</p>
                  <p className="text-xs mt-1">7 个 AI Agent 将协同完成全流程创作</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
