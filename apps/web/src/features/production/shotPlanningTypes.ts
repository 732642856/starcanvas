/**
 * Shot Planning Board — 人工制片规划层
 *
 * 与自动化执行引擎 (ProductionRunQueue) 分层：
 *   ShotPlanningBoard  = 人工规划（todo → ready → shooting → done → blocked）
 *   ProductionRunQueue  = 自动执行（queued → preparing → running → completed → failed）
 *
 * 只有人工标记为 ready 的 shot，才进入自动执行队列（后续通过 adapter 桥接）。
 *
 * Canonical shot identity:
 *   ShotPlanningItem.shotId is the canonical shot identity shared across
 *   planning (this layer), canvas shot nodes, and run queue / executor tasks.
 *   It is derived from the source canvas node id at board creation time.
 */

export type ShotPlanningStatus =
  | "todo"
  | "ready"
  | "shooting"
  | "done"
  | "blocked";

export interface ShotPlanningItem {
  /** Planning item id (local to the planning board) */
  id: string;
  /**
   * Canonical shot identity.
   * Shared across planning, canvas shot nodes, and run queue / executor tasks.
   * Set to sourceNodeId at creation time.
   */
  shotId: string;
  /** Reference to the source canvas node that generated this planning item */
  sourceNodeId: string;
  title: string;
  description?: string;
  shotPresetId?: string;
  stylePresetId?: string;
  durationSec?: number;
  status: ShotPlanningStatus;
  notes?: string;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface ShotPlanningBoard {
  id: string;
  projectId: string;
  title: string;
  items: ShotPlanningItem[];
  createdAt: string;
  updatedAt: string;
}

export interface ShotPlanningSummary {
  total: number;
  todo: number;
  ready: number;
  shooting: number;
  done: number;
  blocked: number;
  totalDurationSec: number;
  progress: number; // 0-100
}

export interface CreateShotPlanningBoardInput {
  projectId: string;
  projectTitle?: string;
  nodes: Array<{
    id: string;
    title?: string;
    description?: string;
    shotPresetId?: string;
    stylePresetId?: string;
    durationSec?: number;
  }>;
  now?: Date;
}
