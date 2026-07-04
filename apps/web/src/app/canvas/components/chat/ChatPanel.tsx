/**
 * ChatPanel - 右侧 Chat 面板，TapNow-inspired 风格
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react"
import { createPortal } from "react-dom"
import {
  Library,
  PanelRightClose,
  Plus,
  MessageSquarePlus,
  Copy,
  ThumbsUp,
  ThumbsDown,
  ChevronDown,
  ImageIcon,
  PlusCircle,
  Wand2,
} from "lucide-react"
import { DESIGN_TOKENS, ICON_CONFIG } from "../../styles/designSystem"
import { useChatAttachments, type ChatAttachment } from "../../hooks/useChatAttachments"
import { ChatInput, type ChatTaskMode } from "./ChatInput"
import type { AiModel } from "./ChatInput"
import { AgentModeSwitcher } from "./AgentModeSwitcher"
import { useChatSSE, parseCanvasActions, stripCanvasActions } from "../../hooks/useChatSSE"
import type {
  ChatCanvasAction,
  ApplyActionsReport,
  ApplyActionResult,
  AskClarificationAction,
  PendingClarificationSnapshot,
} from "../../features/canvas/actions/chatActions"
import {
  buildClarificationAnswerContext,
  buildClarificationResumePayload,
  buildPendingClarificationSnapshot,
  getActionLabel,
  getStatusIcon,
  formatActionsSummary,
  formatActionSummary,
  getPendingActionSummaries,
  isAskClarificationAction,
  normalizeAskClarificationAction,
  shouldClearPendingClarificationAfterAnswer,
} from "../../features/canvas/actions/chatActions"
import { generateImageFromPrompt } from "../../utils/imageGeneration"
import { generateId } from "../../utils/generateId"
import { parseProviderSetupIntent } from "../../../../lib/ai/provider-setup-intent"
import {
  applyProviderSetup,
  getStoredModelOptions,
  openProviderSettings,
  readUseMockPreference,
  type StoredModelOption,
} from "../../../../lib/ai/user-settings"
import type { Node } from "@xyflow/react"
import type { AssetItem } from "../canvas/types"
import type { CanvasNodeData } from "../canvas/types"
import { AssetPreviewPopover, type ReferenceInfo } from "./AssetPreviewPopover"
import { useAIUsageStore } from "../../features/canvas/usage/useAIUsageStore"
import { estimateCostUsd } from "../../features/canvas/usage/estimateCost"
import { buildAutoAgentClarificationResponseActions, processWithAutoAgent } from "../../utils/autoAgentService"
import {
  shouldAutoApplyAutoAgentActions,
  shouldAutoApplyClarificationSelection,
} from "./chatAutoAgentFlow"

// ── @引用解析 ──────────────────────────────────────────
function parseReferences(
  text: string,
  canvasNodes: Node<CanvasNodeData>[],
  assets: AssetItem[],
): React.ReactNode[] {
  const parts: React.ReactNode[] = []
  const regex = /@(node|asset)_([a-zA-Z0-9_-]+)/g
  let lastIndex = 0
  let match

  while ((match = regex.exec(text)) !== null) {
    // 前面的纯文本
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index))
    }

    const type = match[1] as "node" | "asset"
    const id = match[2]
    let ref: ReferenceInfo

    if (type === "node") {
      const node = canvasNodes.find((n) => n.id === id)
      ref = {
        type: "node",
        id,
        title: (node?.data?.title as string) || node?.id,
        imageUrl: (node?.data?.imageUrl as string) || (node?.data?.sketchImageDataUrl as string),
        isValid: !!node,
        kind: (node?.data?.nodeKind as string) || node?.type,
      }
    } else {
      const asset = assets.find((a) => a.id === id)
      ref = {
        type: "asset",
        id,
        title: asset?.name || id,
        imageUrl: asset?.thumbnail || asset?.src,
        isValid: !!asset,
        kind: asset?.type,
      }
    }

    parts.push(
      <AssetPreviewPopover key={`${match[0]}-${match.index}`} reference={ref}>
        @{match[0].slice(1)}
      </AssetPreviewPopover>,
    )

    lastIndex = regex.lastIndex
  }

  // 尾部纯文本
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex))
  }

  return parts.length > 0 ? parts : [text]
}

type CanvasNodeContextSnapshot = {
  id: string
  type?: string
  nodeKind?: string
  title?: string
  prompt?: string
  content?: string
  summary?: string
  workflowRole?: string
  status?: string
  model?: string
  duration?: string
  fileName?: string
  mimeType?: string
  imageUrl?: string
  assetUrl?: string
  inputs?: Array<{ label?: string; type?: string }>
  outputs?: Array<{ label?: string; type?: string; url?: string }>
}

const isDebugEnabled = (key: string) =>
  typeof window !== "undefined" && window.localStorage.getItem(key) === "1"
function getNodeTitle(node: Node): string {
  const data = node.data as Record<string, any> | undefined
  const fallbackText = data?.content || data?.text || data?.prompt || data?.summary
  return String(data?.title || data?.fileName || (fallbackText ? fallbackText.slice(0, 28) : "未命名节点"))
}

function toCanvasNodeContext(node: Node): CanvasNodeContextSnapshot {
  const data = node.data as Record<string, any> | undefined

  const context: CanvasNodeContextSnapshot = {
    id: node.id,
    type: node.type,
    nodeKind: data?.nodeKind,
    title: getNodeTitle(node),
    prompt: data?.prompt,
    content: data?.content || data?.text,
    summary: data?.summary,
    workflowRole: data?.workflowRole,
    status: data?.status,
    model: data?.model,
    duration: data?.duration,
    fileName: data?.fileName,
    mimeType: data?.mimeType,
    imageUrl: data?.imageUrl || data?.src,
    assetUrl: data?.assetUrl || data?.resultUrl,
    inputs: data?.inputs,
    outputs: data?.outputs,
  }

  // Inject shot-specific context when the node is a shot type
  if (data?.shot) {
    const shot = data.shot as Record<string, any>
    Object.assign(context, {
      shotId: shot.id || node.id,
      shotType: shot.shotType,
      cameraMovement: shot.cameraMovement,
      shotDuration: shot.duration,
      shotDescription: shot.description,
      shotVisualPrompt: shot.visualPrompt,
      shotStatus: shot.generationStatus || shot.status,
      shotOrder: shot.order,
      characterIdentities: Array.isArray(shot.characterIdentities)
        ? shot.characterIdentities.map((c: any) => c.name || c.label).filter(Boolean)
        : undefined,
    })
  }

  return context
}

/**
 * 解析 @ 引用格式：@[节点名](node:节点ID)
 * 同时兼容旧格式 @title 和 @nodeId
 */
