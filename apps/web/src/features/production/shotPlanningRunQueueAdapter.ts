/**
 * Shot Planning → Production Run Queue Adapter
 *
 * Maps ShotPlanningBoard items with status "ready" into ProductionRunQueue tasks.
 * This is a pure function — no side effects, no store calls.
 */

import type { ShotPlanningBoard } from "./shotPlanningTypes";
import type {
  ProductionRunQueue,
  ProductionRunQueueTask,
  ProductionRunQueueAction,
} from "@/lib/storyboard/productionRunQueue";

// ============================================================================
// Types
// ============================================================================

export interface CreateRunQueueFromReadyShotsInput {
  board: ShotPlanningBoard;
  projectId: string;
}

// ============================================================================
// Helpers
// ============================================================================

const DEFAULT_ACTION: ProductionRunQueueAction = "generate-storyboard-image";

function buildTaskId(planningItemId: string, action: ProductionRunQueueAction): string {
  return `${planningItemId}:${action}`;
}

// ============================================================================
// Adapter
// ============================================================================

/**
 * Extract ready items from a ShotPlanningBoard and build ProductionRunQueue tasks.
 * Only items with status === "ready" are included.
 * Items preserve their original order from the board.
 */
export function createRunQueueTasksFromReadyShots(
  input: CreateRunQueueFromReadyShotsInput,
): ProductionRunQueueTask[] {
  const { board } = input;

  return board.items
    .filter((item) => item.status === "ready")
    .sort((a, b) => a.order - b.order)
    .map((item) => ({
      id: buildTaskId(item.id, DEFAULT_ACTION),
      shotId: item.sourceNodeId,
      order: item.order,
      title: item.title,
      action: DEFAULT_ACTION,
      status: "queued" as const,
      progress: 0,
    }));
}

/**
 * Build a complete ProductionRunQueue from ready shots in a ShotPlanningBoard.
 * Returns null if no ready shots exist.
 */
export function createProductionRunQueueFromReadyShots(
  input: CreateRunQueueFromReadyShotsInput,
): ProductionRunQueue | null {
  const tasks = createRunQueueTasksFromReadyShots(input);

  if (tasks.length === 0) return null;

  return {
    jobId: `shot-planning:${input.board.id}`,
    status: "queued",
    totalTasks: tasks.length,
    completedTasks: 0,
    failedTasks: 0,
    progress: 0,
    tasks,
    blockedActions: [],
  };
}
