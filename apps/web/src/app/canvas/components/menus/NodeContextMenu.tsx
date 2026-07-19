// ============================================================================
// Node Context Menu - Right-click menu for nodes
// ============================================================================
"use client"

import { memo, useEffect, useRef } from "react"
import { createPortal } from "react-dom"
import {
  Pencil,
  Copy,
  Scissors,
  Clipboard,
  Eye,
  Crop,
  FolderHeart,
  Trash2,
  Image,
  FileText,
  Clapperboard,
  Grid3X3,
  Wand2,
  History,
  Play,
  RotateCcw,
  ArrowRight,
  Square,
  Globe,
  RefreshCw,
  FilePlus2,
  ListTodo,
} from "lucide-react"
import type { ContextMenuState, CanvasNodeKind } from "../canvas/types"
import { DESIGN_TOKENS, ICON_CONFIG } from "../../styles/designSystem"

interface NodeContextMenuProps {
  state: ContextMenuState
  onClose: () => void
  onDelete: () => void
  onDuplicate: () => void
  onCopy: () => void
  onCut: () => void
  onPreviewImage: () => void
  onCropImage: () => void
  onSaveToAssetLibrary: () => void
  onAIVariant?: () => void
  onEdit: () => void
  onViewHistory?: () => void
  onRunCurrentNode?: () => void
  onRunUpstreamAndCurrent?: () => void
  onRunDownstreamChain?: () => void
  onStopWorkflow?: () => void
  onSplitStoryboard?: () => void
  onSplitStoryboardWithGrid?: () => void
  onGenerateShotImage?: () => void
  onGenerateStoryboardGrid?: () => void
  onGenerateStoryboardImage?: () => void
  onCreateStoryboardAssistant?: () => void
  onCreateInspirationFromDocument?: () => void
  onCreateStoryboardFromDocument?: () => void
  onComposeSelectedShots?: () => void
  onOpenPanorama?: () => void
  onRegenerateShot?: () => void
  onCreatePromptFromRemix?: () => void
  onCreateStoryboardFromRemix?: () => void
  onQueueProductionFromRemix?: () => void
  isWorkflowRunning?: boolean
  nodeKind?: CanvasNodeKind
  selectedShotCount?: number
}

interface MenuItemProps {
  icon: React.ReactNode
  label: string
  shortcut?: string
  onClick: () => void
  disabled?: boolean
  danger?: boolean
  separator?: boolean
  testId?: string
}

const MenuItem = memo(function MenuItem({
  icon,
  label,
  shortcut,
  onClick,
  disabled,
  danger,
  separator,
  testId,
}: MenuItemProps) {
  if (separator) {
    return (
      <div
        className="my-1 border-t"
        style={{ borderColor: DESIGN_TOKENS.border }}
      />
    )
  }

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
      className={`
        flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors
        ${disabled ? "cursor-not-allowed opacity-40" : "hover:bg-white/10"}
        ${danger ? "text-red-400 hover:bg-red-500/20" : "text-white/80"}
      `}
    >
      <span
        className="flex h-5 w-5 items-center justify-center"
        style={{ color: danger ? "#ef4444" : ICON_CONFIG.color }}
      >
        {icon}
      </span>
      <span className="flex-1">{label}</span>
      {shortcut && <span className="text-xs text-white/30">{shortcut}</span>}
    </button>
  )
})

