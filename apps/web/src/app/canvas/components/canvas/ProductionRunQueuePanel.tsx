"use client";

import { useEffect, useMemo, useState } from "react";
import { Play, Pause, Square, CheckCircle2, XCircle, AlertTriangle, Clock, Loader2, X, GripVertical, RotateCcw, ChevronRight, Wand2 } from "lucide-react";
import {
  projectProductionRunQueueRuntimeState,
  type ProductionRunQueue,
  type ProductionRunQueueTask,
} from "@/lib/storyboard/productionRunQueue";
import type { TaskExecState } from "@/app/canvas/hooks/useProductionRunExecutor";
import {
  buildProviderHealthSummary,
  type ProviderHealthProvider,
  type ProviderHealthServerConfig,
  type ProviderHealthStatus,
  type ProviderHealthSummary,
} from "@/lib/ai/provider-health-summary";
import {
  buildTaskReadinessSummary,
  getTaskReadinessPrimaryBlockingReason,
  truncateReadinessHint,
} from "@/lib/ai/taskReadiness";
import {
  loadStoredProviderSmokeResults,
  type StoredProviderSmokeResult,
} from "@/lib/ai/providerSmokeResult";
import { loadProviderSettings, openProviderSettings } from "@/lib/ai/user-settings";

// ============================================================================
// DESIGN TOKENS (与 StarCanvas designSystem 对齐)
// ============================================================================
const PANEL = {
  bg: "rgba(18, 18, 24, 0.92)",
  border: "rgba(255, 255, 255, 0.08)",
  text: "rgba(255, 255, 255, 0.92)",
  textSecondary: "rgba(255, 255, 255, 0.62)",
  textMuted: "rgba(255, 255, 255, 0.38)",
  accent: "#64748b",
  accentSoft: "rgba(100, 116, 139, 0.12)",
  successSoft: "rgba(34, 197, 94, 0.12)",
  dangerSoft: "rgba(239, 68, 68, 0.12)",
  warningSoft: "rgba(234, 179, 8, 0.12)",
  runningSoft: "rgba(59, 130, 246, 0.12)",
  card: "rgba(255, 255, 255, 0.04)",
  shadow: "0 16px 48px rgba(0, 0, 0, 0.35)",
} as const;

// ============================================================================
// STATUS HELPERS
// ============================================================================
const STATUS_LABEL: Record<string, string> = {
  queued: "排队中",
  preparing: "准备中",
  running: "运行中",
  paused: "已暂停",
  completed: "已完成",
  failed: "部分失败",
};

const STATUS_COLOR: Record<string, string> = {
  queued: "#94a3b8",
  preparing: "#60a5fa",
  running: "#3b82f6",
  paused: "#facc15",
  completed: "#22c55e",
  failed: "#ef4444",
};

const TASK_ACTION_LABEL: Record<string, string> = {
  "generate-storyboard-image": "生成分镜图",
  "generate-video-clip": "生成视频",
  "generate-voice-track": "生成配音",
  "create-subtitle-track": "创建字幕",
  "review-handoff-warnings": "检查交接警告",
};

const PREFLIGHT_ACTION_LABEL: Record<string, string> = {
  "preflight:strengthen-visual-prompt": "补强视觉提示词",
  "preflight:add-shot-language": "补齐镜头语言",
  "preflight:set-shot-duration": "设置镜头时长",
  "preflight:attach-reference-frame": "补参考帧",
  "preflight:complete-character-anchor": "补角色锚点",
  "preflight:restore-source-timecode": "恢复来源时间码",
  "preflight:add-voice-intent": "补声音意图",
  "preflight:review-handoff-warning": "复核交接警告",
};

function formatBlockedActionLabel(action: string): string {
  if (action.startsWith("video-provider:")) return "视频合同检查";
  return PREFLIGHT_ACTION_LABEL[action] ?? action;
}

const TASK_STATUS_LABEL: Record<string, string> = {
  queued: "等待",
  preparing: "准备",
  running: "执行中",
  paused: "暂停",
  completed: "完成",
  failed: "失败",
  skipped: "跳过",
};

