/**
 * AddNodePanel - TapNow 风格的添加节点侧面板
 *
 * 只保留已接线、可立即使用的入口，避免出现“点了没反应”的无效 UI。
 */

"use client"

import { useState, useCallback, useEffect } from "react"
import type { LucideIcon } from "lucide-react"
import {
  X,
  Type,
  Sparkles,
  Bot,
  FileText,
  Image,
  Upload,
  FileUp,
  Film,
  Video,
  Music,
  Volume2,
  Maximize2,
  Megaphone,
  Camera,
  Repeat,
  Layers,
  MessageSquareText,
  FolderOpen,
  Clapperboard,
  Wand2,
  FileOutput,
  Mic,
  LayoutGrid,
  Workflow,
  Lightbulb,
  BookOpen,
  ShieldCheck,
  PenLine,
} from "lucide-react"
import { DESIGN_TOKENS, ICON_CONFIG } from "../../styles/designSystem"
import type { CanvasNodeKind } from "../canvas/types"

// ============================================================================
// Types
// ============================================================================

type AddNodeAction =
  | { type: "add-node"; nodeType: "content" | "image" | "workflow" | "agent" | "sketch"; nodeKind: CanvasNodeKind }
  | { type: "upload-image" }
  | { type: "upload-document" }
  | { type: "import-script" }
  | { type: "import-video-remix" }
  | { type: "create-workflow" }
  | { type: "open-project-bible" }
  | { type: "open-asset-library" }

interface AddNodeItem {
  icon: LucideIcon
  title: string
  description: string
  action: AddNodeAction
}

interface AddNodeCategory {
  id: string
  icon: LucideIcon
  label: string
  items: AddNodeItem[]
}

interface AddNodePanelProps {
  isOpen: boolean
  onClose: () => void
  onAddNode: (nodeType: "content" | "image" | "workflow" | "agent" | "sketch", nodeKind: CanvasNodeKind) => void
  onUploadImage: () => void
  onUploadDocument?: () => void
  onImportScript?: () => void
  onImportVideoRemix?: () => void
  onCreateVideoWorkflow?: () => void
  onOpenProjectBible?: () => void
  onOpenAssetLibrary?: () => void
}

// ============================================================================
// Categories — only wired actions
// ============================================================================

