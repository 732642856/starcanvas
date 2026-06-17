/**
 * Shot Planning → Production Run Queue Bridge Store
 *
 * Holds the ProductionRunQueue created from ShotPlanningBoard ready shots.
 * Separate from the canvas-derived (node-computed) ProductionRunQueue in StarCanvas.
 */

"use client";

import { create } from "zustand";
import type { ProductionRunQueue } from "@/lib/storyboard/productionRunQueue";
import { createProductionRunQueueFromReadyShots } from "./shotPlanningRunQueueAdapter";
import type { ShotPlanningBoard } from "./shotPlanningTypes";

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
  buildFromBoard: (board: ShotPlanningBoard, projectId: string) => void;
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

  buildFromBoard: (board: ShotPlanningBoard, projectId: string) => {
    const queue = createProductionRunQueueFromReadyShots({ board, projectId });
    const readyCount = board.items.filter((item) => item.status === "ready").length;

    set({
      queue,
      projectId,
      lastMessage:
        queue !== null
          ? `Created ${readyCount} queue task${readyCount > 1 ? "s" : ""}`
          : "No ready shots to queue",
    });
  },

  clear: () => set({ ...initialState }),

  dismissMessage: () => set({ lastMessage: null }),
}));
