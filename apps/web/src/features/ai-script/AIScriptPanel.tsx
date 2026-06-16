/**
 * AIScriptPanel — AI-powered script generation panel (P1-1 MVP).
 *
 * User inputs a brief, selects genre/tone/duration → deterministic local
 * generator produces a structured script draft → preview with scene/shot
 * breakdown → import into canvas as storyboard nodes.
 *
 * Uses local deterministic generator (no API key required).
 * Future: swap in LLMScriptGenerator via the ScriptGenerator interface.
 */
"use client"

import React, { useCallback, useMemo, useState } from "react"
import { createPortal } from "react-dom"
import { X, Sparkles, Zap, Film, Play, Check, Clock, Layers, Camera, Loader2 } from "lucide-react"
import { DESIGN_TOKENS, ICON_CONFIG } from "../../app/canvas/styles/designSystem"
import { generateScriptDraft } from "./generateScriptDraft.ts"
import { convertAIScriptToStoryboard } from "./convertAIScriptToStoryboard.ts"
import {
  SCRIPT_GENRES,
  SCRIPT_TONES,
  DURATION_PRESETS,
} from "./types.ts"
import type {
  AIScriptInput,
  AIScriptDraft,
  AIScriptShot,
} from "./types.ts"
import type { ConvertedStoryboardShot } from "./convertAIScriptToStoryboard.ts"

// ── Props ─────────────────────────────────────────────

export interface AIScriptPanelProps {
  isOpen: boolean
  onClose: () => void
  selectedNodeId?: string | null
  onImportShots?: (shots: ConvertedStoryboardShot[]) => void
}

// ── Component ─────────────────────────────────────────