const CATEGORIES: AddNodeCategory[] = [
  {
    id: "agent",
    icon: Bot,
    label: "Agent",
    items: [
      {
        icon: Bot,
        title: "导演 Agent 中控",
        description: "读取画布素材，编排剧本、分镜、角色一致性和生成链路",
        action: { type: "add-node", nodeType: "agent", nodeKind: "agent" },
      },
      {
        icon: Workflow,
        title: "ArcReel 式流水线",
        description: "小说/剧本 → 角色线索 → 分镜图 → 视频片段 → 项目包",
        action: { type: "create-workflow" },
      },
    ],
  },
  {
    id: "text",
    icon: Type,
    label: "文本创作",
    items: [
      {
        icon: FileText,
        title: "写作文本",
        description: "写故事、剧本、笔记或 Prompt；节点内可直接选择对话/生图",
        action: { type: "add-node", nodeType: "content", nodeKind: "text" },
      },
      {
        icon: Clapperboard,
        title: "故事分镜",
        description: "从一句想法生成完整故事，再拆成文字分镜和分镜图",
        action: { type: "add-node", nodeType: "content", nodeKind: "storyboard" },
      },
      {
        icon: FileUp,
        title: "上传文档",
        description: "导入 TXT / Markdown，作为故事、剧本或资料继续创作",
        action: { type: "upload-document" },
      },
      {
        icon: BookOpen,
        title: "导入剧本 / Bible",
        description: "粘贴剧本，创建故事分镜源节点，并进入角色/场景/视觉圣经",
        action: { type: "import-script" },
      },
      {
        icon: Lightbulb,
        title: "灵感碎片",
        description: "粘贴新闻、文章、链接或想法，提炼成故事种子",
        action: { type: "add-node", nodeType: "workflow", nodeKind: "script" },
      },
    ],
  },
  {
    id: "image",
    icon: Image,
    label: "图像",
    items: [
      {
        icon: Upload,
        title: "上传图片",
        description: "添加参考图、角色图、场景图或风格图",
        action: { type: "upload-image" },
      },
      {
        icon: Image,
        title: "空白图片节点",
        description: "先放一个图片容器，再上传或输入提示生成",
        action: { type: "add-node", nodeType: "image", nodeKind: "uploaded-image" },
      },
      {
        icon: PenLine,
        title: "手绘分镜",
        description: "鼠标/触控笔画构图草图，自动保存并可导出 PNG",
        action: { type: "add-node", nodeType: "sketch", nodeKind: "sketch" },
      },
      {
        icon: Wand2,
        title: "关键画面设计",
        description: "文本到图像，用于生成角色、场景或首帧",
        action: { type: "add-node", nodeType: "workflow", nodeKind: "image-generation" },
      },
      {
        icon: Megaphone,
        title: "AI 海报",
        description: "整合角色、片名、卖点和风格，生成海报提示词",
        action: { type: "add-node", nodeType: "workflow", nodeKind: "poster" },
      },
      {
        icon: Maximize2,
        title: "高清放大",
        description: "参考 Real-ESRGAN 记录 2x/4x 放大和保细节要求",
        action: { type: "add-node", nodeType: "workflow", nodeKind: "upscale" },
      },
    ],
  },
  {
    id: "video",
    icon: Film,
    label: "视频",
    items: [
      {
        icon: Video,
        title: "动效预演",
        description: "用关键画面验证动作、机位和氛围",
        action: { type: "add-node", nodeType: "workflow", nodeKind: "video-generation" },
      },
      {
        icon: Camera,
        title: "摄影机控制",
        description: "规划景别、机位、镜头运动、焦段和一镜到底路径",
        action: { type: "add-node", nodeType: "workflow", nodeKind: "camera-control" },
      },
      {
        icon: Repeat,
        title: "爆款拆解/复刻",
        description: "拆节奏、钩子、镜头结构和可复刻模板",
        action: { type: "add-node", nodeType: "workflow", nodeKind: "remix-analysis" },
      },
      {
        icon: Film,
        title: "一键拉片",
        description: "上传视频，AI自动拆解为分镜结构，可导入画布编辑",
        action: { type: "import-video-remix" },
      },
      {
        icon: MessageSquareText,
        title: "照片说话/数字人",
        description: "记录头像、台词、声线和口型同步生成要求",
        action: { type: "add-node", nodeType: "workflow", nodeKind: "talking-photo" },
      },
      {
        icon: Layers,
        title: "分镜草稿",
        description: "拆出镜头草稿，确定景别、构图和调度",
        action: { type: "add-node", nodeType: "workflow", nodeKind: "storyboard" },
      },
      {
        icon: Clapperboard,
        title: "前期工作流",
        description: "一键创建完整的前期创作流程",
        action: { type: "create-workflow" },
      },
    ],
  },
  {
    id: "audio",
    icon: Music,
    label: "声音",
    items: [
      {
        icon: Mic,
        title: "声音意图",
        description: "记录旁白、音乐、环境声和声音参考",
        action: { type: "add-node", nodeType: "workflow", nodeKind: "audio" },
      },
      {
        icon: Volume2,
        title: "BGM 情绪设计",
        description: "记录音乐情绪、节拍、乐器和版权备注",
        action: { type: "add-node", nodeType: "workflow", nodeKind: "bgm" },
      },
      {
        icon: MessageSquareText,
        title: "对白/旁白草稿",
        description: "沉淀对白、旁白和字幕意图",
        action: { type: "add-node", nodeType: "workflow", nodeKind: "subtitle" },
      },
    ],
  },
  {
    id: "tools",
    icon: LayoutGrid,
    label: "工具",
    items: [
      {
        icon: FileOutput,
        title: "前期项目包",
        description: "汇总创意、分镜、关键画面和声音意图",
        action: { type: "add-node", nodeType: "workflow", nodeKind: "composition" },
      },
      {
        icon: BookOpen,
        title: "项目 Bible",
        description: "查看和统一当前画布角色、场景、视觉风格设定",
        action: { type: "open-project-bible" },
      },
      {
        icon: FolderOpen,
        title: "素材库",
        description: "浏览和管理当前项目素材",
        action: { type: "open-asset-library" },
      },
      {
        icon: ShieldCheck,
        title: "连续性检查",
        description: "六维连续性校验：角色/场景/动作/风格/时间/道具",
        action: { type: "add-node", nodeType: "workflow", nodeKind: "continuity-report" },
      },
    ],
  },
]

// ============================================================================
// Component
// ============================================================================