function parseMentions(input: string): string[] {
  const ids: string[] = []

  // 匹配新格式 @[title](node:id)
  const newFormatRegex = /@\[.*?\]\(node:([a-zA-Z0-9_-]+)\)/g
  let match
  while ((match = newFormatRegex.exec(input)) !== null) {
    ids.push(match[1])
  }

  return ids
}

/**
 * 展开消息中的 @ 引用为节点上下文文本
 * 将 @[title](node:id) 替换为包含节点详细信息的上下文块
 */
function expandMentionsInMessage(input: string, nodes: Node[]): string {
  if (!input.includes("@[")) return input

  let expanded = input
  const regex = /@\[(.*?)\]\(node:([a-zA-Z0-9_-]+)\)/g
  let m
  while ((m = regex.exec(input)) !== null) {
    const [, title, nodeId] = m
    const node = nodes.find((n) => n.id === nodeId)
    if (node) {
      const data = node.data as Record<string, unknown> | undefined
      const contextParts: string[] = [`[引用节点: ${title}]`]
      if (data?.summary) contextParts.push(`摘要: ${data.summary}`)
      if (data?.content) contextParts.push(`内容: ${typeof data.content === "string" ? data.content.slice(0, 500) : ""}`)
      if (data?.prompt) contextParts.push(`提示词: ${typeof data.prompt === "string" ? data.prompt.slice(0, 300) : ""}`)
      if (data?.nodeKind) contextParts.push(`类型: ${data.nodeKind}`)
      // Shot-specific details
      if (data?.shot) {
        const shot = data.shot as Record<string, any>
        if (shot.shotType) contextParts.push(`景别: ${shot.shotType}`)
        if (shot.cameraMovement) contextParts.push(`运镜: ${shot.cameraMovement}`)
        if (shot.duration) contextParts.push(`时长: ${shot.duration}`)
        if (shot.description) contextParts.push(`描述: ${String(shot.description).slice(0, 200)}`)
        if (shot.visualPrompt) contextParts.push(`视觉提示词: ${String(shot.visualPrompt).slice(0, 300)}`)
      }
      expanded = expanded.replace(m[0], contextParts.filter(Boolean).join("\n"))
    }
  }
  return expanded
}

function getMentionedNodes(input: string, nodes: Node[]): CanvasNodeContextSnapshot[] {
  if (!input.includes("@")) return []

  const mentionedIds = parseMentions(input)

  return nodes
    .filter((node) => {
      // 精确匹配 node id（新格式）
      if (mentionedIds.includes(node.id)) return true
      // 兼容旧格式：@title 或 @nodeId
      const title = getNodeTitle(node)
      return input.includes(`@${title}`) || input.includes(`@${node.id}`)
    })
    .map(toCanvasNodeContext)
}

interface GeneratedImage {
  imageUrl: string
  prompt: string
  model: string
  revisedPrompt?: string
}

interface Message {
  id: string
  role: "user" | "assistant"
  content: string
  attachments?: ChatAttachment[]
  thinkingTime?: number // 思考时间（秒）
  generatedImage?: GeneratedImage // AI 生成的图片
  actions?: ChatCanvasAction[] // AI 返回的画布操作
  actionsApplied?: boolean // 是否已应用到画布
  actionsCancelled?: boolean // 用户是否取消了操作
  actionsReport?: ApplyActionsReport // 执行报告
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number } // Token 消耗
}

const DEFAULT_MODEL_OPTIONS: StoredModelOption[] = [
  { value: "gpt-5.5", label: "GPT-5.5", provider: "default", desc: "最强推理+创作", type: "text" },
  { value: "gpt-5.4", label: "GPT-5.4", provider: "default", desc: "高性能多模态", type: "text" },
  { value: "gpt-5.4-mini", label: "GPT-5.4 Mini", provider: "default", desc: "快速响应", type: "text" },
  { value: "gpt-image-2", label: "gpt-image-2", provider: "default", desc: "高质量图像生成", type: "image" },
]

function getPendingClarificationStorageKey(conversationId: string): string {
  return `starcanvas:pending-clarification:${conversationId}`
}

function getCurrentConversationStorageKey(): string {
  if (typeof window === "undefined") return "starcanvas:chat-current-conversation:server"
  const projectId = new URLSearchParams(window.location.search).get("projectId")
  const scope = projectId || window.location.pathname || "default"
  return `starcanvas:chat-current-conversation:${encodeURIComponent(scope)}`
}

function readCurrentConversationId(): string | null {
  if (typeof window === "undefined") return null
  try {
    const value = window.sessionStorage.getItem(getCurrentConversationStorageKey())
    return value?.trim() || null
  } catch {
    return null
  }
}

function saveCurrentConversationId(conversationId: string): void {
  if (typeof window === "undefined") return
  try {
    window.sessionStorage.setItem(getCurrentConversationStorageKey(), conversationId)
  } catch {
    // Ignore unavailable sessionStorage.
  }
}

function readPendingClarificationSnapshot(
  conversationId: string,
): PendingClarificationSnapshot | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.sessionStorage.getItem(getPendingClarificationStorageKey(conversationId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<PendingClarificationSnapshot>
    if (
      typeof parsed.clarificationId !== "string" ||
      typeof parsed.messageId !== "string" ||
      typeof parsed.question !== "string" ||
      typeof parsed.createdAt !== "number"
    ) {
      return null
    }
    return {
      clarificationId: parsed.clarificationId,
      threadId: typeof parsed.threadId === "string" ? parsed.threadId : undefined,
      messageId: parsed.messageId,
      question: parsed.question,
      options: Array.isArray(parsed.options)
        ? parsed.options.filter((option): option is string => typeof option === "string")
        : undefined,
      createdAt: parsed.createdAt,
    }
  } catch {
    return null
  }
}

function savePendingClarificationSnapshot(
  conversationId: string,
  snapshot: PendingClarificationSnapshot,
): void {
  if (typeof window === "undefined") return
  try {
    window.sessionStorage.setItem(
      getPendingClarificationStorageKey(conversationId),
      JSON.stringify(snapshot),
    )
  } catch {
    // Ignore unavailable sessionStorage.
  }
}

function clearPendingClarificationSnapshot(conversationId: string): void {
  if (typeof window === "undefined") return
  try {
    window.sessionStorage.removeItem(getPendingClarificationStorageKey(conversationId))
  } catch {
    // Ignore unavailable sessionStorage.
  }
}

interface ChatPanelProps {
  isOpen: boolean
  onClose: () => void
  selectedNodeId?: string | null
  selectedNode?: Node | null
  canvasNodes?: Node[] // 画布上所有节点，用于AI感知
  assets?: AssetItem[] // 素材库资产，用于 @asset_ 引用
  onAddImageToCanvas: (attachment: ChatAttachment) => void
  onApplyChatActions?: (actions: ChatCanvasAction[]) => ApplyActionsReport // 返回执行报告
  showHistoryFromOutside?: boolean
  onHistoryPanelClosed?: () => void
  agentMode?: "ask" | "max" | "preview"
  onAgentModeChange?: (mode: "ask" | "max" | "preview") => void
}