function AIScriptPanelInner({
  isOpen,
  onClose,
  selectedNodeId,
  onImportShots,
}: AIScriptPanelProps) {
  const [brief, setBrief] = useState("")
  const [genre, setGenre] = useState("short-film")
  const [duration, setDuration] = useState(30)
  const [tone, setTone] = useState("warm")
  const [language, setLanguage] = useState<"zh" | "en">("zh")
  const [draft, setDraft] = useState<AIScriptDraft | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [imported, setImported] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ── Handle generate ─────────────────────────────────
  const handleGenerate = useCallback(async () => {
    if (!brief.trim()) {
      setError("请输入故事梗概")
      return
    }
    setError(null)
    setIsGenerating(true)
    setDraft(null)

    // Simulate brief delay for UX feedback
    await new Promise((r) => setTimeout(r, 300))

    try {
      const input: AIScriptInput = { brief, genre, durationSec: duration, tone, language }
      const result = generateScriptDraft(input)
      setDraft(result)
    } catch (e) {
      setError(e instanceof Error ? e.message : "剧本生成失败")
    } finally {
      setIsGenerating(false)
    }
  }, [brief, genre, duration, tone, language])

  // ── Handle import ───────────────────────────────────
  const handleImport = useCallback(() => {
    if (!draft || !onImportShots) return
    const shots = convertAIScriptToStoryboard(draft)
    onImportShots(shots)
    setImported(true)
    setTimeout(() => setImported(false), 2000)
  }, [draft, onImportShots])

  if (!isOpen) return null

  const totalShots = useMemo(
    () => draft?.scenes.reduce((s, sc) => s + sc.shots.length, 0) ?? 0,
    [draft],
  )

  return createPortal(
    <div className="fixed top-16 right-4 z-[90] min-w-[380px] max-w-[440px] max-h-[calc(100vh-120px)] overflow-y-auto">
      <div data-testid="ai-script-panel" className="bg-[var(--color-bg-panel)] backdrop-blur-xl rounded-xl border border-[var(--color-border)] shadow-2xl overflow-hidden">
        {/* ── Header ─────────────────────────────────── */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
          <div className="flex items-center gap-2 text-sm font-semibold text-[var(--color-text)]">
            <Sparkles size={16} />
            AI 剧本生成
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[var(--color-hover)] transition-colors text-[var(--color-text-secondary)]"
          >
            <X size={16} />
          </button>
        </div>

        {/* ── Input Section ────────────────────────────── */}
        <div className="p-4 space-y-3 border-b border-[var(--color-border)]">
          {/* Brief */}
          <div>
            <label className="text-[10px] uppercase tracking-wider text-[var(--color-text-tertiary)] mb-1 block">
              故事梗概 / 产品信息
            </label>
            <textarea
              data-testid="ai-script-brief"
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              placeholder="例如：一个年轻人辞掉工作环游世界，在旅途中找回自我..."
              rows={3}
              className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-2.5 text-xs text-[var(--color-text)] placeholder:text-[var(--color-text-tertiary)] focus:outline-none focus:border-[var(--color-accent)]/50 resize-none"
            />
          </div>

          {/* Genre */}
          <div>
            <label className="text-[10px] uppercase tracking-wider text-[var(--color-text-tertiary)] mb-1 block">
              类型
            </label>
            <div className="flex flex-wrap gap-1">
              {SCRIPT_GENRES.map((g) => (
                <button
                  key={g.id}
                  onClick={() => setGenre(g.id)}
                  className={`px-2.5 py-1 rounded text-[10px] font-medium transition-all ${
                    genre === g.id
                      ? "bg-[var(--color-accent)] text-white"
                      : "bg-[var(--color-hover)] text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"
                  }`}
                >
                  {g.name}
                </button>
              ))}
            </div>
          </div>

          {/* Duration */}
          <div>
            <label className="text-[10px] uppercase tracking-wider text-[var(--color-text-tertiary)] mb-1 block">
              目标时长
            </label>
            <div className="flex gap-1">
              {DURATION_PRESETS.map((d) => (
                <button
                  key={d.value}
                  onClick={() => setDuration(d.value)}
                  className={`px-2.5 py-1 rounded text-[10px] font-medium transition-all ${
                    duration === d.value
                      ? "bg-[var(--color-accent)] text-white"
                      : "bg-[var(--color-hover)] text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          {/* Tone + Language */}
          <div>
            <label className="text-[10px] uppercase tracking-wider text-[var(--color-text-tertiary)] mb-1 block">
              语气 / 语言
            </label>
            <div className="flex gap-1 flex-wrap">
              {SCRIPT_TONES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTone(t.id)}
                  className={`px-2 py-1 rounded text-[10px] font-medium transition-all ${
                    tone === t.id
                      ? "bg-[var(--color-accent)] text-white"
                      : "bg-[var(--color-hover)] text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"
                  }`}
                >
                  {t.name}
                </button>
              ))}
              <span className="w-px bg-[var(--color-border)] mx-0.5" />
              <button
                onClick={() => setLanguage("zh")}
                className={`px-2 py-1 rounded text-[10px] font-medium transition-all ${
                  language === "zh"
                    ? "bg-[var(--color-accent)] text-white"
                    : "bg-[var(--color-hover)] text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"
                }`}
              >
                中文
              </button>
              <button
                onClick={() => setLanguage("en")}
                className={`px-2 py-1 rounded text-[10px] font-medium transition-all ${
                  language === "en"
                    ? "bg-[var(--color-accent)] text-white"
                    : "bg-[var(--color-hover)] text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"
                }`}
              >
                EN
              </button>
            </div>
          </div>

          {/* Generate Button */}
          <button
            data-testid="ai-script-generate-button"
            onClick={handleGenerate}
            disabled={isGenerating || !brief.trim()}
            className="w-full bg-[var(--color-accent)] hover:brightness-110 text-white text-xs font-medium px-4 py-2.5 rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isGenerating ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                生成中...
              </>
            ) : (
              <>
                <Sparkles size={14} />
                生成剧本
              </>
            )}
          </button>
        </div>

        {/* ── Error ────────────────────────────────────── */}
        {error && (
          <div className="mx-4 mt-3 bg-red-500/10 border border-red-500/30 rounded-lg p-2.5">
            <p className="text-xs text-red-400">{error}</p>
          </div>
        )}

        {/* ── Draft Preview ────────────────────────────── */}
        {draft && (
          <div data-testid="ai-script-draft-preview" className="p-4 space-y-3">
            {/* Meta */}
            <div className="bg-[var(--color-hover)] rounded-lg p-3 space-y-1">
              <h3 className="text-xs font-semibold text-[var(--color-text)]">{draft.title}</h3>
              <p className="text-[10px] text-[var(--color-text-secondary)]">{draft.logline}</p>
              <p className="text-[10px] text-[var(--color-text-tertiary)]">{draft.synopsis}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--color-bg)] text-[var(--color-text-secondary)]">
                  {draft.genre ?? "-"}
                </span>
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--color-bg)] text-[var(--color-text-secondary)]">
                  <Clock size={10} className="inline mr-0.5" />
                  {draft.totalDurationSec}s
                </span>
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--color-bg)] text-[var(--color-text-secondary)]">
                  <Layers size={10} className="inline mr-0.5" />
                  {draft.scenes.length} 场景
                </span>
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--color-bg)] text-[var(--color-text-secondary)]">
                  <Camera size={10} className="inline mr-0.5" />
                  {totalShots} 分镜
                </span>
              </div>
            </div>

            {/* Scene list */}
            {draft.scenes.map((scene) => (
              <div key={scene.id} className="space-y-1">
                <div className="flex items-center gap-2 text-[10px] font-semibold text-[var(--color-text)] px-1">
                  <Film size={12} />
                  {scene.title}
                  <span className="text-[var(--color-text-tertiary)] font-normal">
                    {scene.shots.length} shots
                  </span>
                  {scene.location && (
                    <span className="text-[var(--color-text-tertiary)] font-normal">· {scene.location}</span>
                  )}
                </div>

                {scene.shots.map((shot) => (
                  <div key={shot.id} className="bg-[var(--color-hover)] rounded-lg p-2 ml-4 flex gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] font-medium text-[var(--color-text)]">{shot.title}</div>
                      <p className="text-[9px] text-[var(--color-text-secondary)] mt-0.5 line-clamp-2">
                        {shot.description}
                      </p>
                      {shot.dialogue && (
                        <p className="text-[9px] text-[var(--color-text-tertiary)] italic mt-0.5 line-clamp-1">
                          {shot.dialogue}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col items-end justify-between flex-shrink-0">
                      <span className="text-[9px] text-[var(--color-text-tertiary)]">{shot.durationSec}s</span>
                      <span className="text-[8px] text-[var(--color-accent)]">#{shot.shotPresetId.split("-")[1]}</span>
                    </div>
                  </div>
                ))}
              </div>
            ))}

            {/* Import Button */}
            <button
              data-testid="ai-script-import-button"
              onClick={handleImport}
              disabled={imported}
              className={`w-full text-xs font-medium px-4 py-2.5 rounded-lg transition-all flex items-center justify-center gap-2 ${
                imported
                  ? "bg-green-500/20 text-green-400"
                  : "bg-[var(--color-accent)] hover:brightness-110 text-white"
              }`}
            >
              {imported ? (
                <>
                  <Check size={14} />
                  已导入！
                </>
              ) : (
                <>
                  <Play size={14} />
                  导入 {totalShots} 个分镜到画布
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}

export { AIScriptPanelInner }
export default AIScriptPanelInner
