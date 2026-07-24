/**
 * ChatInput - Chat 输入框组件，TapNow 风格
 * 支持附件上传、真实 AI 模型选择、语音输入
 */

import { useRef, useState, type ChangeEvent, type KeyboardEvent } from "react"
import { Paperclip, ArrowUp, Square, Mic, Settings, MessageSquareText, Image, Archive } from "lucide-react"
import { DESIGN_TOKENS, ICON_CONFIG } from "../../styles/designSystem"
import { ChatAttachmentPreview } from "./ChatAttachmentPreview"
import { SlashCommandMenu } from "./SlashCommandMenu"
import type { ChatAttachment } from "../../hooks/useChatAttachments"
import type { SlashCommand } from "@/lib/slashCommands/slashCommands"
import type { AssetItem } from "../canvas/types"
import { getCachedDefaultImageModel } from "@/lib/ai/client"
import { getModelOptions } from "@/lib/ai/imageProviderCapabilities"

// 默认模型列表；用户可在设置面板中替换为自己的中转站模型
export type AiModel =
  | "gpt-5.4"
  | "gpt-5.4-mini"
  | "gpt-5.5"
  | "gpt-image-2"

export interface ModelOption {
  value: string
  label: string
  provider: string
  desc: string
  type: "text" | "image" | "video"
}

export type ChatTaskMode = "chat" | "image"

const DEFAULT_CHAT_MODEL = "gpt-5.5"
const DEFAULT_IMAGE_MODEL = getCachedDefaultImageModel()

const TASK_MODE_OPTIONS: Array<{
  value: ChatTaskMode
  label: string
  desc: string
  modelType: "text" | "image"
  defaultModel: string
  icon: typeof MessageSquareText
}> = [
  { value: "chat", label: "对话", desc: "写作、分析、整理画布", modelType: "text", defaultModel: DEFAULT_CHAT_MODEL, icon: MessageSquareText },
  { value: "image", label: "生图", desc: "生成图片，自动使用图片模型", modelType: "image", defaultModel: DEFAULT_IMAGE_MODEL, icon: Image },
]

const IMAGE_MODEL_OPTIONS = getModelOptions()
const DEFAULT_IMAGE_OPTION = IMAGE_MODEL_OPTIONS[0]

const MODEL_OPTIONS: ModelOption[] = [
  { value: "gpt-5.5", label: "GPT-5.5", provider: "default", desc: "最强推理+创作", type: "text" },
  { value: "gpt-5.4", label: "GPT-5.4", provider: "default", desc: "高性能多模态", type: "text" },
  { value: "gpt-5.4-mini", label: "GPT-5.4 Mini", provider: "default", desc: "快速响应", type: "text" },
  { value: DEFAULT_IMAGE_OPTION.value, label: DEFAULT_IMAGE_OPTION.label, provider: "default", desc: "高质量图像生成", type: "image" },
]

function dispatchCanvasNotice(title: string, description: string, kind: "info" | "warning" | "error" = "info") {
  if (typeof window === "undefined") return
  window.dispatchEvent(
    new CustomEvent("starcanvas:notice", {
      detail: { kind, title, description },
    }),
  )
}

interface ChatInputProps {
  value: string
  onChange: (value: string) => void
  onSend: (model: string, mode?: ChatTaskMode) => void
  onStop?: () => void
  isGenerating?: boolean
  selectedModel: string
  onModelChange: (model: string) => void
  attachments: ChatAttachment[]
  onAttachmentsChange: {
    handleFileSelect: (e: ChangeEvent<HTMLInputElement>) => void
    removeAttachment: (id: string) => void
    clearAttachments: () => void
    handleDragOver: (e: React.DragEvent) => void
    handleDrop: (e: React.DragEvent) => void
  }
  isParsing?: boolean
  onAddAttachmentToCanvas?: (attachment: ChatAttachment) => void
  placeholder?: string
  disabled?: boolean
  canvasNodes?: any[] // 画布节点列表，用于 @ 引用
  assets?: AssetItem[] // 素材库列表，用于 @asset_ 引用
  selectedCount?: number // 选中节点数，用于 slash 命令过滤
}

