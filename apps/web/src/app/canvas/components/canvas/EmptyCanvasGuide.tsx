/**
 * EmptyCanvasGuide - 空画布引导
 * 所有元素功能真实可点击，无视觉装饰
 */

"use client"

import { useEffect, useState } from "react"
import { FileText, Sparkles, Image, MessageCircle, Settings2, ArrowRight } from "lucide-react"
import { DESIGN_TOKENS } from "../../styles/designSystem"
import type { ProjectEntryMode } from "../../stores/useProjectStore"

interface EmptyCanvasGuideProps {
  onCreateTextNode?: () => void
  onImportScript?: () => void
  onUploadImage: () => void
  onImportReferenceVideo?: () => void
  chatOpen?: boolean
  chatPanelWidth?: number
  leftToolbarWidth?: number
  entryMode?: ProjectEntryMode
  onOpenSettings?: () => void
  onOpenOnboarding?: () => void
}

export function EmptyCanvasGuide({
  onCreateTextNode,
  onImportScript,
  onUploadImage,
  onImportReferenceVideo,
  chatOpen = false,
  chatPanelWidth = 400,
  leftToolbarWidth = 88,
  entryMode = "blank",
  onOpenSettings,
  onOpenOnboarding,
}: EmptyCanvasGuideProps) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 100)
    return () => clearTimeout(timer)
  }, [])

  const actions = entryMode === "video-production"
    ? [
        { icon: MessageCircle, label: "导入参考视频", desc: "上传成片或爆款视频，自动拆镜头与节奏结构", onClick: onImportReferenceVideo, testId: "empty-guide-import-reference-video" },
        { icon: Image, label: "上传关键画面", desc: "从首帧、角色图或场景图开始搭建视频链路", onClick: onUploadImage, testId: "empty-guide-upload-image" },
        { icon: FileText, label: "导入脚本 / 文案", desc: "补充剧情、旁白与镜头意图，继续细化镜头设计", onClick: onImportScript, testId: "empty-guide-import-script" },
      ]
    : entryMode === "storyboard"
      ? [
          { icon: FileText, label: "导入剧本 / AI 分析", desc: "粘贴或上传剧本文档，自动进入 Shot 拆分与 Bible 设定", onClick: onImportScript, testId: "empty-guide-import-script" },
          { icon: Sparkles, label: "空白写作", desc: "从一句话灵感开始创作", onClick: onCreateTextNode, testId: "empty-guide-create-text" },
          { icon: Image, label: "上传参考图", desc: "把图片放进画布，用于角色、风格、场景参考", onClick: onUploadImage, testId: "empty-guide-upload-image" },
        ]
      : [
          { icon: Sparkles, label: "空白写作", desc: "从一句话灵感开始创作", onClick: onCreateTextNode, testId: "empty-guide-create-text" },
          { icon: FileText, label: "导入剧本 / AI 分析", desc: "粘贴或上传剧本文档，自动进入 Shot 拆分与 Bible 设定", onClick: onImportScript, testId: "empty-guide-import-script" },
          { icon: MessageCircle, label: "导入参考视频", desc: "上传成片或爆款视频，再选择生成分镜草稿或做结构拆解", onClick: onImportReferenceVideo, testId: "empty-guide-import-reference-video" },
          { icon: Image, label: "上传参考图", desc: "把图片放进画布，用于角色、风格、场景参考", onClick: onUploadImage, testId: "empty-guide-upload-image" },
        ]

  const title =
    entryMode === "video-production"
      ? "开始搭建视频工作台"
      : entryMode === "storyboard"
        ? "开始生成分镜"
        : "开始创作"

  const subtitle =
    entryMode === "video-production"
      ? "先配置模型，再导入参考视频或关键画面"
      : entryMode === "storyboard"
        ? "先配置模型，再导入剧本或从一句灵感开始"
        : "先配置你的模型，再选择一个起点"

  return (
    <div
      className="pointer-events-none absolute top-0 bottom-0 flex items-center justify-center px-6"
      style={{ left: leftToolbarWidth, right: chatOpen ? chatPanelWidth : 0 }}
    >
      <div
        className={`flex w-full max-w-3xl flex-col items-center gap-6 transition-all duration-700 ${
          mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
        }`}
      >
        <div
          className="pointer-events-auto w-full rounded-[32px] border px-6 py-6 shadow-2xl backdrop-blur-2xl md:px-8 md:py-8"
          style={{
            background:
              "radial-gradient(circle at top, rgba(100,116,139,0.16), rgba(10,12,18,0.92) 55%)",
            borderColor: DESIGN_TOKENS.border,
            boxShadow: "0 24px 80px rgba(0,0,0,0.36)",
          }}
        >
          <div className="grid gap-6 md:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)] md:items-start">
            <div className="flex flex-col gap-5">
              <div className="flex flex-col gap-4">
                <div
                  className="flex h-12 w-12 items-center justify-center rounded-2xl"
                  style={{ backgroundColor: DESIGN_TOKENS.card }}
                >
                  <Sparkles
                    size={22}
                    strokeWidth={1.5}
                    style={{ color: DESIGN_TOKENS.accentHover }}
                  />
                </div>
                <div>
                  <div
                    className="mb-2 inline-flex rounded-full border px-3 py-1 text-[11px]"
                    style={{
                      borderColor: DESIGN_TOKENS.border,
                      backgroundColor: "rgba(255,255,255,0.04)",
                      color: DESIGN_TOKENS.textMuted,
                    }}
                  >
                    星轨画布工作台
                  </div>
                  <h2 className="text-2xl font-medium tracking-tight" style={{ color: DESIGN_TOKENS.text }}>
                    {title}
                  </h2>
                  <p className="mt-2 max-w-xl text-sm leading-6" style={{ color: DESIGN_TOKENS.textSecondary }}>
                    {subtitle}
                  </p>
                </div>
              </div>

              <div className="grid gap-2.5">
                {actions.map((action, index) => (
                  <button
                    key={action.label}
                    onClick={action.onClick}
                    data-testid={action.testId}
                    className="flex items-start gap-3 rounded-2xl px-4 py-3.5 text-left transition-all hover:-translate-y-0.5 hover:bg-white/10"
                    style={{
                      backgroundColor:
                        index === 0 ? "rgba(255,255,255,0.08)" : "rgba(18, 20, 28, 0.82)",
                      border: `1px solid ${DESIGN_TOKENS.border}`,
                      boxShadow: "0 10px 28px rgba(0,0,0,0.2)",
                    }}
                  >
                    <div
                      className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl"
                      style={{
                        backgroundColor:
                          index === 0 ? "rgba(255,255,255,0.08)" : DESIGN_TOKENS.surfaceAlt,
                      }}
                    >
                      <action.icon
                        size={17}
                        strokeWidth={1.6}
                        style={{
                          color:
                            index === 0 ? DESIGN_TOKENS.accentHover : DESIGN_TOKENS.accent,
                        }}
                      />
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="text-sm font-medium" style={{ color: DESIGN_TOKENS.text }}>
                        {action.label}
                      </span>
                      <span className="text-xs leading-relaxed" style={{ color: DESIGN_TOKENS.textMuted }}>
                        {action.desc}
                      </span>
                    </div>
                    <ArrowRight
                      size={16}
                      strokeWidth={1.5}
                      style={{ color: DESIGN_TOKENS.textMuted }}
                    />
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <div
                className="rounded-3xl border p-4"
                style={{
                  borderColor: DESIGN_TOKENS.border,
                  backgroundColor: "rgba(255,255,255,0.04)",
                }}
              >
                <div className="flex items-start gap-3">
                  <div
                    className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-2xl"
                    style={{ backgroundColor: DESIGN_TOKENS.accentSoft }}
                  >
                    <Settings2
                      size={16}
                      strokeWidth={1.6}
                      style={{ color: DESIGN_TOKENS.accentHover }}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium" style={{ color: DESIGN_TOKENS.text }}>
                      先连接你的模型
                    </div>
                    <p className="mt-1 text-xs leading-5" style={{ color: DESIGN_TOKENS.textMuted }}>
                      星轨画布支持你自己的中转站和任意模型。把 API Key、Base URL、默认模型填好之后，
                      后续画图、视频、分镜和聊天都会走你的配置。
                    </p>
                    <button
                      type="button"
                      onClick={onOpenSettings}
                      className="mt-3 inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-medium transition hover:bg-white/10"
                      style={{
                        borderColor: DESIGN_TOKENS.border,
                        backgroundColor: "rgba(255,255,255,0.03)",
                        color: DESIGN_TOKENS.text,
                      }}
                    >
                      <Settings2 size={14} strokeWidth={1.6} />
                      配置模型与中转站
                    </button>
                  </div>
                </div>
              </div>

              <div
                className="rounded-3xl border p-4"
                style={{
                  borderColor: DESIGN_TOKENS.border,
                  backgroundColor: "rgba(255,255,255,0.03)",
                }}
              >
                <div className="text-xs font-medium" style={{ color: DESIGN_TOKENS.text }}>
                  给新用户的建议路径
                </div>
                <div className="mt-3 space-y-2 text-xs leading-5" style={{ color: DESIGN_TOKENS.textMuted }}>
                  <div>1. 先配置模型与中转站</div>
                  <div>2. 从剧本、参考图或空白写作进入画布</div>
                  <div>3. 需要更专业的工具时，再从左侧和顶部展开</div>
                </div>
                <button
                  type="button"
                  onClick={onOpenOnboarding}
                  className="mt-3 inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-medium transition hover:bg-white/10"
                  style={{
                    backgroundColor: "rgba(255,255,255,0.05)",
                    color: DESIGN_TOKENS.textSecondary,
                  }}
                >
                  查看新手引导
                  <ArrowRight size={13} strokeWidth={1.6} />
                </button>
              </div>
            </div>
          </div>
        </div>

        <div
          className="pointer-events-auto rounded-full px-4 py-2.5"
          style={{
            backgroundColor: "rgba(18, 20, 28, 0.85)",
            border: `1px solid ${DESIGN_TOKENS.border}`,
            backdropFilter: "blur(12px)",
          }}
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
