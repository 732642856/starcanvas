"use client";

import type { BatchGenerationJob } from "./types";

type StoryboardBatchProgressOverlayProps = {
  job: BatchGenerationJob | null;
  onDismiss?: () => void;
  rightOffset?: number;
};

const STATUS_LABELS: Record<BatchGenerationJob["status"], string> = {
  queued: "排队中",
  preparing: "准备中",
  generating: "生成中",
  completed: "已完成",
  failed: "失败",
};

export function StoryboardBatchProgressOverlay({
  job,
  onDismiss,
  rightOffset = 20,
}: StoryboardBatchProgressOverlayProps) {
  if (!job) return null;

  const progress = Math.max(0, Math.min(100, job.progress ?? 0));
  const failedShots = Object.values(job.shots).filter((shot) => shot.status === "failed");
  const completedText = `${job.completed}/${job.total}`;
  const isTerminal = job.status === "completed" || job.status === "failed";

  return (
    <div
      className="fixed bottom-5 z-50 w-[360px] rounded-2xl border border-slate-700/70 bg-slate-950/90 p-4 text-slate-100 shadow-2xl backdrop-blur-xl"
      style={{ right: rightOffset }}
      data-testid="storyboard-batch-progress-overlay"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-medium uppercase tracking-[0.22em] text-cyan-300/80">
            Storyboard Batch
          </div>
          <div className="mt-1 text-base font-semibold text-white">
            批量分镜图生成
          </div>
        </div>
        <div
          className={`rounded-full px-2.5 py-1 text-xs font-medium ${
            job.status === "failed"
              ? "bg-rose-500/15 text-rose-200"
              : job.status === "completed"
                ? "bg-emerald-500/15 text-emerald-200"
                : "bg-cyan-500/15 text-cyan-200"
          }`}
          data-testid="storyboard-batch-status"
        >
          {STATUS_LABELS[job.status]}
        </div>
      </div>

      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between text-xs text-slate-300">
          <span data-testid="storyboard-batch-message">{job.message || "正在处理分镜任务"}</span>
          <span data-testid="storyboard-batch-count">{completedText}</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-800">
          <div
            className={`h-full rounded-full transition-all duration-300 ${
              job.status === "failed"
                ? "bg-rose-400"
                : job.status === "completed"
                  ? "bg-emerald-400"
                  : "bg-gradient-to-r from-cyan-400 to-violet-400"
            }`}
            style={{ width: `${progress}%` }}
            data-testid="storyboard-batch-progress-bar"
          />
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
        <div className="rounded-xl bg-slate-900/80 px-3 py-2">
          <div className="text-slate-500">总镜头</div>
          <div className="mt-0.5 font-semibold text-slate-100">{job.total}</div>
        </div>
        <div className="rounded-xl bg-slate-900/80 px-3 py-2">
          <div className="text-slate-500">已完成</div>
          <div className="mt-0.5 font-semibold text-emerald-200">{job.completed}</div>
        </div>
        <div className="rounded-xl bg-slate-900/80 px-3 py-2">
          <div className="text-slate-500">失败</div>
          <div className="mt-0.5 font-semibold text-rose-200">{job.failed}</div>
        </div>
      </div>

      {job.activeShotId ? (
        <div
          className="mt-3 rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2 text-xs text-slate-300"
          data-testid="storyboard-batch-active-shot"
        >
          当前：
          <span className="text-slate-100">
            {job.shots[job.activeShotId]?.title || job.activeShotId}
          </span>
        </div>
      ) : null}

      {failedShots.length > 0 ? (
        <div
          className="mt-3 rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-100"
          data-testid="storyboard-batch-failed-shots"
        >
          <div className="font-medium">失败项</div>
          <div className="mt-1 line-clamp-2 text-rose-100/80">
            {failedShots.map((shot) => shot.title || shot.shotNodeId).join("、")}
          </div>
        </div>
      ) : null}

      {onDismiss && isTerminal ? (
        <button
          type="button"
          className="mt-3 w-full rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2 text-xs font-medium text-slate-200 transition hover:bg-slate-800"
          onClick={onDismiss}
          data-testid="storyboard-batch-dismiss"
        >
          收起
        </button>
      ) : null}
    </div>
  );
}