export const NodeContextMenu = memo(function NodeContextMenu({
  state,
  onClose,
  onDelete,
  onDuplicate,
  onCopy,
  onCut,
  onPreviewImage,
  onCropImage,
  onSaveToAssetLibrary,
  onAIVariant,
  onEdit,
  onViewHistory,
  onRunCurrentNode,
  onRunUpstreamAndCurrent,
  onRunDownstreamChain,
  onStopWorkflow,
  onSplitStoryboard,
  onSplitStoryboardWithGrid,
  onGenerateShotImage,
  onGenerateStoryboardGrid,
  onGenerateStoryboardImage,
  onCreateStoryboardAssistant,
  onCreateInspirationFromDocument,
  onCreateStoryboardFromDocument,
  onComposeSelectedShots,
  onOpenPanorama,
  onRegenerateShot,
  onCreatePromptFromRemix,
  onCreateStoryboardFromRemix,
  onQueueProductionFromRemix,
  isWorkflowRunning,
  nodeKind,
  selectedShotCount = 1,
}: NodeContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose()
      }
    }

    if (state) {
      document.addEventListener("mousedown", handleClickOutside)
      document.addEventListener("keydown", handleEscape)
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
      document.removeEventListener("keydown", handleEscape)
    }
  }, [state, onClose])

  if (!state || state.type !== "node") return null

  const isSketchNode = nodeKind === "sketch"
  const isImageNode = nodeKind?.includes("image") || nodeKind === "image"
  const isReferenceImageNode = isImageNode || isSketchNode
  const isDocumentNode = nodeKind === "document"
  const isInspirationNode = nodeKind === "script"
  const isStoryboardSource = nodeKind === "storyboard" || nodeKind === "text" || nodeKind === "prompt"
  const isShotNode = nodeKind === "shot"
  const isStoryboardGridNode = nodeKind === "storyboard-grid"
  const isRemixAnalysisNode = nodeKind === "remix-analysis"
  const position = { x: state.screenX, y: state.screenY }

  // Adjust position to prevent menu from going off-screen
  const adjustedPosition = { ...position }
  if (typeof window !== "undefined") {
    const menuWidth = 200
    const menuHeight = isImageNode ? 520 : isRemixAnalysisNode ? 620 : isStoryboardSource ? 700 : 420
    if (adjustedPosition.x + menuWidth > window.innerWidth) {
      adjustedPosition.x = window.innerWidth - menuWidth - 10
    }
    if (adjustedPosition.y + menuHeight > window.innerHeight) {
      adjustedPosition.y = window.innerHeight - menuHeight - 10
    }
  }

  const menuContent = (
    <div
      ref={menuRef}
      className="fixed z-50 min-w-[200px] max-h-[calc(100vh-20px)] overflow-y-auto rounded-xl border backdrop-blur-xl"
      style={{
        left: adjustedPosition.x,
        top: adjustedPosition.y,
        backgroundColor: DESIGN_TOKENS.panelSolid,
        borderColor: DESIGN_TOKENS.border,
        boxShadow: DESIGN_TOKENS.shadowMenu,
      }}
    >
      {/* Edit Section */}
      <div
        className="border-b px-3 py-2"
        style={{ borderColor: DESIGN_TOKENS.border }}
      >
        <p
          className="text-[10px] uppercase tracking-wider"
          style={{ color: DESIGN_TOKENS.textMuted }}
        >
          编辑
        </p>
      </div>
      <div className="py-1">
        <MenuItem
          icon={<Pencil size={ICON_CONFIG.size} strokeWidth={ICON_CONFIG.strokeWidth} />}
          label="编辑节点"
          shortcut="⏎"
          onClick={() => {
            onEdit()
            onClose()
          }}
        />
        {onViewHistory && (
          <MenuItem
            icon={<History size={ICON_CONFIG.size} strokeWidth={ICON_CONFIG.strokeWidth} />}
            label="查看历史"
            onClick={() => {
              onViewHistory()
              onClose()
            }}
          />
        )}
      </div>

      {/* Run Section (P2-2) */}
      <div
        className="border-b px-3 py-2"
        style={{ borderColor: DESIGN_TOKENS.border }}
      >
        <p
          className="text-[10px] uppercase tracking-wider"
          style={{ color: DESIGN_TOKENS.textMuted }}
        >
          运行
        </p>
      </div>
      <div className="py-1">
        <MenuItem
          icon={<Play size={ICON_CONFIG.size} strokeWidth={ICON_CONFIG.strokeWidth} />}
          label="运行当前节点"
          shortcut="⌘R"
          onClick={() => {
            onRunCurrentNode?.()
            onClose()
          }}
        />
        <MenuItem
          icon={<RotateCcw size={ICON_CONFIG.size} strokeWidth={ICON_CONFIG.strokeWidth} />}
          label="运行上游+当前"
          onClick={() => {
            onRunUpstreamAndCurrent?.()
            onClose()
          }}
        />
        <MenuItem
          icon={<ArrowRight size={ICON_CONFIG.size} strokeWidth={ICON_CONFIG.strokeWidth} />}
          label="运行下游链路"
          onClick={() => {
            onRunDownstreamChain?.()
            onClose()
          }}
        />
        {onStopWorkflow && (
          <MenuItem
            icon={<Square size={ICON_CONFIG.size} strokeWidth={ICON_CONFIG.strokeWidth} />}
            label="停止当前工作流"
            disabled={!isWorkflowRunning}
            onClick={() => {
              if (!isWorkflowRunning) return
              onStopWorkflow()
              onClose()
            }}
          />
        )}
      </div>

      {(isDocumentNode || isInspirationNode || isStoryboardSource || isShotNode || isStoryboardGridNode || isRemixAnalysisNode) && (
        <>
          <div className="border-b px-3 py-2" style={{ borderColor: DESIGN_TOKENS.border }}>
            <p className="text-[10px] uppercase tracking-wider" style={{ color: DESIGN_TOKENS.textMuted }}>
              分镜
            </p>
          </div>
          <div className="py-1">
            {isDocumentNode && onCreateInspirationFromDocument && (
              <MenuItem
                icon={<FileText size={ICON_CONFIG.size} strokeWidth={ICON_CONFIG.strokeWidth} />}
                label="作为灵感碎片提炼"
                onClick={() => {
                  onCreateInspirationFromDocument()
                  onClose()
                }}
              />
            )}
            {isDocumentNode && onCreateStoryboardFromDocument && (
              <MenuItem
                icon={<Clapperboard size={ICON_CONFIG.size} strokeWidth={ICON_CONFIG.strokeWidth} />}
                label="进入故事分镜"
                onClick={() => {
                  onCreateStoryboardFromDocument()
                  onClose()
                }}
              />
            )}
            {isInspirationNode && onCreateStoryboardAssistant && (
              <MenuItem
                icon={<Clapperboard size={ICON_CONFIG.size} strokeWidth={ICON_CONFIG.strokeWidth} />}
                label="用故事种子继续分镜"
                onClick={() => {
                  onCreateStoryboardAssistant()
                  onClose()
                }}
              />
            )}
            {isStoryboardSource && onSplitStoryboard && (
              <MenuItem
                icon={<Clapperboard size={ICON_CONFIG.size} strokeWidth={ICON_CONFIG.strokeWidth} />}
                label="拆成镜头"
                onClick={() => {
                  onSplitStoryboard()
                  onClose()
                }}
              />
            )}
            {isStoryboardSource && onSplitStoryboardWithGrid && (
              <MenuItem
                icon={<Grid3X3 size={ICON_CONFIG.size} strokeWidth={ICON_CONFIG.strokeWidth} />}
                label="拆成镜头并建合成预览"
                onClick={() => {
                  onSplitStoryboardWithGrid()
                  onClose()
                }}
              />
            )}
            {(isStoryboardSource || isDocumentNode) && onGenerateStoryboardImage && (
              <MenuItem
                icon={<Wand2 size={ICON_CONFIG.size} strokeWidth={ICON_CONFIG.strokeWidth} />}
                label="一键生成分镜图"
                onClick={() => {
                  onGenerateStoryboardImage()
                  onClose()
                }}
              />
            )}
            {isShotNode && onGenerateShotImage && (
              <MenuItem
                icon={<Wand2 size={ICON_CONFIG.size} strokeWidth={ICON_CONFIG.strokeWidth} />}
                label="生成本镜头图片"
                onClick={() => {
                  onGenerateShotImage()
                  onClose()
                }}
              />
            )}
            {isShotNode && onRegenerateShot && (
              <MenuItem
                icon={<RefreshCw size={ICON_CONFIG.size} strokeWidth={ICON_CONFIG.strokeWidth} />}
                label="重绘本镜头"
                onClick={() => {
                  onRegenerateShot()
                  onClose()
                }}
              />
            )}
            {isRemixAnalysisNode && onCreatePromptFromRemix && (
              <MenuItem
                icon={<FileText size={ICON_CONFIG.size} strokeWidth={ICON_CONFIG.strokeWidth} />}
                label="派生复刻提示词"
                testId="node-context-remix-create-prompt"
                onClick={() => {
                  onCreatePromptFromRemix()
                  onClose()
                }}
              />
            )}
            {isRemixAnalysisNode && onCreateStoryboardFromRemix && (
              <MenuItem
                icon={<FilePlus2 size={ICON_CONFIG.size} strokeWidth={ICON_CONFIG.strokeWidth} />}
                label="拆成参考分镜"
                testId="node-context-remix-create-storyboard"
                onClick={() => {
                  onCreateStoryboardFromRemix()
                  onClose()
                }}
              />
            )}
            {isRemixAnalysisNode && onQueueProductionFromRemix && (
              <MenuItem
                icon={<ListTodo size={ICON_CONFIG.size} strokeWidth={ICON_CONFIG.strokeWidth} />}
                label="生成生产队列"
                testId="node-context-remix-queue-production"
                onClick={() => {
                  onQueueProductionFromRemix()
                  onClose()
                }}
              />
            )}
            {isShotNode && onComposeSelectedShots && selectedShotCount >= 2 && (
              <MenuItem
                icon={<Grid3X3 size={ICON_CONFIG.size} strokeWidth={ICON_CONFIG.strokeWidth} />}
                label={`合成选中 ${selectedShotCount} 镜头为网格图`}
                onClick={() => {
                  onComposeSelectedShots()
                  onClose()
                }}
              />
            )}
            {isStoryboardGridNode && onGenerateStoryboardGrid && (
              <MenuItem
                icon={<Image size={ICON_CONFIG.size} strokeWidth={ICON_CONFIG.strokeWidth} />}
                label="输出分镜合成图"
                onClick={() => {
                  onGenerateStoryboardGrid()
                  onClose()
                }}
              />
            )}
          </div>
        </>
      )}

      {/* Clipboard Section */}
      <div
        className="border-b px-3 py-2"
        style={{ borderColor: DESIGN_TOKENS.border }}
      >
        <p
          className="text-[10px] uppercase tracking-wider"
          style={{ color: DESIGN_TOKENS.textMuted }}
        >
          剪贴板
        </p>
      </div>
      <div className="py-1">
        <MenuItem
          icon={<Copy size={ICON_CONFIG.size} strokeWidth={ICON_CONFIG.strokeWidth} />}
          label="复制"
          shortcut="⌘C"
          onClick={() => {
            onCopy()
            onClose()
          }}
        />
        <MenuItem
          icon={<Scissors size={ICON_CONFIG.size} strokeWidth={ICON_CONFIG.strokeWidth} />}
          label="剪切"
          shortcut="⌘X"
          onClick={() => {
            onCut()
            onClose()
          }}
        />
        <MenuItem
          icon={<Clipboard size={ICON_CONFIG.size} strokeWidth={ICON_CONFIG.strokeWidth} />}
          label="复制并粘贴"
          shortcut="⌘D"
          onClick={() => {
            onDuplicate()
            onClose()
          }}
        />
      </div>

      {/* Image / Sketch reference Section */}
      {isReferenceImageNode && (
        <>
          <div
            className="border-b px-3 py-2"
            style={{ borderColor: DESIGN_TOKENS.border }}
          >
            <p
              className="text-[10px] uppercase tracking-wider"
              style={{ color: DESIGN_TOKENS.textMuted }}
            >
              图片
            </p>
          </div>
          <div className="py-1">
            {isImageNode && (
              <>
                <MenuItem
                  icon={<Eye size={ICON_CONFIG.size} strokeWidth={ICON_CONFIG.strokeWidth} />}
                  label="预览大图"
                  onClick={() => {
                    onPreviewImage()
                    onClose()
                  }}
                />
                <MenuItem
                  icon={<Crop size={ICON_CONFIG.size} strokeWidth={ICON_CONFIG.strokeWidth} />}
                  label="裁剪"
                  onClick={() => {
                    onCropImage()
                    onClose()
                  }}
                />
                {onOpenPanorama && (
                  <MenuItem
                    icon={<Globe size={ICON_CONFIG.size} strokeWidth={ICON_CONFIG.strokeWidth} />}
                    label="在全景中查看"
                    onClick={() => {
                      onOpenPanorama()
                      onClose()
                    }}
                  />
                )}
              </>
            )}
            {onAIVariant && (
              <MenuItem
                icon={<Wand2 size={ICON_CONFIG.size} strokeWidth={ICON_CONFIG.strokeWidth} />}
                label={isSketchNode ? "草图生成参考图" : "AI 变体"}
                onClick={() => {
                  onAIVariant()
                  onClose()
                }}
              />
            )}
            <MenuItem
              icon={<FolderHeart size={ICON_CONFIG.size} strokeWidth={ICON_CONFIG.strokeWidth} />}
              label="保存到素材库"
              onClick={() => {
                onSaveToAssetLibrary()
                onClose()
              }}
            />
          </div>
        </>
      )}

      {/* Danger Zone */}
      <div
        className="border-t px-3 py-2"
        style={{ borderColor: DESIGN_TOKENS.border }}
      >
        <p
          className="text-[10px] uppercase tracking-wider"
          style={{ color: DESIGN_TOKENS.textMuted }}
        >
          危险操作
        </p>
      </div>
      <div className="py-1">
        <MenuItem
          icon={<Trash2 size={ICON_CONFIG.size} strokeWidth={ICON_CONFIG.strokeWidth} />}
          label="删除节点"
          shortcut="⌫"
          onClick={() => {
            onDelete()
            onClose()
          }}
          danger
        />
      </div>
    </div>
  )

  if (typeof document === "undefined") return null
  return createPortal(menuContent, document.body)
})

export default NodeContextMenu
