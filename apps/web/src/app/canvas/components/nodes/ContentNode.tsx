// ============================================================================
// Content Node Component - simplified TapNow-inspired text + AI input node
// ============================================================================
"use client"

import { memo, useState, useEffect, useRef, useCallback, useMemo } from "react"
import {
  Sparkles,
  ChevronDown,
  ChevronUp,
  ArrowUp,
  Loader2,
  X,
  Wand2,
  Maximize2,
  Minimize2,
  Grid3X3,
  MessageSquareText,
  Image,
  Download,
  AlertTriangle,
  CheckCircle,
  Info,
} from "lucide-react"
import { Handle, Position, NodeResizer, type NodeProps, useReactFlow } from "@xyflow/react"
import { pushUndo } from "../../StarCanvas"
import { DESIGN_TOKENS } from "../../styles/designSystem"
import type { CanvasNodeData, CanvasNodeKind, NodeRunStatus } from "../canvas/types"
import { NodeRunStatusIndicator } from "./NodeRunStatusIndicator"
import { useWorkflowRunner } from "../../hooks/useWorkflowRunner"
import { generateImageFromPrompt } from "../../utils/imageGeneration"
import {
  getSlashCommandsForTarget,
  parseSlashQuery,
  removeSlashCommandFromText,
  type SlashCommand,
  type SlashQuery,
} from "@/lib/slashCommands/slashCommands"
import { runSlashTextCommand } from "@/lib/slashCommands/runSlashTextCommand"
import { runStoryboardAssistantCommand } from "@/lib/slashCommands/runStoryboardAssistantCommand"
import {
  getStoryboardAssistantStage,
  STORYBOARD_ASSISTANT_LABELS,
} from "@/lib/storyboard/storyboardTextNode"
import { InlineSlashCommandMenu } from "../menus/InlineSlashCommandMenu"
import { getCachedDefaultImageModel } from "@/lib/ai/client"
import { getModelOptions } from "@/lib/ai/imageProviderCapabilities"
import { convertSrtToVtt } from "@/lib/storyboard/subtitleFormatter"

interface ContentNodeProps extends NodeProps {
  data: CanvasNodeData
}

type ContentAiMode = "chat" | "image"

const DEFAULT_CHAT_MODEL = "gpt-5.5"
const DEFAULT_IMAGE_MODEL = getCachedDefaultImageModel()

const MODEL_OPTIONS = [
  { value: DEFAULT_CHAT_MODEL, label: "GPT-5.5", desc: "文本生成", mode: "chat" as const },
  {
    value: DEFAULT_IMAGE_MODEL,
    label: getModelOptions().find((m) => m.value === DEFAULT_IMAGE_MODEL)?.label || "图片模型",
    desc: "图片生成",
    mode: "image" as const,
  },
]

const AI_MODE_OPTIONS: Array<{
  value: ContentAiMode
  label: string
  desc: string
  icon: typeof MessageSquareText
}> = [
  { value: "chat", label: "对话", desc: "写作、改写、续写", icon: MessageSquareText },
  { value: "image", label: "生图", desc: "自动使用图片模型", icon: Image },
]

const IMAGE_SIZE_OPTIONS = [
  { value: "1792x1024", label: "横图", desc: "1792×1024" },
  { value: "1024x1024", label: "方图", desc: "1024×1024" },
  { value: "1024x1792", label: "竖图", desc: "1024×1792" },
]

// ---- 六维连续性检查面板（内嵌组件） ----

interface ContinuityCheckPanelProps {
  issues: Array<{
    dimension: string
    severity: "error" | "warning" | "info"
    message: string
    shotId?: string
    sceneId?: string
  }>
  report: string
}

const DIMENSION_LABELS: Record<string, string> = {
  character: "角色连续性",
  scene: "场景连续性",
  action: "动作连续性",
  style: "风格连续性",
  time: "时间连续性",
  prop: "道具连续性",
}

const SEVERITY_COLORS = {
  error: { icon: AlertTriangle, color: "#f87171", bg: "rgba(248, 113, 113, 0.08)", label: "错误" },
  warning: { icon: AlertTriangle, color: "#fbbf24", bg: "rgba(251, 191, 36, 0.08)", label: "警告" },
  info: { icon: Info, color: "#60a5fa", bg: "rgba(96, 165, 250, 0.08)", label: "提示" },
} as const

