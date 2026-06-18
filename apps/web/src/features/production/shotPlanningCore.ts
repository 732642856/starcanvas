import type {
  ShotPlanningBoard,
  ShotPlanningItem,
  ShotPlanningStatus,
  ShotPlanningSummary,
  CreateShotPlanningBoardInput,
} from "./shotPlanningTypes.ts";

/**
 * 从分镜画布节点创建制片规划板
 * 缺失 title 时 fallback 为 "Shot 1" / "Shot 2"
 */
export function createShotPlanningBoardFromStoryboard(
  input: CreateShotPlanningBoardInput,
): ShotPlanningBoard {
  const nowIso = (input.now ?? new Date()).toISOString();

  const items: ShotPlanningItem[] = input.nodes.map((node, index) => ({
    id: `plan-item-${node.id}`,
    shotId: node.id,
    sourceNodeId: node.id,
    title: node.title?.trim() || `Shot ${index + 1}`,
    description: node.description,
    shotPresetId: node.shotPresetId,
    stylePresetId: node.stylePresetId,
    durationSec: node.durationSec,
    status: "todo" as ShotPlanningStatus,
    notes: "",
    order: index,
    createdAt: nowIso,
    updatedAt: nowIso,
  }));

  return {
    id: `plan-board-${input.projectId}`,
    projectId: input.projectId,
    title: input.projectTitle
      ? `${input.projectTitle} · Shot Plan`
      : "Shot Plan",
    items,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

/**
 * 更新单个 item 的状态（不可变）
 */
export function updateShotPlanningItemStatus(
  board: ShotPlanningBoard,
  itemId: string,
  status: ShotPlanningStatus,
  now = new Date(),
): ShotPlanningBoard {
  const nowIso = now.toISOString();

  return {
    ...board,
    updatedAt: nowIso,
    items: board.items.map((item) =>
      item.id === itemId ? { ...item, status, updatedAt: nowIso } : item,
    ),
  };
}

/**
 * 更新单个 item 的备注（不可变）
 */
export function updateShotPlanningItemNotes(
  board: ShotPlanningBoard,
  itemId: string,
  notes: string,
  now = new Date(),
): ShotPlanningBoard {
  const nowIso = now.toISOString();

  return {
    ...board,
    updatedAt: nowIso,
    items: board.items.map((item) =>
      item.id === itemId ? { ...item, notes, updatedAt: nowIso } : item,
    ),
  };
}

/**
 * 获取制片规划汇总统计
 */
export function getShotPlanningSummary(
  board: ShotPlanningBoard,
): ShotPlanningSummary {
  const total = board.items.length;
  const done = board.items.filter((i) => i.status === "done").length;
  const blocked = board.items.filter((i) => i.status === "blocked").length;
  const todo = board.items.filter((i) => i.status === "todo").length;
  const ready = board.items.filter((i) => i.status === "ready").length;
  const shooting = board.items.filter(
    (i) => i.status === "shooting",
  ).length;
  const totalDurationSec = board.items.reduce(
    (sum, item) => sum + (item.durationSec ?? 0),
    0,
  );

  return {
    total,
    todo,
    ready,
    shooting,
    done,
    blocked,
    totalDurationSec,
    progress: total === 0 ? 0 : Math.round((done / total) * 100),
  };
}