export function AddNodePanel({
  isOpen,
  onClose,
  onAddNode,
  onUploadImage,
  onUploadDocument,
  onImportScript,
  onImportVideoRemix,
  onCreateVideoWorkflow,
  onOpenProjectBible,
  onOpenAssetLibrary,
}: AddNodePanelProps) {
  const [activeCategory, setActiveCategory] = useState(CATEGORIES[0].id)

  useEffect(() => {
    if (isOpen) {
      setActiveCategory(CATEGORIES[0].id)
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [isOpen, onClose])

  const handleItemClick = useCallback(
    (item: AddNodeItem) => {
      switch (item.action.type) {
        case "add-node":
          onAddNode(item.action.nodeType, item.action.nodeKind)
          break
        case "upload-image":
          onUploadImage()
          break
        case "upload-document":
          onUploadDocument?.()
          break
        case "import-script":
          onImportScript?.()
          break
        case "import-video-remix":
          onImportVideoRemix?.()
          break
        case "create-workflow":
          onCreateVideoWorkflow?.()
          break
        case "open-project-bible":
          onOpenProjectBible?.()
          break
        case "open-asset-library":
          onOpenAssetLibrary?.()
          break
      }
      onClose()
    },
    [onAddNode, onUploadImage, onUploadDocument, onImportScript, onImportVideoRemix, onCreateVideoWorkflow, onOpenProjectBible, onOpenAssetLibrary, onClose]
  )

  if (!isOpen) return null

  const active = CATEGORIES.find((c) => c.id === activeCategory) ?? CATEGORIES[0]

  return (
    <>
      <div
        className="fixed inset-0 z-30"
        style={{ zIndex: DESIGN_TOKENS.zIndex.panel - 1 }}
        onClick={onClose}
      />

      <div
        className="fixed left-16 top-1/2 z-30 flex overflow-hidden rounded-2xl border"
        style={{
          transform: "translateY(-50%)",
          width: 408,
          maxHeight: "min(640px, calc(100vh - 48px))",
          backgroundColor: "rgba(14, 14, 20, 0.96)",
          borderColor: DESIGN_TOKENS.border,
          backdropFilter: "blur(24px)",
          boxShadow: DESIGN_TOKENS.shadowPanel,
          zIndex: DESIGN_TOKENS.zIndex.panel,
        }}
      >
        {/* Left icon rail */}
        <div
          className="flex flex-col items-center px-1.5 py-3"
          style={{
            width: 52,
            backgroundColor: "rgba(255, 255, 255, 0.025)",
            borderRight: `1px solid ${DESIGN_TOKENS.border}`,
          }}
        >
          <button
            onClick={onClose}
            className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg transition-all hover:bg-white/10"
            style={{ color: DESIGN_TOKENS.textMuted }}
            title="关闭"
          >
            <X size={16} strokeWidth={2} />
          </button>

          <div className="mb-2 h-px w-6" style={{ backgroundColor: DESIGN_TOKENS.border }} />

          <div className="flex flex-1 flex-col items-center gap-1">
            {CATEGORIES.map((cat) => {
              const isActive = activeCategory === cat.id
              return (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.id)}
                  className="relative flex h-10 w-10 items-center justify-center rounded-xl transition-all hover:bg-white/5"
                  style={{
                    color: isActive ? DESIGN_TOKENS.accentHover : DESIGN_TOKENS.textMuted,
                    backgroundColor: isActive ? DESIGN_TOKENS.accentSoft : "transparent",
                  }}
                  title={cat.label}
                >
                  <cat.icon size={18} strokeWidth={ICON_CONFIG.strokeWidth} />
                  {isActive && (
                    <div
                      className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r-full"
                      style={{ backgroundColor: DESIGN_TOKENS.accentHover }}
                    />
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Content */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4">
            <div className="flex items-center gap-2">
              <Workflow size={16} strokeWidth={ICON_CONFIG.strokeWidth} style={{ color: DESIGN_TOKENS.accent }} />
              <div>
                <h2 className="text-sm font-medium leading-none" style={{ color: DESIGN_TOKENS.text }}>
                  添加节点
                </h2>
                <p className="mt-1 text-[11px]" style={{ color: DESIGN_TOKENS.textMuted }}>
                  {active.label}
                </p>
              </div>
            </div>
          </div>

          <div className="mx-4 h-px" style={{ backgroundColor: DESIGN_TOKENS.border }} />

          <div className="flex-1 overflow-y-auto p-4">
            <div className="grid grid-cols-1 gap-2.5">
              {active.items.map((item) => (
                <button
                  key={item.title}
                  onClick={() => handleItemClick(item)}
                  data-testid={`add-node-item-${item.title}`}
                  className="group flex items-center gap-3 rounded-xl border p-3 text-left transition-all hover:bg-white/[0.06]"
                  style={{ borderColor: DESIGN_TOKENS.border }}
                >
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                    style={{ backgroundColor: DESIGN_TOKENS.accentSoft }}
                  >
                    <item.icon
                      size={17}
                      strokeWidth={ICON_CONFIG.strokeWidth}
                      style={{ color: DESIGN_TOKENS.accentHover }}
                    />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-medium" style={{ color: DESIGN_TOKENS.text }}>
                      {item.title}
                    </div>
                    <div className="mt-0.5 text-[11px] leading-relaxed" style={{ color: DESIGN_TOKENS.textMuted }}>
                      {item.description}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