function ContinuityCheckPanel({ issues, report }: ContinuityCheckPanelProps) {
  const [expanded, setExpanded] = useState(true)
  const [showReport, setShowReport] = useState(false)

  const errorCount = issues.filter((i) => i.severity === "error").length
  const warningCount = issues.filter((i) => i.severity === "warning").length
  const infoCount = issues.filter((i) => i.severity === "info").length
  const hasIssues = issues.length > 0

  return (
    <div className="border-b" style={{ borderColor: "rgba(15, 23, 42, 0.08)" }}>
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-2.5 transition-colors hover:bg-slate-50"
      >
        <div className="flex items-center gap-2">
          {hasIssues ? (
            <AlertTriangle size={14} style={{ color: errorCount > 0 ? "#f87171" : "#fbbf24" }} />
          ) : (
            <CheckCircle size={14} style={{ color: "#34d399" }} />
          )}
          <span className="text-xs font-medium text-slate-700">六维连续性检查</span>
          {hasIssues && (
            <span
              className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
              style={{
                backgroundColor: errorCount > 0 ? "rgba(248,113,113,0.12)" : "rgba(251,191,36,0.12)",
                color: errorCount > 0 ? "#dc2626" : "#d97706",
              }}
            >
              {issues.length} 项
            </span>
          )}
          {!hasIssues && (
            <span className="text-[10px] text-emerald-600">全部通过</span>
          )}
        </div>
        {expanded ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
      </button>

      {/* Body */}
      {expanded && (
        <div className="px-4 pb-3">
          {/* 统计 */}
          <div className="mb-2 flex items-center gap-3 text-[11px]">
            {errorCount > 0 && <span style={{ color: "#f87171" }}>● {errorCount} 错误</span>}
            {warningCount > 0 && <span style={{ color: "#fbbf24" }}>▲ {warningCount} 警告</span>}
            {infoCount > 0 && <span style={{ color: "#60a5fa" }}>◆ {infoCount} 提示</span>}
          </div>

          {/* 问题列表 */}
          {hasIssues && (
            <div className="flex flex-col gap-1.5 max-h-[240px] overflow-y-auto">
              {issues.map((issue, idx) => {
                const config = SEVERITY_COLORS[issue.severity] ?? SEVERITY_COLORS.info
                const Icon = config.icon
                const dimLabel = DIMENSION_LABELS[issue.dimension] ?? issue.dimension
                return (
                  <div
                    key={issue.shotId ?? issue.sceneId ?? `${issue.dimension}-${idx}`}
                    className="rounded-lg p-2 flex flex-col gap-0.5"
                    style={{ backgroundColor: config.bg, border: `1px solid ${config.color}22` }}
                  >
                    <div className="flex items-center gap-1">
                      <Icon size={11} style={{ color: config.color }} />
                      <span className="text-[10px] font-medium" style={{ color: config.color }}>
                        {dimLabel}
                      </span>
                      {issue.shotId && (
                        <span className="text-[10px] ml-auto text-slate-400">{issue.shotId}</span>
                      )}
                    </div>
                    <p className="text-[11px] leading-4 text-slate-600">{issue.message}</p>
                  </div>
                )
              })}
            </div>
          )}

          {/* 完整报告 */}
          {report && (
            <div className="mt-2">
              <button
                type="button"
                onClick={() => setShowReport((v) => !v)}
                className="text-[10px] text-teal-600 underline"
              >
                {showReport ? "隐藏" : "查看"}完整报告
              </button>
              {showReport && (
                <pre className="mt-1 whitespace-pre-wrap text-[10px] leading-4 rounded-lg p-2 overflow-x-auto bg-slate-100 text-slate-500">
                  {report}
                </pre>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const STORYBOARD_RUN_STATUS_LABELS: Record<NodeRunStatus, string> = {
  idle: "待开始",
  ready: "已就绪",
  pending: "准备中",
  queued: "排队中",
  running: "生成中",
  succeeded: "已完成",
  failed: "失败",
  stale: "需更新",
  cancelled: "已取消",
}

export const ContentNode = memo(function ContentNode({ id, data, selected, width, height }: ContentNodeProps) {
  const [editContent, setEditContent] = useState(data.content || data.prompt || "")
  const [aiInput, setAiInput] = useState("")
  const [aiMode, setAiMode] = useState<ContentAiMode>("chat")
  const [selectedModel, setSelectedModel] = useState(DEFAULT_CHAT_MODEL)
  const [imageSize, setImageSize] = useState("1792x1024")
  const [showModelDropdown, setShowModelDropdown] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const [slashQuery, setSlashQuery] = useState<SlashQuery | null>(null)
  const [slashActiveIndex, setSlashActiveIndex] = useState(0)
  const [slashError, setSlashError] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const aiInputRef = useRef<HTMLTextAreaElement>(null)
  const { setNodes, getNodes, getEdges, setEdges } = useReactFlow()
  const { runNode } = useWorkflowRunner()

  const content = data.content || data.prompt || ""
  const isStoryboardNode = data.nodeKind === "storyboard"
  const isDocumentNode = data.nodeKind === "document"
  const isSubtitleSrtNode = data.nodeKind === "subtitle-srt"
  const isHandoffReportNode = data.nodeKind === "handoff-report"
  const isWritingSourceNode = isStoryboardNode || isDocumentNode || data.nodeKind === "text" || data.nodeKind === "prompt"
  const isReadonlyContentNode = isSubtitleSrtNode || isHandoffReportNode
  const isFocusWritingMode = data.writingMode === "focus"
  const storyboardStage = getStoryboardAssistantStage({
    stage: data.storyboardAssistantStage,
    content: editContent,
  })
  const storyboardLabels = STORYBOARD_ASSISTANT_LABELS[storyboardStage]
  const hasStoryboardSeedText = editContent.trim().length > 0
  const storyboardRunMeta = data.runMeta
  const hasStoryboardProcessNodes = Boolean(data.generatedShotNodeIds?.length || data.generatedStoryboardGridNodeId)
  const isStoryboardProcessVisible = data.storyboardProcessVisible !== false
  const hasStoryboardFinalOutput = Boolean(data.storyboardOutputImageUrl || data.storyboardOutputImageNodeId)
  const shouldSuppressStaleStoryboardFailure = hasStoryboardFinalOutput && storyboardRunMeta?.runStatus === "failed"
  const effectiveStoryboardRunMeta = shouldSuppressStaleStoryboardFailure ? undefined : storyboardRunMeta
  const isStoryboardRunActive = effectiveStoryboardRunMeta?.runStatus === "pending" || effectiveStoryboardRunMeta?.runStatus === "running"
  const hasStandaloneStoryboardOutput = Boolean(data.storyboardOutputImageNodeId)
  const storyboardResultCaption =
    data.storyboardResultQuality === "fallback-shot"
      ? data.storyboardWarning || "合成分镜图暂时失败，已使用镜头图作为临时结果。"
      : data.storyboardResultQuality === "single-shot"
        ? "已根据文本生成 1 个镜头。"
        : data.storyboardResultQuality === "composed-grid"
          ? "已合成多镜头分镜图。"
          : undefined
  const contentNodeBadge = isSubtitleSrtNode
    ? "字幕文件"
    : isHandoffReportNode
      ? "交接报告"
      : data.nodeKind === "prompt"
        ? data.storyboardOutputImageUrl || data.storyboardAssistantStage
          ? "故事分镜"
          : "写作文本"
        : isStoryboardNode
          ? storyboardLabels.badge
          : isDocumentNode
            ? "创作文档"
            : "写作文本"
  const isStoryboardRunVisible =
    isWritingSourceNode &&
    effectiveStoryboardRunMeta?.message &&
    effectiveStoryboardRunMeta.source === "manual" &&
    ["pending", "running", "succeeded", "failed"].includes(effectiveStoryboardRunMeta.runStatus)
  const slashCommands = useMemo(
    () => getSlashCommandsForTarget("text", slashQuery?.query ?? ""),
    [slashQuery],
  )
  const defaultWritingWidth = isFocusWritingMode ? 920 : isStoryboardNode || isDocumentNode ? 760 : 680
  const defaultWritingHeight = isFocusWritingMode ? 720 : isStoryboardNode || isDocumentNode ? 620 : 560
  const nodeWidth = typeof width === "number" ? width : data.displayWidth || defaultWritingWidth
  const nodeHeight = typeof height === "number" ? height : data.displayHeight || defaultWritingHeight
  const hasFixedNodeHeight = typeof nodeHeight === "number"
  const mainTextMaxHeight = hasFixedNodeHeight ? Math.max(260, nodeHeight - 220) : isStoryboardNode ? 960 : 560

  useEffect(() => {
    setEditContent(data.content || data.prompt || "")
  }, [data.content, data.prompt])

  const autoResize = useCallback((el: HTMLTextAreaElement | null, maxHeight: number) => {
    if (!el) return
    el.style.height = "auto"
    const nextHeight = Math.min(el.scrollHeight, maxHeight)
    el.style.height = `${nextHeight}px`
    el.style.overflowY = el.scrollHeight > maxHeight ? "auto" : "hidden"
  }, [])

  useEffect(() => {
    if (hasFixedNodeHeight && textareaRef.current) {
      textareaRef.current.style.height = "100%"
      textareaRef.current.style.overflowY = "auto"
      return
    }
    autoResize(textareaRef.current, mainTextMaxHeight)
  }, [editContent, hasFixedNodeHeight, mainTextMaxHeight, autoResize])

  useEffect(() => {
    autoResize(aiInputRef.current, 120)
  }, [aiInput, autoResize])

  const updateContent = useCallback((nextContent: string) => {
    setEditContent(nextContent)
    setNodes((nds) =>
      nds.map((node) =>
        node.id === id
          ? {
              ...node,
              data: {
                ...node.data,
                content: nextContent,
                prompt: nextContent,
              },
            }
          : node
      )
    )
  }, [id, setNodes])

  const updateSlashQueryFromTextarea = useCallback((value: string, cursor: number) => {
    const parsed = parseSlashQuery(value, cursor)
    setSlashQuery(parsed)
    setSlashActiveIndex(0)
  }, [])

  const triggerSplitStoryboard = useCallback((targetNodeId: string) => {
    window.dispatchEvent(new CustomEvent("starcanvas:split-storyboard", { detail: { nodeId: targetNodeId } }))
  }, [])

  const triggerGenerateStoryboardImage = useCallback((targetNodeId: string) => {
    setAiMode("image")
    setSelectedModel(DEFAULT_IMAGE_MODEL)
    setShowModelDropdown(false)
    window.dispatchEvent(new CustomEvent("starcanvas:generate-storyboard-image", { detail: { nodeId: targetNodeId } }))
  }, [])

  const getStoryboardProcessNodeIndex = useCallback(
    (node: { id: string; type?: string; data?: CanvasNodeData }) => {
      if (node.type === "storyboardGrid") return 10_000
      const explicitIndex = data.generatedShotNodeIds?.indexOf(node.id) ?? -1
      if (explicitIndex >= 0) return explicitIndex
      if (typeof node.data?.sourceShotOrder === "number") return Math.max(0, node.data.sourceShotOrder - 1)
      if (typeof node.data?.shot?.order === "number") return Math.max(0, node.data.shot.order - 1)
      return 9_000
    },
    [data.generatedShotNodeIds],
  )

  const layoutStoryboardProcessNodes = useCallback(
    (nextVisible: boolean, processNodeIds: Set<string>) => {
      const currentNodes = getNodes() as Array<{
        id: string
        type?: string
        position?: { x: number; y: number }
        data?: CanvasNodeData
      }>
      const sourceNode = currentNodes.find((node) => node.id === id)
      const sourcePosition = sourceNode?.position
      if (!sourcePosition) return

      const finalOutputNode = currentNodes.find(
        (node) =>
          node.data?.sourceStoryboardNodeId === id &&
          (node.data?.role === "storyboard-final-output" || node.data?.isStoryboardFinalOutput === true),
      )
      const finalRight = finalOutputNode?.position
        ? finalOutputNode.position.x + (finalOutputNode.data?.displayWidth ?? 380)
        : sourcePosition.x + 800
      const baseShotX = Math.max(sourcePosition.x + 860, finalRight + 80)
      const shotWidth = 340
      const imageX = baseShotX + shotWidth + 72
      const gridX = imageX + 400
      const rowGap = 420

      setNodes((nds) =>
        nds.map((node) => {
          if (!processNodeIds.has(node.id)) return node
          const processIndex = getStoryboardProcessNodeIndex(node as { id: string; type?: string; data?: CanvasNodeData })
          const rowY = sourcePosition.y + (processIndex >= 9_000 ? 0 : processIndex * rowGap)
          const nextPosition =
            node.type === "storyboardGrid"
              ? { x: gridX, y: sourcePosition.y }
              : node.type === "image" || node.data?.role === "shot-image"
                ? { x: imageX, y: rowY }
                : { x: baseShotX, y: rowY }

          return {
            ...node,
            position: nextPosition,
            hidden: !nextVisible,
            data: {
              ...node.data,
              hiddenByStoryboardProcessMode: !nextVisible,
            },
          }
        }),
      )
    },
    [getNodes, getStoryboardProcessNodeIndex, id, setNodes],
  )

  const toggleStoryboardProcessNodes = useCallback(() => {
    const nextVisible = !isStoryboardProcessVisible
    const currentNodes = getNodes() as Array<{ id: string; type?: string; data?: CanvasNodeData }>
    const explicitProcessNodeIds = new Set([
      ...(data.generatedShotNodeIds ?? []),
      ...(data.generatedStoryboardGridNodeId ? [data.generatedStoryboardGridNodeId] : []),
    ])
    const processNodeIds = new Set(
      currentNodes
        .filter((node) => {
          const nodeData = node.data
          return Boolean(
            explicitProcessNodeIds.has(node.id) ||
              ((nodeData?.sourceStoryboardNodeId === id ||
                nodeData?.storyboardGrid?.sourceStoryboardNodeId === id ||
                nodeData?.shot?.sourceStoryboardNodeId === id) &&
                (node.type === "shot" ||
                  node.type === "storyboardGrid" ||
                  nodeData?.role === "shot-image" ||
                  nodeData?.role === "storyboard-process" ||
                  nodeData?.isStoryboardProcessNode === true)),
          )
        })
        .map((node) => node.id),
    )
    setNodes((nds) =>
      nds.map((node) =>
        node.id === id
          ? {
              ...node,
              data: {
                ...node.data,
                storyboardProcessVisible: nextVisible,
              },
            }
          : processNodeIds.has(node.id)
            ? {
                ...node,
                hidden: !nextVisible,
                data: {
                  ...node.data,
                  hiddenByStoryboardProcessMode: !nextVisible,
                },
              }
            : node,
      ),
    )
    if (nextVisible) {
      layoutStoryboardProcessNodes(nextVisible, processNodeIds)
    }
    const currentEdges = getEdges()
    setEdges((eds) =>
      eds.map((edge) => {
        const touchesProcess = processNodeIds.has(edge.source) || processNodeIds.has(edge.target)
        const existingEdge = currentEdges.find((item) => item.id === edge.id)
        const isFinalOutputEdge =
          !touchesProcess &&
          (existingEdge?.data as Record<string, unknown> | undefined)?.relation === "storyboard-final-output"
        if (isFinalOutputEdge) return { ...edge, hidden: false }
        return touchesProcess ? { ...edge, hidden: !nextVisible } : edge
      }),
    )
  }, [data.generatedShotNodeIds, data.generatedStoryboardGridNodeId, getEdges, getNodes, id, isStoryboardProcessVisible, layoutStoryboardProcessNodes, setEdges, setNodes])

  const toggleWritingMode = useCallback(() => {
    const nextFocusMode = !isFocusWritingMode
    const nextWidth = nextFocusMode ? 920 : isStoryboardNode || isDocumentNode ? 760 : 680
    const nextHeight = nextFocusMode ? 720 : isStoryboardNode || isDocumentNode ? 620 : 560
    setNodes((nds) =>
      nds.map((node) =>
        node.id === id
          ? {
              ...node,
              width: nextWidth,
              height: nextHeight,
              measured: {
                ...node.measured,
                width: nextWidth,
                height: nextHeight,
              },
              data: {
                ...node.data,
                writingMode: nextFocusMode ? "focus" : "normal",
                displayWidth: nextWidth,
                displayHeight: nextHeight,
                autoSizeMode: "manual",
              },
            }
          : node,
      ),
    )
  }, [id, isDocumentNode, isFocusWritingMode, isStoryboardNode, setNodes])

  const handleDownloadSubtitle = useCallback((format: "srt" | "vtt") => {
    const srtContent = data.srtContent || content
    if (!srtContent) return

    const fileContent = format === "vtt" ? convertSrtToVtt(srtContent) : srtContent
    const ext = format === "vtt" ? ".vtt" : ".srt"
    const mimeType = format === "vtt" ? "text/vtt" : "text/plain"
    const baseName = (data.title || "subtitle").replace(/\.[^.]+$/, "")

    const blob = new Blob([fileContent], { type: `${mimeType};charset=utf-8` })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${baseName}${ext}`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [content, data.srtContent, data.title])

  const handleDownloadHandoffReport = useCallback(() => {
    const reportContent = data.content || data.text || content
    if (!reportContent) return

    const baseName = (data.title || "handoff-report").replace(/\.[^.]+$/, "")
    const blob = new Blob([reportContent], { type: "text/markdown;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${baseName}.md`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [content, data.content, data.text, data.title])

  const handleContinueStoryboardAssistant = useCallback(async (sourceText: string) => {
    const currentText = editContent
    setSlashQuery(null)
    setSlashError(null)
    setAiError(null)
    setIsGenerating(true)

    // 按实际内容重新检测阶段，避免因上一步超时导致 stage 字段未更新的问题
    const effectiveStage = getStoryboardAssistantStage({
      stage: data.storyboardAssistantStage,
      content: sourceText,
    })

    try {
      await runStoryboardAssistantCommand({
        text: sourceText,
        stage: effectiveStage,
        nodeId: id,
        nodeWidth,
        updateNode: (next) => {
          setEditContent(next.text)
          setNodes((nds) =>
            nds.map((node) =>
              node.id === id
                ? {
                    ...node,
                    width: next.width,
                    height: next.height,
                    measured: {
                      ...node.measured,
                      width: next.width,
                      height: next.height,
                    },
                    data: {
                      ...node.data,
                      title: STORYBOARD_ASSISTANT_LABELS[next.stage].title,
                      content: next.text,
                      prompt: next.text,
                      storyboardAssistantStage: next.stage,
                      autoSizeMode: "fixed-width-height-grows",
                      displayWidth: next.width,
                      displayHeight: next.height,
                    },
                  }
                : node
            )
          )
        },
        triggerSplitStoryboard,
      })
    } catch (error: any) {
      const message = error?.message || "故事分镜执行失败"
      setSlashError(message)
      setAiError(message)
      // 只在 AI 调用前内容没有变更时才回滚（避免超时后清空已有分镜内容）
      if (editContent === currentText) {
        updateContent(currentText)
      }
    } finally {
      setIsGenerating(false)
    }
  }, [data.storyboardAssistantStage, editContent, id, nodeWidth, setNodes, triggerSplitStoryboard, updateContent])

  const executeSlashCommand = useCallback(async (command: SlashCommand) => {
    const currentQuery = slashQuery
    const currentText = editContent
    const cleanedText = currentQuery
      ? removeSlashCommandFromText(currentText, currentQuery.range)
      : currentText

    setSlashQuery(null)
    setSlashError(null)

    if (command.id === "split-storyboard") {
      updateContent(cleanedText)
      triggerSplitStoryboard(id)
      return
    }

    if (command.id === "continue-storyboard-assistant" || command.id === "generate-storyboard-text") {
      await handleContinueStoryboardAssistant(cleanedText)
      return
    }

    if (!["summarize", "expand", "rewrite"].includes(command.id)) return

    setIsGenerating(true)
    try {
      const result = await runSlashTextCommand({
        commandId: command.id as "summarize" | "expand" | "rewrite",
        nodeText: cleanedText,
      })
      updateContent(result)
    } catch (error: any) {
      setSlashError(error?.message || "命令执行失败")
      updateContent(currentText)
    } finally {
      setIsGenerating(false)
    }
  }, [editContent, handleContinueStoryboardAssistant, id, slashQuery, triggerSplitStoryboard, updateContent])

  const handleMainTextKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!slashQuery || slashCommands.length === 0) return

    if (e.key === "ArrowDown") {
      e.preventDefault()
      setSlashActiveIndex((index) => (index + 1) % slashCommands.length)
      return
    }
    if (e.key === "ArrowUp") {
      e.preventDefault()
      setSlashActiveIndex((index) =>
        index === 0 ? slashCommands.length - 1 : index - 1,
      )
      return
    }
    if (e.key === "Escape") {
      e.preventDefault()
      setSlashQuery(null)
      return
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      const command = slashCommands[slashActiveIndex]
      if (command) executeSlashCommand(command)
    }
  }, [executeSlashCommand, slashActiveIndex, slashCommands, slashQuery])

  const handleAiGenerate = useCallback(async () => {
    const userPrompt = aiInput.trim()
    if (!userPrompt) return

    const isImageGen = aiMode === "image"
    const selectedModelOption = MODEL_OPTIONS.find((model) => model.value === selectedModel)
    const modelForRequest =
      selectedModelOption?.mode === aiMode
        ? selectedModelOption.value
        : isImageGen
          ? DEFAULT_IMAGE_MODEL
          : DEFAULT_CHAT_MODEL
    setIsGenerating(true)
    setAiError(null)

    try {
      if (isImageGen) {
        const result = await generateImageFromPrompt({
          prompt: userPrompt,
          model: modelForRequest,
          size: imageSize,
          requestId: `content-image-${id}-${Date.now()}`,
        })

        const displayUrl = result.imageUrl
        const assetId = result.assetId

        const currentNode = getNodes().find((n) => n.id === id)
        if (!currentNode) throw new Error("Node not found")

        const newNode = {
          id: `node-${Date.now()}`,
          type: "image" as const,
          position: { x: currentNode.position.x + 380, y: currentNode.position.y },
          data: {
            title: `生成: ${userPrompt.slice(0, 20)}${userPrompt.length > 20 ? "..." : ""}`,
            imageUrl: displayUrl,
            assetId,
            nodeKind: "ai-generated-image" as CanvasNodeKind,
            prompt: userPrompt,
            summary: result.prompt,
            generationOutput: {
              prompt: userPrompt,
              finalPrompt: result.prompt,
              revisedPrompt: result.revisedPrompt,
              model: result.model || modelForRequest,
              size: imageSize,
            },
            model: result.model || modelForRequest,
            size: imageSize,
            sourcePromptId: id,
            source: "generated" as const,
            persistence: assetId ? "indexeddb" as const : undefined,
            displayWidth: 280,
            displayHeight: 280,
            createdAt: Date.now(),
          },
        }

        setNodes((nds) => [...nds, newNode])
        setEdges((eds) => [...eds, {
          id: `edge-${id}-${newNode.id}`,
          source: id,
          target: newNode.id,
          type: "creative",
          animated: true,
          style: { stroke: DESIGN_TOKENS.nodeEdge, strokeWidth: 1.5 },
        }])
      } else {
        const combinedPrompt = content
          ? `${content}\n\n---\n\n用户追加指令: ${userPrompt}`
          : userPrompt

        await runNode(id, combinedPrompt)
      }

      setAiInput("")
    } catch (err: any) {
      setAiError(err.message || "生成失败")
    } finally {
      setIsGenerating(false)
    }
  }, [aiInput, aiMode, selectedModel, imageSize, id, content, runNode, getNodes, setNodes, setEdges])

  const handleAiInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleAiGenerate()
    }
  }

  const modeModelOptions = MODEL_OPTIONS.filter((model) => model.mode === aiMode)
  const selectedModelForMode = modeModelOptions.some((model) => model.value === selectedModel)
    ? selectedModel
    : aiMode === "image"
      ? DEFAULT_IMAGE_MODEL
      : DEFAULT_CHAT_MODEL
  const currentModel = MODEL_OPTIONS.find((model) => model.value === selectedModelForMode) || modeModelOptions[0] || MODEL_OPTIONS[0]

  return (
    <>
      {selected && (
        <NodeResizer
          minWidth={520}
          minHeight={420}
          handleStyle={{
            background: DESIGN_TOKENS.nodeHandle,
            border: "2px solid rgba(255,255,255,0.3)",
            borderRadius: "4px",
          }}
          lineStyle={{ stroke: DESIGN_TOKENS.nodeHandle, strokeWidth: 1.5, strokeDasharray: "6 3" }}
        />
      )}

      <Handle type="target" position={Position.Top} className="!bg-slate-400 !h-2.5 !w-2.5 !rounded-sm !border !border-white/30" />
      <Handle type="target" position={Position.Left} className="!bg-slate-400 !h-2.5 !w-2.5 !rounded-sm !border !border-white/30" />
      <Handle type="source" position={Position.Right} className="!bg-slate-500 !h-2.5 !w-2.5 !rounded-sm !border !border-white/30" />
      <Handle type="source" position={Position.Bottom} className="!bg-slate-500 !h-2.5 !w-2.5 !rounded-sm !border !border-white/30" />

      <div
        className="flex flex-col overflow-hidden rounded-2xl border transition-all"
        style={{
          width: nodeWidth,
          height: hasFixedNodeHeight ? nodeHeight : undefined,
          minHeight: 420,
          backgroundColor: "#f8fafc",
          borderColor: selected ? "rgba(148, 163, 184, 0.4)" : DESIGN_TOKENS.border,
          boxShadow: selected ? DESIGN_TOKENS.shadowNode : "none",
        }}
      >
        <div
          className="flex items-center justify-between border-b px-3 py-2"
          style={{ borderColor: DESIGN_TOKENS.border, backgroundColor: "rgba(0,0,0,0.18)" }}
        >
          <div className="flex items-center gap-2">
            <Sparkles size={14} strokeWidth={1.5} style={{ color: DESIGN_TOKENS.accentHover }} />
            <span className="text-xs" style={{ color: DESIGN_TOKENS.textSecondary }}>
              {contentNodeBadge}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleWritingMode}
              className="nodrag nopan flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] transition-colors hover:bg-white/10"
              style={{ color: DESIGN_TOKENS.textSecondary }}
              title={isFocusWritingMode ? "恢复普通写作尺寸" : "放大为大屏写作尺寸"}
            >
              {isFocusWritingMode ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
              <span>{isFocusWritingMode ? "恢复" : "大屏"}</span>
            </button>
            {isSubtitleSrtNode && (
              <>
                <button
                  type="button"
                  onClick={() => handleDownloadSubtitle("srt")}
                  className="nodrag nopan flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] transition-colors hover:bg-white/10"
                  style={{ color: DESIGN_TOKENS.accent }}
                  title="下载 SRT 字幕文件"
                >
                  <Download size={12} />
                  <span>SRT</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDownloadSubtitle("vtt")}
                  className="nodrag nopan flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] transition-colors hover:bg-white/10"
                  style={{ color: DESIGN_TOKENS.accentHover }}
                  title="下载 WebVTT 字幕文件（兼容网页播放器）"
                >
                  <Download size={12} />
                  <span>VTT</span>
                </button>
              </>
            )}
            {isHandoffReportNode && (
              <button
                type="button"
                onClick={handleDownloadHandoffReport}
                className="nodrag nopan flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] transition-colors hover:bg-white/10"
                style={{ color: DESIGN_TOKENS.accent }}
                title="下载交接报告 (Markdown)"
              >
                <Download size={12} />
                <span>导出</span>
              </button>
            )}
            <NodeRunStatusIndicator data={data} variant="dot" />
          </div>
        </div>

        {data.errorMessage && (
          <div className="border-b px-4 py-2 text-[11px] text-amber-200/80" style={{ borderColor: DESIGN_TOKENS.border, backgroundColor: "rgba(245, 158, 11, 0.1)" }}>
            {data.errorMessage}
          </div>
        )}

        {isStoryboardRunVisible && effectiveStoryboardRunMeta && (
          <div className="border-b bg-white px-4 py-3" style={{ borderColor: "rgba(15, 23, 42, 0.08)" }}>
            <div className="mb-2 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs font-medium text-slate-800">
                {effectiveStoryboardRunMeta.runStatus === "running" || effectiveStoryboardRunMeta.runStatus === "pending" ? (
                  <Loader2 size={13} className="animate-spin text-slate-500" />
                ) : effectiveStoryboardRunMeta.runStatus === "failed" ? (
                  <X size={13} className="text-amber-500" />
                ) : (
                  <Grid3X3 size={13} className="text-emerald-600" />
                )}
                <span>一键分镜图</span>
              </div>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">
                {STORYBOARD_RUN_STATUS_LABELS[effectiveStoryboardRunMeta.runStatus]}
              </span>
            </div>
            <p className="text-[11px] leading-5 text-slate-500">{effectiveStoryboardRunMeta.message}</p>
            {typeof effectiveStoryboardRunMeta.progress === "number" && effectiveStoryboardRunMeta.runStatus !== "idle" && (
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-slate-900 transition-all"
                  style={{ width: `${Math.min(100, Math.max(0, effectiveStoryboardRunMeta.progress))}%` }}
                />
              </div>
            )}
            <div className="mt-2 flex items-center justify-between gap-2">
              <p className="text-[10px] leading-4 text-slate-400">
                默认只展示最终分镜图；镜头卡片和合成预览属于可编辑过程，可按需展开。
              </p>
              {hasStoryboardProcessNodes && !isStoryboardRunActive && (
                <button
                  type="button"
                  onClick={toggleStoryboardProcessNodes}
                  className="nodrag nopan shrink-0 rounded-lg border border-slate-200 px-2 py-1 text-[10px] text-slate-500 transition-colors hover:bg-slate-50"
                >
                  {isStoryboardProcessVisible ? "隐藏过程" : "查看过程"}
                </button>
              )}
            </div>
          </div>
        )}

        {data.storyboardOutputImageUrl && (
          <div className="border-b bg-white px-4 py-3" style={{ borderColor: "rgba(15, 23, 42, 0.08)" }}>
            <div className="mb-2 flex items-center justify-between text-xs font-medium text-slate-800">
              <span>{data.storyboardResultQuality === "fallback-shot" ? "临时分镜图" : "最终分镜图"}</span>
              {hasStoryboardProcessNodes && (
                <button
                  type="button"
                  onClick={toggleStoryboardProcessNodes}
                  className="nodrag nopan rounded-lg border border-slate-200 px-2 py-1 text-[10px] text-slate-500 transition-colors hover:bg-slate-50"
                >
                  {isStoryboardProcessVisible ? "隐藏过程" : "查看过程"}
                </button>
              )}
            </div>
            {storyboardResultCaption && (
              <p className="mb-2 text-[10px] leading-4 text-slate-500">{storyboardResultCaption}</p>
            )}
            {hasStandaloneStoryboardOutput ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] leading-5 text-slate-500">
                最终图片已放在右侧独立节点，当前这里只保留缩略提示，避免一个结果重复占用主视觉。
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                <img src={data.storyboardOutputImageUrl} alt="分镜图" className="max-h-28 w-full object-cover" />
              </div>
            )}
          </div>
        )}

        {/* 六维连续性检查结果 */}
        {data.runMeta?.continuityChecked && (
          <ContinuityCheckPanel
            issues={data.runMeta.continuityIssues ?? []}
            report={data.runMeta.continuityReport ?? ""}
          />
        )}

        <div className="relative min-h-0 flex-1 overflow-visible bg-slate-100 px-4 py-4">
          <div className="h-full rounded-2xl border border-slate-200 bg-white shadow-sm">
            <textarea
            ref={textareaRef}
            value={editContent}
            onChange={(e) => {
              updateContent(e.target.value)
              updateSlashQueryFromTextarea(e.target.value, e.target.selectionStart)
              if (!hasFixedNodeHeight) autoResize(e.target, mainTextMaxHeight)
            }}
            onKeyDown={handleMainTextKeyDown}
            onSelect={(e) =>
              updateSlashQueryFromTextarea(
                e.currentTarget.value,
                e.currentTarget.selectionStart,
              )
            }
            onFocus={() => {
              pushUndo({ nodes: getNodes(), edges: getEdges() }, "edit-text")
            }}
            onPointerDownCapture={(e) => e.stopPropagation()}
            onMouseDownCapture={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
            placeholder={isStoryboardNode ? storyboardLabels.placeholder : isDocumentNode ? "在这里写故事、剧本、资料摘录，或从 TXT / Markdown 文档导入..." : "在这里输入你的想法，或输入 / 调用 AI 命令..."}
            className="nodrag nopan nowheel h-full w-full resize-none rounded-2xl bg-white px-5 py-4 text-[15px] leading-7 text-slate-950 placeholder:text-slate-400 focus:outline-none"
            style={hasFixedNodeHeight
              ? { height: "100%", minHeight: 0, overflowY: "auto" }
              : { minHeight: "320px", maxHeight: mainTextMaxHeight, overflowY: "auto" }}
            rows={8}
          />
          {slashQuery && slashCommands.length > 0 && (
            <InlineSlashCommandMenu
              commands={slashCommands}
              activeIndex={slashActiveIndex}
              onSelect={executeSlashCommand}
            />
          )}
          {slashError && (
            <div className="absolute left-3 top-full z-50 mt-2 rounded-lg px-2 py-1 text-[11px] text-red-300" style={{ backgroundColor: "rgba(239,68,68,0.12)" }}>
              {slashError}
            </div>
          )}
          </div>
        </div>

        {!isReadonlyContentNode && (
        <div
          className="shrink-0 border-t px-3 py-2.5"
          style={{ borderColor: DESIGN_TOKENS.border }}
        >
          <div className="mb-2 grid gap-2 md:grid-cols-2">
            {isStoryboardNode && (
              <button
                type="button"
                onClick={() => handleContinueStoryboardAssistant(editContent)}
                disabled={isGenerating || !hasStoryboardSeedText}
                className="flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-all disabled:cursor-not-allowed disabled:opacity-40"
                style={{
                  backgroundColor: hasStoryboardSeedText ? DESIGN_TOKENS.accent : "rgba(255,255,255,0.08)",
                  color: DESIGN_TOKENS.textPrimary,
                }}
                title={hasStoryboardSeedText ? storyboardLabels.button : "请先输入一句故事想法或故事正文"}
              >
                {isGenerating ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
                <span>{isGenerating ? storyboardLabels.loading : storyboardLabels.button}</span>
              </button>
            )}
            {isWritingSourceNode && (
              <button
                type="button"
                onClick={() => triggerGenerateStoryboardImage(id)}
                disabled={isGenerating || !editContent.trim()}
                className="flex w-full items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition-all hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                style={{
                  borderColor: "rgba(15, 23, 42, 0.12)",
                  backgroundColor: "#ffffff",
                  color: "#0f172a",
                }}
                title={editContent.trim() ? "一次生成一张多格分镜图；不会逐张生成镜头图，避免浪费算力" : "请先输入故事、剧本或文字分镜"}
              >
                <Grid3X3 size={14} />
                <span>一键生成分镜图</span>
                <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-normal text-slate-500">生图模式</span>
              </button>
            )}
          </div>

          <div className="mb-2 flex items-center gap-1 rounded-xl border bg-white p-1" style={{ borderColor: "rgba(15, 23, 42, 0.12)" }}>
            {AI_MODE_OPTIONS.map((option) => {
              const Icon = option.icon
              const active = aiMode === option.value
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    setAiMode(option.value)
                    setSelectedModel(option.value === "image" ? DEFAULT_IMAGE_MODEL : DEFAULT_CHAT_MODEL)
                    setShowModelDropdown(false)
                  }}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors"
                  style={{
                    backgroundColor: active ? "rgba(15, 23, 42, 0.08)" : "transparent",
                    color: active ? "#0f172a" : "#64748b",
                  }}
                  title={option.desc}
                >
                  <Icon size={13} strokeWidth={1.7} />
                  <span>{option.label}</span>
                </button>
              )
            })}
          </div>

          <textarea
            ref={aiInputRef}
            value={aiInput}
            onChange={(e) => {
              setAiInput(e.target.value)
              autoResize(e.target, 120)
            }}
            onKeyDown={handleAiInputKeyDown}
            onPointerDownCapture={(e) => e.stopPropagation()}
            onMouseDownCapture={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
            placeholder={aiMode === "image" ? "描述要生成的画面..." : "描述你想让 AI 做什么..."}
            className="nodrag nopan nowheel w-full resize-none rounded-xl border bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
            style={{
              borderColor: "rgba(15, 23, 42, 0.12)",
              minHeight: "44px",
              maxHeight: "120px",
              overflowY: "auto",
            }}
            rows={1}
          />

          <div className="mt-2 flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-1.5">
              <div className="relative">
                <button
                  onClick={() => setShowModelDropdown(!showModelDropdown)}
                  className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs transition-colors hover:bg-slate-200/70"
                  style={{ color: "#334155" }}
                >
                  <Sparkles size={12} strokeWidth={1.5} />
                  <span>{currentModel.label}</span>
                  <ChevronDown size={12} strokeWidth={1.5} />
                </button>

                {showModelDropdown && (
                  <div
                    className="absolute bottom-full left-0 mb-1 w-44 rounded-xl border py-1"
                    style={{
                      backgroundColor: "#ffffff",
                      borderColor: "rgba(15, 23, 42, 0.12)",
                      boxShadow: DESIGN_TOKENS.shadowMenu,
                    }}
                  >
                    <div className="px-3 py-1 text-[10px]" style={{ color: DESIGN_TOKENS.textMuted }}>
                      当前模式：{aiMode === "image" ? "生图" : "对话"}
                    </div>
                    {modeModelOptions.map((model) => (
                      <button
                        key={model.value}
                        onClick={() => {
                          setSelectedModel(model.value)
                          setShowModelDropdown(false)
                        }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-slate-100"
                        style={{ color: selectedModel === model.value ? DESIGN_TOKENS.accentHover : "#334155" }}
                      >
                        <Sparkles size={12} strokeWidth={1.5} />
                        <div>
                          <div className="font-medium">{model.label}</div>
                          <div className="text-[10px]" style={{ color: DESIGN_TOKENS.textMuted }}>{model.desc}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {aiMode === "image" && (
                <div className="flex items-center gap-1 rounded-lg border bg-white p-0.5" style={{ borderColor: "rgba(15, 23, 42, 0.12)" }}>
                  {IMAGE_SIZE_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setImageSize(option.value)}
                      title={option.desc}
                      className="rounded-md px-2 py-0.5 text-[11px] transition-colors"
                      style={{
                        backgroundColor: imageSize === option.value ? "rgba(15, 23, 42, 0.08)" : "transparent",
                        color: imageSize === option.value ? "#0f172a" : "#64748b",
                      }}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={handleAiGenerate}
              disabled={isGenerating || !aiInput.trim()}
              className="ml-1 flex h-8 w-8 items-center justify-center rounded-full transition-all disabled:opacity-30"
              style={{
                backgroundColor: aiInput.trim() ? DESIGN_TOKENS.accent : "rgba(255,255,255,0.1)",
              }}
            >
              {isGenerating ? (
                <Loader2 size={15} className="animate-spin text-white/70" />
              ) : (
                <ArrowUp size={15} strokeWidth={2} className="text-white/80" />
              )}
            </button>
          </div>

          {aiError && (
            <div className="mt-2 flex items-center justify-between rounded-lg px-2 py-1.5" style={{ backgroundColor: "rgba(239,68,68,0.1)" }}>
              <span className="text-[11px] text-red-300/70">{aiError}</span>
              <button onClick={() => setAiError(null)} className="text-[11px] text-white/40 hover:text-white/60">
                <X size={12} />
              </button>
            </div>
          )}
        </div>
        )}
      </div>
    </>
  )
})

export default ContentNode
