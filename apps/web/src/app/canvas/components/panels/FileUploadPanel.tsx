/**
 * FileUploadPanel — 文件上传面板
 *
 * 对标 TapNow 的创作输入层。支持拖拽上传 + 点击上传。
 * 格式：DOCX / PDF / TXT / Markdown
 * 上传后自动解析文本 → 在画布上创建文档节点
 *
 * 依赖库：react-dropzone, mammoth, pdfjs-dist（在 fileParser.ts 中使用）
 */
"use client"

import React, { useCallback, useState } from "react"
import { createPortal } from "react-dom"
import { X, Upload, FileType, Film, Loader2, Check, AlertCircle } from "lucide-react"
import { DESIGN_TOKENS } from "../../styles/designSystem"
import { parseDocument, type ParseResult } from "../../utils/fileParser"
import { persistMediaFile } from "@/lib/assets/localMediaStore"
import {
  importProjectPackageToCanvas,
  type ProjectPackageCanvasImport,
} from "../../utils/projectPackageImport"
import {
  classifyUploadPanelFile,
  UPLOAD_PANEL_ACCEPT,
} from "./uploadPanelMedia"

interface FileUploadPanelProps {
  isOpen: boolean
  onClose: () => void
  onDocumentParsed: (result: ParseResult, position: { x: number; y: number }) => void
  onVideoImported?: (video: UploadPanelVideoImport, position: { x: number; y: number }) => void
  onProjectPackageImported?: (result: ProjectPackageCanvasImport) => void
}

export type UploadPanelVideoImport = {
  title: string
  url: string
  fileName: string
  fileSize: number
  mimeType: string
  assetId: string
  width?: number
  height?: number
  durationMs?: number
}

async function readVideoMetadata(file: File): Promise<{
  width?: number
  height?: number
  durationMs?: number
}> {
  const metadataUrl = URL.createObjectURL(file)
  return new Promise((resolve) => {
    const video = document.createElement("video")
    video.preload = "metadata"
    video.muted = true
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(metadataUrl)
      resolve({
        width: video.videoWidth || undefined,
        height: video.videoHeight || undefined,
        durationMs: Number.isFinite(video.duration)
          ? Math.round(video.duration * 1000)
          : undefined,
      })
    }
    video.onerror = () => {
      URL.revokeObjectURL(metadataUrl)
      resolve({})
    }
    video.src = metadataUrl
  })
}