export function ChatPanel({
  isOpen,
  onClose,
  selectedNodeId,
  selectedNode,
  canvasNodes = [],
  assets = [],
  onAddImageToCanvas,
  onApplyChatActions,
  showHistoryFromOutside,
  onHistoryPanelClosed,
  agentMode = "ask",
  onAgentModeChange,
}: ChatPanelProps) {
  const [input, setInput] = useState("")
  const [messages, setMessages] = useState<Message[]>([])
  const [conversationTitle, setConversationTitle] = useState("新对话")
  const [conversationId, setConversationId] = useState(() => readCurrentConversationId() ?? generateId())
  const [selectedModel, setSelectedModel] = useState<string>("gpt-5.5")
  const [showHistory, setShowHistory] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const thinkingStartRef = useRef<number | null>(null)
  const pendingClarificationRef = useRef<PendingClarificationSnapshot | null>(null)
  const [pendingClarification, setPendingClarification] = useState<PendingClarificationSnapshot | null>(null)

  useEffect(() => {
    saveCurrentConversationId(conversationId)
    const snapshot = readPendingClarificationSnapshot(conversationId)
    pendingClarificationRef.current = snapshot
    setPendingClarification(snapshot)
  }, [conversationId])

  // 生成画布节点摘要
  const nodeSummary = useMemo(() => {
    if (!canvasNodes || canvasNodes.length === 0) return null
    const imageNodes = canvasNodes.filter((n) => n.type === "image")
    const contentNodes = canvasNodes.filter((n) => n.type === "content")
    const parts: string[] = []
    imageNodes.forEach((n) => {
      const title = n.data?.title || n.data?.fileName || "图片"
      parts.push(`[图片] ${title}`)
    })
    contentNodes.forEach((n) => {
      const data = n.data as Record<string, any> | undefined
      const nodeKind = data?.nodeKind || "text"
      const content = data?.content || data?.prompt || ""
      const preview = content.length > 30 ? content.slice(0, 30) + "..." : content
      parts.push(`[${nodeKind === "prompt" ? "提示词" : "文本"}] ${preview || "内容"}`)
    })
    return parts
  }, [canvasNodes])

  // 同步外部传入的 showHistory 状态
  useEffect(() => {
    if (showHistoryFromOutside !== undefined) {
      setShowHistory(showHistoryFromOutside)
    }
  }, [showHistoryFromOutside])

  // 会话历史 — 当前版本不持久化，用户开始新对话后显示在列表中
  const [conversations, setConversations] = useState<Array<{ id: string; title: string; timestamp: number }>>([])

  // Chat 附件 hook
  const attachmentsState = useChatAttachments()

  // SSE Chat hook
  const { sendMessage, isStreaming, abort } = useChatSSE({
    onMessage: (content) => {
      setMessages((prev) => {
        const lastIdx = prev.length - 1
        if (lastIdx >= 0 && prev[lastIdx].role === "assistant") {
          const updated = [...prev]
          updated[lastIdx] = {
            ...updated[lastIdx],
            content: updated[lastIdx].content + content,
          }
          return updated
        }
        return prev
      })
    },
    onImageGenerated: (data) => {
      // Add the generated image to the latest assistant message
      setMessages((prev) => {
        const lastIdx = prev.length - 1
        if (lastIdx >= 0 && prev[lastIdx].role === "assistant") {
          const updated = [...prev]
          updated[lastIdx] = {
            ...updated[lastIdx],
            generatedImage: {
              imageUrl: data.imageUrl,
              prompt: data.prompt,
              model: data.model,
              revisedPrompt: data.revisedPrompt,
            },
          }
          return updated
        }
        return prev
      })
    },
    onUsage: (usage) => {
      const finishedAt = new Date()
      // Store token usage on the latest assistant message
      setMessages((prev) => {
        const lastIdx = prev.length - 1
        if (lastIdx >= 0 && prev[lastIdx].role === "assistant") {
          const updated = [...prev]
          updated[lastIdx] = {
            ...updated[lastIdx],
            usage: {
              prompt_tokens: usage.prompt_tokens,
              completion_tokens: usage.completion_tokens,
              total_tokens: usage.total_tokens,
            },
          }
          return updated
        }
        return prev
      })
      useAIUsageStore.getState().addUsageRecord({
        id: `usage-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        provider: "chat",
        model: selectedModel,
        taskType: "text",
        inputTokens: usage.prompt_tokens,
        outputTokens: usage.completion_tokens,
        totalTokens: usage.total_tokens,
        estimatedCostUsd: estimateCostUsd({
          provider: "chat",
          model: selectedModel,
          taskType: "text",
          inputTokens: usage.prompt_tokens,
          outputTokens: usage.completion_tokens,
        }),
        currency: "USD",
        startedAt: finishedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        status: "success",
      })
    },
    onComplete: (fullContent) => {
      if (thinkingStartRef.current) {
        const elapsed = Math.round((Date.now() - thinkingStartRef.current) / 1000)
        setMessages((prev) => {
          const lastIdx = prev.length - 1
          if (lastIdx >= 0 && prev[lastIdx].role === "assistant") {
            const actions = parseCanvasActions(fullContent)
            const updated = [...prev]
            updated[lastIdx] = {
              ...updated[lastIdx],
              thinkingTime: elapsed,
              // Store parsed actions and strip the JSON block from visible content
              ...(actions && actions.length > 0
                ? { actions, content: stripCanvasActions(updated[lastIdx].content) }
                : {}),
            }
            return updated
          }
          return prev
        })
        thinkingStartRef.current = null
      } else {
        // no thinking time tracked, still parse actions
        const actions = parseCanvasActions(fullContent)
        if (actions && actions.length > 0) {
          setMessages((prev) => {
            const lastIdx = prev.length - 1
            if (lastIdx >= 0 && prev[lastIdx].role === "assistant") {
              const updated = [...prev]
              updated[lastIdx] = {
                ...updated[lastIdx],
                actions,
                content: stripCanvasActions(updated[lastIdx].content),
              }
              return updated
            }
            return prev
          })
        }
      }
    },
    onError: (error) => {
      console.error("[Chat SSE Error]", error)
      setMessages((prev) => [
        ...prev,
        {
          id: generateId(),
          role: "assistant",
          content: `抱歉，发生了错误: ${error.message}`,
        },
      ])
    },
  })

  // 滚动到底部
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, isStreaming, scrollToBottom])

  // 发送消息
  const handleSend = useCallback(async (model: string, mode: ChatTaskMode = "chat") => {
    if (!input.trim() && attachmentsState.attachments.length === 0) return

    const rawUserContent = input.trim()
    const setupIntent = parseProviderSetupIntent(rawUserContent)
    const userMessage: Message = {
      id: generateId(),
      role: "user",
      content: setupIntent.redactedMessage,
      attachments: [...attachmentsState.attachments],
    }

    const assistantMessageId = generateId()

    setMessages((prev) => [...prev, userMessage])
    setInput("")
    attachmentsState.clearAttachments()

    // 添加空的助手消息
    setMessages((prev) => [
      ...prev,
      {
        id: assistantMessageId,
        role: "assistant",
        content: mode === "image" ? "🎨 正在生成图片..." : "",
      },
    ])

    thinkingStartRef.current = Date.now()

    try {
      if (mode === "image") {
        const startedAt = Date.now()
        const result = await generateImageFromPrompt({
          prompt: userMessage.content,
          model,
          size: "1792x1024",
          requestId: `chat-image-${assistantMessageId}`,
        })

        setMessages((prev) =>
          prev.map((message) =>
            message.id === assistantMessageId
              ? {
                  ...message,
                  content: "✅ 图片生成完成。点击下方按钮可添加到画布。",
                  thinkingTime: Math.round((Date.now() - startedAt) / 1000),
                  generatedImage: {
                    imageUrl: result.imageUrl,
                    prompt: result.prompt || userMessage.content,
                    model: result.model || model,
                    revisedPrompt: result.revisedPrompt,
                  },
                }
              : message,
          ),
        )
        useAIUsageStore.getState().addUsageRecord({
          id: `usage-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          runId: assistantMessageId,
          provider: "chat",
          model: result.model || model,
          taskType: "image",
          imageCount: 1,
          estimatedCostUsd: estimateCostUsd({
            provider: "chat",
            model: result.model || model,
            taskType: "image",
            imageCount: 1,
          }),
          currency: "USD",
          startedAt: new Date(startedAt).toISOString(),
          finishedAt: new Date().toISOString(),
          status: "success",
        })
        return
      }

      if (mode === "chat" && setupIntent.shouldHandleLocally) {
        if (Object.keys(setupIntent.updates).length > 0) {
          const result = applyProviderSetup(
            {
              ...setupIntent.updates,
              openSettings: setupIntent.openSettings,
            },
            getStoredModelOptions(DEFAULT_MODEL_OPTIONS),
          )

          setMessages((prev) =>
            prev.map((message) =>
              message.id === assistantMessageId
                ? {
                    ...message,
                    content: [
                      result.summary,
                      setupIntent.detectedProviderLabel
                        ? `- 已按 ${setupIntent.detectedProviderLabel} 的常见中转站地址帮你预填。`
                        : null,
                    ].filter(Boolean).join("\n"),
                    thinkingTime: Math.max(1, Math.round((Date.now() - (thinkingStartRef.current ?? Date.now())) / 1000)),
                  }
                : message,
            ),
          )

          if (result.selectedModel) {
            setSelectedModel(result.selectedModel)
          }
          thinkingStartRef.current = null
          return
        }

        if (setupIntent.openSettings) {
          openProviderSettings()
          setMessages((prev) =>
            prev.map((message) =>
              message.id === assistantMessageId
                ? {
                    ...message,
                    content: "已为你打开模型设置面板。你可以继续直接对我说“帮我把 OpenRouter 的 key xxx 配到星轨画布，文本模型用 xxx，图片模型用 xxx”，我会继续帮你填好。",
                    thinkingTime: Math.max(1, Math.round((Date.now() - (thinkingStartRef.current ?? Date.now())) / 1000)),
                  }
                : message,
            ),
          )
          thinkingStartRef.current = null
          return
        }
      }

      const canvasContext = canvasNodes.slice(0, 30).map(toCanvasNodeContext)
      const mentionedNodes = getMentionedNodes(rawUserContent, canvasNodes)
      const answeredClarificationSnapshot = pendingClarificationRef.current && rawUserContent
        ? pendingClarificationRef.current
        : null
      const clarificationAnswerContext = answeredClarificationSnapshot
        ? buildClarificationAnswerContext({
            clarificationId: answeredClarificationSnapshot.clarificationId,
            threadId: answeredClarificationSnapshot.threadId,
            question: answeredClarificationSnapshot.question,
            options: answeredClarificationSnapshot.options,
            answer: setupIntent.redactedMessage,
          })
        : undefined
      const clarificationResumePayload = answeredClarificationSnapshot
        ? buildClarificationResumePayload({
            snapshot: answeredClarificationSnapshot,
            answer: setupIntent.redactedMessage,
          })
        : undefined
      // 展开 @[title](node:id) 引用为详细上下文，再发送给 AI
      const expandedContent = [
        clarificationAnswerContext,
        expandMentionsInMessage(setupIntent.redactedMessage, canvasNodes),
      ].filter(Boolean).join("\n\n")
      const sendFallbackChat = () => sendMessage(expandedContent, {
        selectedNodeId,
        selectedNode: selectedNode ? toCanvasNodeContext(selectedNode) : undefined,
        nodes: canvasContext,
        mentionedNodes,
        canvasStats: {
          total: canvasNodes.length,
          byKind: canvasNodes.reduce<Record<string, number>>((acc, node) => {
            const data = node.data as Record<string, any> | undefined
            const kind = String(data?.nodeKind || node.type || "node")
            acc[kind] = (acc[kind] || 0) + 1
            return acc
          }, {}),
        },
        attachments: userMessage.attachments?.map((a) => ({
          id: a.id,
          type: a.type,
          name: a.name,
          size: a.size,
          mimeType: a.mimeType,
          width: a.width,
          height: a.height,
          textContent: a.textContent,
        })),
        pendingClarificationAnswer: clarificationResumePayload,
        model,
        mode,
      })

      if (mode === "chat") {
        const startedAt = Date.now()
        let handledByAutoAgent = false
        let fallbackChatSent = false

        await processWithAutoAgent(expandedContent, {
          canvasContext: {
            selectedNode: selectedNode ? toCanvasNodeContext(selectedNode) : undefined,
            nodes: canvasContext,
            mentionedNodes,
            canvasStats: {
              total: canvasNodes.length,
              byKind: canvasNodes.reduce<Record<string, number>>((acc, node) => {
                const data = node.data as Record<string, any> | undefined
                const kind = String(data?.nodeKind || node.type || "node")
                acc[kind] = (acc[kind] || 0) + 1
                return acc
              }, {}),
            },
            pendingClarificationAnswer: clarificationResumePayload,
          },
          imageModel: model,
          onProgress: (status) => {
            setMessages((prev) =>
              prev.map((message) =>
                message.id === assistantMessageId
                  ? { ...message, content: status }
                  : message,
              ),
            )
          },
          onText: (text) => {
            handledByAutoAgent = true
            setMessages((prev) =>
              prev.map((message) =>
                message.id === assistantMessageId
                  ? {
                      ...message,
                      content: text,
                      thinkingTime: Math.max(1, Math.round((Date.now() - startedAt) / 1000)),
                    }
                  : message,
              ),
            )
          },
          onImageGenerated: (data) => {
            handledByAutoAgent = true
            setMessages((prev) =>
              prev.map((message) =>
                message.id === assistantMessageId
                  ? {
                      ...message,
                      content: "✅ 图片生成完成。点击下方按钮可添加到画布。",
                      thinkingTime: Math.max(1, Math.round((Date.now() - startedAt) / 1000)),
                      generatedImage: {
                        imageUrl: data.imageUrl,
                        prompt: data.prompt,
                        model: data.model,
                        revisedPrompt: data.revisedPrompt,
                      },
                    }
                  : message,
              ),
            )
          },
          onActions: (actions) => {
            handledByAutoAgent = true
            const shouldAutoApply = shouldAutoApplyAutoAgentActions(agentMode, actions)
            let report: ApplyActionsReport | undefined
            if (shouldAutoApply && onApplyChatActions) {
              report = onApplyChatActions(actions)
            }
            setMessages((prev) =>
              prev.map((message) =>
                message.id === assistantMessageId
                  ? {
                      ...message,
                      actions,
                      actionsApplied: Boolean(report),
                      actionsReport: report,
                      thinkingTime: Math.max(1, Math.round((Date.now() - startedAt) / 1000)),
                    }
                  : message,
              ),
            )
            return report
          },
          onFallbackChat: async () => {
            fallbackChatSent = true
            await sendFallbackChat()
          },
          onComplete: () => {
            thinkingStartRef.current = null
          },
        })

        if (
          shouldClearPendingClarificationAfterAnswer({
            answeredClarificationId: answeredClarificationSnapshot?.clarificationId,
            currentPendingClarificationId: pendingClarificationRef.current?.clarificationId ?? null,
          })
        ) {
          pendingClarificationRef.current = null
          setPendingClarification(null)
          clearPendingClarificationSnapshot(conversationId)
        }

        if (handledByAutoAgent || fallbackChatSent) return
      }

      await sendFallbackChat()
    } catch (error: any) {
      console.error("[Chat] Send error:", error)
      setMessages((prev) =>
        prev.map((message) =>
          message.id === assistantMessageId
            ? {
                ...message,
                content: error?.message || "生成失败，请稍后重试。",
              }
            : message,
        ),
      )
    }
  }, [
    input,
    attachmentsState,
    selectedNodeId,
    selectedNode,
    canvasNodes,
    sendMessage,
    agentMode,
    onApplyChatActions,
  ])

  // 停止生成
  const handleStop = useCallback(() => {
    abort()
  }, [abort])

  // 复制消息
  const handleCopyMessage = useCallback((content: string) => {
    navigator.clipboard.writeText(content)
  }, [])

  // Hydration fix: only render Portal after client mount
  const [isClient, setIsClient] = useState(false)
  // P0-3: Mock mode indicator — read from localStorage, listen for settings changes
  const [isMockMode, setIsMockMode] = useState(false)
  useEffect(() => { setIsClient(true) }, [])

  // P0-3: sync mock state from localStorage, listen for SettingsPanel changes
  useEffect(() => {
    const readMock = () => {
      return readUseMockPreference()
    }
    setIsMockMode(readMock())
    const handler = () => setIsMockMode(readMock())
    window.addEventListener("startrails-settings-updated", handler)
    return () => window.removeEventListener("startrails-settings-updated", handler)
  }, [])

  // 应用 AI actions 到画布，接收执行报告
  const handleApplyActions = useCallback(
    (msgId: string, actions: ChatCanvasAction[]) => {
      if (!onApplyChatActions) return
      const normalizedActions = actions.map((action, actionIndex) =>
        isAskClarificationAction(action)
          ? normalizeAskClarificationAction(action, {
              messageId: msgId,
              conversationId,
              actionIndex,
            })
          : action,
      )
      const report = onApplyChatActions(normalizedActions)
      const clarification = normalizedActions.find(isAskClarificationAction)
      if (clarification) {
        const snapshot = buildPendingClarificationSnapshot({
          action: clarification as AskClarificationAction,
          messageId: msgId,
          conversationId,
          createdAt: Date.now(),
        })
        pendingClarificationRef.current = snapshot
        setPendingClarification(snapshot)
        savePendingClarificationSnapshot(conversationId, snapshot)
      }
      // 标记为已应用，并保存报告
      setMessages((prev) =>
        prev.map((m) => (m.id === msgId ? { ...m, actions: normalizedActions, actionsApplied: true, actionsReport: report } : m))
      )
    },
    [conversationId, onApplyChatActions]
  )

  const handleClarificationOption = useCallback(
    (msgId: string, clarification: ChatCanvasAction, answer: string) => {
      const nextActions = buildAutoAgentClarificationResponseActions(clarification, answer)
      let report: ApplyActionsReport | undefined
      const shouldAutoApply = shouldAutoApplyClarificationSelection(agentMode, nextActions)
      if (shouldAutoApply && onApplyChatActions) {
        report = onApplyChatActions(nextActions)
      }

      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId
            ? {
                ...m,
                content: `已选择：${answer}`,
                actions: nextActions,
                actionsApplied: Boolean(report),
                actionsCancelled: false,
                actionsReport: report,
              }
            : m,
        ),
      )
      pendingClarificationRef.current = null
      setPendingClarification(null)
      clearPendingClarificationSnapshot(conversationId)
    },
    [agentMode, conversationId, onApplyChatActions],
  )

  // 取消 AI actions
  const handleCancelActions = useCallback(
    (msgId: string) => {
      if (pendingClarificationRef.current?.messageId === msgId) {
        pendingClarificationRef.current = null
        setPendingClarification(null)
        clearPendingClarificationSnapshot(conversationId)
      }
      setMessages((prev) =>
        prev.map((m) => (m.id === msgId ? { ...m, actionsCancelled: true } : m))
      )
    },
    [conversationId]
  )

  // 将附件添加到画布
  const handleAddToCanvas = useCallback(
    (attachment: ChatAttachment) => {
      onAddImageToCanvas(attachment)
      attachmentsState.removeAttachment(attachment.id)
    },
    [onAddImageToCanvas, attachmentsState]
  )

  if (!isOpen) return null
  if (!isClient) return null // hydration fix: don't render Portal during SSR
  if (typeof document === "undefined") return null

  return createPortal(
    <div
      data-testid="chat-panel"
      className="fixed bottom-0 right-0 top-0 flex flex-col border-l"
      style={{
        width: "400px",
        backgroundColor: DESIGN_TOKENS.panelSolid,
        borderColor: DESIGN_TOKENS.border,
        zIndex: DESIGN_TOKENS.zIndex.panel,
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between border-b px-5 py-3"
        style={{ borderColor: DESIGN_TOKENS.border, minHeight: "52px" }}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium" style={{ color: DESIGN_TOKENS.text }}>
            {conversationTitle}
          </span>
          {/* P0-3: Mock mode indicator */}
          {isMockMode && (
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-medium"
              style={{
                backgroundColor: "rgba(245,158,11,0.15)",
                color: "#fbbf24",
                border: "0.5px solid rgba(245,158,11,0.3)",
              }}
              title="模拟模式已启用 — 不会调用真实 API"
            >
              Mock
            </span>
          )}
          {/* Agent 模式切换器集成到 header */}
          {onAgentModeChange && (
            <AgentModeSwitcher
              activeMode={agentMode}
              onChange={onAgentModeChange}
            />
          )}
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              // 保存当前会话
              if (messages.length > 0) {
                setConversations((prev) => [
                  { id: generateId(), title: conversationTitle, timestamp: Date.now() },
                  ...prev,
                ])
              }
              // 开始新会话
              const nextConversationId = generateId()
              setMessages([])
              setConversationTitle("新对话")
              setInput("")
              setConversationId(nextConversationId)
              pendingClarificationRef.current = null
              setPendingClarification(null)
              clearPendingClarificationSnapshot(conversationId)
            }}
            className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-white/5"
            style={{ color: ICON_CONFIG.color }}
            title="新会话"
          >
            <Plus size={ICON_CONFIG.size} strokeWidth={ICON_CONFIG.strokeWidth} />
          </button>
          <button
            onClick={() => {
              const next = !showHistory
              setShowHistory(next)
              if (!next) onHistoryPanelClosed?.()
            }}
            className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-white/5"
            style={{
              color: showHistory ? DESIGN_TOKENS.accent : ICON_CONFIG.color,
              backgroundColor: showHistory ? "rgba(100,116,139,0.1)" : "transparent",
            }}
            title="历史记录"
          >
            <MessageSquarePlus size={ICON_CONFIG.size} strokeWidth={ICON_CONFIG.strokeWidth} />
          </button>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-white/5"
            style={{ color: ICON_CONFIG.color }}
            title="关闭"
          >
            <PanelRightClose size={ICON_CONFIG.size} strokeWidth={ICON_CONFIG.strokeWidth} />
          </button>
        </div>
      </div>

      {/* 历史记录面板 */}
      {showHistory && (
        <div
          className="border-b"
          style={{ borderColor: DESIGN_TOKENS.border, maxHeight: "200px", overflowY: "auto" }}
        >
          <div className="px-5 py-3">
            <p className="mb-2 text-xs font-medium uppercase tracking-wider" style={{ color: DESIGN_TOKENS.textMuted }}>
              历史会话
            </p>
            <div className="flex flex-col gap-1">
              {conversations.map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => {
                    setConversationTitle(conv.title)
                    setShowHistory(false)
                    onHistoryPanelClosed?.()
                  }}
                  className="flex items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-white/5"
                  style={{ color: DESIGN_TOKENS.textSecondary }}
                >
                  <span className="truncate">{conv.title}</span>
                  <span className="text-[10px] flex-shrink-0" style={{ color: DESIGN_TOKENS.textMuted }}>
                    {new Date(conv.timestamp).toLocaleDateString("zh-CN", { month: "short", day: "numeric" })}
                  </span>
                </button>
              ))}
              {conversations.length === 0 && (
                <div className="px-3 py-6 text-center">
                  <p className="text-xs mb-1" style={{ color: DESIGN_TOKENS.textSecondary }}>
                    暂无历史对话
                  </p>
                  <p className="text-[10px]" style={{ color: DESIGN_TOKENS.textMuted }}>
                    开始一次新的创作对话后，这里会显示你的会话记录。
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Selected Node Context */}
      {selectedNode && (
        <div
          className="mx-5 mt-4 flex items-center gap-3 rounded-xl px-4 py-3"
          style={{
            backgroundColor: DESIGN_TOKENS.accentSoft,
            border: `1px solid ${DESIGN_TOKENS.borderAccent}`,
          }}
        >
          <div
            className="flex h-8 w-8 items-center justify-center rounded-lg"
            style={{ backgroundColor: DESIGN_TOKENS.accent }}
          >
            <div className="h-2 w-2 rounded-full bg-white" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium" style={{ color: DESIGN_TOKENS.text }}>
              {selectedNode.type === "shot" ? "当前镜头" : "已选中节点"}
            </p>
            <p className="text-xs" style={{ color: DESIGN_TOKENS.textMuted }}>
              {String(selectedNode.data?.title || selectedNode.type || "未命名节点")}
              {(selectedNode.data?.shot as Record<string, any> | undefined) && (
                <span style={{ color: DESIGN_TOKENS.accent }}>
                  {(selectedNode.data?.shot as Record<string, any>).shotType ? ` · ${(selectedNode.data?.shot as Record<string, any>).shotType}` : ""}
                  {(selectedNode.data?.shot as Record<string, any>).cameraMovement ? ` · ${(selectedNode.data?.shot as Record<string, any>).cameraMovement}` : ""}
                  {(selectedNode.data?.shot as Record<string, any>).duration ? ` · ${(selectedNode.data?.shot as Record<string, any>).duration}` : ""}
                </span>
              )}
            </p>
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-5">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col justify-end pb-4">
            {/* TapNow 风格欢迎语 - AI 感知画布节点 */}
            <div className="flex flex-col gap-3">
              {/* 节点读取状态 */}
              {nodeSummary && nodeSummary.length > 0 && (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-1.5 text-xs" style={{ color: DESIGN_TOKENS.textMuted }}>
                    <span>已读取节点</span>
                    <ChevronDown size={12} />
                  </div>
                  <div className="flex flex-col gap-1.5 rounded-lg border p-3" style={{ borderColor: DESIGN_TOKENS.border }}>
                    <p className="text-sm" style={{ color: DESIGN_TOKENS.textSecondary }}>
                      看到了！画布上有{canvasNodes?.length}个节点：
                    </p>
                    {nodeSummary.map((summary, idx) => (
                      <div key={idx} className="text-sm" style={{ color: DESIGN_TOKENS.text }}>
                        {summary}
                      </div>
                    ))}
                    <p className="mt-1 text-sm" style={{ color: DESIGN_TOKENS.textSecondary }}>
                      你想用它们做什么？比如：
                    </p>
                    <ul className="flex flex-col gap-1 text-sm" style={{ color: DESIGN_TOKENS.textMuted }}>
                      <li>为其中某个节点生成更多内容？</li>
                      <li>制作角色参考视频？</li>
                      <li>还是有其他创作方向？</li>
                    </ul>
                  </div>
                </div>
              )}

              {/* 空画布时的默认欢迎 */}
              {(!nodeSummary || nodeSummary.length === 0) && (
                <>
                  <h3 className="text-xl font-medium" style={{ color: DESIGN_TOKENS.text }}>
                    先连接你的模型，或直接开始创作
                  </h3>
                  <p className="text-sm" style={{ color: DESIGN_TOKENS.textSecondary }}>
                    你可以让我直接帮你配置中转站，也可以让我一起写脚本、拆分镜、生成图片和视频。
                  </p>
                  <div className="rounded-xl border px-3 py-3 text-sm leading-6" style={{ borderColor: DESIGN_TOKENS.border, color: DESIGN_TOKENS.textSecondary }}>
                    <div>可以直接这样说：</div>
                    <div style={{ color: DESIGN_TOKENS.text }}>
                      帮我把 OpenRouter 的 key sk-xxxx 配到星轨画布，文本模型用 openai/gpt-4.1-mini，图片模型用 flux-dev
                    </div>
                    <div style={{ color: DESIGN_TOKENS.text }}>
                      帮我打开模型设置，我要配置自己的中转站
                    </div>
                  </div>
                  <ul className="flex flex-col gap-1.5 text-sm" style={{ color: DESIGN_TOKENS.textSecondary }}>
                    <li>帮我把一段口播脚本拆成分镜</li>
                    <li>根据参考图设计角色和场景</li>
                    <li>规划一条完整的视频创作工作流</li>
                  </ul>
                </>
              )}
              {/* 输入引导提示 */}
              <div className="mt-4 rounded-lg border px-3 py-2 text-xs" style={{ borderColor: DESIGN_TOKENS.borderAccent, backgroundColor: "rgba(100,116,139,0.06)" }}>
                <span style={{ color: DESIGN_TOKENS.accent }}>↓ 在下方输入你的创作需求，按 Enter 发送</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div className="flex max-w-[90%] flex-col gap-1.5">
                  {/* 思考时间指示器 */}
                  {msg.role === "assistant" && msg.thinkingTime !== undefined && msg.thinkingTime > 0 && (
                    <div className="flex items-center gap-1.5 px-1">
                      <div
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ backgroundColor: DESIGN_TOKENS.accent }}
                      />
                      <span className="text-[11px]" style={{ color: DESIGN_TOKENS.textMuted }}>
                        思考了 {msg.thinkingTime} 秒
                      </span>
                      <ChevronDown size={12} strokeWidth={1.5} style={{ color: DESIGN_TOKENS.textMuted }} />
                    </div>
                  )}

                  {/* Token 消耗指示器 */}
                  {msg.role === "assistant" && msg.usage && (
                    <div className="flex items-center gap-1 px-1">
                      <span className="text-[10px]" style={{ color: DESIGN_TOKENS.textMuted, opacity: 0.5 }}>
                        {msg.usage.total_tokens.toLocaleString()} tokens
                      </span>
                    </div>
                  )}

                  {/* 消息气泡 */}
                  <div
                    className="rounded-2xl px-4 py-3"
                    style={{
                      backgroundColor:
                        msg.role === "user"
                          ? DESIGN_TOKENS.accent
                          : DESIGN_TOKENS.card,
                      color: msg.role === "user" ? "#fff" : DESIGN_TOKENS.text,
                    }}
                  >
                    {msg.content && (
                      <p className="whitespace-pre-wrap text-sm leading-relaxed">
                        {parseReferences(msg.content, canvasNodes, assets)}
                      </p>
                    )}
                    {msg.content === "" && isStreaming && (
                      <div className="flex items-center gap-2 py-1">
                        <div
                          className="h-2 w-2 animate-pulse rounded-full"
                          style={{ backgroundColor: DESIGN_TOKENS.accent }}
                        />
                        <span className="text-xs" style={{ color: DESIGN_TOKENS.textMuted }}>
                          思考中...
                        </span>
                      </div>
                    )}

                    {/* Generated Image Display */}
                    {msg.generatedImage && (
                      <div className="mt-3 flex flex-col gap-2">
                        <div
                          className="relative overflow-hidden rounded-xl border"
                          style={{ borderColor: DESIGN_TOKENS.border }}
                        >
                          <img
                            src={msg.generatedImage.imageUrl}
                            alt={msg.generatedImage.prompt}
                            className="w-full object-contain"
                            style={{ maxHeight: "280px" }}
                          />
                        </div>
                        <button
                          onClick={() => {
                            const img = msg.generatedImage!
                            onAddImageToCanvas({
                              id: generateId(),
                              type: "image",
                              name: `AI生成-${img.model}`,
                              src: img.imageUrl,
                              size: 0,
                              mimeType: "image/png",
                              width: 1024,
                              height: 1024,
                            })
                          }}
                          className="flex items-center gap-2 self-start rounded-lg px-3 py-1.5 text-xs transition-colors"
                          style={{
                            backgroundColor: "rgba(100,116,139,0.15)",
                            color: DESIGN_TOKENS.accent,
                            border: `1px solid ${DESIGN_TOKENS.borderAccent}`,
                          }}
                        >
                          <PlusCircle size={14} strokeWidth={1.5} />
                          添加到画布
                        </button>
                      </div>
                    )}
                  </div>

                  {/* 消息操作按钮 */}
                  {msg.role === "assistant" && msg.content && (
                    <div className="flex flex-col gap-1.5 px-1">
                      {/* 画布操作确认/执行/结果面板 */}
                      {msg.actions && msg.actions.length > 0 && onApplyChatActions && (
                        <div className="flex flex-col gap-1">
                          {/* 状态A：已取消 */}
                          {msg.actionsCancelled ? (
                            <div
                              className="flex items-center gap-2 self-start rounded-lg px-3 py-1.5 text-xs font-medium"
                              style={{
                                color: DESIGN_TOKENS.textMuted,
                                backgroundColor: "rgba(100,116,139,0.08)",
                                border: `1px solid ${DESIGN_TOKENS.border}`,
                              }}
                            >
                              <span>⊘ 已取消（{msg.actions.length} 个操作）</span>
                            </div>
                          ) : msg.actionsApplied ? (
                            <>
                              {/* 状态B：已执行 — 显示结果报告 */}
                              {msg.actionsReport && (
                                <div
                                  className="rounded-lg border px-3 py-2 text-[11px]"
                                  style={{
                                    borderColor: DESIGN_TOKENS.border,
                                    backgroundColor: "rgba(255,255,255,0.03)",
                                  }}
                                >
                                  <p className="font-medium" style={{ color: DESIGN_TOKENS.textSecondary }}>
                                    {formatActionsSummary(msg.actionsReport)}
                                  </p>
                                  {msg.actionsReport.results.filter(r => r.status !== "applied").length > 0 && (
                                    <div className="mt-1.5 flex flex-col gap-0.5">
                                      {msg.actionsReport.results
                                        .filter(r => r.status !== "applied")
                                        .map((r) => (
                                          <div key={r.index} className="flex items-center gap-1.5" style={{ color: DESIGN_TOKENS.textMuted }}>
                                            <span>{getStatusIcon(r.status)}</span>
                                            <span>{getActionLabel(r.action)}</span>
                                            {r.reason && <span>— {r.reason}</span>}
                                          </div>
                                        ))}
                                    </div>
                                  )}
                                </div>
                              )}
                            </>
                          ) : (
                            <>
                              {/* 状态C：待确认 — 操作预览 + "执行"/"取消"按钮 */}
                              <div
                                className="rounded-lg border text-[11px]"
                                style={{
                                  borderColor: DESIGN_TOKENS.borderAccent,
                                  backgroundColor: DESIGN_TOKENS.accentSoft,
                                }}
                              >
                                {/* 标题 */}
                                <div
                                  className="flex items-center gap-1.5 border-b px-3 py-2 font-medium"
                                  style={{ borderColor: DESIGN_TOKENS.border, color: DESIGN_TOKENS.accent }}
                                >
                                  <Wand2 size={13} strokeWidth={1.7} />
                                  <span>即将执行以下画布操作</span>
                                </div>

                                {/* 操作列表 */}
                                <div className="flex flex-col px-3 py-2">
                                  {getPendingActionSummaries(msg.actions).map((item) => (
                                    <div
                                      key={item._index}
                                      className="flex items-center gap-2 py-1"
                                      style={{ color: DESIGN_TOKENS.text }}
                                    >
                                      <span
                                        className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-[10px] font-medium"
                                        style={{
                                          backgroundColor: "rgba(100,116,139,0.2)",
                                          color: DESIGN_TOKENS.textMuted,
                                        }}
                                      >
                                        {item._index + 1}
                                      </span>
                                      <span>{item._summary}</span>
                                    </div>
                                  ))}
                                  {msg.actions.map((action, actionIndex) => (
                                    action.action === "ask_clarification" && action.options?.length ? (
                                      <div key={`clarification-${actionIndex}`} className="mt-2 flex flex-wrap gap-1.5">
                                        {action.options.map((option) => (
                                          <button
                                            key={option}
                                            type="button"
                                            onClick={() => handleClarificationOption(msg.id, action, option)}
                                            className="rounded-lg border px-2.5 py-1 text-[11px] font-medium transition hover:bg-white/10"
                                            style={{
                                              borderColor: DESIGN_TOKENS.borderAccent,
                                              color: DESIGN_TOKENS.accent,
                                              backgroundColor: "rgba(100,116,139,0.08)",
                                            }}
                                          >
                                            {option}
                                          </button>
                                        ))}
                                      </div>
                                    ) : null
                                  ))}
                                </div>

                                {/* 操作按钮 */}
                                <div className="flex items-center gap-2 border-t px-3 py-2"
                                  style={{ borderColor: DESIGN_TOKENS.border }}>
                                  <button
                                    onClick={() => handleApplyActions(msg.id, msg.actions!)}
                                    className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all hover:opacity-90"
                                    style={{
                                      backgroundColor: DESIGN_TOKENS.accent,
                                      color: "#fff",
                                    }}
                                  >
                                    执行 {msg.actions.length} 个操作
                                  </button>
                                  <button
                                    onClick={() => handleCancelActions(msg.id)}
                                    className="rounded-lg px-3 py-1.5 text-xs font-medium transition-all hover:bg-white/5"
                                    style={{ color: DESIGN_TOKENS.textMuted }}
                                  >
                                    取消
                                  </button>
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      )}

                      {/* 操作工具栏 */}
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleCopyMessage(msg.content)}
                          className="flex h-6 w-6 items-center justify-center rounded-md transition-colors hover:bg-white/5"
                          style={{ color: DESIGN_TOKENS.textMuted }}
                          title="复制"
                        >
                          <Copy size={12} strokeWidth={1.5} />
                        </button>
                        <button
                          className="flex h-6 w-6 items-center justify-center rounded-md transition-colors hover:bg-white/5"
                          style={{ color: DESIGN_TOKENS.textMuted }}
                          title="赞"
                        >
                          <ThumbsUp size={12} strokeWidth={1.5} />
                        </button>
                        <button
                          className="flex h-6 w-6 items-center justify-center rounded-md transition-colors hover:bg-white/5"
                          style={{ color: DESIGN_TOKENS.textMuted }}
                          title="踩"
                        >
                          <ThumbsDown size={12} strokeWidth={1.5} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t p-5" style={{ borderColor: DESIGN_TOKENS.border }}>
        {pendingClarification && (
          <div
            data-testid="pending-clarification-banner"
            className="mb-3 rounded-lg border px-3 py-2"
            style={{
              borderColor: DESIGN_TOKENS.borderAccent,
              backgroundColor: DESIGN_TOKENS.accentSoft,
            }}
          >
            <div className="mb-1.5 flex items-start gap-2">
              <Wand2 size={14} strokeWidth={1.7} className="mt-0.5 shrink-0" style={{ color: DESIGN_TOKENS.accent }} />
              <div className="min-w-0">
                <p className="text-xs font-medium" style={{ color: DESIGN_TOKENS.accent }}>
                  等待你的确认
                </p>
                <p className="mt-0.5 text-xs leading-relaxed" style={{ color: DESIGN_TOKENS.text }}>
                  {pendingClarification.question}
                </p>
              </div>
            </div>
            {pendingClarification.options?.length ? (
              <div className="flex flex-wrap gap-1.5 pl-6">
                {pendingClarification.options.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setInput(option)}
                    className="rounded-md border px-2 py-1 text-[11px] font-medium transition-colors hover:bg-white/10"
                    style={{
                      borderColor: DESIGN_TOKENS.border,
                      color: DESIGN_TOKENS.textSecondary,
                    }}
                  >
                    {option}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        )}
        <ChatInput
          value={input}
          onChange={setInput}
          onSend={handleSend}
          onStop={handleStop}
          isGenerating={isStreaming}
          selectedModel={selectedModel}
          onModelChange={setSelectedModel}
          attachments={attachmentsState.attachments}
          onAttachmentsChange={attachmentsState}
          isParsing={attachmentsState.isParsing}
          onAddAttachmentToCanvas={handleAddToCanvas}
          placeholder={selectedNodeId ? "根据选中节点提问…" : "输入你的具体需求，例如：把这个故事拆成 12 个分镜…"}
          canvasNodes={canvasNodes}
          assets={assets}
          selectedCount={selectedNodeId ? 1 : 0}
        />
      </div>
    </div>,
    document.body
  )
}
