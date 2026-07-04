// ============================================================================
// VideoNode — 视频节点组件 (P1-3 增强版)
//
// 支持：
//  - 视频预览与播放
//  - 六态运行状态 (NodeRunStatus)
//  - 生成进度条与百分比
//  - 剩余时间预估
//  - 失败重试按钮
//  - 音频轨道同步指示器
// ============================================================================
"use client";

import { memo, useState, useRef, useCallback, useEffect } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Play, Pause, Loader2, AlertTriangle, RotateCcw, Music, Clock, Subtitles, Zap } from "lucide-react";
import type { CanvasNodeData, NodeRunStatus } from "../canvas/types";
import { nodeToneStyles } from "../canvas/types";
import { getCompatibleRunMeta, isNodeBusy, isNodeFinished } from "../../utils/nodeRunMeta";
import type { SubtitleSegment } from "../../../../lib/storyboard/subtitleFormatter";

interface VideoNodeProps extends NodeProps {
  data: CanvasNodeData;
  /** Retry callback when generation failed. Receives node ID. */
  onRetry?: (nodeId: string) => void;
  /** HD enhance / upscale callback. Receives node ID. */
  onUpscale?: (nodeId: string) => void;
}

// ── Status labels ─────────────────────────────────────────────
const runStatusLabels: Record<NodeRunStatus, string> = {
  idle: "就绪",
  ready: "已就绪",
  pending: "待确认",
  queued: "排队中",
  running: "生成中",
  succeeded: "完成",
  failed: "失败",
  stale: "需更新",
  cancelled: "已取消",
};

// ── Generational stage detection ──────────────────────────────

/** Map NodeRunStatus + message to a finer-grained video generation stage */
type VideoGenStage = "idle" | "queued" | "analyzing" | "generating" | "rendering" | "done" | "failed";

function detectVideoStage(runStatus: NodeRunStatus, message?: string): VideoGenStage {
  if (runStatus === "failed") return "failed";
  if (runStatus === "succeeded") return "done";
  if (runStatus !== "running") return "idle";

  const msg = (message ?? "").toLowerCase();
  if (msg.includes("排队") || msg.includes("queued")) return "queued";
  if (msg.includes("分析") || msg.includes("analyzing")) return "analyzing";
  if (msg.includes("渲染") || msg.includes("rendering")) return "rendering";
  return "generating";
}

const stageLabels: Record<VideoGenStage, string> = {
  idle: "等待输入",
  queued: "排队中",
  analyzing: "分析中",
  generating: "生成中",
  rendering: "渲染中",
  done: "已完成",
  failed: "失败",
};

// ── Component ─────────────────────────────────────────────────

