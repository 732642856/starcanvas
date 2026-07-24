"use client"

import { createPortal } from "react-dom"
import { Film, TrendingUp, X } from "lucide-react"
import { DESIGN_TOKENS } from "../../styles/designSystem"

interface ReferenceVideoEntryPanelProps {
  isOpen: boolean
  onClose: () => void
  onChooseStoryboard: () => void
  onChooseStructure: () => void
}

function EntryCard({
  title,
  description,
  onClick,
  icon,
  testId,
}: {
  title: string
  description: string
  onClick: () => void
  icon: React.ReactNode
  testId: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className="flex min-h-[164px] flex-col items-start gap-3 rounded-2xl border p-5 text-left transition hover:bg-white/5"
      style={{
        borderColor: DESIGN_TOKENS.border,
        backgroundColor: "rgba(255,255,255,0.02)",
      }}
    >
      <div
        className="flex h-11 w-11 items-center justify-center rounded-2xl"
        style={{ backgroundColor: DESIGN_TOKENS.accentSoft }}
      >
        {icon}
      </div>
      <div>
        <h3 className="text-sm font-semibold" style={{ color: DESIGN_TOKENS.text }}>
          {title}
        </h3>
        <p className="mt-2 text-xs leading-5" style={{ color: DESIGN_TOKENS.textMuted }}>
          {description}
        </p>
      </div>
    </button>
  )
}

export function ReferenceVideoEntryPanel({
  isOpen,
  onClose,
  onChooseStoryboard,
  onChooseStructure,
}: ReferenceVideoEntryPanelProps) {
  if (!isOpen || typeof document === "undefined") return null

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center px-6">
      <button
        type="button"
        aria-label="关闭参考视频分析入口"
        className="absolute inset-0 cursor-default bg-black/60"
        onClick={onClose}
      />
      <section
        data-testid="reference-video-entry-panel"
        className="relative z-10 flex w-full max-w-3xl flex-col overflow-hidden rounded-3xl border shadow-2xl"
        style={{
          backgroundColor: DESIGN_TOKENS.panelSolid,
          borderColor: DESIGN_TOKENS.border,
          boxShadow: DESIGN_TOKENS.shadowPanel,
        }}
      >
        <header
          className="flex items-start justify-between gap-4 border-b px-5 py-4"
          style={{ borderColor: DESIGN_TOKENS.border }}
        >
          <div>
            <h2 className="text-base font-semibold" style={{ color: DESIGN_TOKENS.text }}>
              参考视频分析
            </h2>
            <p className="mt-1 text-xs leading-5" style={{ color: DESIGN_TOKENS.textMuted }}>
              先选你要拿这条参考视频做什么，再进入对应工作流。
            </p>
          </div>
          <button
            type="button"
            className="rounded-xl p-2 transition hover:bg-white/10"
            onClick={onClose}
            title="关闭"
          >
            <X size={16} strokeWidth={1.7} style={{ color: DESIGN_TOKENS.textMuted }} />
          </button>
        </header>

        <div className="grid gap-4 p-5 md:grid-cols-2">
          <EntryCard
            title="生成分镜草稿"
            description="上传参考视频，抽取关键帧并生成可导入画布的分镜草稿。"
            onClick={onChooseStoryboard}
            testId="reference-video-entry-storyboard"
            icon={<Film size={18} strokeWidth={1.7} style={{ color: DESIGN_TOKENS.accentHover }} />}
          />
          <EntryCard
            title="结构拆解"
            description="拆解钩子、节奏、情绪曲线与可复刻结构，沉淀为分析节点。"
            onClick={onChooseStructure}
            testId="reference-video-entry-structure"
            icon={<TrendingUp size={18} strokeWidth={1.7} style={{ color: DESIGN_TOKENS.accentHover }} />}
          />
        </div>
      </section>
    </div>,
    document.body,
  )
}