const PROVIDER_HEALTH_STYLE: Record<ProviderHealthStatus, { color: string; backgroundColor: string; borderColor: string; label: string }> = {
  ready: {
    color: "#22c55e",
    backgroundColor: PANEL.successSoft,
    borderColor: "rgba(34, 197, 94, 0.18)",
    label: "可用",
  },
  warning: {
    color: "#facc15",
    backgroundColor: PANEL.warningSoft,
    borderColor: "rgba(234, 179, 8, 0.18)",
    label: "注意",
  },
  blocked: {
    color: "#ef4444",
    backgroundColor: PANEL.dangerSoft,
    borderColor: "rgba(239, 68, 68, 0.24)",
    label: "阻塞",
  },
};

type ProductionProviderServerConfig = ProviderHealthServerConfig & {
  providers?: ProviderHealthProvider[];
};

function getProductionProviderItems(summary: ProviderHealthSummary | null) {
  return summary?.items.filter((item) => item.id === "image" || item.id === "video") ?? [];
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function TaskStatusIcon({ status }: { status: ProductionRunQueueTask["status"] }) {
  switch (status) {
    case "completed":
      return <CheckCircle2 size={14} strokeWidth={1.8} color="#22c55e" />;
    case "failed":
      return <XCircle size={14} strokeWidth={1.8} color="#ef4444" />;
    case "running":
      return <Loader2 size={14} strokeWidth={1.8} color="#3b82f6" className="animate-spin" />;
    case "preparing":
      return <Clock size={14} strokeWidth={1.8} color="#60a5fa" />;
    case "paused":
      return <Clock size={14} strokeWidth={1.8} color="#facc15" />;
    case "skipped":
      return <ChevronRight size={14} strokeWidth={1.8} color="#94a3b8" />;
    default:
      return <Clock size={14} strokeWidth={1.8} color="rgba(255,255,255,0.25)" />;
  }
}

function ProgressBar({ value, color }: { value: number; color?: string }) {
  const width = `${Math.max(0, Math.min(100, value * 100))}%`;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ backgroundColor: "rgba(255,255,255,0.06)" }}>
      <div
        className="h-full rounded-full transition-all duration-300"
        style={{ width, backgroundColor: color ?? PANEL.accent }}
      />
    </div>
  );
}

// ============================================================================
// MAIN PANEL
// ============================================================================

export type ProductionRunQueuePanelProps = {
  queue: ProductionRunQueue;
  onClose?: () => void;
  /** 点击阻塞/预检项后定位到对应镜头 */
  onResolveIssue?: (shotId: string, action: string) => void;
  /** 为阻塞/预检项应用可编辑修复草案 */
  onApplyProductionFix?: (shotId: string, action: string, source?: "production-queue" | "export-preflight") => void;
  /** 是否正在执行中（Step 2 新增） */
  isRunning?: boolean;
  /** 是否暂停中 */
  isPaused?: boolean;
  /** 点击"开始生产"回调（Step 2 新增） */
  onStart?: () => void;
  /** 暂停当前生产任务 */
  onPause?: () => void;
  /** 恢复暂停中的生产任务 */
  onResume?: () => void;
  /** 取消当前生产任务 */
  onAbort?: () => void;
  /** 实时任务执行状态（Step 4 新增） */
  execState?: Record<string, TaskExecState>;
  /** 重试失败任务（Step 4 新增） */
  onRetryTask?: (taskId: string) => void;
  /** 跳过失败任务（Step 4 新增） */
  onSkipTask?: (taskId: string) => void;
  rightOffset?: number;
};