export function FileUploadPanel({
  isOpen,
  onClose,
  onDocumentParsed,
  onVideoImported,
  onProjectPackageImported,
}: FileUploadPanelProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [isParsing, setIsParsing] = useState(false)
  const [parseResult, setParseResult] = useState<ParseResult | null>(null)
  const [videoResult, setVideoResult] = useState<UploadPanelVideoImport | null>(null)
  const [projectPackageResult, setProjectPackageResult] = useState<ProjectPackageCanvasImport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [parseProgress, setParseProgress] = useState<string>("")

  const handleFile = useCallback(async (file: File) => {
    const classification = classifyUploadPanelFile(file)
    if (classification.kind === "unsupported") {
      setError(classification.reason ?? "不支持的文件格式")
      return
    }

    setIsParsing(true)
    setError(null)
    setParseResult(null)
    setVideoResult(null)
    setProjectPackageResult(null)
    setParseProgress(
      classification.kind === "video"
        ? "正在导入视频..."
        : classification.kind === "project-package"
          ? "正在导入项目包..."
          : "正在解析文件...",
    )

    try {
      const position = {
        x: 200 + Math.random() * 300,
        y: 200 + Math.random() * 200,
      }

      if (classification.kind === "video") {
        const metadata = await readVideoMetadata(file)
        const persisted = await persistMediaFile(file, {
          kind: "video",
          width: metadata.width,
          height: metadata.height,
          durationMs: metadata.durationMs,
          mimeType: file.type,
        })
        const importedVideo: UploadPanelVideoImport = {
          title: file.name,
          url: persisted.objectUrl,
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type,
          assetId: persisted.assetId,
          width: metadata.width,
          height: metadata.height,
          durationMs: metadata.durationMs,
        }
        setVideoResult(importedVideo)
        setParseProgress("视频导入完成")
        onVideoImported?.(importedVideo, position)
      } else if (classification.kind === "project-package") {
        const text = await file.text()
        const parsed = JSON.parse(text)
        const importedProject = importProjectPackageToCanvas(parsed)
        setProjectPackageResult(importedProject)
        setParseProgress("项目包导入完成")
        onProjectPackageImported?.(importedProject)
      } else {
        const result = await parseDocument(file)
        setParseResult(result)
        setParseProgress("解析完成")
        onDocumentParsed(result, position)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "导入失败")
      setParseProgress("")
    } finally {
      setIsParsing(false)
    }
  }, [onDocumentParsed, onProjectPackageImported, onVideoImported])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
  }, [handleFile])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback(() => setIsDragging(false), [])

  const handleClick = useCallback(() => {
    const input = document.createElement("input")
    input.type = "file"
    input.accept = UPLOAD_PANEL_ACCEPT
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (file) handleFile(file)
    }
    input.click()
  }, [handleFile])

  if (!isOpen) return null

  const formatDisplay: Record<string, string> = {
    pdf: "PDF",
    docx: "DOCX",
    txt: "TXT",
    unknown: "文件",
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.75)" }}>
      <div
        className="relative w-[440px] rounded-2xl border shadow-2xl overflow-hidden"
        style={{
          backgroundColor: DESIGN_TOKENS.panel,
          borderColor: DESIGN_TOKENS.border,
          backdropFilter: "blur(20px)",
        }}
      >
        {/* ── 标题栏 ── */}
        <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: DESIGN_TOKENS.border }}>
          <div className="flex items-center gap-2">
            <Upload size={18} style={{ color: DESIGN_TOKENS.accent }} />
            <span className="text-sm font-semibold" style={{ color: DESIGN_TOKENS.text }}>文件上传</span>
          </div>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg transition-all hover:bg-white/10"
            style={{ color: DESIGN_TOKENS.textMuted }}
          >
            <X size={16} />
          </button>
        </div>

        {/* ── 拖拽区 ── */}
        <div className="p-4">
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={handleClick}
            className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed py-12 transition-all"
            style={{
              borderColor: isDragging ? DESIGN_TOKENS.accent : DESIGN_TOKENS.border,
              backgroundColor: isDragging ? DESIGN_TOKENS.accentSoft : "rgba(255,255,255,0.02)",
            }}
          >
            {isParsing ? (
              <div className="flex flex-col items-center gap-3">
                <Loader2 size={40} className="animate-spin" style={{ color: DESIGN_TOKENS.accent }} />
                <span className="text-sm" style={{ color: DESIGN_TOKENS.textSecondary }}>{parseProgress}</span>
              </div>
            ) : videoResult ? (
              <div className="flex flex-col items-center gap-2">
                <Check size={40} style={{ color: "#22c55e" }} />
                <span className="text-sm" style={{ color: DESIGN_TOKENS.textSecondary }}>
                  {videoResult.fileName}
                </span>
                <span className="text-xs" style={{ color: DESIGN_TOKENS.textMuted }}>
                  视频素材 · {Math.round(videoResult.fileSize / 1024 / 1024)}MB
                  {videoResult.durationMs && ` · ${Math.round(videoResult.durationMs / 1000)}s`}
                </span>
                <button
                  onClick={handleClick}
                  className="mt-2 rounded-lg px-3 py-1.5 text-xs transition-all hover:bg-white/10"
                  style={{ color: DESIGN_TOKENS.accentHover }}
                >
                  再次上传
                </button>
              </div>
            ) : projectPackageResult ? (
              <div className="flex flex-col items-center gap-2">
                <Check size={40} style={{ color: "#22c55e" }} />
                <span className="text-sm" style={{ color: DESIGN_TOKENS.textSecondary }}>
                  {projectPackageResult.projectName || "星轨项目包"}
                </span>
                <span className="text-xs" style={{ color: DESIGN_TOKENS.textMuted }}>
                  项目包 · {projectPackageResult.nodes.length} 节点 · {projectPackageResult.edges.length} 连线
                </span>
                <button
                  onClick={handleClick}
                  className="mt-2 rounded-lg px-3 py-1.5 text-xs transition-all hover:bg-white/10"
                  style={{ color: DESIGN_TOKENS.accentHover }}
                >
                  再次上传
                </button>
              </div>
            ) : parseResult ? (
              <div className="flex flex-col items-center gap-2">
                <Check size={40} style={{ color: "#22c55e" }} />
                <span className="text-sm" style={{ color: DESIGN_TOKENS.textSecondary }}>
                  {parseResult.fileName}
                </span>
                <span className="text-xs" style={{ color: DESIGN_TOKENS.textMuted }}>
                  {formatDisplay[parseResult.type]} · {parseResult.wordCount} 词
                  {parseResult.pageCount && ` · ${parseResult.pageCount} 页`}
                </span>
                <button
                  onClick={handleClick}
                  className="mt-2 rounded-lg px-3 py-1.5 text-xs transition-all hover:bg-white/10"
                  style={{ color: DESIGN_TOKENS.accentHover }}
                >
                  再次上传
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <Upload size={40} style={{ color: DESIGN_TOKENS.textMuted, opacity: 0.5 }} />
                <span className="text-sm" style={{ color: DESIGN_TOKENS.textSecondary }}>拖拽文件到此处</span>
                <span className="text-xs" style={{ color: DESIGN_TOKENS.textMuted }}>
                  或点击选择文件
                </span>
              </div>
            )}
          </div>

          {/* ── 错误提示 ── */}
          {error && (
            <div
              className="mt-3 flex items-center gap-2 rounded-lg px-3 py-2"
              style={{ backgroundColor: "rgba(239,68,68,0.1)", color: "#ef4444" }}
            >
              <AlertCircle size={14} />
              <span className="text-xs">{error}</span>
            </div>
          )}

          {/* ── 支持的格式 ── */}
          <div className="mt-4 rounded-xl border p-3" style={{ borderColor: DESIGN_TOKENS.border }}>
            <span className="text-[10px] font-medium" style={{ color: DESIGN_TOKENS.textMuted }}>
              支持的格式
            </span>
            <div className="mt-2 flex gap-2">
                  {[
                { label: "DOCX", ext: ".docx", desc: "Word 文档" },
                { label: "PDF", ext: ".pdf", desc: "PDF 文档" },
                { label: "TXT", ext: ".txt", desc: "纯文本" },
                { label: "MD", ext: ".md", desc: "Markdown" },
                { label: "JSON", ext: ".json", desc: "星轨项目包" },
                { label: "MP4", ext: ".mp4", desc: "视频素材" },
              ].map((fmt) => (
                <div
                  key={fmt.ext}
                  className="flex flex-1 flex-col items-center rounded-lg border p-2 text-center"
                  style={{ borderColor: DESIGN_TOKENS.border }}
                >
                  <FileType size={16} style={{ color: DESIGN_TOKENS.textMuted }} />
                  <span className="mt-1 text-[10px] font-medium" style={{ color: DESIGN_TOKENS.text }}>
                    {fmt.label}
                  </span>
                  <span className="text-[9px]" style={{ color: DESIGN_TOKENS.textMuted }}>{fmt.desc}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ── 说明 ── */}
          <p className="mt-3 text-center text-[10px]" style={{ color: DESIGN_TOKENS.textMuted }}>
            上传文档会创建文本节点；上传视频会创建素材链路；上传项目包会恢复画布
          </p>
        </div>
      </div>
    </div>,
    document.body,
  )
}
