import type {
  ProductionRunQueueRuntimeState,
  ProductionRunQueueTask,
  ProductionRunQueueTaskStatus,
} from "../../../lib/storyboard/productionRunQueue.ts";

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
    return !isTerminalTaskStatus(task.status) && !isTerminalTaskStatus(runtimeStatus);
  });
}
