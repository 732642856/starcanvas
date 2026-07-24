"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { createPortal } from "react-dom";
import {
  Film,
  Loader2,
  Upload,
  X,
  ChevronDown,
  ChevronUp,
  Layers,
  BarChart3,
  TrendingUp,
  Zap,
  Sparkles,
  FileVideo,
  AlertTriangle,
} from "lucide-react";
import { DESIGN_TOKENS } from "../../styles/designSystem";
import { analyzeRemix, type RemixAnalysisResult } from "../../utils/newWorkflowServices";

// ── 类型定义 ────────────────────────────────────────────────────────────────

export type VideoRemixBeatNode = {
  index: number;
  timestamp: string;
  duration: string;
  type: string;
  description: string;
  visualNotes: string;
  audioNotes: string;
  emotionalValence: number;
};

export type VideoRemixImportPayload = {
  videoName: string;
  result: RemixAnalysisResult;
};

type VideoRemixPanelProps = {
  isOpen: boolean;
  onClose: () => void;
  onImportRemix: (payload: VideoRemixImportPayload) => void;
};

type UploadState = {
  /** 上传阶段：none=未上传, uploading=上传中, uploaded=已上传, analyzing=分析中, done=分析完成, error=出错 */
  phase: "none" | "uploading" | "uploaded" | "analyzing" | "done" | "error";
  fileName?: string;
  fileSize?: number;
  progress: number; // 0-100
  error?: string;
};

const BEAT_TYPE_LABELS: Record<string, string> = {
  hook: "钩子",
  setup: "铺垫",
  conflict: "冲突",
  climax: "高潮",
  twist: "反转",
  resolution: "收尾",
  cta: "引导",
};

