/**
 * ReverseStoryboardPanel — Reference Video → Storyboard (MVP)
 *
 * P0-1: Upload reference video → extract key frames → generate storyboard draft → import to canvas.
 *
 * All frame extraction happens client-side via <video> + <canvas>.
 */
"use client"

import React, { useCallback, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { X, Upload, Camera, Film, Image, Play, Loader2, Check, Sparkles, Clock } from "lucide-react"
import { DESIGN_TOKENS } from "../../app/canvas/styles/designSystem"
import { useVideoFrameExtractor } from "@/features/reverse-storyboard/useVideoFrameExtractor.ts"
import { generateStoryboardDraft } from "@/features/reverse-storyboard/generateStoryboardDraft.ts"
import {
  validateVideoFile,
  validateVideoDuration,
  VIDEO_CONSTRAINTS,
} from "@/features/reverse-storyboard/types.ts"
import type {
  ReverseStoryboardShot,
  ExtractedVideoFrame,
  VideoMetadata,
  ReverseStoryboardSource,
} from "@/features/reverse-storyboard/types.ts"

// ── Props ─────────────────────────────────────────────

export interface ReverseStoryboardPanelProps {
  isOpen: boolean
  onClose: () => void
  selectedNodeId?: string | null
  onImportShots?: (shots: ReverseStoryboardShot[], videoMeta: VideoMetadata) => void
}

// ── Component ─────────────────────────────────────────

function ReverseStoryboardPanelInner({
  isOpen,
  onClose,
  selectedNodeId,
  onImportShots,
}: ReverseStoryboardPanelProps) {
  const [file, setFile] = useState<File | null>(null)
  const [videoMeta, setVideoMeta] = useState<VideoMetadata | null>(null)
  const [draftShots, setDraftShots] = useState<ReverseStoryboardShot[] | null>(null)
  const [imported, setImported] = useState(false)
  const [fileError, setFileError] = useState<string | null>(null)
  const [durationError, setDurationError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { state: extractor, extractFromFile, reset: resetExtractor } = useVideoFrameExtractor()

  // ── Step 1: File selection ──────────────────────────
  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selected = e.target.files?.[0]
      if (!selected) return

      setFileError(null)
      setDurationError(null)
      setDraftShots(null)
      setImported(false)

      const validationError = validateVideoFile(selected)
      if (validationError) {
        setFileError(validationError.message)
        return
      }

      setFile(selected)
      setVideoMeta(null)
    },
    [],
  )

  // ── Step 2: Extract key frames ──────────────────────
  const handleExtractFrames = useCallback(async () => {
    if (!file) return
    setFileError(null)
    setDurationError(null)
    setDraftShots(null)
    setImported(false)

    const frames = await extractFromFile(file, {
      count: VIDEO_CONSTRAINTS.defaultFrameCount,
      maxFrames: VIDEO_CONSTRAINTS.maxFrames,
    })

    if (frames.length > 0) {
      // Derive video metadata from extractor state
      const meta: VideoMetadata = {
        fileName: file.name,
        fileSizeBytes: file.size,
        durationSec: extractor.videoDuration,
        width: extractor.videoWidth,
        height: extractor.videoHeight,
        mimeType: file.type,
      }

      // Validate duration
      const durError = validateVideoDuration(meta.durationSec)
      if (durError) {
        setDurationError(durError.message)
        resetExtractor()
        return
      }

      setVideoMeta(meta)
    }
  }, [file, extractFromFile, extractor.videoDuration, extractor.videoWidth, extractor.videoHeight, resetExtractor])

  // ── Step 3: Generate storyboard draft ───────────────
  const handleGenerateDraft = useCallback(() => {
    if (extractor.frames.length === 0) return
    const shots = generateStoryboardDraft(extractor.frames)
    setDraftShots(shots)
  }, [extractor.frames])

  // ── Step 4: Import to canvas ────────────────────────
  const handleImportToCanvas = useCallback(() => {
    if (!draftShots || !videoMeta || !onImportShots) return
    onImportShots(draftShots, videoMeta)
    setImported(true)
    setTimeout(() => setImported(false), 2000)
  }, [draftShots, videoMeta, onImportShots])

  // ── Reset ───────────────────────────────────────────
  const handleReset = useCallback(() => {
    setFile(null)
    setVideoMeta(null)
    setDraftShots(null)
    setFileError(null)
    setDurationError(null)
    setImported(false)
    resetExtractor()
    if (fileInputRef.current) fileInputRef.current.value = ""
  }, [resetExtractor])

  // ── Format helpers ──────────────────────────────────
  const formatDuration = (sec: number) => {
    const m = Math.floor(sec / 60)
    const s = Math.floor(sec % 60)
    return m > 0 ? `${m}分${s}秒` : `${s}秒`
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    const kb = bytes / 1024
    if (kb < 1024) return `${kb.toFixed(1)} KB`
    return `${(kb / 1024).toFixed(1)} MB`
  }

  if (!isOpen) return null

  const isExtracting = extractor.status === "loading-video" || extractor.status === "extracting"
  const hasFrames = extractor.status === "done" && extractor.frames.length > 0
  const hasDraft = draftShots !== null && draftShots.length > 0
  const error = extractor.error || fileError || durationError

  return createPortal(
    <div className="fixed top-16 right-4 z-[90] min-w-[360px] max-w-[420px] max-h-[calc(100vh-120px)] overflow-y-auto">
      <div className="bg-[var(--color-bg-panel)] backdrop-blur-xl rounded-xl border border-[var(--color-border)] shadow-2xl overflow-hidden">
        {/* ── Header ─────────────────────────────────── */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
          <div className="flex items-center gap-2 text-sm font-semibold text-[var(--color-text)]">
            <Film size={16} />
            参考视频逆向分镜
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={handleReset}
              disabled={isExtracting}
              className="text-[10px] px-2 py-1 rounded bg-[var(--color-hover)] text-[var(--color-text-secondary)] hover:text-[var(--color-text)] disabled:opacity-30 transition-colors"
            >
              重置
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-[var(--color-hover)] transition-colors text-[var(--color-text-secondary)]"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="p-4 space-y-4">
          {/* ── Step 1: Upload ────────────────────────── */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="w-5 h-5 rounded-full bg-[var(--color-accent)] text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                1
              </span>
              <span className="text-xs font-medium text-[var(--color-text)]">选择参考视频</span>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept={VIDEO_CONSTRAINTS.supportedExtensions.map((e) => `.${e.slice(1)}`).join(",")}
              onChange={handleFileSelect}
              className="hidden"
            />

            {!file ? (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full border-2 border-dashed border-[var(--color-border)] rounded-xl p-6 flex flex-col items-center gap-2 hover:border-[var(--color-accent)]/50 hover:bg-[var(--color-accent)]/5 transition-all"
              >
                <Upload size={24} className="text-[var(--color-text-tertiary)]" />
                <span className="text-xs text-[var(--color-text-secondary)]">
                  点击选择视频文件（MP4 / WebM / MOV）
                </span>
                <span className="text-[10px] text-[var(--color-text-tertiary)]">
                  最大 100 MB，最长 120 秒
                </span>
              </button>
            ) : (
              <div className="bg-[var(--color-hover)] rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-[var(--color-text)] truncate max-w-[200px]">
                    {file.name}
                  </span>
                  <span className="text-[10px] text-[var(--color-text-tertiary)]">
                    {formatFileSize(file.size)}
                  </span>
                </div>

                {videoMeta && (
                  <div className="flex items-center gap-3 text-[10px] text-[var(--color-text-secondary)]">
                    <span className="flex items-center gap-1">
                      <Clock size={10} />
                      {formatDuration(videoMeta.durationSec)}
                    </span>
                    <span>
                      {videoMeta.width}×{videoMeta.height}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Step 2: Extract Frames ─────────────────── */}
          {file && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="w-5 h-5 rounded-full bg-[var(--color-accent)] text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                  2
                </span>
                <span className="text-xs font-medium text-[var(--color-text)]">抽取关键帧</span>
              </div>

              {isExtracting && (
                <div className="bg-[var(--color-hover)] rounded-lg p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Loader2 size={14} className="animate-spin text-[var(--color-accent)]" />
                    <span className="text-xs text-[var(--color-text-secondary)]">
                      {extractor.status === "loading-video" ? "加载视频中..." : `抽取中... ${Math.round(extractor.progress * 100)}%`}
                    </span>
                  </div>
                  <div className="w-full h-1 bg-[var(--color-bg)] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[var(--color-accent)] transition-all duration-300"
                      style={{ width: `${extractor.progress * 100}%` }}
                    />
                  </div>
                </div>
              )}

              {!hasFrames && !isExtracting && (
                <button
                  onClick={handleExtractFrames}
                  className="w-full bg-[var(--color-accent)] hover:brightness-110 text-white text-xs font-medium px-4 py-2 rounded-lg transition-all flex items-center justify-center gap-2"
                >
                  <Camera size={14} />
                  抽取 {VIDEO_CONSTRAINTS.defaultFrameCount} 个关键帧
                </button>
              )}

              {hasFrames && (
                <div className="space-y-2">
                  <div className="grid grid-cols-4 gap-1.5">
                    {extractor.frames.slice(0, 8).map((frame) => (
                      <div
                        key={frame.id}
                        className="relative aspect-video rounded-lg overflow-hidden border border-[var(--color-border)]"
                      >
                        <img
                          src={frame.dataUrl}
                          alt={`帧 ${frame.timeSec}s`}
                          className="w-full h-full object-cover"
                        />
                        <span className="absolute bottom-0.5 right-0.5 bg-black/70 text-white text-[8px] px-1 rounded">
                          {(frame.timeSec).toFixed(1)}s
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-[var(--color-text-tertiary)]">
                      已抽取 {extractor.frames.length} 个关键帧
                    </span>
                    <button
                      onClick={handleExtractFrames}
                      className="text-[10px] text-[var(--color-accent)] hover:underline"
                    >
                      重新抽取
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Step 3: Generate Draft ─────────────────── */}
          {hasFrames && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="w-5 h-5 rounded-full bg-[var(--color-accent)] text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                  3
                </span>
                <span className="text-xs font-medium text-[var(--color-text)]">生成分镜草稿</span>
              </div>

              {!hasDraft && (
                <button
                  onClick={handleGenerateDraft}
                  className="w-full bg-[var(--color-accent)] hover:brightness-110 text-white text-xs font-medium px-4 py-2 rounded-lg transition-all flex items-center justify-center gap-2"
                >
                  <Sparkles size={14} />
                  从关键帧生成分镜草稿
                </button>
              )}

              {hasDraft && (
                <div className="space-y-2">
                  {draftShots.map((shot, i) => (
                    <div
                      key={shot.id}
                      className="bg-[var(--color-hover)] rounded-lg p-2.5 flex gap-2.5"
                    >
                      <div className="w-20 h-12 rounded overflow-hidden border border-[var(--color-border)] flex-shrink-0">
                        <img
                          src={shot.thumbnail}
                          alt={shot.title}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-semibold text-[var(--color-text)]">
                            {shot.title}
                          </span>
                          <span className="text-[9px] text-[var(--color-text-tertiary)]">
                            {shot.timeSec.toFixed(1)}s | {shot.durationSec}s
                          </span>
                        </div>
                        <p className="text-[10px] text-[var(--color-text-secondary)] leading-relaxed mt-0.5 line-clamp-2">
                          {shot.description}
                        </p>
                      </div>
                    </div>
                  ))}
                  <button
                    onClick={handleGenerateDraft}
                    className="w-full text-[10px] text-[var(--color-accent)] hover:underline text-center py-1"
                  >
                    重新生成
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── Step 4: Import to Canvas ────────────────── */}
          {hasDraft && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="w-5 h-5 rounded-full bg-[var(--color-accent)] text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                  4
                </span>
                <span className="text-xs font-medium text-[var(--color-text)]">导入画布</span>
              </div>

              <button
                onClick={handleImportToCanvas}
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
                    导入 {draftShots.length} 个分镜到画布
                  </>
                )}
              </button>
            </div>
          )}

          {/* ── Error Display ───────────────────────────── */}
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
              <p className="text-xs text-red-400">{error}</p>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}

export { ReverseStoryboardPanelInner }
export default ReverseStoryboardPanelInner
