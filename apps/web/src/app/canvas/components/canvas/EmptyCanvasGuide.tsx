/**
 * EmptyCanvasGuide - 空画布引导
 * 所有元素功能真实可点击，无视觉装饰
 */

"use client"

import { useEffect, useState } from "react"
import { FileText, Sparkles, Image, MessageCircle } from "lucide-react"
import { DESIGN_TOKENS } from "../../styles/designSystem"

interface EmptyCanvasGuideProps {
  onCreateTextNode?: () => void
  onImportScript?: () => void
  onUploadImage: () => void
  chatOpen?: boolean
  chatPanelWidth?: number
  leftToolbarWidth?: number
}

export function EmptyCanvasGuide({
  onCreateTextNode,
  onImportScript,
  onUploadImage,
  chatOpen = false,
  chatPanelWidth = 400,
  leftToolbarWidth = 88,
}: EmptyCanvasGuideProps) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 100)
    return () => clearTimeout(timer)
  }, [])

  const actions = [
    { icon: FileText, label: "导入剧本 / AI 分析", desc: "粘贴或上传剧本文档，自动进入 Shot 拆分与 Bible 设定", onClick: onImportScript, testId: "empty-guide-import-script" },
    { icon: Sparkles, label: "空白写作", desc: "从一句话灵感开始创作", onClick: onCreateTextNode, testId: "empty-guide-create-text" },
    { icon: Image, label: "上传参考图", desc: "把图片放进画布，用于角色、风格、场景参考", onClick: onUploadImage, testId: "empty-guide-upload-image" },
  ]

  return (
    <div
      className="absolute top-0 bottom-0 flex items-center justify-center pointer-events-none"
      style={{ left: leftToolbarWidth, right: chatOpen ? chatPanelWidth : 0 }}
    >
      <div
        className={`flex flex-col items-center gap-6 transition-all duration-700 ${
          mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
        }`}
      >
        {/* Title */}
        <div className="flex flex-col items-center gap-3 pointer-events-auto">
          <div
            className="flex h-12 w-12 items-center justify-center rounded-2xl"
            style={{ backgroundColor: DESIGN_TOKENS.card }}
          >
            <Sparkles size={22} strokeWidth={1.5} style={{ color: DESIGN_TOKENS.accent }} />
          </div>
          <div className="text-center">
            <h2 className="text-lg font-medium" style={{ color: DESIGN_TOKENS.text }}>
              开始创作
            </h2>
            <p className="mt-1 text-sm" style={{ color: DESIGN_TOKENS.textMuted }}>
              选择一个起点
            </p>
          </div>
        </div>

        {/* Action Cards — all clickable, no decoration */}
        <div className="pointer-events-auto flex flex-col gap-2 w-72">
          {actions.map((action) => (
            <button
              key={action.label}
              onClick={action.onClick}
              data-testid={action.testId}
              className="flex items-start gap-3 rounded-xl px-4 py-3 text-left transition-all hover:bg-white/10"
              style={{
                backgroundColor: "rgba(18, 20, 28, 0.88)",
                border: `1px solid ${DESIGN_TOKENS.border}`,
                backdropFilter: "blur(16px)",
                boxShadow: "0 4px 24px rgba(0,0,0,0.25)",
              }}
            >
              <div
                className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg"
                style={{ backgroundColor: DESIGN_TOKENS.surfaceAlt }}
              >
                <action.icon size={16} strokeWidth={1.5} style={{ color: DESIGN_TOKENS.accent }} />
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-medium" style={{ color: DESIGN_TOKENS.text }}>
                  {action.label}
                </span>
                <span className="text-[11px] leading-relaxed" style={{ color: DESIGN_TOKENS.textMuted }}>
                  {action.desc}
                </span>
              </div>
            </button>
          ))}
        </div>

        {/* Tip bar */}
        <div
          className="pointer-events-auto rounded-lg px-3.5 py-2.5"
          style={{ backgroundColor: "rgba(18, 20, 28, 0.85)", border: `1px solid ${DESIGN_TOKENS.border}`, backdropFilter: "blur(12px)" }}
        >
          <span className="text-[11px]" style={{ color: DESIGN_TOKENS.textMuted }}>
            按 <kbd className="mx-0.5 rounded border px-1 py-0.5 text-[10px]" style={{ borderColor: DESIGN_TOKENS.border, backgroundColor: DESIGN_TOKENS.surfaceAlt }}>/</kbd> 打开命令菜单 · 右键打开节点菜单
          </span>
        </div>
      </div>
    </div>
  )
}

export default EmptyCanvasGuide