// 读取用户配置的模型列表（from localStorage or default）
function getConfiguredModels(): ModelOption[] {
  if (typeof window === "undefined") return MODEL_OPTIONS
  try {
    const stored = localStorage.getItem("startrails_models")
    if (stored) {
      const storedModels = JSON.parse(stored) as ModelOption[]
      const merged = [...storedModels]

      for (const defaultModel of MODEL_OPTIONS) {
        if (!merged.some((model) => model.value === defaultModel.value)) {
          merged.push(defaultModel)
        }
      }

      return merged
    }
  } catch {}
  return MODEL_OPTIONS
}

export function ChatInput({
  value,
  onChange,
  onSend,
  onStop,
  isGenerating = false,
  selectedModel,
  onModelChange,
  attachments,
  onAttachmentsChange,
  onAddAttachmentToCanvas,
  placeholder = "输入你的具体需求，例如：把这个故事拆成 12 个分镜…",
  disabled = false,
  isParsing = false,
  canvasNodes = [],
  assets = [],
  selectedCount = 0,
}: ChatInputProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [taskMode, setTaskMode] = useState<ChatTaskMode>("chat")
  const [showNodeMention, setShowNodeMention] = useState(false)
  const [showSlashMenu, setShowSlashMenu] = useState(false)
  const [slashQuery, setSlashQuery] = useState("")
  const [mentionQuery, setMentionQuery] = useState("")
  const [mentionIndex, setMentionIndex] = useState(0)

  const currentMode = TASK_MODE_OPTIONS.find((option) => option.value === taskMode) ?? TASK_MODE_OPTIONS[0]
  const selectedModelOption = getConfiguredModels().find((m) => m.value === selectedModel)
  const selectedModelForMode =
    selectedModelOption?.type === currentMode.modelType
      ? selectedModelOption.value
      : currentMode.defaultModel

  // @ 引用节点/素材过滤：节点插入 @node_xxx，素材插入 @asset_xxx，与 build-node-execution-context 对齐
  const mentionableNodes = canvasNodes.filter((n) => n.data?.title || n.data?.text || n.data?.fileName)
  const normalizedMentionQuery = mentionQuery.toLowerCase()
  const filteredMentionNodes = mentionQuery
    ? mentionableNodes.filter((n) => {
        const title = n.data?.title || n.data?.fileName || n.data?.text || ""
        return String(title).toLowerCase().includes(normalizedMentionQuery) || String(n.id).toLowerCase().includes(normalizedMentionQuery)
      })
    : mentionableNodes
  const filteredMentionAssets = (mentionQuery
    ? assets.filter((asset) =>
        asset.name.toLowerCase().includes(normalizedMentionQuery) ||
        asset.id.toLowerCase().includes(normalizedMentionQuery) ||
        asset.folder.toLowerCase().includes(normalizedMentionQuery),
      )
    : assets
  ).slice(0, 12)
  const mentionOptions = [
    ...filteredMentionNodes.slice(0, 12).map((node) => ({ kind: "node" as const, item: node })),
    ...filteredMentionAssets.map((asset) => ({ kind: "asset" as const, item: asset })),
  ]

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // @ 引用下拉菜单导航
    if (showNodeMention) {
      if (e.key === "ArrowDown") {
        e.preventDefault()
        setMentionIndex((prev) => (prev + 1) % mentionOptions.length)
        return
      }
      if (e.key === "ArrowUp") {
        e.preventDefault()
        setMentionIndex((prev) => (prev - 1 + mentionOptions.length) % mentionOptions.length)
        return
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault()
        const option = mentionOptions[mentionIndex]
        if (option?.kind === "node") {
          insertNodeMention(option.item)
        } else if (option?.kind === "asset") {
          insertAssetMention(option.item)
        }
        return
      }
      if (e.key === "Escape") {
        setShowNodeMention(false)
        return
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      if (!isGenerating && (value.trim() || attachments.length > 0)) {
        onSend(selectedModelForMode, taskMode)
      }
    }
  }

  const closeMentionMenu = () => {
    setShowNodeMention(false)
    setMentionQuery("")
    setMentionIndex(0)
    textareaRef.current?.focus()
  }

  const replaceActiveMention = (token: string) => {
    const lastAtIndex = value.lastIndexOf("@")
    if (lastAtIndex >= 0) {
      const before = value.slice(0, lastAtIndex)
      const after = value.slice(lastAtIndex + 1 + mentionQuery.length)
      onChange(before + token + " " + after)
    }
    closeMentionMenu()
  }

  const insertNodeMention = (node: any) => {
    // build-node-execution-context 当前解析 @node_xxx；因此这里插入机器可解析 token，而不是 markdown 链接。
    replaceActiveMention(`@${node.id}`)
  }

  const insertAssetMention = (asset: AssetItem) => {
    replaceActiveMention(`@${asset.id}`)
  }

  const handleInputChange = (newValue: string) => {
    onChange(newValue)
    // Slash command detection
    const lastSlashIndex = newValue.lastIndexOf("/")
    if (lastSlashIndex >= 0) {
      const afterSlash = newValue.slice(lastSlashIndex + 1)
      // Only trigger if "/" is at start or after whitespace, and query is alphanumeric/Chinese
      const beforeSlash = lastSlashIndex > 0 ? newValue[lastSlashIndex - 1] : " "
      if (/\s/.test(beforeSlash) || lastSlashIndex === 0) {
        if (/^[\w一-鿿]*$/.test(afterSlash) && !afterSlash.includes(" ")) {
          setSlashQuery(afterSlash)
          setShowSlashMenu(true)
        } else {
          setShowSlashMenu(false)
        }
      } else {
        setShowSlashMenu(false)
      }
    } else {
      setShowSlashMenu(false)
    }
    // 检测 @ 触发引用
    const lastAtIndex = newValue.lastIndexOf("@")
    if (lastAtIndex >= 0) {
      const afterAt = newValue.slice(lastAtIndex + 1)
      // 检查 @ 后面是否只有字母数字中文（没有空格）
      if (/^[\w\u4e00-\u9fa5]*$/.test(afterAt) && !afterAt.includes(" ")) {
        setShowNodeMention(true)
        setMentionQuery(afterAt)
        setMentionIndex(0)
      } else {
        setShowNodeMention(false)
      }
    } else {
      setShowNodeMention(false)
    }
  }

  const handlePaperclipClick = () => {
    fileInputRef.current?.click()
  }


  // Slash command handler
  const handleSlashSelect = (command: SlashCommand) => {
    setShowSlashMenu(false)
    setSlashQuery("")
    // Chat 输入统一使用核心 SlashCommand 注册表，插入 /id 便于 AI/日志稳定识别。
    const newValue = value.replace(/\/[^\s]*$/, `/${command.id}`)
    onChange(newValue + " ")
    textareaRef.current?.focus()
  }

  const handleSlashClose = () => {
    setShowSlashMenu(false)
    setSlashQuery("")
  }
  return (
    <div
      className="flex flex-col rounded-2xl border"
      style={{
        backgroundColor: "rgba(25,25,32,0.95)",
        borderColor: DESIGN_TOKENS.border,
      }}
      onDragOver={onAttachmentsChange.handleDragOver}
      onDrop={onAttachmentsChange.handleDrop}
    >
      {/* ===== 主输入区：textarea 是绝对视觉中心 ===== */}
      <div
        className="relative rounded-xl border"
        style={{
          backgroundColor: "rgba(15,15,22,0.8)",
          borderColor: DESIGN_TOKENS.border,
          margin: "10px",
          marginBottom: "4px",
        }}
      >
        <textarea
          ref={textareaRef}
          data-testid="chat-input"
          value={value}
          onChange={(e) => handleInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled || isGenerating}
          rows={3}
          className="w-full resize-none border-0 bg-transparent px-4 py-3 text-sm leading-relaxed outline-none"
          style={{
            color: DESIGN_TOKENS.text,
            maxHeight: "180px",
            minHeight: "72px",
          }}
        />

        {/* @ 引用节点下拉菜单 */}
        {showNodeMention && mentionOptions.length > 0 && (
          <div
            className="absolute bottom-full left-4 mb-2 max-h-[240px] w-[320px] overflow-y-auto rounded-xl border py-2 shadow-xl"
            style={{
              backgroundColor: "rgba(30,30,38,0.98)",
              borderColor: DESIGN_TOKENS.border,
            }}
          >
            <div className="px-3 py-1 text-xs" style={{ color: DESIGN_TOKENS.textMuted }}>
              引用画布节点 / 素材库资产
            </div>
            {mentionOptions.map((option, idx) => {
              if (option.kind === "asset") {
                const asset = option.item
                return (
                  <button
                    key={`asset-${asset.id}`}
                    onClick={() => insertAssetMention(asset)}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-white/5 ${
                      idx === mentionIndex ? "bg-white/10" : ""
                    }`}
                    style={{ color: idx === mentionIndex ? DESIGN_TOKENS.accent : DESIGN_TOKENS.text }}
                  >
                    <span className="flex items-center gap-1 text-xs rounded px-1.5 py-0.5" style={{ backgroundColor: "rgba(100,116,139,0.2)", color: DESIGN_TOKENS.textMuted }}>
                      <Archive size={11} />
                      素材
                    </span>
                    <span className="min-w-0 flex-1 truncate">{asset.name}</span>
                    <span className="text-[10px]" style={{ color: DESIGN_TOKENS.textMuted }}>{asset.folder}</span>
                  </button>
                )
              }

              const node = option.item
              const title = node.data?.title || node.data?.fileName || node.data?.text?.slice(0, 20) || "未命名节点"
              const typeLabel = node.type === "image" ? "图片" : node.type === "text" ? "文本" : "节点"
              return (
                <button
                  key={`node-${node.id}`}
                  onClick={() => insertNodeMention(node)}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-white/5 ${
                    idx === mentionIndex ? "bg-white/10" : ""
                  }`}
                  style={{ color: idx === mentionIndex ? DESIGN_TOKENS.accent : DESIGN_TOKENS.text }}
                >
                  <span className="text-xs rounded px-1.5 py-0.5" style={{ backgroundColor: "rgba(100,116,139,0.2)", color: DESIGN_TOKENS.textMuted }}>
                    {typeLabel}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{title}</span>
                  <span className="text-[10px]" style={{ color: DESIGN_TOKENS.textMuted }}>@{node.id}</span>
                </button>
              )
            })}
          </div>
        )}
        {/* Slash Command Menu */}
        {showSlashMenu && (
          <SlashCommandMenu
            query={slashQuery}
            selectedCount={selectedCount}
            onSelect={handleSlashSelect}
            onClose={() => setShowSlashMenu(false)}
          />
        )}
      </div>

      {/* 附件预览 — 紧贴在输入框下方 */}
      <ChatAttachmentPreview
        attachments={attachments}
        onRemove={onAttachmentsChange.removeAttachment}
        onAddToCanvas={onAddAttachmentToCanvas}
        showAddToCanvas={true}
      />

      {/* 底部工具栏 — 精简为单行小字 */}
      <div className="flex items-center justify-between px-4 pb-3 pt-1">
        {/* 左侧：精简工具 */}
        <div className="flex min-w-0 items-center gap-1.5">
          {/* 附件按钮 */}
          <button
            onClick={handlePaperclipClick}
            disabled={disabled || isGenerating}
            className="flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-white/5"
            style={{ color: DESIGN_TOKENS.textMuted }}
            title="添加附件"
          >
            <Paperclip size={14} strokeWidth={1.5} />
          </button>

          {/* 隐藏的文件输入 */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*,audio/*,.txt,.md,.pdf,.doc,.docx,.srt,.vtt,.json"
            multiple
            onChange={onAttachmentsChange.handleFileSelect}
            className="hidden"
          />

          {/* 任务模式：紧凑胶囊 */}
          <div className="flex h-7 items-center gap-0.5 rounded-full p-0.5" style={{ backgroundColor: "rgba(255,255,255,0.05)" }}>
            {TASK_MODE_OPTIONS.map((option) => {
              const Icon = option.icon
              const active = taskMode === option.value
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    setTaskMode(option.value)
                    onModelChange(option.defaultModel)
                  }}
                  className="flex h-6 items-center gap-1 rounded-full px-2 text-[11px] font-medium leading-none whitespace-nowrap transition-colors"
                  style={{
                    backgroundColor: active ? "rgba(255,255,255,0.12)" : "transparent",
                    color: active ? DESIGN_TOKENS.text : DESIGN_TOKENS.textMuted,
                  }}
                  title={option.desc}
                >
                  <Icon size={12} strokeWidth={1.7} />
                  <span>{option.label}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* 右侧：发送为主 */}
        <div className="flex items-center gap-1">
          {/* 麦克风 */}
          <button
            onClick={() => {
              if ("webkitSpeechRecognition" in window || "SpeechRecognition" in window) {
                const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition
                const recognition = new SpeechRecognition()
                recognition.lang = "zh-CN"
                recognition.onresult = (event: any) => {
                  const transcript = event.results[0][0].transcript
                  onChange(value + transcript)
                }
                recognition.start()
              } else {
                dispatchCanvasNotice("当前浏览器不支持语音输入", "请使用 Chrome 或其他支持 SpeechRecognition 的浏览器。", "warning")
              }
            }}
            disabled={disabled || isGenerating}
            className="flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-white/5"
            style={{ color: DESIGN_TOKENS.textMuted }}
            title="语音输入"
          >
            <Mic size={14} strokeWidth={1.5} />
          </button>

          {/* 设置 */}
          <button
            onClick={() => {
              if (typeof window !== "undefined") {
                window.dispatchEvent(new CustomEvent("startrails-open-settings"))
              }
            }}
            disabled={disabled || isGenerating}
            className="flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-white/5"
            style={{ color: DESIGN_TOKENS.textMuted }}
            title="设置"
          >
            <Settings size={14} strokeWidth={1.5} />
          </button>

          {/* 发送/停止按钮 */}
          {isGenerating ? (
            <button
              onClick={onStop}
              className="flex h-8 w-8 items-center justify-center rounded-full transition-colors"
              style={{
                backgroundColor: "rgba(239, 68, 68, 0.2)",
                color: "#ef4444",
              }}
              title="停止生成"
            >
              <Square size={14} strokeWidth={2} />
            </button>
          ) : (
            <button
              onClick={() => onSend(selectedModelForMode, taskMode)}
              disabled={disabled || isParsing || (!value.trim() && attachments.length === 0)}
              className="flex h-8 w-8 items-center justify-center rounded-full transition-all"
              title={isParsing ? "正在解析文档..." : "发送"}
              style={{
                backgroundColor:
                  value.trim() || attachments.length > 0
                    ? DESIGN_TOKENS.accent
                    : DESIGN_TOKENS.accentSoft,
                color: value.trim() || attachments.length > 0 ? "#fff" : DESIGN_TOKENS.textMuted,
              }}
            >
              <ArrowUp size={16} strokeWidth={2.5} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