const VideoNode = memo(function VideoNode({ id, data, selected, onRetry, onUpscale }: VideoNodeProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const tone = nodeToneStyles["video"] ?? {
    eyebrow: "#f59e0b", body: "#f59e0b/75", meta: "#f59e0b/60",
    border: "1px solid rgba(245,158,11,0.2)", background: "rgba(245,158,11,0.1)",
  };

  // ── RunMeta-driven state (P1-3) ──
  const runMeta = getCompatibleRunMeta(data);
  const runStatus = runMeta.runStatus;
  const busy = isNodeBusy(runStatus);
  const finished = isNodeFinished(runStatus);
  const stage = detectVideoStage(runStatus, runMeta.message);
  const progress = runMeta.progress ?? (runStatus === "succeeded" ? 100 : runStatus === "running" ? 0 : undefined);

  // ── Video URL resolution ──
  const videoUrl = data.resultUrl ?? data.imageUrl ?? "";
  const hasVideo = Boolean(videoUrl);

  // ── Audio sync info ──
  const voiceAudioUrl = data.shot?.voiceAudioUrl;
  const hasVoiceConfig = Boolean(data.shot?.voiceConfig);
  const hasAudioSync = Boolean(voiceAudioUrl) || hasVoiceConfig;
  const audioSynced = Boolean(voiceAudioUrl);

  // ── Subtitle overlay (P1-3: subtitle timeline) ──
  const subtitleSegments: SubtitleSegment[] = data.shot?.subtitleTimeline?.segments ?? [];
  const hasSubtitles = subtitleSegments.length > 0;
  const [currentSubtitle, setCurrentSubtitle] = useState<string>("");

  useEffect(() => {
    if (!hasSubtitles || !videoRef.current) return;
    const video = videoRef.current;

    const updateSubtitle = () => {
      const t = video.currentTime;
      const seg = subtitleSegments.find(
        (s) => t >= s.startSeconds && t <= s.endSeconds,
      );
      setCurrentSubtitle(seg?.text ?? "");
    };

    const handleEnded = () => setCurrentSubtitle("");
    const handlePause = () => setCurrentSubtitle("");

    video.addEventListener("timeupdate", updateSubtitle);
    video.addEventListener("ended", handleEnded);
    video.addEventListener("pause", handlePause);
    return () => {
      video.removeEventListener("timeupdate", updateSubtitle);
      video.removeEventListener("ended", handleEnded);
      video.removeEventListener("pause", handlePause);
    };
  }, [hasSubtitles, subtitleSegments]);

  // ── Countdown estimate ──
  const estimatedRemaining = runMeta.message?.match(/剩余(?:约)?\s*(\d+)\s*秒|(\d+)s?\s*remaining/i);
  const etaSeconds = estimatedRemaining
    ? parseInt(estimatedRemaining[1] || estimatedRemaining[2], 10)
    : undefined;

  // ── Playback controls ──
  const togglePlay = useCallback(() => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play();
    }
    setIsPlaying(!isPlaying);
  }, [isPlaying]);

  // ── Derived border color ──
  const borderColor =
    runStatus === "failed"
      ? "#ef4444"
      : busy
        ? "#3b82f6"
        : runStatus === "succeeded"
          ? "#22c55e"
          : tone.border;

  return (
    <div
      className={`rounded-xl border shadow-lg min-w-[300px] max-w-[400px] overflow-hidden
        ${selected ? "ring-2 ring-purple-500/50" : ""}`}
      style={{
        background: "rgba(21, 21, 27, 0.95)",
        borderColor: borderColor,
      }}
    >
      {/* ══ Header ══ */}
      <div className="flex items-center justify-between px-3 py-2 border-b" style={{ borderColor: tone.border }}>
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-base">🎬</span>
          <span className="font-semibold text-xs truncate" style={{ color: tone.eyebrow }}>
            {data.title || "视频节点"}
          </span>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {/* Audio sync badge */}
          {hasAudioSync && (
            <div
              className="text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1"
              style={{
                backgroundColor: audioSynced ? "rgba(168,85,247,0.15)" : "rgba(148,163,184,0.15)",
                color: audioSynced ? "#a855f7" : "#94a3b8",
              }}
              title={audioSynced ? "音频已同步" : "音频待生成"}
            >
              <Music size={10} />
              {audioSynced ? "已配音" : "待配音"}
            </div>
          )}

          {/* Run status badge */}
          {busy && <Loader2 size={12} className="animate-spin" style={{ color: "#3b82f6" }} />}
          {runStatus === "failed" && <AlertTriangle size={12} style={{ color: "#ef4444" }} />}
          <span
            className="text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap"
            style={{
              backgroundColor:
                runStatus === "succeeded"
                  ? "rgba(34,197,94,0.15)"
                  : runStatus === "failed"
                    ? "rgba(239,68,68,0.15)"
                    : runStatus === "running"
                      ? "rgba(59,130,246,0.15)"
                      : "rgba(148,163,184,0.15)",
              color:
                runStatus === "succeeded"
                  ? "#22c55e"
                  : runStatus === "failed"
                    ? "#ef4444"
                    : runStatus === "running"
                      ? "#3b82f6"
                      : "#94a3b8",
            }}
          >
            {runStatusLabels[runStatus]}
          </span>
        </div>
      </div>

      {/* ══ Video area ══ */}
      <div className="relative bg-black/60" style={{ aspectRatio: data.aspectRatio ?? "16/9" }}>
        {hasVideo ? (
          <>
            <video
              ref={videoRef}
              src={videoUrl}
              className="w-full h-full object-contain"
              onEnded={() => setIsPlaying(false)}
              onPause={() => setIsPlaying(false)}
              onPlay={() => setIsPlaying(true)}
              preload="metadata"
              controls={false}
            />
            {/* Play overlay */}
            {!isPlaying && (
              <button
                onClick={togglePlay}
                className="absolute inset-0 flex items-center justify-center bg-black/30
                           hover:bg-black/40 transition-colors"
              >
                <div className="w-12 h-12 rounded-full bg-purple-600/80 flex items-center justify-center">
                  <Play size={20} className="text-white ml-0.5" />
                </div>
              </button>
            )}
            {/* Play/Pause controls bar */}
            <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-3 py-1.5 bg-gradient-to-t from-black/70 to-transparent">
              <button
                onClick={togglePlay}
                className="text-white/80 hover:text-white transition-colors"
              >
                {isPlaying ? <Pause size={14} /> : <Play size={14} />}
              </button>
              {onUpscale && runStatus === "succeeded" && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onUpscale(id);
                  }}
                  className="nodrag inline-flex items-center gap-1 rounded-md border px-2 py-0.5
                             text-[10px] font-medium transition-colors hover:bg-white/10"
                  style={{
                    borderColor: "rgba(168,85,247,0.35)",
                    backgroundColor: "rgba(168,85,247,0.12)",
                    color: "#ddd6fe",
                  }}
                  title="图片/帧 HD 高清增强"
                >
                  <Zap size={11} />
                  HD
                </button>
              )}
            </div>
            {/* Subtitle overlay */}
            {hasSubtitles && currentSubtitle && isPlaying && (
              <div className="absolute bottom-8 left-0 right-0 flex justify-center px-4">
                <span
                  className="text-xs font-medium text-center px-3 py-1 rounded leading-relaxed"
                  style={{
                    backgroundColor: "rgba(0,0,0,0.75)",
                    color: "#fff",
                    textShadow: "0 1px 2px rgba(0,0,0,0.8)",
                  }}
                >
                  {currentSubtitle}
                </span>
              </div>
            )}
          </>
        ) : busy ? (
          /* ══ Progress area (generation in progress) ══ */
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6">
            <Loader2 size={28} className="animate-spin" style={{ color: "#3b82f6" }} />
            <span className="text-xs text-gray-300 font-medium">
              {stageLabels[stage]}
            </span>

            {/* Progress bar */}
            {progress !== undefined && (
              <div className="w-full space-y-1.5">
                <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500 ease-out"
                    style={{
                      width: `${Math.min(progress, 100)}%`,
                      background: progress > 90
                        ? "linear-gradient(90deg, #3b82f6, #22c55e)"
                        : "linear-gradient(90deg, #3b82f6, #6366f1)",
                    }}
                  />
                </div>
                <div className="flex items-center justify-between text-[10px] text-gray-400">
                  <span>{progress}%</span>
                  {etaSeconds !== undefined && etaSeconds > 0 && (
                    <span className="flex items-center gap-1">
                      <Clock size={9} />
                      剩余约 {etaSeconds}s
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Stage message from runMeta */}
            {runMeta.message && (
              <span className="text-[10px] text-gray-500 text-center leading-relaxed max-w-[220px]">
                {runMeta.message}
              </span>
            )}
          </div>
        ) : runStatus === "failed" ? (
          /* ══ Error state with retry ══ */
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6">
            <div className="w-10 h-10 rounded-full bg-red-500/15 flex items-center justify-center">
              <AlertTriangle size={20} style={{ color: "#ef4444" }} />
            </div>
            <span className="text-xs text-red-300 font-medium">视频生成失败</span>
            {runMeta.error && (
              <span className="text-[10px] text-red-300/60 text-center leading-relaxed max-w-[240px]">
                {runMeta.error}
              </span>
            )}
            {onRetry && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRetry(id);
                }}
                className="nodrag mt-1 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg
                           text-xs font-medium border transition-colors"
                style={{
                  borderColor: "rgba(59,130,246,0.3)",
                  backgroundColor: "rgba(59,130,246,0.12)",
                  color: "#93c5fd",
                }}
              >
                <RotateCcw size={12} />
                重新生成
              </button>
            )}
          </div>
        ) : (
          /* ══ Empty state ══ */
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <div className="text-3xl mb-2">🎬</div>
              <span className="text-xs text-gray-500">暂无视频</span>
            </div>
          </div>
        )}
      </div>

      {/* ══ Info footer ══ */}
      <div className="px-3 py-1.5 flex items-center gap-2 text-[10px]" style={{ color: tone.meta }}>
        {/* Backend / model */}
        {data.model && <span>模型: {data.model}</span>}
        {/* Duration */}
        {data.duration && <span>时长: {data.duration}</span>}
        {/* Audio sync dot */}
        {hasAudioSync && (
          <span
            className="w-1.5 h-1.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: audioSynced ? "#22c55e" : "#94a3b8" }}
            title={audioSynced ? "音频已同步" : "音频待同步"}
          />
        )}
        {/* Subtitle sync indicator */}
        {hasSubtitles && (
          <span className="flex items-center gap-0.5 text-[10px]" title={`${subtitleSegments.length} 条字幕`}>
            <Subtitles size={10} />
            {subtitleSegments.length}
          </span>
        )}
        {/* Flexible spacer */}
        <span className="flex-1" />
        {/* Stage indicator for running */}
        {busy && (
          <span className="italic opacity-60">
            {stageLabels[stage]}
          </span>
        )}
        {/* Summary for succeeded */}
        {runStatus === "succeeded" && data.summary && (
          <span className="truncate max-w-[180px]">{data.summary}</span>
        )}
      </div>

      {/* ══ Handles ══ */}
      <Handle type="target" position={Position.Top} className="!w-2 !h-2 !bg-purple-400" />
      <Handle type="source" position={Position.Bottom} className="!w-2 !h-2 !bg-purple-400" />
    </div>
  );
});

export default VideoNode;
