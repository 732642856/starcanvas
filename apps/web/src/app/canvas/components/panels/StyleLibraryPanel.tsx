// ============================================================================
// StyleLibraryPanel — 影视画风库面板（对标小云雀2.0 100+画风库）
// ============================================================================
"use client"

import { memo, useCallback, useMemo, useState } from "react"
import { Search, Sparkles, Check, Palette, Filter, X } from "lucide-react"
import {
  STYLE_PRESETS,
  STYLE_CATEGORIES,
  getStylesByCategory,
  searchStyles,
  applyStyleToPrompt,
  type StylePreset,
  type StyleCategory,
} from "@/lib/styles/styleLibrary"
import { DESIGN_TOKENS } from "../../styles/designSystem"

// ============================================================================
// Types
// ============================================================================

interface StyleLibraryPanelProps {
  isOpen: boolean
  onClose: () => void
  currentPrompt?: string
  onApplyStyle?: (enhancedPrompt: string, style: StylePreset) => void
}

// ============================================================================
// Component
// ============================================================================

export const StyleLibraryPanel = memo(function StyleLibraryPanel({
  isOpen,
  onClose,
  currentPrompt,
  onApplyStyle,
}: StyleLibraryPanelProps) {
  const [activeCategory, setActiveCategory] = useState<StyleCategory | "all">("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedStyleId, setSelectedStyleId] = useState<string | null>(null)
  const [previewStyleId, setPreviewStyleId] = useState<string | null>(null)

  const filteredStyles = useMemo(() => {
    let styles = activeCategory === "all"
      ? STYLE_PRESETS
      : getStylesByCategory(activeCategory)
    if (searchQuery.trim()) {
      styles = searchStyles(searchQuery).filter((s) =>
        activeCategory === "all" ? true : s.category === activeCategory,
      )
    }
    return styles
  }, [activeCategory, searchQuery])

  const handleApply = useCallback(
    (style: StylePreset) => {
      if (!currentPrompt || !onApplyStyle) return
      const enhanced = applyStyleToPrompt(currentPrompt, style.id)
      onApplyStyle(enhanced, style)
      setSelectedStyleId(style.id)
      setTimeout(() => setSelectedStyleId(null), 2000)
    },
    [currentPrompt, onApplyStyle],
  )

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[10vh]"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      style={{ backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
    >
      <div
        className="flex max-h-[75vh] w-[800px] flex-col overflow-hidden rounded-2xl border shadow-2xl"
        style={{
          backgroundColor: "rgba(18, 18, 28, 0.98)",
          borderColor: DESIGN_TOKENS.border,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: `1px solid ${DESIGN_TOKENS.border}` }}>
          <div className="flex items-center gap-2">
            <Palette size={18} strokeWidth={1.5} style={{ color: DESIGN_TOKENS.accent }} />
            <span className="text-sm font-semibold" style={{ color: DESIGN_TOKENS.text }}>
              影视画风库
            </span>
            <span className="rounded-full px-1.5 py-0.5 text-[10px]" style={{ backgroundColor: "rgba(255,255,255,0.06)", color: DESIGN_TOKENS.textMuted }}>
              {STYLE_PRESETS.length} 风格
            </span>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 transition hover:bg-white/10"
            style={{ color: DESIGN_TOKENS.textMuted }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Search */}
        <div className="px-5 pt-3">
          <div className="flex items-center gap-2 rounded-xl border px-3 py-2" style={{ borderColor: DESIGN_TOKENS.border, backgroundColor: "rgba(255,255,255,0.02)" }}>
            <Search size={14} style={{ color: DESIGN_TOKENS.textMuted }} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索风格：港风、赛博朋克、吉卜力..."
              className="flex-1 bg-transparent text-xs outline-none"
              style={{ color: DESIGN_TOKENS.text }}
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")} style={{ color: DESIGN_TOKENS.textMuted }}>
                <X size={12} />
              </button>
            )}
          </div>
        </div>

        {/* Category Tabs */}
        <div className="flex gap-1 overflow-x-auto px-5 pt-3 pb-1">
          <CategoryTab
            label="全部"
            isActive={activeCategory === "all"}
            onClick={() => setActiveCategory("all")}
          />
          {STYLE_CATEGORIES.map((cat) => (
            <CategoryTab
              key={cat.id}
              label={`${cat.icon} ${cat.name}`}
              isActive={activeCategory === cat.id}
              onClick={() => setActiveCategory(cat.id)}
            />
          ))}
        </div>

        {/* Style Grid */}
        <div className="flex-1 overflow-auto px-5 py-3">
          {filteredStyles.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12" style={{ color: DESIGN_TOKENS.textMuted }}>
              <Search size={32} strokeWidth={1.2} />
              <p className="mt-2 text-sm">没有找到匹配的风格</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {filteredStyles.map((style) => (
                <StyleCard
                  key={style.id}
                  style={style}
                  isSelected={selectedStyleId === style.id}
                  isPreview={previewStyleId === style.id}
                  onSelect={() => setPreviewStyleId(previewStyleId === style.id ? null : style.id)}
                  onApply={() => handleApply(style)}
                  hasCurrentPrompt={Boolean(currentPrompt)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Hint */}
        {currentPrompt && (
          <div className="border-t px-5 py-2 text-center text-[10px]" style={{ borderColor: DESIGN_TOKENS.border, color: DESIGN_TOKENS.textMuted }}>
            点击&ldquo;应用&rdquo;将风格注入当前选中分镜的视觉提示词
          </div>
        )}
      </div>
    </div>
  )
})

// ============================================================================
// Sub-components
// ============================================================================

function CategoryTab({ label, isActive, onClick }: { label: string; isActive: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="shrink-0 rounded-full border px-3 py-1 text-[11px] font-medium transition"
      style={{
        borderColor: isActive ? DESIGN_TOKENS.accent : DESIGN_TOKENS.border,
        backgroundColor: isActive ? "rgba(99,102,241,0.12)" : "rgba(255,255,255,0.03)",
        color: isActive ? DESIGN_TOKENS.accent : DESIGN_TOKENS.textMuted,
      }}
    >
      {label}
    </button>
  )
}

function StyleCard({
  style,
  isSelected,
  isPreview,
  onSelect,
  onApply,
  hasCurrentPrompt,
}: {
  style: StylePreset
  isSelected: boolean
  isPreview: boolean
  onSelect: () => void
  onApply: () => void
  hasCurrentPrompt: boolean
}) {
  return (
    <div
      className="overflow-hidden rounded-xl border transition"
      style={{
        borderColor: isSelected ? "#22c55e" : isPreview ? DESIGN_TOKENS.borderAccent : DESIGN_TOKENS.border,
        backgroundColor: "rgba(255,255,255,0.02)",
      }}
    >
      {/* Color strip preview */}
      <div
        className="h-1.5 w-full"
        style={{
          background: style.colorPalette
            ? `linear-gradient(90deg, ${style.colorPalette.split("+").join(",")})`
            : `linear-gradient(90deg, ${DESIGN_TOKENS.accent}, ${DESIGN_TOKENS.accentHover})`,
        }}
      />

      <div className="p-3">
        {/* Name */}
        <div
          className="cursor-pointer"
          onClick={onSelect}
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-xs font-medium" style={{ color: DESIGN_TOKENS.text }}>
                {style.name}
              </div>
              <div className="mt-0.5 text-[10px]" style={{ color: DESIGN_TOKENS.textMuted }}>
                {style.nameEn}
              </div>
            </div>
            {isSelected && (
              <Check size={14} color="#22c55e" />
            )}
          </div>

          {/* Preview content */}
          {isPreview && (
            <div className="mt-2 space-y-1.5 border-t pt-2" style={{ borderColor: DESIGN_TOKENS.border }}>
              <div className="text-[10px]" style={{ color: DESIGN_TOKENS.textMuted }}>
                <span className="opacity-60">参考：</span>
                {style.visualReference}
              </div>
              <div className="flex flex-wrap gap-1">
                {style.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full px-1.5 py-0.5 text-[9px]"
                    style={{ backgroundColor: "rgba(255,255,255,0.05)", color: DESIGN_TOKENS.textMuted }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
              {style.aspectRatio && (
                <div className="text-[9px] opacity-50" style={{ color: DESIGN_TOKENS.textMuted }}>
                  推荐画幅：{style.aspectRatio}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Apply button */}
        {hasCurrentPrompt && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onApply() }}
            disabled={isSelected}
            className="mt-2 flex w-full items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-[10px] font-medium transition disabled:opacity-50"
            style={{
              backgroundColor: isSelected ? "rgba(34,197,94,0.15)" : "rgba(255,255,255,0.06)",
              color: isSelected ? "#22c55e" : DESIGN_TOKENS.textSecondary,
            }}
          >
            {isSelected ? (
              <>
                <Check size={10} />
                已应用
              </>
            ) : (
              <>
                <Sparkles size={10} />
                应用风格
              </>
            )}
          </button>
        )}
      </div>
    </div>
  )
}
