"use client";

import { useState, useCallback, useRef } from "react";
import type {
  ProductionRunQueue,
  ProductionRunQueueTask,
  ProductionRunQueueTaskStatus,
} from "@/lib/storyboard/productionRunQueue";
import {
  buildInitialProductionRunExecState,
  selectRunnableProductionRunTasks,
} from "./productionRunExecutorState";

// ============================================================================
// TYPES
// ============================================================================

export type ProductionTaskExecutor = (
  task: ProductionRunQueueTask,
  signal: AbortSignal,
) => Promise<void>;

export type TaskExecState = {
  status: ProductionRunQueueTaskStatus;
  error?: string;
};

export type ProductionRunExecutorOptions = {
  /** 队列实例 */
  queue: ProductionRunQueue | null;
  /** 任务执行回调 — Step 3: 映射到真实执行器 */
  onExecuteTask: ProductionTaskExecutor;
  /** 每个任务完成后的回调（用于更新 UI 状态） */
  onTaskCompleted?: (taskId: string) => void;
  /** 每个任务失败后的回调 */
  onTaskFailed?: (taskId: string, error: Error) => void;
  /** 每个任务跳过后的回调 */
  onTaskSkipped?: (taskId: string, reason?: string) => void;
  /** 全部完成后回调 */
  onAllCompleted?: () => void;
};

export type UseProductionRunExecutorReturn = {
  /** 是否正在执行 */
  isRunning: boolean;
  /** 是否暂停中 */
  isPaused: boolean;
  /** 开始执行队列 */
  start: () => void;
  /** 暂停当前执行，保留进度 */
  pause: () => void;
  /** 从暂停点恢复执行 */
  resume: () => void;
  /** 中止执行 */
  abort: () => void;
  /** 重试单个失败任务 */
  retryTask: (taskId: string) => void;
  /** 跳过单个失败任务（标记为 completed，继续后续） */
  skipTask: (taskId: string) => void;
  /** 当前错误 */
  error: string | null;
  /** 实时任务执行状态（Step 4 新增） */
  execState: Record<string, TaskExecState>;
};

// ============================================================================
// HOOK
// ============================================================================

/**
 * 生产运行队列执行器。
 *
 * 职责：
 * - 管理执行状态（idle / running）
 * - 串行遍历队列任务，逐个调用 onExecuteTask
 * - 支持中止
 * - 失败后继续执行（不中断整个队列）
 * - 记录每个任务的执行状态（execState），供 Panel 展示
 *
 * Step 4 新增：
 * - execState 实时追踪每个任务状态
 * - retryTask / skipTask 支持失败后恢复
 */
