import type { ProjectPackageProductionRunManifest } from "./projectPackageManifest";
import type { ShotProductionPreflight } from "./productionPreflight";

export type ProductionRunQueueStatus = "queued" | "preparing" | "running" | "paused" | "completed" | "failed";

export type ProductionRunQueueTaskStatus =
  | "queued"
  | "preparing"
  | "running"
  | "paused"
  | "completed"
  | "failed"
  | "skipped";

export type ProductionRunQueueAction =
  | "generate-storyboard-image"
  | "generate-video-clip"
  | "generate-voice-track"
  | "create-subtitle-track"
  | "review-handoff-warnings";

export type ProductionRunQueueBlockedAction = {
  shotId: string;
  order: number;
  title: string;
  action: string;
  reason: string;
  severity?: "warning" | "blocking";
};

export type ProductionRunQueueTask = {
  id: string;
  shotId: string;
  order: number;
  title: string;
  detail?: string;
  action: ProductionRunQueueAction;
  status: ProductionRunQueueTaskStatus;
  progress: number;
  error?: string;
};

export type ProductionRunQueue = {
  jobId: string;
  status: ProductionRunQueueStatus;
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  skippedTasks: number;
  progress: number;
  activeTaskId?: string;
  tasks: ProductionRunQueueTask[];
  blockedActions: ProductionRunQueueBlockedAction[];
  productionPreflight?: ProjectPackageProductionRunManifest["productionPreflight"];
  videoProviderDryRun?: ProjectPackageProductionRunManifest["videoProviderDryRun"];
};

export type ProductionRunQueueRuntimeTaskState = {
  status: ProductionRunQueueTaskStatus;
  error?: string;
};

export type ProductionRunQueueRuntimeState = Record<string, ProductionRunQueueRuntimeTaskState>;

export type BuildProductionRunQueueOptions = {
  jobId?: string;
};

const EXECUTABLE_ACTIONS = new Set<ProductionRunQueueAction>([
  "generate-storyboard-image",
  "generate-video-clip",
  "generate-voice-track",
  "create-subtitle-track",
  "review-handoff-warnings",
]);

const BLOCKED_ACTION_REASONS: Record<string, string> = {
  "add-visual-prompt": "Shot needs a visual prompt before automatic production can run.",
};

const PREFLIGHT_ACTION_REASONS: Record<string, string> = {
  "strengthen-visual-prompt": "视觉提示词需要补强后再进入自动生产。",
  "add-shot-language": "缺少景别或运镜，需要先补齐镜头语言。",
  "set-shot-duration": "缺少镜头时长，会影响排期、字幕和音频同步。",
  "attach-reference-frame": "缺少参考帧或角色参考资产，一致性风险较高。",
  "complete-character-anchor": "角色视觉锚点不完整，跨镜头一致性风险很高。",
  "restore-source-timecode": "参考视频镜头缺少来源时间码，追溯和重抽帧会变难。",
  "add-voice-intent": "有对白但缺少声线/表演意图，配音控制不足。",
  "review-handoff-warning": "存在交接警告，需要人工复核。",
};

function isExecutableAction(action: string): action is ProductionRunQueueAction {
  return EXECUTABLE_ACTIONS.has(action as ProductionRunQueueAction);
}

