/**
 * ShotLibraryPanel — 结构化镜头库面板 (P1-4)
 *
 * Browse, search, and apply 50+ shot presets to selected canvas nodes.
 * Presets map to CinematicParamPanel slider values for downstream AI use.
 */
"use client"

import React, { useCallback, useMemo, useState } from "react"
import { createPortal } from "react-dom"
import { X, Search, Camera, Zap, Check, Film, Crosshair } from "lucide-react"
import { DESIGN_TOKENS, ICON_CONFIG } from "../../app/canvas/styles/designSystem"
import { SHOT_PRESETS } from "./shotPresets.ts"
import { SHOT_CATEGORIES, searchShotPresets, getShotPrompt } from "./types.ts"
import type { ShotCategory, ShotPreset } from "./types.ts"

// ── Props ─────────────────────────────────────────────

export interface ShotLibraryPanelProps {
  isOpen: boolean
  onClose: () => void
  selectedNodeId?: string | null
  onApplyToNode?: (nodeId: string, shotPrompt: string) => void
}

// ── Component ─────────────────────────────────────────

function ShotLibraryPanelInner({
  isOpen,
  onClose,
  selectedNodeId,
  onApplyToNode,
}: ShotLibraryPanelProps) {
  const [search, setSearch] = useState("")
  const [category, setCategory] = useState<ShotCategory | "all">("all")
  const [appliedId, setAppliedId] = useState<string | null>(null)

  const filtered = useMemo(
    () => searchShotPresets(SHOT_PRESETS, search, category),
    [search, category],
  )

  const handleApply = useCallback(
    (preset: ShotPreset) => {
      if (!selectedNodeId || !onApplyToNode) return
      const prompt = getShotPrompt(preset)
      onApplyToNode(selectedNodeId, prompt)
      setAppliedId(preset.id)
      setTimeout(() => setAppliedId(null), 2000)
    },
    [selectedNodeId, onApplyToNode],
  )

  if (!isOpen) return null

  return createPortal(
    <div className="fixed top-16 right-4 z-[90] min-w-[360px] max-w-[420px] max-h-[calc(100vh-120px)] overflow-y-auto">
      <div className="bg-[var(--color-bg-panel)] backdrop-blur-xl rounded-xl border border-[var(--color-border)] shadow-2xl overflow-hidden">
        {/* ── Header ─────────────────────────────────── */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
          <div className="flex items-center gap-2 text-sm font-semibold text-[var(--color-text)]">
            <Film size={16} />
            镜头库
            <span className="text-[10px] text-[var(--color-text-tertiary)] font-normal">
              {SHOT_PRESETS.length} 个预设
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[var(--color-hover)] transition-colors text-[var(--color-text-secondary)]"
          >
            <X size={16} />
          </button>
        </div>

        {/* ── Search ──────────────────────────────────── */}
        <div className="p-3 border-b border-[var(--color-border)]">
          <div className="relative">
            <Search
              size={14}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-tertiary)]"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索镜头（名称、用途、类型）..."
              className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg pl-8 pr-3 py-2 text-xs text-[var(--color-text)] placeholder:text-[var(--color-text-tertiary)] focus:outline-none focus:border-[var(--color-accent)]/50"
            />
          </div>
        </div>

        {/* ── Category Tabs ────────────────────────────── */}
        <div className="px-3 pt-2 pb-1 flex flex-wrap gap-1">
          <button
            onClick={() => setCategory("all")}
            className={`px-2 py-1 rounded text-[10px] font-medium transition-all ${
              category === "all"
                ? "bg-[var(--color-accent)] text-white"
                : "bg-[var(--color-hover)] text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"
            }`}
          >
            全部
          </button>
          {SHOT_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setCategory(cat.id)}
              className={`px-2 py-1 rounded text-[10px] font-medium transition-all ${
                category === cat.id
                  ? "bg-[var(--color-accent)] text-white"
                  : "bg-[var(--color-hover)] text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"
              }`}
            >
              {cat.icon} {cat.name}
            </button>
          ))}
        </div>

        {/* ── Preset List ──────────────────────────────── */}
        <div className="p-3 space-y-1.5">
          {filtered.length === 0 && (
            <div className="text-center py-8">
              <span className="text-xs text-[var(--color-text-tertiary)]">
                未找到匹配的镜头预设
              </span>
            </div>
          )}

          {filtered.map((preset) => (
            <div
              key={preset.id}
              className="bg-[var(--color-hover)] rounded-lg p-2.5 hover:bg-[var(--color-accent)]/10 transition-colors group"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-semibold text-[var(--color-text)]">
                      {preset.name}
                    </span>
                    {preset.nameEn && (
                      <span className="text-[9px] text-[var(--color-text-tertiary)]">
                        {preset.nameEn}
                      </span>
                    )}
                  </div>

                  {/* Shot attributes */}
                  <div className="flex flex-wrap items-center gap-1 mt-1">
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--color-bg)] text-[var(--color-text-secondary)]">
                      {preset.shotSize}
                    </span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--color-bg)] text-[var(--color-text-secondary)]">
                      {preset.cameraAngle}
                    </span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--color-bg)] text-[var(--color-text-secondary)]">
                      {preset.cameraMovement}
                    </span>
                    {preset.lens && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--color-bg)] text-[var(--color-text-secondary)]">
                        {preset.lens}
                      </span>
                    )}
                  </div>

                  {/* Use cases */}
                  {preset.useCases.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {preset.useCases.slice(0, 3).map((uc) => (
                        <span
                          key={uc}
                          className="text-[8px] text-[var(--color-text-tertiary)]"
                        >
                          #{uc}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Apply button */}
                <button
                  onClick={() => handleApply(preset)}
                  disabled={!selectedNodeId}
                  className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-all flex-shrink-0 ${
                    appliedId === preset.id
                      ? "bg-green-500/20 text-green-400"
                      : "bg-[var(--color-accent)]/90 hover:bg-[var(--color-accent)] text-white disabled:opacity-30 disabled:cursor-not-allowed"
                  }`}
                  title={
                    selectedNodeId
                      ? "应用到选中节点"
                      : "请先选中一个节点"
                  }
                >
                  {appliedId === preset.id ? (
                    <>
                      <Check size={10} />
                      已应用
                    </>
                  ) : (
                    <>
                      <Zap size={10} />
                      应用
                    </>
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  )
}

export { ShotLibraryPanelInner }
export default ShotLibraryPanelInner
