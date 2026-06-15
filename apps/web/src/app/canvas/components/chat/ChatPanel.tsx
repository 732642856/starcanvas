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
import type { ChatCanvasAction, ApplyActionsReport, ApplyActionResult } from "../../features/canvas/actions/chatActions"
import { getActionLabel, getStatusIcon, formatActionsSummary, formatActionSummary, getPendingActionSummaries } from "../../features/canvas/actions/chatActions"
import { generateImageFromPrompt } from "../../utils/imageGeneration"
import { generateId } from "../../utils/generateId"
import type { Node } from "@xyflow/react"
import type { AssetItem } from "../canvas/types"
import type { CanvasNodeData } from "../canvas/types"
import { AssetPreviewPopover, type ReferenceInfo } from "./AssetPreviewPopover"

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

  return {
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
  const [selectedModel, setSelectedModel] = useState<string>("gpt-5.5")
  const [showHistory, setShowHistory] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const thinkingStartRef = useRef<number | null>(null)

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

    const userMessage: Message = {
      id: generateId(),
      role: "user",
      content: input.trim(),
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
        return
      }

      const canvasContext = canvasNodes.slice(0, 30).map(toCanvasNodeContext)
      const mentionedNodes = getMentionedNodes(userMessage.content, canvasNodes)
      // 展开 @[title](node:id) 引用为详细上下文，再发送给 AI
      const expandedContent = expandMentionsInMessage(userMessage.content, canvasNodes)

      await sendMessage(expandedContent, {
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
        model,
        mode,
      })
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
      if (typeof window === "undefined") return false
      return localStorage.getItem("startrails_use_mock") !== "false"
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
      const report = onApplyChatActions(actions)
      // 标记为已应用，并保存报告
      setMessages((prev) =>
        prev.map((m) => (m.id === msgId ? { ...m, actionsApplied: true, actionsReport: report } : m))
      )
    },
    [onApplyChatActions]
  )

  // 取消 AI actions
  const handleCancelActions = useCallback(
    (msgId: string) => {
      setMessages((prev) =>
        prev.map((m) => (m.id === msgId ? { ...m, actionsCancelled: true } : m))
      )
    },
    []
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
              setMessages([])
              setConversationTitle("新对话")
              setInput("")
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
              已选中节点
            </p>
            <p className="text-xs" style={{ color: DESIGN_TOKENS.textMuted }}>
              {String(selectedNode.data?.title || selectedNode.type || "未命名节点")}
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
              <h3 className="text-xl font-medium" style={{ color: DESIGN_TOKENS.text }}>
                Greeting
              </h3>

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
                  <p className="text-sm" style={{ color: DESIGN_TOKENS.textSecondary }}>
                    你好！我是星轨Ai，你的创作助手。
                  </p>
                  <p className="text-sm" style={{ color: DESIGN_TOKENS.textSecondary }}>
                    有什么我可以帮你的吗？比如：
                  </p>
                  <ul className="flex flex-col gap-1.5 text-sm" style={{ color: DESIGN_TOKENS.textSecondary }}>
                    <li>构思故事或剧本</li>
                    <li>设计角色</li>
                    <li>生成图片或视频</li>
                    <li>规划分镜</li>
                    <li>其他创意项目</li>
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
                        {" · "}
                        ¥{(msg.usage.total_tokens * 0.000015).toFixed(4)}
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