function normalizeProgress(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function buildTaskId(shotId: string, action: string): string {
  return `${shotId}:${action}`;
}

function buildPreflightBlockedActions(
  shot: ShotProductionPreflight,
): ProductionRunQueueBlockedAction[] {
  if (shot.status === "ready") return [];

  const blockingIssueCount = shot.issues.filter((issue) => issue.severity === "blocking").length;
  const warningIssueCount = shot.issues.filter((issue) => issue.severity === "warning").length;
  const issueSummary = [
    blockingIssueCount > 0 ? `${blockingIssueCount} 个阻塞` : "",
    warningIssueCount > 0 ? `${warningIssueCount} 个警告` : "",
  ].filter(Boolean).join("、");

  return shot.requiredActions.map((action) => ({
    shotId: shot.shotId,
    order: shot.order,
    title: shot.title,
    action: `preflight:${action}`,
    reason: `${PREFLIGHT_ACTION_REASONS[action] ?? "需要先完成镜头预检修复。"}${issueSummary ? `（${issueSummary}）` : ""}`,
    severity: shot.status === "blocked" ? "blocking" : "warning",
  }));
}

function buildVideoProviderBlockedActions(
  report: ProjectPackageProductionRunManifest["videoProviderDryRun"],
): ProductionRunQueueBlockedAction[] {
  return report.shots.flatMap((shot) =>
    shot.issues
      .filter((issue) => issue.severity !== "info")
      .map((issue) => ({
        shotId: shot.shotId,
        order: shot.order,
        title: shot.title,
        action: `video-provider:${issue.code}`,
        reason: `${shot.providerName ?? "视频供应商"} dry-run：${issue.message}（${shot.durationSeconds}s · ${shot.aspectRatio} · ${shot.resolution}）`,
        severity: issue.severity === "blocking" ? "blocking" : "warning",
      })),
  );
}

function recomputeQueue(queue: ProductionRunQueue): ProductionRunQueue {
  const completedTasks = queue.tasks.filter((task) => task.status === "completed").length;
  const failedTasks = queue.tasks.filter((task) => task.status === "failed").length;
  const skippedTasks = queue.tasks.filter((task) => task.status === "skipped").length;
  const activeTask = queue.tasks.find((task) => task.status === "running" || task.status === "preparing" || task.status === "paused");
  const totalProgress = queue.tasks.reduce((sum, task) => sum + normalizeProgress(task.progress), 0);
  const progress = queue.tasks.length > 0 ? totalProgress / queue.tasks.length : 1;
  const allSettled = queue.tasks.every((task) => task.status === "completed" || task.status === "failed" || task.status === "skipped");
  const status: ProductionRunQueueStatus = failedTasks > 0
    ? "failed"
    : activeTask?.status === "paused"
      ? "paused"
    : activeTask?.status === "running"
      ? "running"
      : activeTask?.status === "preparing"
        ? "preparing"
        : allSettled
          ? "completed"
          : "queued";

  return {
    ...queue,
    status,
    completedTasks,
    failedTasks,
    skippedTasks,
    progress,
    activeTaskId: activeTask?.id,
  };
}

function updateTask(
  queue: ProductionRunQueue,
  taskId: string,
  updater: (task: ProductionRunQueueTask) => ProductionRunQueueTask,
): ProductionRunQueue {
  return recomputeQueue({
    ...queue,
    tasks: queue.tasks.map((task) => (task.id === taskId ? updater(task) : task)),
  });
}

function runtimeProgress(
  task: ProductionRunQueueTask,
  status: ProductionRunQueueTaskStatus,
): number {
  switch (status) {
    case "completed":
      return 1;
    case "running":
      return Math.max(task.progress, 0.1);
    case "preparing":
      return Math.max(task.progress, 0.05);
    case "skipped":
      return 1;
    case "queued":
    case "failed":
    case "paused":
    default:
      return task.progress;
  }
}

export function projectProductionRunQueueRuntimeState(
  queue: ProductionRunQueue,
  runtimeState?: ProductionRunQueueRuntimeState,
): ProductionRunQueue {
  if (!runtimeState || Object.keys(runtimeState).length === 0) return queue;

  return recomputeQueue({
    ...queue,
    tasks: queue.tasks.map((task) => {
      const runtime = runtimeState[task.id];
      if (!runtime) return task;

      return {
        ...task,
        status: runtime.status,
        progress: runtimeProgress(task, runtime.status),
        error: runtime.error,
      };
    }),
  });
}

export function buildProductionRunQueue(
  manifest: ProjectPackageProductionRunManifest,
  options: BuildProductionRunQueueOptions = {},
): ProductionRunQueue {
  const tasks: ProductionRunQueueTask[] = [];
  const blockedActions: ProductionRunQueueBlockedAction[] = manifest.productionPreflight.shots
    .flatMap(buildPreflightBlockedActions)
    .concat(buildVideoProviderBlockedActions(manifest.videoProviderDryRun));
  const blockedShotIds = new Set(
    manifest.productionPreflight.shots
      .filter((shot) => shot.status === "blocked")
      .map((shot) => shot.shotId),
  );

  for (const plan of manifest.productionRunPlan) {
    if (blockedShotIds.has(plan.shotId)) {
      continue;
    }

    for (const action of plan.nextActions) {
      if (isExecutableAction(action)) {
        tasks.push({
          id: buildTaskId(plan.shotId, action),
          shotId: plan.shotId,
          order: plan.order,
          title: plan.title,
          detail:
            action === "review-handoff-warnings" && plan.videoReferenceAudit
              ? `${plan.videoReferenceAudit.mode.toUpperCase()} · 已用 ${plan.videoReferenceAudit.usedCount}/${plan.videoReferenceAudit.configuredCount} · 跳过 ${plan.videoReferenceAudit.skippedCount}`
              : undefined,
          action,
          status: "queued",
          progress: 0,
        });
        continue;
      }

      blockedActions.push({
        shotId: plan.shotId,
        order: plan.order,
        title: plan.title,
        action,
        reason: BLOCKED_ACTION_REASONS[action] ?? "Action requires manual preparation before it can run automatically.",
        severity: "blocking",
      });
    }
  }

  return recomputeQueue({
    jobId: options.jobId ?? "production-run-queue",
    status: tasks.length > 0 ? "queued" : "completed",
    totalTasks: tasks.length,
    completedTasks: 0,
    failedTasks: 0,
    skippedTasks: 0,
    progress: tasks.length > 0 ? 0 : 1,
    tasks,
    blockedActions,
    productionPreflight: manifest.productionPreflight,
    videoProviderDryRun: manifest.videoProviderDryRun,
  });
}

export function getNextQueuedTask(queue: ProductionRunQueue): ProductionRunQueueTask | undefined {
  return queue.tasks.find((task) => task.status === "queued");
}

export function prepareProductionRunTask(queue: ProductionRunQueue, taskId = getNextQueuedTask(queue)?.id): ProductionRunQueue {
  if (!taskId) return recomputeQueue(queue);

  return updateTask(queue, taskId, (task) => ({
    ...task,
    status: task.status === "queued" ? "preparing" : task.status,
    progress: task.status === "queued" ? Math.max(task.progress, 0.05) : task.progress,
    error: undefined,
  }));
}

export function startProductionRunTask(queue: ProductionRunQueue, taskId = queue.activeTaskId ?? getNextQueuedTask(queue)?.id): ProductionRunQueue {
  if (!taskId) return recomputeQueue(queue);

  return updateTask(queue, taskId, (task) => ({
    ...task,
    status: task.status === "completed" || task.status === "failed" ? task.status : "running",
    progress: task.status === "completed" ? task.progress : Math.max(task.progress, 0.1),
    error: undefined,
  }));
}

export function updateProductionRunTaskProgress(
  queue: ProductionRunQueue,
  taskId: string,
  progress: number,
): ProductionRunQueue {
  return updateTask(queue, taskId, (task) => ({
    ...task,
    progress: task.status === "completed" ? 1 : normalizeProgress(progress),
  }));
}

export function completeProductionRunTask(queue: ProductionRunQueue, taskId: string): ProductionRunQueue {
  return updateTask(queue, taskId, (task) => ({
    ...task,
    status: "completed",
    progress: 1,
    error: undefined,
  }));
}

export function failProductionRunTask(queue: ProductionRunQueue, taskId: string, error: string): ProductionRunQueue {
  return updateTask(queue, taskId, (task) => ({
    ...task,
    status: "failed",
    progress: normalizeProgress(task.progress),
    error: error.trim() || "Production task failed.",
  }));
}

export function pauseProductionRunTask(queue: ProductionRunQueue, taskId = queue.activeTaskId): ProductionRunQueue {
  if (!taskId) return recomputeQueue(queue);

  return updateTask(queue, taskId, (task) => ({
    ...task,
    status: task.status === "running" || task.status === "preparing" ? "paused" : task.status,
    progress: normalizeProgress(task.progress),
  }));
}

export function resumeProductionRunQueue(queue: ProductionRunQueue): ProductionRunQueue {
  return recomputeQueue({
    ...queue,
    tasks: queue.tasks.map((task) => task.status === "paused"
      ? { ...task, status: "queued", progress: normalizeProgress(task.progress), error: undefined }
      : task),
  });
}

export function retryProductionRunTask(queue: ProductionRunQueue, taskId: string): ProductionRunQueue {
  return updateTask(queue, taskId, (task) => ({
    ...task,
    status: task.status === "failed" || task.status === "skipped" ? "queued" : task.status,
    progress: task.status === "failed" || task.status === "skipped" ? 0 : task.progress,
    error: task.status === "failed" || task.status === "skipped" ? undefined : task.error,
  }));
}

export function skipProductionRunTask(queue: ProductionRunQueue, taskId: string, reason?: string): ProductionRunQueue {
  return updateTask(queue, taskId, (task) => ({
    ...task,
    status: task.status === "completed" ? "completed" : "skipped",
    progress: 1,
    error: task.status === "completed" ? undefined : reason?.trim() || "Skipped by user.",
  }));
}