export function ProductionRunQueuePanel({
  queue,
  onClose,
  onResolveIssue,
  onApplyProductionFix,
  isRunning,
  isPaused,
  onStart,
  onPause,
  onResume,
  onAbort,
  execState,
  onRetryTask,
  onSkipTask,
  rightOffset = 20,
}: ProductionRunQueuePanelProps) {
  const displayQueue = projectProductionRunQueueRuntimeState(queue, execState);
  const [providerHealthSummary, setProviderHealthSummary] = useState<ProviderHealthSummary | null>(null);
  const [storedProviderSmokeResults, setStoredProviderSmokeResults] = useState<Partial<Record<"text" | "image" | "video", StoredProviderSmokeResult>>>({});
  const statusLabel = STATUS_LABEL[displayQueue.status] ?? displayQueue.status;
  const statusColor = STATUS_COLOR[displayQueue.status] ?? PANEL.accent;
  const hasContent = displayQueue.tasks.length > 0 || displayQueue.blockedActions.length > 0;
  const preflightSummary = displayQueue.productionPreflight?.summary;
  const hasBlockingPreflight = (preflightSummary?.blockedShots ?? 0) > 0;
  const videoDryRun = displayQueue.videoProviderDryRun;
  const videoDryRunSummary = videoDryRun?.summary;
  const hasBlockingVideoDryRun = (videoDryRunSummary?.blockingIssues ?? 0) > 0;
  const firstBlockingVideoIssue = videoDryRun?.shots
    .flatMap((shot) => shot.issues)
    .find((issue) => issue.severity === "blocking");
  const firstBlockedPreflightAction = displayQueue.blockedActions.find(
    (action) => action.severity === "blocking" && action.action.startsWith("preflight:"),
  );
  const productionProviderItems = useMemo(
    () => getProductionProviderItems(providerHealthSummary),
    [providerHealthSummary],
  );
  const taskReadinessSummary = useMemo(
    () => buildTaskReadinessSummary({
      providerHealthSummary,
      providerSmokeReport: null,
      storedProviderSmokeResults,
    }),
    [providerHealthSummary, storedProviderSmokeResults],
  );
  const productionTaskReadiness = taskReadinessSummary.items.find((item) => item.taskId === "production-run");
  const providerBlockingCount = productionProviderItems.filter((item) => item.status === "blocked").length;
  const hasBlockingProviderHealth = providerBlockingCount > 0;
  const hasProviderHealthAttention = productionProviderItems.some((item) => item.status !== "ready");
  const hasBlockingProductionTaskReadiness = productionTaskReadiness?.status === "blocked";
  const isProviderHealthPending = providerHealthSummary === null;
  const firstBlockedProviderItem = productionProviderItems.find((item) => item.status === "blocked");
  const primaryStartBlockReason = hasBlockingPreflight
    ? truncateReadinessHint(firstBlockedPreflightAction?.reason)
    : hasBlockingVideoDryRun
      ? truncateReadinessHint(firstBlockingVideoIssue?.message)
      : hasBlockingProductionTaskReadiness
        ? truncateReadinessHint(getTaskReadinessPrimaryBlockingReason(productionTaskReadiness))
        : hasBlockingProviderHealth
          ? truncateReadinessHint(firstBlockedProviderItem?.details?.[0] || firstBlockedProviderItem?.message)
          : undefined;
  const canStart =
    displayQueue.status !== "completed" &&
    !hasBlockingPreflight &&
    !hasBlockingVideoDryRun &&
    !hasBlockingProviderHealth &&
    !hasBlockingProductionTaskReadiness &&
    !isProviderHealthPending;
  const startButtonLabel = isProviderHealthPending
    ? "检查模型中"
    : hasBlockingPreflight
      ? `先处理：${primaryStartBlockReason ?? "阻塞镜头"}`
      : hasBlockingVideoDryRun
        ? `先处理：${primaryStartBlockReason ?? "视频供应商"}`
        : hasBlockingProductionTaskReadiness
          ? `先处理：${primaryStartBlockReason ?? "任务阻塞"}`
        : hasBlockingProviderHealth
          ? `先处理：${primaryStartBlockReason ?? "模型配置"}`
          : "一键开始生产";

  useEffect(() => {
    let cancelled = false;

    const refreshProviderHealth = async () => {
      let serverConfig: ProductionProviderServerConfig | null = null;

      try {
        const res = await fetch("/api/ai/config");
        if (res.ok) {
          serverConfig = await res.json();
        }
      } catch {
        serverConfig = null;
      }

      if (cancelled) return;

      const settings = loadProviderSettings();
      setStoredProviderSmokeResults(loadStoredProviderSmokeResults());

      setProviderHealthSummary(
        buildProviderHealthSummary({
          serverConfig,
          apiBaseUrl: settings.apiBaseUrl,
          sessionApiKey: settings.sessionApiKey,
          useLocalOverride: settings.useLocalOverride,
          useMock: settings.useMock,
          defaultModel: settings.defaultModel || serverConfig?.defaultModel || "",
          imageModel: settings.imageModel || serverConfig?.defaultImageModel || "",
          videoModel: settings.videoModel || serverConfig?.videoModel || "",
          timeoutMs: settings.timeoutMs || (serverConfig?.timeoutMs ? String(serverConfig.timeoutMs) : "120000"),
          providers: serverConfig?.providers ?? [],
          voiceCloneBaseUrl: process.env.NEXT_PUBLIC_VOICE_CLONE_BASE_URL,
          voxcpmBaseUrlConfigured: Boolean(process.env.NEXT_PUBLIC_VOXCPM_URL),
        }),
      );
    };

    void refreshProviderHealth();

    if (typeof window === "undefined") return () => {
      cancelled = true;
    };

    const handleSettingsUpdated = () => {
      setProviderHealthSummary(null);
      void refreshProviderHealth();
    };

    window.addEventListener("startrails-provider-updated", handleSettingsUpdated);
    window.addEventListener("startrails-settings-updated", handleSettingsUpdated);
    return () => {
      cancelled = true;
      window.removeEventListener("startrails-provider-updated", handleSettingsUpdated);
      window.removeEventListener("startrails-settings-updated", handleSettingsUpdated);
    };
  }, []);

  if (!hasContent) {
    return (
      <div
        data-testid="production-run-queue-panel"
        className="fixed bottom-5 z-50 w-[360px] rounded-3xl border p-5 shadow-2xl backdrop-blur-xl"
        style={{
          right: rightOffset,
          backgroundColor: PANEL.bg,
          borderColor: PANEL.border,
          boxShadow: PANEL.shadow,
          color: PANEL.text,
        }}
      >
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-medium" data-testid="production-run-queue-status">
            <GripVertical size={14} strokeWidth={1.5} style={{ color: PANEL.textMuted }} />
            <span>生产队列</span>
          </h3>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-1 transition hover:bg-white/10"
              aria-label="关闭"
            >
              <X size={14} strokeWidth={1.5} style={{ color: PANEL.textSecondary }} />
            </button>
          )}
        </div>

        {/* Empty state */}
        <div
          className="rounded-2xl p-6 text-center text-xs"
          style={{ backgroundColor: PANEL.card, color: PANEL.textMuted }}
          data-testid="production-run-queue-empty"
        >
          当前画布没有可执行的生产任务。
          <br />
          请先在分镜节点中填入画面提示词、对白或音效信息。
        </div>
      </div>
    );
  }

  return (
    <div
      data-testid="production-run-queue-panel"
      className="fixed bottom-5 z-50 flex max-h-[42vh] w-[360px] flex-col overflow-hidden rounded-3xl border p-5 shadow-2xl backdrop-blur-xl"
      style={{
        right: rightOffset,
        backgroundColor: PANEL.bg,
        borderColor: PANEL.border,
        boxShadow: PANEL.shadow,
        color: PANEL.text,
      }}
    >
      {/* ── Header ── */}
      <div className="mb-4 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-medium" data-testid="production-run-queue-status">
          <GripVertical size={14} strokeWidth={1.5} style={{ color: PANEL.textMuted }} />
          <span>生产队列</span>
          <span
            className="inline-block rounded-full px-2 py-0.5 text-[11px] font-medium"
            style={{ backgroundColor: `${statusColor}28`, color: statusColor }}
          >
            {statusLabel}
          </span>
        </h3>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 transition hover:bg-white/10"
            aria-label="关闭"
          >
            <X size={14} strokeWidth={1.5} style={{ color: PANEL.textSecondary }} />
          </button>
        )}
      </div>

      {/* ── Progress ── */}
      <div className="mb-2">
        <ProgressBar value={displayQueue.progress} color={statusColor} />
      </div>
      <div
        className="mb-4 flex items-center gap-3 text-xs"
        style={{ color: PANEL.textSecondary }}
        data-testid="production-run-queue-progress"
      >
        <span>
          {displayQueue.completedTasks}/{displayQueue.totalTasks} 完成
        </span>
        {displayQueue.failedTasks > 0 && (
          <span style={{ color: "#ef4444" }}>{displayQueue.failedTasks} 失败</span>
        )}
        {displayQueue.skippedTasks > 0 && (
          <span style={{ color: "#94a3b8" }}>{displayQueue.skippedTasks} 跳过</span>
        )}
        {displayQueue.activeTaskId && (
          <span className="flex items-center gap-1" style={{ color: "#3b82f6" }}>
            <Loader2 size={10} strokeWidth={2} className="animate-spin" />
            执行中
          </span>
        )}
      </div>

      <div className="-mx-1 min-h-0 flex-1 space-y-3 overflow-y-auto px-1 pr-2 pb-2">
      {/* ── Production Preflight Summary ── */}
      {preflightSummary && (
        <div
          className="mb-3 rounded-2xl border p-3"
          style={{
            borderColor: hasBlockingPreflight ? "rgba(239, 68, 68, 0.24)" : PANEL.border,
            backgroundColor: hasBlockingPreflight ? PANEL.dangerSoft : PANEL.card,
          }}
          data-testid="production-preflight-summary"
        >
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-[11px] font-medium" style={{ color: PANEL.text }}>
              <AlertTriangle size={12} strokeWidth={1.8} color={hasBlockingPreflight ? "#ef4444" : "#facc15"} />
              投产预检
            </div>
            <span className="text-[11px]" style={{ color: PANEL.textMuted }}>
              {preflightSummary.averageScore}/100
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-[11px]">
            <div className="rounded-lg py-1.5" style={{ backgroundColor: PANEL.successSoft, color: "#22c55e" }}>
              {preflightSummary.readyShots} 就绪
            </div>
            <div className="rounded-lg py-1.5" style={{ backgroundColor: PANEL.warningSoft, color: "#facc15" }}>
              {preflightSummary.reviewShots} 复核
            </div>
            <div className="rounded-lg py-1.5" style={{ backgroundColor: PANEL.dangerSoft, color: "#ef4444" }}>
              {preflightSummary.blockedShots} 阻塞
            </div>
          </div>
        </div>
      )}

      {/* ── Video Provider Dry-run Summary ── */}
      {videoDryRunSummary && (
        <div
          className="mb-3 rounded-2xl border p-3"
          style={{
            borderColor: hasBlockingVideoDryRun ? "rgba(239, 68, 68, 0.24)" : PANEL.border,
            backgroundColor: hasBlockingVideoDryRun ? PANEL.dangerSoft : PANEL.card,
          }}
          data-testid="video-provider-dry-run-summary"
        >
          <div className="mb-2 flex items-center justify-between">
            <div className="min-w-0 flex items-center gap-1.5 text-[11px] font-medium" style={{ color: PANEL.text }}>
              <AlertTriangle size={12} strokeWidth={1.8} color={hasBlockingVideoDryRun ? "#ef4444" : "#22c55e"} />
              <span className="truncate">{videoDryRun.providerName ?? "视频供应商"}</span>
            </div>
            <span className="shrink-0 text-[11px]" style={{ color: PANEL.textMuted }}>
              {videoDryRun.model ?? "默认模型"}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-[11px]">
            <div className="rounded-lg py-1.5" style={{ backgroundColor: PANEL.successSoft, color: "#22c55e" }}>
              {videoDryRunSummary.readyShots} 就绪
            </div>
            <div className="rounded-lg py-1.5" style={{ backgroundColor: PANEL.dangerSoft, color: "#ef4444" }}>
              {videoDryRunSummary.blockingIssues} 阻塞
            </div>
            <div className="rounded-lg py-1.5" style={{ backgroundColor: PANEL.warningSoft, color: "#facc15" }}>
              {videoDryRunSummary.warningIssues} 警告
            </div>
          </div>
          {firstBlockingVideoIssue ? (
            <div className="mt-2 text-[11px]" style={{ color: PANEL.textSecondary }}>
              原因：{firstBlockingVideoIssue.message}
            </div>
          ) : null}
        </div>
      )}

      {/* ── Provider Readiness Summary ── */}
      {(isProviderHealthPending || providerHealthSummary) && (
        <div
          className="mb-3 rounded-2xl border p-3"
          style={{
            borderColor: hasBlockingProviderHealth ? "rgba(239, 68, 68, 0.24)" : PANEL.border,
            backgroundColor: hasBlockingProviderHealth ? PANEL.dangerSoft : PANEL.card,
          }}
          data-testid="production-provider-health-summary"
        >
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-[11px] font-medium" style={{ color: PANEL.text }}>
              {isProviderHealthPending ? (
                <Loader2 size={12} strokeWidth={1.8} className="animate-spin" color="#60a5fa" />
              ) : (
                <AlertTriangle
                  size={12}
                  strokeWidth={1.8}
                  color={hasBlockingProviderHealth ? "#ef4444" : "#22c55e"}
                />
              )}
              模型准备
            </div>
            <div className="flex items-center gap-2">
              {!isProviderHealthPending && primaryStartBlockReason ? (
                <span
                  className="max-w-[150px] truncate text-[10px]"
                  style={{ color: PANEL.textMuted }}
                  data-testid="production-provider-fix-hint"
                  title={primaryStartBlockReason}
                >
                  先修：{primaryStartBlockReason}
                </span>
              ) : null}
              <span className="text-[11px]" style={{ color: PANEL.textMuted }}>
                {isProviderHealthPending ? "检查中" : `${providerBlockingCount} 阻塞`}
              </span>
              {!isProviderHealthPending && hasProviderHealthAttention && (
                <button
                  type="button"
                  className="rounded-full px-2 py-0.5 text-[10px] transition hover:bg-white/10"
                  style={{ color: "#93c5fd", backgroundColor: "rgba(59, 130, 246, 0.10)" }}
                  onClick={openProviderSettings}
                  data-testid="production-provider-open-settings"
                >
                  设置
                </button>
              )}
            </div>
          </div>
          {isProviderHealthPending ? (
            <div className="text-[11px]" style={{ color: PANEL.textMuted }}>
              正在读取当前模型和 API Key 配置。
            </div>
          ) : (
            <div className="space-y-2">
              {productionTaskReadiness ? (
                <div
                  className="rounded-lg border px-2 py-1.5 text-[11px]"
                  style={{
                    borderColor: PROVIDER_HEALTH_STYLE[productionTaskReadiness.status].borderColor,
                    backgroundColor: PROVIDER_HEALTH_STYLE[productionTaskReadiness.status].backgroundColor,
                  }}
                  data-testid="production-task-readiness"
                >
                  <div className="mb-0.5 flex items-center justify-between gap-2">
                    <span className="font-medium" style={{ color: PANEL.text }}>
                      完整生产队列
                    </span>
                    <span
                      className="shrink-0"
                      style={{ color: PROVIDER_HEALTH_STYLE[productionTaskReadiness.status].color }}
                    >
                      {PROVIDER_HEALTH_STYLE[productionTaskReadiness.status].label}
                    </span>
                  </div>
                  <div style={{ color: PANEL.textSecondary }}>
                    {productionTaskReadiness.summary}
                  </div>
                  {productionTaskReadiness.blockingReasons.length > 0 ? (
                    <div className="mt-1 text-[10px]" style={{ color: PANEL.textMuted }}>
                      原因：{productionTaskReadiness.blockingReasons[0]}
                    </div>
                  ) : null}
                </div>
              ) : null}
              {productionProviderItems.map((item) => {
                const style = PROVIDER_HEALTH_STYLE[item.status];
                return (
                  <div
                    key={item.id}
                    className="rounded-lg border px-2 py-1.5 text-[11px]"
                    style={{
                      borderColor: style.borderColor,
                      backgroundColor: style.backgroundColor,
                    }}
                  >
                    <div className="mb-0.5 flex items-center justify-between gap-2">
                      <span className="font-medium" style={{ color: PANEL.text }}>
                        {item.label}
                      </span>
                      <span className="shrink-0" style={{ color: style.color }}>
                        {style.label}
                      </span>
                    </div>
                    <div style={{ color: PANEL.textSecondary }}>
                      {item.message}
                    </div>
                    {item.details?.length ? (
                      <div className="mt-1 text-[10px]" style={{ color: PANEL.textMuted }}>
                        原因：{item.details[0]}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

        {/* ── Active Task ── */}
        {displayQueue.activeTaskId && (
          <div
            className="rounded-xl p-3 text-xs"
            style={{ backgroundColor: PANEL.runningSoft }}
            data-testid="production-run-queue-active-task"
          >
            <div className="mb-1" style={{ color: PANEL.textMuted }}>
              当前任务
            </div>
            <div style={{ color: PANEL.text }}>
              {(() => {
                const active = displayQueue.tasks.find((task) => task.id === displayQueue.activeTaskId);
                if (!active) return null;
                return (
                  <>
                    <span className="font-medium">#{active.order}</span>{" "}
                    {active.title || "—"} · {TASK_ACTION_LABEL[active.action] ?? active.action}
                  </>
                );
              })()}
            </div>
          </div>
        )}

        {/* ── Task List ── */}
        {displayQueue.tasks.length > 0 && (
          <div>
            <div className="mb-1.5 text-[11px] font-medium" style={{ color: PANEL.textMuted }}>
              任务列表
            </div>
            <div className="space-y-1">
              {displayQueue.tasks.map((task) => {
                const liveStatus = task.status;
                const liveError = task.error;
                const isFailed = liveStatus === "failed";
                const isSkipped = liveStatus === "skipped";

                return (
                  <div
                    key={task.id}
                    data-testid="production-run-queue-task"
                    className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs transition"
                    style={{
                      backgroundColor: liveStatus === "running" ? PANEL.runningSoft : "transparent",
                    }}
                  >
                    <TaskStatusIcon status={liveStatus as ProductionRunQueueTask["status"]} />
                    <span style={{ color: PANEL.textSecondary }}>#{task.order}</span>
                    <span
                      className="flex-1 truncate"
                      style={{
                        color: isFailed ? "#ef4444" : PANEL.text,
                        textDecoration: isFailed || isSkipped ? "line-through" : undefined,
                        opacity: isSkipped ? 0.68 : 1,
                      }}
                    >
                      {task.title || "—"} · {TASK_ACTION_LABEL[task.action] ?? task.action}
                      {task.detail ? (
                        <span data-testid="production-run-queue-task-detail" className="ml-1 text-[10px]" style={{ color: PANEL.textMuted }}>
                          {task.detail}
                        </span>
                      ) : null}
                    </span>
                    {/* ── Failure reason (Step 4) ── */}
                    {isFailed && liveError && (
                      <span
                        className="max-w-[80px] truncate text-[10px]"
                        style={{ color: "#ef4444" }}
                        title={liveError}
                      >
                        {liveError}
                      </span>
                    )}
                    <span
                      className="text-[10px]"
                      style={{
                        color:
                          liveStatus === "running"
                            ? "#3b82f6"
                            : isFailed
                              ? "#ef4444"
                              : isSkipped
                                ? "#94a3b8"
                                : liveStatus === "completed"
                                ? "#22c55e"
                                : PANEL.textMuted,
                      }}
                    >
                      {TASK_STATUS_LABEL[liveStatus] ?? liveStatus}
                    </span>
                    {/* ── Retry / Skip buttons (Step 4) ── */}
                    {isFailed && !isRunning && onRetryTask && onSkipTask && (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); onRetryTask(task.id); }}
                          className="rounded p-1 transition hover:bg-white/10"
                          title="重试"
                          data-testid="production-run-queue-retry"
                        >
                          <RotateCcw size={11} strokeWidth={1.8} style={{ color: "#60a5fa" }} />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); onSkipTask(task.id); }}
                          className="rounded p-1 transition hover:bg-white/10"
                          title="跳过"
                          data-testid="production-run-queue-skip"
                        >
                          <ChevronRight size={11} strokeWidth={1.8} style={{ color: PANEL.textMuted }} />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Blocked Actions ── */}
        {displayQueue.blockedActions.length > 0 && (
          <div className="rounded-2xl p-4" style={{ backgroundColor: PANEL.warningSoft }}>
            <div
              className="mb-2 flex items-center gap-1.5 text-[11px] font-medium"
              style={{ color: "#facc15" }}
            >
              <AlertTriangle size={12} strokeWidth={1.8} />
              需要手动处理
            </div>
            <div className="space-y-2">
              {displayQueue.blockedActions.map((blocked, index) => (
                <div
                  key={`${blocked.shotId}-${blocked.action}-${index}`}
                  data-testid="production-run-queue-blocked-action"
                  className="rounded-lg px-1 py-1 text-xs transition hover:bg-white/5"
                  style={{
                    color: PANEL.textSecondary,
                  }}
                >
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onResolveIssue?.(blocked.shotId, blocked.action)}
                      className="min-w-0 flex-1 truncate text-left font-medium transition hover:text-white"
                      style={{
                        color: PANEL.text,
                        cursor: onResolveIssue ? "pointer" : "default",
                      }}
                    >
                      #{blocked.order} {blocked.title || "—"}
                    </button>
                    <span
                      className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px]"
                      style={{
                        backgroundColor: blocked.severity === "blocking" ? PANEL.dangerSoft : PANEL.warningSoft,
                        color: blocked.severity === "blocking" ? "#ef4444" : "#facc15",
                      }}
                    >
                      {formatBlockedActionLabel(blocked.action)}
                    </span>
                    {onApplyProductionFix && (
                      <button
                        type="button"
                        data-testid="production-run-queue-apply-fix"
                        className="inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] transition hover:bg-white/10"
                        style={{ color: "#93c5fd" }}
                        onClick={(event) => {
                          event.stopPropagation();
                          onApplyProductionFix(blocked.shotId, blocked.action, "production-queue");
                        }}
                      >
                        <Wand2 size={10} strokeWidth={1.8} />
                        草案
                      </button>
                    )}
                  </div>
                  <div className="mt-0.5" style={{ color: PANEL.textMuted }}>
                    {blocked.reason}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Summary Footer ── */}
      <div
        className="mt-4 border-t pt-3 text-[11px]"
        style={{ borderColor: PANEL.border, color: PANEL.textMuted }}
      >
        {displayQueue.tasks.length > 0 && (
          <span>
            {displayQueue.completedTasks}/{displayQueue.totalTasks} 可执行任务
          </span>
        )}
        {displayQueue.tasks.length > 0 && displayQueue.blockedActions.length > 0 && (
          <span className="mx-1.5">·</span>
        )}
        {displayQueue.blockedActions.length > 0 && (
          <span style={{ color: "#facc15" }}>
            {displayQueue.blockedActions.length} 阻塞项
          </span>
        )}
        {displayQueue.status === "completed" && (
          <span className="flex items-center gap-1" style={{ color: "#22c55e" }}>
            <CheckCircle2 size={12} strokeWidth={1.8} />
            全部完成
          </span>
        )}
        {displayQueue.skippedTasks > 0 && displayQueue.status !== "completed" && (
          <span className="ml-1.5" style={{ color: "#94a3b8" }}>
            · {displayQueue.skippedTasks} 已跳过
          </span>
        )}
      </div>

      {/* ── Execution Controls (Step 2) ── */}
      {onStart && (
        <div className="mt-3 border-t pt-3" style={{ borderColor: PANEL.border }}>
          {isRunning ? (
            <div className="flex items-center gap-2">
              <div
                className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-3 py-2.5 text-xs"
                style={{ backgroundColor: PANEL.accentSoft, color: PANEL.textSecondary }}
              >
                <Loader2 size={13} strokeWidth={1.8} className="shrink-0 animate-spin" />
                <span className="truncate">生产任务执行中</span>
              </div>
              {onPause && (
                <button
                  type="button"
                  onClick={onPause}
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition hover:bg-white/10"
                  style={{ color: "#facc15", backgroundColor: PANEL.warningSoft }}
                  title="暂停"
                  aria-label="暂停生产"
                  data-testid="production-run-queue-pause"
                >
                  <Pause size={14} strokeWidth={2} />
                </button>
              )}
              {onAbort && (
                <button
                  type="button"
                  onClick={onAbort}
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition hover:bg-white/10"
                  style={{ color: "#ef4444", backgroundColor: PANEL.dangerSoft }}
                  title="取消"
                  aria-label="取消生产"
                  data-testid="production-run-queue-abort"
                >
                  <Square size={13} strokeWidth={2} />
                </button>
              )}
            </div>
          ) : isPaused && onResume ? (
            <button
              type="button"
              onClick={onResume}
              data-testid="production-run-queue-resume"
              className="flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-xs font-medium transition-all active:scale-[0.98]"
              style={{
                backgroundColor: "#facc15",
                color: "#111827",
              }}
            >
              <Play size={13} strokeWidth={2} fill="currentColor" />
              继续生产
            </button>
          ) : (
            <button
              type="button"
              onClick={onStart}
              disabled={!canStart}
              data-testid="production-run-queue-start"
              className="flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-xs font-medium transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-30"
              style={{
                backgroundColor: canStart ? "#3b82f6" : "#64748b",
                color: "#fff",
              }}
            >
              <Play size={13} strokeWidth={2} fill="currentColor" />
              {startButtonLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
