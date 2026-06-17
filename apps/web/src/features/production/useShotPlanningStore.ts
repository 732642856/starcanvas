/**
 * Shot Planning Store — Zustand + localStorage 持久化
 *
 * 按 projectId 隔离存储，支持：
 * - 从画布分镜节点生成规划板
 * - 更新镜头状态和备注
 * - 获取汇总统计
 */

import { create } from "zustand";
import {
  createShotPlanningBoardFromStoryboard,
  updateShotPlanningItemStatus,
  updateShotPlanningItemNotes,
  getShotPlanningSummary,
} from "./shotPlanningCore.ts";
import type {
  ShotPlanningBoard,
  ShotPlanningStatus,
  ShotPlanningSummary,
  CreateShotPlanningBoardInput,
} from "./shotPlanningTypes.ts";

// ============================================================================
// Storage helpers
// ============================================================================

const STORAGE_KEY_PREFIX = "starcanvas:shot-planning-board:";

function storageKey(projectId: string): string {
  return `${STORAGE_KEY_PREFIX}${projectId}`;
}

function loadBoard(projectId: string): ShotPlanningBoard | null {
  try {
    const raw = localStorage.getItem(storageKey(projectId));
    if (!raw) return null;
    return JSON.parse(raw) as ShotPlanningBoard;
  } catch {
    return null;
  }
}

function saveBoard(board: ShotPlanningBoard): void {
  try {
    localStorage.setItem(storageKey(board.projectId), JSON.stringify(board));
  } catch {
    // Storage full or unavailable — silently fail
  }
}

// ============================================================================
// Store state & actions
// ============================================================================

interface ShotPlanningStoreState {
  /** Current project's board (null if not loaded yet) */
  board: ShotPlanningBoard | null;
  /** Whether we've attempted loading */
  isLoaded: boolean;

  // Actions
  loadBoard: (projectId: string) => void;
  buildFromStoryboard: (input: CreateShotPlanningBoardInput) => void;
  updateStatus: (itemId: string, status: ShotPlanningStatus) => void;
  updateNotes: (itemId: string, notes: string) => void;
  getSummary: () => ShotPlanningSummary | null;
}

export const useShotPlanningStore = create<ShotPlanningStoreState>(
  (set, get) => ({
    board: null,
    isLoaded: false,

    loadBoard: (projectId: string) => {
      const board = loadBoard(projectId);
      set({ board, isLoaded: true });
    },

    buildFromStoryboard: (input: CreateShotPlanningBoardInput) => {
      const board = createShotPlanningBoardFromStoryboard(input);
      saveBoard(board);
      set({ board });
    },

    updateStatus: (itemId: string, status: ShotPlanningStatus) => {
      const { board } = get();
      if (!board) return;
      const updated = updateShotPlanningItemStatus(board, itemId, status);
      saveBoard(updated);
      set({ board: updated });
    },

    updateNotes: (itemId: string, notes: string) => {
      const { board } = get();
      if (!board) return;
      const updated = updateShotPlanningItemNotes(board, itemId, notes);
      saveBoard(updated);
      set({ board: updated });
    },

    getSummary: () => {
      const { board } = get();
      if (!board) return null;
      return getShotPlanningSummary(board);
    },
  }),
);