const BEAT_TYPE_COLORS: Record<string, string> = {
  hook: "text-rose-400 bg-rose-500/10",
  setup: "text-blue-400 bg-blue-500/10",
  conflict: "text-orange-400 bg-orange-500/10",
  climax: "text-purple-400 bg-purple-500/10",
  twist: "text-amber-400 bg-amber-500/10",
  resolution: "text-emerald-400 bg-emerald-500/10",
  cta: "text-cyan-400 bg-cyan-500/10",
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * 情绪值 → 标签
 */
function valenceLabel(val: number): string {
  if (val <= -0.6) return "非常负面";
  if (val <= -0.2) return "负面";
  if (val < 0.2) return "中性";
  if (val < 0.6) return "正面";
  return "非常正面";
}

function valenceColor(val: number): string {
  if (val <= -0.2) return "text-red-400";
  if (val < 0.2) return "text-white/50";
  return "text-green-400";
}

// ── 组件 ────────────────────────────────────────────────────────────────────

export function VideoRemixPanel({ isOpen, onClose, onImportRemix }: VideoRemixPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [videoDescription, setVideoDescription] = useState("");
  const [uploadState, setUploadState] = useState<UploadState>({ phase: "none", progress: 0 });
  const [result, setResult] = useState<RemixAnalysisResult | null>(null);
  const [expandedBeats, setExpandedBeats] = useState(true);
  const [isDragOver, setIsDragOver] = useState(false);

  // 重置状态
  const reset = useCallback(() => {
    setUploadState({ phase: "none", progress: 0 });
    setResult(null);
    setVideoDescription("");
    setExpandedBeats(true);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  // 关闭
  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [onClose, reset]);

  // ── 视频文件处理 ──────────────────────────────────────────────────────────

  const handleVideoFile = useCallback(async (file: File) => {
    if (!file.type.startsWith("video/")) {
      setUploadState({ phase: "error", progress: 0, error: "请选择视频文件（MP4、MOV、AVI 等格式）" });
      return;
    }

    // 大文件限制（500MB）
    if (file.size > 500 * 1024 * 1024) {
      setUploadState({ phase: "error", progress: 0, error: "视频文件过大，请选择 500MB 以内的视频" });
      return;
    }

    setUploadState({ phase: "uploading", fileName: file.name, fileSize: file.size, progress: 0 });

    // 模拟上传进度（实际项目中应调用真实上传 API）
    for (let p = 10; p <= 90; p += Math.floor(Math.random() * 15) + 5) {
      await new Promise((r) => setTimeout(r, 120));
      setUploadState((prev) => ({ ...prev, progress: Math.min(p, 90) }));
    }

    setUploadState((prev) => ({
      ...prev,
      phase: "uploaded",
      progress: 100,
      fileName: file.name,
      fileSize: file.size,
    }));
  }, []);

  // 文件选择
  const handleFileChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      handleVideoFile(file);
    },
    [handleVideoFile],
  );

  // 拖拽
  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (!file) return;
      handleVideoFile(file);
    },
    [handleVideoFile],
  );

  // ── 开始分析 ──────────────────────────────────────────────────────────────

  const handleAnalyze = useCallback(async () => {
    if (uploadState.phase !== "uploaded") return;

    setUploadState((prev) => ({ ...prev, phase: "analyzing" }));
    setResult(null);

    try {
      const description = videoDescription.trim() || uploadState.fileName || "上传的视频";
      const data = await analyzeRemix(description, { useLLM: false });
      setResult(data);
      setUploadState((prev) => ({ ...prev, phase: "done" }));
    } catch (err: any) {
      setUploadState((prev) => ({
        ...prev,
        phase: "error",
        error: err?.message || "分析失败，请稍后重试",
      }));
    }
  }, [uploadState, videoDescription]);

  // ── 导入到画布 ────────────────────────────────────────────────────────────

  const handleImport = useCallback(() => {
    if (!result) return;

    onImportRemix({
      videoName: uploadState.fileName || "视频拉片",
      result,
    });
    reset();
    onClose();
  }, [result, uploadState.fileName, onImportRemix, reset, onClose]);

  // ── 计算统计 ──────────────────────────────────────────────────────────────

  const beatCount = useMemo(() => result?.template?.structure?.length ?? 0, [result]);

  const canAnalyze = uploadState.phase === "uploaded";
  const canImport = result !== null;

  if (!isOpen || typeof document === "undefined") return null;

  // ── 渲染 ──────────────────────────────────────────────────────────────────

  const beats = result?.template?.structure ?? [];

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center px-6">
      <button
        type="button"
        aria-label="关闭一键拉片面板"
        className="absolute inset-0 cursor-default bg-black/60"
        onClick={handleClose}
      />

      <section
        data-testid="video-remix-panel"
        className="relative z-10 flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border shadow-2xl"
        style={{
          backgroundColor: DESIGN_TOKENS.panelSolid,
          borderColor: DESIGN_TOKENS.border,
          boxShadow: DESIGN_TOKENS.shadowPanel,
        }}
      >
        {/* 头部 */}
        <header
          className="flex items-start justify-between gap-4 border-b px-5 py-4"
          style={{ borderColor: DESIGN_TOKENS.border }}
        >
          <div className="flex items-start gap-3">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-2xl"
              style={{ backgroundColor: DESIGN_TOKENS.accentSoft }}
            >
              <Film size={18} strokeWidth={1.7} style={{ color: DESIGN_TOKENS.accentHover }} />
            </div>
            <div>
              <h2 className="text-base font-semibold" style={{ color: DESIGN_TOKENS.text }}>
                一键拉片
              </h2>
              <p className="mt-1 text-xs leading-5" style={{ color: DESIGN_TOKENS.textMuted }}>
                上传视频，AI 自动拆解为分镜结构，可导入画布编辑
              </p>
            </div>
          </div>
          <button
            type="button"
            className="rounded-xl p-2 transition hover:bg-white/10"
            onClick={handleClose}
            aria-label="关闭"
            title="关闭"
          >
            <X size={16} strokeWidth={1.7} style={{ color: DESIGN_TOKENS.textMuted }} />
          </button>
        </header>

        {/* 内容区 */}
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <div className="grid gap-4 md:grid-cols-[240px_1fr]">
            {/* 左侧：上传区 + 描述 */}
            <aside className="space-y-3">
              {/* 拖拽上传 */}
              <button
                type="button"
                className={`flex w-full flex-col items-center justify-center rounded-2xl border border-dashed px-4 py-7 text-center transition ${
                  isDragOver ? "border-cyan-400/50 bg-cyan-500/5" : ""
                } hover:bg-white/5`}
                style={{ borderColor: isDragOver ? undefined : DESIGN_TOKENS.borderStrong }}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                {uploadState.phase === "uploading" || uploadState.phase === "analyzing" ? (
                  <Loader2 size={28} className="animate-spin" style={{ color: DESIGN_TOKENS.accentHover }} />
                ) : (
                  <Upload size={28} strokeWidth={1.5} style={{ color: DESIGN_TOKENS.accentHover }} />
                )}
                <span className="mt-3 text-sm font-medium" style={{ color: DESIGN_TOKENS.textSecondary }}>
                  {uploadState.phase === "none" ? "选择视频文件" : uploadState.fileName}
                </span>
                <span className="mt-1 text-[11px] leading-4" style={{ color: DESIGN_TOKENS.textMuted }}>
                  {uploadState.phase === "none"
                    ? "MP4 / MOV / AVI · 500MB 内"
                    : uploadState.fileSize
                      ? formatFileSize(uploadState.fileSize)
                      : ""}
                </span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="video/*"
                className="hidden"
                onChange={handleFileChange}
              />

              {/* 上传进度 */}
              {(uploadState.phase === "uploading" || uploadState.phase === "analyzing") && (
                <div className="rounded-2xl border p-3" style={{ borderColor: DESIGN_TOKENS.border }}>
                  <div className="mb-2 flex items-center justify-between text-xs" style={{ color: DESIGN_TOKENS.textSecondary }}>
                    <span>
                      {uploadState.phase === "uploading" ? "上传中..." : "AI 分析中..."}
                    </span>
                    <span>{uploadState.progress}%</span>
                  </div>
                  <div
                    className="h-1.5 w-full overflow-hidden rounded-full"
                    style={{ backgroundColor: DESIGN_TOKENS.surfaceAlt }}
                  >
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{
                        width: `${uploadState.phase === "analyzing" ? 60 : uploadState.progress}%`,
                        backgroundColor: DESIGN_TOKENS.accentHover,
                      }}
                    />
                  </div>
                </div>
              )}

              {/* 上传完成 */}
              {uploadState.phase === "uploaded" && uploadState.fileName && (
                <div
                  className="rounded-2xl border p-3"
                  style={{ borderColor: DESIGN_TOKENS.border, backgroundColor: DESIGN_TOKENS.card }}
                >
                  <div className="flex items-center gap-2 text-xs font-medium" style={{ color: DESIGN_TOKENS.text }}>
                    <FileVideo size={14} />
                    <span className="truncate">{uploadState.fileName}</span>
                  </div>
                  <div className="mt-1 text-[11px]" style={{ color: DESIGN_TOKENS.textMuted }}>
                    {uploadState.fileSize ? formatFileSize(uploadState.fileSize) : ""} · 已上传
                  </div>
                </div>
              )}

              {/* 错误提示 */}
              {uploadState.phase === "error" && uploadState.error && (
                <div className="flex items-start gap-2 rounded-2xl border border-red-400/25 bg-red-500/10 px-3 py-2 text-xs text-red-100">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                  <span>{uploadState.error}</span>
                </div>
              )}

              {/* 视频描述 */}
              <div>
                <label
                  className="mb-1.5 block text-xs font-medium"
                  style={{ color: DESIGN_TOKENS.textSecondary }}
                >
                  视频描述（可选）
                </label>
                <textarea
                  value={videoDescription}
                  onChange={(e) => setVideoDescription(e.target.value)}
                  className="w-full resize-none rounded-2xl border bg-black/30 px-3 py-2.5 text-xs leading-5 outline-none transition focus:border-slate-400"
                  style={{ borderColor: DESIGN_TOKENS.border, color: DESIGN_TOKENS.textSecondary }}
                  placeholder="简要描述视频内容，帮助 AI 更精准分析…"
                  rows={3}
                />
              </div>

              {/* 开始分析按钮 */}
              {uploadState.phase === "uploaded" && (
                <button
                  type="button"
                  onClick={handleAnalyze}
                  disabled={!canAnalyze}
                  className="flex w-full items-center justify-center gap-1.5 rounded-full px-4 py-2.5 text-xs font-semibold transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-40"
                  style={{ backgroundColor: DESIGN_TOKENS.accent, color: "#fff" }}
                >
                  <Zap size={14} />
                  开始分析
                </button>
              )}
            </aside>

            {/* 右侧：分析结果 */}
            <main className="min-h-[300px] space-y-3">
              {uploadState.phase === "analyzing" && (
                <div className="flex flex-col items-center justify-center gap-3 py-16 text-white/30">
                  <Loader2 size={32} className="animate-spin" />
                  <span className="text-sm">AI 正在分析视频结构…</span>
                </div>
              )}

              {uploadState.phase === "none" && (
                <div className="flex flex-col items-center justify-center gap-3 py-16 text-white/20">
                  <Film size={40} strokeWidth={1.2} />
                  <span className="text-sm" style={{ color: DESIGN_TOKENS.textMuted }}>
                    先上传视频即可开始拉片分析
                  </span>
                </div>
              )}

              {result && (
                <>
                  {/* 模板概览 */}
                  <div
                    className="rounded-2xl border p-4"
                    style={{ borderColor: DESIGN_TOKENS.border, backgroundColor: DESIGN_TOKENS.card }}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-sm font-semibold" style={{ color: DESIGN_TOKENS.text }}>
                          {result.template.name}
                        </h3>
                        <p className="mt-0.5 text-[11px]" style={{ color: DESIGN_TOKENS.textMuted }}>
                          {result.template.category} · {result.template.totalDuration}
                        </p>
                      </div>
                      <span className="text-[10px] text-white/20">来源: {result.source}</span>
                    </div>
                    {result.template.hookPattern && (
                      <p className="mt-2 text-xs leading-5" style={{ color: DESIGN_TOKENS.textSecondary }}>
                        <span className="font-medium text-white/60">钩子模式：</span>
                        {result.template.hookPattern}
                      </p>
                    )}
                  </div>

                  {/* 关键指标 */}
                  <div
                    className="rounded-2xl border p-4"
                    style={{ borderColor: DESIGN_TOKENS.border, backgroundColor: DESIGN_TOKENS.card }}
                  >
                    <div className="mb-3 flex items-center gap-1.5">
                      <BarChart3 size={13} className="text-white/40" />
                      <span className="text-[11px] font-medium" style={{ color: DESIGN_TOKENS.textMuted }}>
                        关键指标
                      </span>
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      <div className="rounded-xl bg-white/[0.03] px-3 py-2 text-center">
                        <div className="text-lg font-bold" style={{ color: DESIGN_TOKENS.text }}>
                          {result.keyMetrics.hookTime}
                        </div>
                        <div className="text-[10px]" style={{ color: DESIGN_TOKENS.textMuted }}>
                          钩子时间
                        </div>
                      </div>
                      <div className="rounded-xl bg-white/[0.03] px-3 py-2 text-center">
                        <div className="text-lg font-bold" style={{ color: DESIGN_TOKENS.text }}>
                          {result.keyMetrics.conflictDensity}
                        </div>
                        <div className="text-[10px]" style={{ color: DESIGN_TOKENS.textMuted }}>
                          冲突密度
                        </div>
                      </div>
                      <div className="rounded-xl bg-white/[0.03] px-3 py-2 text-center">
                        <div className="text-lg font-bold" style={{ color: DESIGN_TOKENS.text }}>
                          {result.keyMetrics.twistCount}
                        </div>
                        <div className="text-[10px]" style={{ color: DESIGN_TOKENS.textMuted }}>
                          反转次数
                        </div>
                      </div>
                      <div className="rounded-xl bg-white/[0.03] px-3 py-2 text-center">
                        <div className="text-lg font-bold capitalize" style={{ color: DESIGN_TOKENS.text }}>
                          {result.keyMetrics.pacing === "fast"
                            ? "快"
                            : result.keyMetrics.pacing === "slow"
                              ? "慢"
                              : "中"}
                        </div>
                        <div className="text-[10px]" style={{ color: DESIGN_TOKENS.textMuted }}>
                          节奏
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 情绪曲线 */}
                  {result.emotionalCurve.length > 0 && (
                    <div
                      className="rounded-2xl border p-4"
                      style={{ borderColor: DESIGN_TOKENS.border, backgroundColor: DESIGN_TOKENS.card }}
                    >
                      <div className="mb-3 flex items-center gap-1.5">
                        <TrendingUp size={13} className="text-white/40" />
                        <span className="text-[11px] font-medium" style={{ color: DESIGN_TOKENS.textMuted }}>
                          情绪曲线
                        </span>
                      </div>
                      <div className="flex items-end gap-1.5" style={{ height: 48 }}>
                        {result.emotionalCurve.map((point, i) => {
                          const height = Math.max(4, (point.valence + 1) * 24);
                          return (
                            <div
                              key={i}
                              className="group relative flex-1 rounded-sm transition-all hover:opacity-80"
                              style={{
                                height: `${height}px`,
                                backgroundColor:
                                  point.valence > 0
                                    ? "rgba(34, 197, 94, 0.6)"
                                    : point.valence < 0
                                      ? "rgba(239, 68, 68, 0.6)"
                                      : "rgba(148, 163, 184, 0.3)",
                              }}
                              title={`${point.phase}: ${point.valence.toFixed(1)}`}
                            >
                              <span className="absolute -top-5 left-1/2 hidden -translate-x-1/2 whitespace-nowrap text-[9px] group-hover:block" style={{ color: DESIGN_TOKENS.textMuted }}>
                                {point.phase}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* 分镜结构列表 */}
                  <div
                    className="rounded-2xl border p-4"
                    style={{ borderColor: DESIGN_TOKENS.border, backgroundColor: DESIGN_TOKENS.card }}
                  >
                    <button
                      type="button"
                      className="flex w-full items-center justify-between"
                      onClick={() => setExpandedBeats((v) => !v)}
                    >
                      <div className="flex items-center gap-1.5">
                        <Layers size={13} className="text-white/40" />
                        <span className="text-[11px] font-medium" style={{ color: DESIGN_TOKENS.textMuted }}>
                          分镜结构 ({beats.length})
                        </span>
                      </div>
                      {expandedBeats ? (
                        <ChevronUp size={14} className="text-white/30" />
                      ) : (
                        <ChevronDown size={14} className="text-white/30" />
                      )}
                    </button>

                    {expandedBeats && (
                      <div className="mt-3 space-y-2">
                        {beats.map((beat, idx) => {
                          const typeLabel = BEAT_TYPE_LABELS[beat.type] || beat.type;
                          const typeColor = BEAT_TYPE_COLORS[beat.type] || "text-white/40 bg-white/5";
                          return (
                            <div
                              key={idx}
                              className="flex items-start gap-3 rounded-xl px-3 py-2.5"
                              style={{ backgroundColor: "rgba(255,255,255,0.03)" }}
                            >
                              {/* 序号 */}
                              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[10px] font-bold" style={{ backgroundColor: DESIGN_TOKENS.accentSoft, color: DESIGN_TOKENS.textMuted }}>
                                {idx + 1}
                              </span>

                              {/* 内容 */}
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${typeColor}`}>
                                    {typeLabel}
                                  </span>
                                  <span className="text-[10px] font-mono" style={{ color: DESIGN_TOKENS.textMuted }}>
                                    {beat.timestamp} · {beat.duration}
                                  </span>
                                  <span className={`ml-auto text-[10px] font-medium ${valenceColor(beat.emotionalValence)}`}>
                                    {valenceLabel(beat.emotionalValence)}
                                  </span>
                                </div>
                                <p className="mt-1 text-xs leading-5" style={{ color: DESIGN_TOKENS.textSecondary }}>
                                  {beat.description}
                                </p>
                                {beat.visualNotes && (
                                  <p className="mt-0.5 text-[10px]" style={{ color: DESIGN_TOKENS.textMuted }}>
                                    视觉: {beat.visualNotes}
                                    {beat.audioNotes && ` · 音频: ${beat.audioNotes}`}
                                  </p>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* 关键技巧 & 可复用元素 */}
                  {(result.template.keyTechniques.length > 0 || result.template.reusableElements.length > 0) && (
                    <div
                      className="rounded-2xl border p-4"
                      style={{ borderColor: DESIGN_TOKENS.border, backgroundColor: DESIGN_TOKENS.card }}
                    >
                      {result.template.keyTechniques.length > 0 && (
                        <div className="mb-3">
                          <span className="text-[11px] font-medium" style={{ color: DESIGN_TOKENS.textMuted }}>
                            关键技巧
                          </span>
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            {result.template.keyTechniques.map((t, i) => (
                              <span
                                key={i}
                                className="rounded bg-white/[0.06] px-2 py-0.5 text-[10px]"
                                style={{ color: DESIGN_TOKENS.textSecondary }}
                              >
                                {t}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {result.template.reusableElements.length > 0 && (
                        <div>
                          <span className="text-[11px] font-medium" style={{ color: DESIGN_TOKENS.textMuted }}>
                            可复用元素
                          </span>
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            {result.template.reusableElements.map((e, i) => (
                              <span
                                key={i}
                                className="rounded bg-violet-500/10 px-2 py-0.5 text-[10px] text-violet-400/80"
                              >
                                {e}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {result.template.adaptationNotes && (
                    <div
                      className="rounded-2xl border border-amber-500/15 bg-amber-500/5 px-4 py-3 text-xs leading-5"
                      style={{ color: DESIGN_TOKENS.textSecondary }}
                    >
                      <span className="font-medium text-amber-400/80">改编建议：</span>
                      {result.template.adaptationNotes}
                    </div>
                  )}
                </>
              )}
            </main>
          </div>
        </div>

        {/* 底部 */}
        <footer
          className="flex flex-wrap items-center justify-between gap-3 border-t px-5 py-4"
          style={{ borderColor: DESIGN_TOKENS.border }}
        >
          <div className="flex items-center gap-2 text-[11px]" style={{ color: DESIGN_TOKENS.textMuted }}>
            <Layers size={13} />
            <span>分析结果将生成 {beatCount} 个分镜节点</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded-full border px-4 py-2 text-xs transition hover:bg-white/10"
              style={{ borderColor: DESIGN_TOKENS.border, color: DESIGN_TOKENS.textMuted }}
              onClick={handleClose}
            >
              取消
            </button>
            <button
              type="button"
              disabled={!canImport}
              className="flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-40"
              style={{ backgroundColor: DESIGN_TOKENS.accent, color: "#fff" }}
              onClick={handleImport}
            >
              <Sparkles size={14} />
              导入到画布
            </button>
          </div>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