export function useProductionRunExecutor({
  queue,
  onExecuteTask,
  onTaskCompleted,
  onTaskFailed,
  onTaskSkipped,
  onAllCompleted,
}: ProductionRunExecutorOptions): UseProductionRunExecutorReturn {
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [execState, setExecState] = useState<Record<string, TaskExecState>>({});
  const abortRef = useRef<AbortController | null>(null);
  const pauseRequestedRef = useRef(false);
  const abortRequestedRef = useRef(false);
  const execStateRef = useRef(execState);
  execStateRef.current = execState;

  // 更新单个任务状态
  const updateTaskState = useCallback(
    (taskId: string, patch: Partial<TaskExecState>) => {
      const prev = execStateRef.current;
      const next = {
        ...prev,
        [taskId]: { ...(prev[taskId] ?? { status: "queued" }), ...patch },
      };
      execStateRef.current = next;
      setExecState(next);
    },
    [],
  );

  const start = useCallback(async () => {
    if (!queue || !queue.tasks.length) return;

    const initialState = buildInitialProductionRunExecState(queue.tasks, execStateRef.current);
    const runnableTasks = selectRunnableProductionRunTasks(queue.tasks, initialState);

    if (!runnableTasks.length) {
      setError("没有可执行的任务");
      return;
    }

    setIsRunning(true);
    setIsPaused(false);
    setError(null);
    pauseRequestedRef.current = false;
    abortRequestedRef.current = false;
    setExecState(initialState);
    execStateRef.current = initialState;
    abortRef.current = new AbortController();
    const { signal } = abortRef.current;

    while (!signal.aborted) {
      const task = selectRunnableProductionRunTasks(queue.tasks, execStateRef.current)[0];
      if (!task) break;
      if (signal.aborted) break;

      // 跳过已完成或已跳过的任务
      if (
        execStateRef.current[task.id]?.status === "completed" ||
        execStateRef.current[task.id]?.status === "skipped"
      ) {
        continue;
      }

      updateTaskState(task.id, { status: "running", error: undefined });

      try {
        await onExecuteTask(task, signal);
        updateTaskState(task.id, { status: "completed", error: undefined });
        onTaskCompleted?.(task.id);
      } catch (err: any) {
        if (err?.name === "AbortError") {
          updateTaskState(task.id, {
            status: pauseRequestedRef.current ? "paused" : "queued",
          });
          break;
        }
        const errMsg = err instanceof Error ? err.message : String(err);
        updateTaskState(task.id, { status: "failed", error: errMsg });
        onTaskFailed?.(task.id, err instanceof Error ? err : new Error(errMsg));
        // 继续执行下一个任务（不中断）
      }
    }

    setIsRunning(false);
    abortRef.current = null;
    if (!pauseRequestedRef.current && !abortRequestedRef.current) {
      onAllCompleted?.();
    }
    abortRequestedRef.current = false;
  }, [queue, onExecuteTask, onTaskCompleted, onTaskFailed, onAllCompleted, updateTaskState]);

  const pause = useCallback(() => {
    if (!isRunning) return;
    pauseRequestedRef.current = true;
    setIsPaused(true);
    const activeTaskId = Object.entries(execStateRef.current).find(([, state]) =>
      state.status === "running" || state.status === "preparing"
    )?.[0];
    if (activeTaskId) {
      updateTaskState(activeTaskId, { status: "paused" });
    }
    abortRef.current?.abort();
    setIsRunning(false);
  }, [isRunning, updateTaskState]);

  const resume = useCallback(() => {
    if (!queue) return;
    pauseRequestedRef.current = false;
    setIsPaused(false);
    void start();
  }, [queue, start]);

  const abort = useCallback(() => {
    pauseRequestedRef.current = false;
    abortRequestedRef.current = true;
    abortRef.current?.abort();
    abortRef.current = null;
    setIsRunning(false);
    setIsPaused(false);
  }, []);

  const retryTask = useCallback(
    async (taskId: string) => {
      if (!queue || isRunning) return;
      const task = queue.tasks.find((t) => t.id === taskId);
      if (!task) return;

      setIsRunning(true);
      setIsPaused(false);
      setError(null);
      pauseRequestedRef.current = false;
      abortRequestedRef.current = false;
      const controller = new AbortController();
      abortRef.current = controller;
      updateTaskState(taskId, { status: "running", error: undefined });

      try {
        await onExecuteTask(task, controller.signal);
        updateTaskState(taskId, { status: "completed", error: undefined });
        onTaskCompleted?.(taskId);
      } catch (err: any) {
        if (err?.name === "AbortError") {
          updateTaskState(taskId, {
            status: pauseRequestedRef.current ? "paused" : "queued",
          });
          return;
        }
        const errMsg = err instanceof Error ? err.message : String(err);
        updateTaskState(taskId, { status: "failed", error: errMsg });
        onTaskFailed?.(taskId, err instanceof Error ? err : new Error(errMsg));
      } finally {
        setIsRunning(false);
        abortRef.current = null;
        abortRequestedRef.current = false;
      }
    },
    [queue, isRunning, onExecuteTask, onTaskCompleted, onTaskFailed, updateTaskState],
  );

  const skipTask = useCallback(
    (taskId: string) => {
      updateTaskState(taskId, { status: "skipped", error: "Skipped by user." });
      onTaskSkipped?.(taskId, "Skipped by user.");
    },
    [onTaskSkipped, updateTaskState],
  );

  return { isRunning, isPaused, start, pause, resume, abort, retryTask, skipTask, error, execState };
}
