/**
 * Shot Planning → Production Run Queue Bridge Store
 *
 * Holds the ProductionRunQueue created from ShotPlanningBoard ready shots.
 * Separate from the canvas-derived (node-computed) ProductionRunQueue in StarCanvas.
 */

"use client";

import { create } from "zustand";
import type { ProductionRunQueue } from "../../lib/storyboard/productionRunQueue.ts";
import {
  completeProductionRunTask,
  failProductionRunTask,
  retryProductionRunTask,
  skipProductionRunTask,
} from "../../lib/storyboard/productionRunQueue.ts";
import {
  createProductionRunQueueFromReadyShots,
  type ShotPlanningSourceNode,
} from "./shotPlanningRunQueueAdapter.ts";
import type { ShotPlanningBoard } from "./shotPlanningTypes.ts";

// ============================================================================
// State
// ============================================================================

export interface ShotPlanningRunQueueState {
  /** The bridged run queue (null = not yet created or no ready shots) */
  queue: ProductionRunQueue | null;
  /** The projectId this queue was created for */
  projectId: string | null;
  /** Brief status message (e.g., "Created 3 queue tasks") */
  lastMessage: string | null;
}

export interface ShotPlanningRunQueueActions {
  /** Create a run queue from a ShotPlanningBoard's ready items */
  buildFromBoard: (board: ShotPlanningBoard, projectId: string, sourceNodes?: ShotPlanningSourceNode[]) => void;
  /** Directly set a queue built outside the planning board */
  setQueue: (queue: ProductionRunQueue | null, projectId?: string | null) => void;
  /** Mark a task as completed (recomputes queue status) */
  markTaskCompleted: (taskId: string) => void;
  /** Mark a task as failed (recomputes queue status) */
  markTaskFailed: (taskId: string, error: string) => void;
  /** Reset a failed/skipped task to queued for retry */
  retryTask: (taskId: string) => void;
  /** Mark a failed task as skipped so remaining tasks can continue */
  skipTask: (taskId: string, reason?: string) => void;
  /** Clear the queue */
  clear: () => void;
  /** Acknowledge lastMessage (set to null) */
  dismissMessage: () => void;
}

type ShotPlanningRunQueueStore = ShotPlanningRunQueueState & ShotPlanningRunQueueActions;

// ============================================================================
// Store
// ============================================================================

const initialState: ShotPlanningRunQueueState = {
  queue: null,
  projectId: null,
  lastMessage: null,
};

export const useShotPlanningRunQueueStore = create<ShotPlanningRunQueueStore>()((set) => ({
  ...initialState,

  buildFromBoard: (board: ShotPlanningBoard, projectId: string, sourceNodes?: ShotPlanningSourceNode[]) => {
    const queue = createProductionRunQueueFromReadyShots({ board, projectId, sourceNodes });

    set({
      queue,
      projectId,
      lastMessage:
        queue !== null
          ? `Created ${queue.tasks.length} queue task${queue.tasks.length > 1 ? "s" : ""}`
          : "No ready shots to queue",
    });
  },

  setQueue: (queue: ProductionRunQueue | null, projectId: string | null = null) => {
    set({
      queue,
      projectId,
      lastMessage: queue
        ? `Created ${queue.tasks.length} queue task${queue.tasks.length > 1 ? "s" : ""}`
        : null,
    });
  },

  markTaskCompleted: (taskId: string) => {
    set((state) => ({
      queue: state.queue ? completeProductionRunTask(state.queue, taskId) : null,
    }));
  },

  markTaskFailed: (taskId: string, error: string) => {
    set((state) => ({
      queue: state.queue ? failProductionRunTask(state.queue, taskId, error) : null,
    }));
  },

  retryTask: (taskId: string) => {
    set((state) => ({
      queue: state.queue ? retryProductionRunTask(state.queue, taskId) : null,
    }));
  },

  skipTask: (taskId: string, reason?: string) => {
    set((state) => ({
      queue: state.queue ? skipProductionRunTask(state.queue, taskId, reason) : null,
    }));
  },

  clear: () => set({ ...initialState }),

  dismissMessage: () => set({ lastMessage: null }),
}));
