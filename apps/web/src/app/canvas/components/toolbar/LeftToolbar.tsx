/**
 * LeftToolbar - 左侧胶囊工具栏
 * - "+" 按钮打开 AddNodePanel（TapNow 风格侧面板）
 * - 底部保留素材库、聊天、用户
 */

import { Plus, Library, MessageCircle, Clock3, Save, ImageIcon, Camera, Palette, Film, Globe, Clapperboard, Upload } from "lucide-react"
import { DESIGN_TOKENS, ICON_CONFIG } from "../../styles/designSystem"

interface LeftToolbarProps {
  onOpenAssetLibrary: () => void
  onToggleAddNodePanel: () => void
  isAddNodePanelOpen: boolean
  onToggleChat: () => void
  isChatOpen: boolean
  onOpenWorkspaceHistory?: () => void
  onOpenFileUpload?: () => void
  onOpenTemplates?: () => void
  onOpenUserMenu: () => void
  // 制片层面板
  onOpenCharacterView?: () => void
  onOpenCinematicParams?: () => void
  onOpenColorGrade?: () => void
  onToggleTimeline?: () => void
  onOpenPanorama?: () => void
  onOpenCrewAgent?: () => void
}

export function LeftToolbar({
  onOpenAssetLibrary,
  onToggleAddNodePanel,
  isAddNodePanelOpen,
  onToggleChat,
  isChatOpen,
  onOpenWorkspaceHistory,
  onOpenTemplates,
  onOpenUserMenu,
  onOpenCharacterView,
  onOpenCinematicParams,
  onOpenColorGrade,
  onToggleTimeline,
  onOpenPanorama,
  onOpenCrewAgent,
  onOpenFileUpload,
}: LeftToolbarProps) {
  return (
    <div
      className="fixed left-3 top-1/2 z-20 flex flex-col items-center rounded-full border p-2"
      style={{
        transform: "translateY(-50%)",
        backgroundColor: "rgba(20,20,24,0.9)",
        borderColor: DESIGN_TOKENS.border,
        backdropFilter: "blur(20px)",
      }}
    >
      {/* 添加节点 (+) 按钮 */}
      <button
        onClick={onToggleAddNodePanel}
        className="flex h-10 w-10 items-center justify-center rounded-full transition-all hover:scale-105"
        style={{
          backgroundColor: isAddNodePanelOpen
            ? DESIGN_TOKENS.accentSoftHover
            : DESIGN_TOKENS.accentSoft,
          color: isAddNodePanelOpen
            ? DESIGN_TOKENS.accentHover
            : DESIGN_TOKENS.accent,
        }}
        title="添加节点"
      >
        <Plus size={20} strokeWidth={2} />
      </button>

      {/* 分隔线 */}
      <div
        className="my-1.5 h-px w-6"
        style={{ backgroundColor: DESIGN_TOKENS.border }}
      />

      {/* 文件上传 */}
      <button
        onClick={onOpenFileUpload}
        className="flex h-9 w-9 items-center justify-center rounded-full transition-all hover:bg-white/10"
        style={{ color: DESIGN_TOKENS.textMuted }}
        title="上传剧本/文档 (DOCX/PDF/TXT)"
      >
        <Upload size={ICON_CONFIG.size} strokeWidth={ICON_CONFIG.strokeWidth} />
      </button>

      {/* 素材库 */}
      <button
        onClick={onOpenAssetLibrary}
        className="flex h-9 w-9 items-center justify-center rounded-full transition-all hover:bg-white/10"
        style={{ color: DESIGN_TOKENS.textMuted }}
        title="素材库"
      >
        <Library size={ICON_CONFIG.size} strokeWidth={ICON_CONFIG.strokeWidth} />
      </button>

      {/* 分隔线 */}
      <div
        className="my-1.5 h-px w-6"
        style={{ backgroundColor: DESIGN_TOKENS.border }}
      />

      {/* 聊天按钮 */}
      <button
        onClick={onToggleChat}
        className="flex h-9 w-9 items-center justify-center rounded-full transition-all hover:bg-white/10"
        style={{
          color: isChatOpen ? DESIGN_TOKENS.accent : DESIGN_TOKENS.textMuted,
          backgroundColor: isChatOpen ? DESIGN_TOKENS.accentSoft : "transparent",
        }}
        title={isChatOpen ? "关闭聊天" : "打开聊天"}
      >
        <MessageCircle size={ICON_CONFIG.size} strokeWidth={ICON_CONFIG.strokeWidth} />
      </button>

      {/* 分隔线 */}
      <div
        className="my-1.5 h-px w-6"
        style={{ backgroundColor: DESIGN_TOKENS.border }}
      />

      {/* 工作流模板 —— 对标 TapNow 克隆 / LibTV 打组保存 */}
      <button
        onClick={onOpenTemplates}
        className="flex h-9 w-9 items-center justify-center rounded-full transition-all hover:bg-white/10"
        style={{ color: DESIGN_TOKENS.textMuted }}
        title="工作流模板（保存/加载）"
      >
        <Save size={ICON_CONFIG.size} strokeWidth={ICON_CONFIG.strokeWidth} />
      </button>

      {/* 分隔线 */}
      <div
        className="my-1.5 h-px w-6"
        style={{ backgroundColor: DESIGN_TOKENS.border }}
      />

      {/* --- 制片层面板工具 --- */}

      {/* 角色三视图 */}
      <button
        onClick={onOpenCharacterView}
        className="flex h-9 w-9 items-center justify-center rounded-full transition-all hover:bg-white/10"
        style={{ color: DESIGN_TOKENS.textMuted }}
        title="角色三视图生成"
      >
        <ImageIcon size={ICON_CONFIG.size} strokeWidth={ICON_CONFIG.strokeWidth} />
      </button>

      {/* 运镜参数 */}
      <button
        onClick={onOpenCinematicParams}
        className="flex h-9 w-9 items-center justify-center rounded-full transition-all hover:bg-white/10"
        style={{ color: DESIGN_TOKENS.textMuted }}
        title="运镜参数控制"
      >
        <Camera size={ICON_CONFIG.size} strokeWidth={ICON_CONFIG.strokeWidth} />
      </button>

      {/* 调色面板 */}
      <button
        onClick={onOpenColorGrade}
        className="flex h-9 w-9 items-center justify-center rounded-full transition-all hover:bg-white/10"
        style={{ color: DESIGN_TOKENS.textMuted }}
        title="色彩分级"
      >
        <Palette size={ICON_CONFIG.size} strokeWidth={ICON_CONFIG.strokeWidth} />
      </button>

      {/* 全景预𪾢 */}
      <button
        onClick={onOpenPanorama}
        className="flex h-9 w-9 items-center justify-center rounded-full transition-all hover:bg-white/10"
        style={{ color: DESIGN_TOKENS.textMuted }}
        title="720/360 全景预𪾢"
      >
        <Globe size={ICON_CONFIG.size} strokeWidth={ICON_CONFIG.strokeWidth} />
      </button>

      {/* AI 创作剧组 */}
      <button
        onClick={onOpenCrewAgent}
        className="flex h-9 w-9 items-center justify-center rounded-full transition-all hover:bg-white/10"
        style={{ color: DESIGN_TOKENS.textMuted }}
        title="AI 影视创作剧组 (7 Agent)"
      >
        <Clapperboard size={ICON_CONFIG.size} strokeWidth={ICON_CONFIG.strokeWidth} />
      </button>

      {/* 时间轴 */}
      <button
        onClick={onToggleTimeline}
        className="flex h-9 w-9 items-center justify-center rounded-full transition-all hover:bg-white/10"
        style={{ color: DESIGN_TOKENS.textMuted }}
        title="时间轴编辑"
      >
        <Film size={ICON_CONFIG.size} strokeWidth={ICON_CONFIG.strokeWidth} />
      </button>

      {/* 分隔线 */}
      <div
        className="my-1.5 h-px w-6"
        style={{ backgroundColor: DESIGN_TOKENS.border }}
      />

      {/* 工作记录 */}
      <button
        onClick={onOpenWorkspaceHistory}
        className="flex h-9 w-9 items-center justify-center rounded-full transition-all hover:bg-white/10"
        style={{ color: DESIGN_TOKENS.textMuted }}
        title="工作记录"
      >
        <Clock3 size={ICON_CONFIG.size} strokeWidth={ICON_CONFIG.strokeWidth} />
      </button>

      {/* 分隔线 */}
      <div
        className="my-1.5 h-px w-6"
        style={{ backgroundColor: DESIGN_TOKENS.border }}
      />

      {/* 用户头像 */}
      <button
        onClick={onOpenUserMenu}
        className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full transition-all hover:scale-105"
        style={{
          backgroundColor: DESIGN_TOKENS.accent,
          color: "#fff",
        }}
        title="用户菜单"
      >
        <span className="text-sm font-medium">N</span>
      </button>
    </div>
  )
}
