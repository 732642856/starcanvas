import type {
  ProductionRunQueueAction,
  ProductionRunQueueRuntimeState,
  ProductionRunQueueTask,
  ProductionRunQueueTaskStatus,
} from "../../../lib/storyboard/productionRunQueue.ts";

const ACTION_ORDER: Record<ProductionRunQueueAction, number> = {
  "generate-storyboard-image": 0,
  "generate-video-clip": 1,
  "generate-voice-track": 2,
  "create-subtitle-track": 3,
  "review-handoff-warnings": 4,
};

const TERMINAL_TASK_STATUSES = new Set<ProductionRunQueueTaskStatus>([
  "completed",
  "skipped",
]);

function isTerminalTaskStatus(status: ProductionRunQueueTaskStatus): boolean {
  return TERMINAL_TASK_STATUSES.has(status);
}

export function buildInitialProductionRunExecState(
  tasks: ProductionRunQueueTask[],
  previousState: ProductionRunQueueRuntimeState = {},
): ProductionRunQueueRuntimeState {
  const initial: ProductionRunQueueRuntimeState = {};

  for (const task of tasks) {
    const previous = previousState[task.id];
    if (isTerminalTaskStatus(task.status)) {
      initial[task.id] = { status: task.status, error: task.error };
      continue;
    }

    if (previous && isTerminalTaskStatus(previous.status)) {
      initial[task.id] = { status: previous.status, error: previous.error };
      continue;
    }

    initial[task.id] = { status: "queued", error: undefined };
  }

  return initial;
}

export function selectRunnableProductionRunTasks(
  tasks: ProductionRunQueueTask[],
  state: ProductionRunQueueRuntimeState,
): ProductionRunQueueTask[] {
  return tasks.filter((task) => {
    const runtimeStatus = state[task.id]?.status ?? task.status;
    if (isTerminalTaskStatus(task.status) || isTerminalTaskStatus(runtimeStatus)) {
      return false;
    }
    if (runtimeStatus !== "queued") {
      return false;
    }
    const taskOrder = ACTION_ORDER[task.action];
    return !tasks.some((candidate) => {
      if (candidate.shotId !== task.shotId) return false;
      if (ACTION_ORDER[candidate.action] >= taskOrder) return false;
      const candidateStatus = state[candidate.id]?.status ?? candidate.status;
      return !isTerminalTaskStatus(candidateStatus);
    });
  });
}
