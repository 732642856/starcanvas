/**
 * Shot Planning → Production Run Queue Adapter
 *
 * Maps ShotPlanningBoard items with status "ready" into ProductionRunQueue tasks.
 * This is a pure function — no side effects, no store calls.
 */

import type { Node } from "@xyflow/react";

import type { CanvasNodeData } from "../../app/canvas/components/canvas/types.ts";
import { buildProjectPackageManifest } from "../../lib/storyboard/projectPackageManifest.ts";
import type {
  ProductionRunQueue,
  ProductionRunQueueAction,
  ProductionRunQueueBlockedAction,
  ProductionRunQueueTask,
} from "../../lib/storyboard/productionRunQueue.ts";
import { buildProductionRunQueue } from "../../lib/storyboard/productionRunQueue.ts";
import { buildShotProductionBrief } from "../../lib/storyboard/shotProductionBrief.ts";

import type { ShotPlanningBoard } from "./shotPlanningTypes.ts";

// ============================================================================
// Types
// ============================================================================

export type ShotPlanningSourceNode = Pick<Node<CanvasNodeData>, "id" | "data">;

export interface CreateRunQueueFromReadyShotsInput {
  board: ShotPlanningBoard;
  projectId: string;
  sourceNodes?: ShotPlanningSourceNode[];
}

// ============================================================================
// Helpers
// ============================================================================

const DEFAULT_ACTION: ProductionRunQueueAction = "generate-storyboard-image";
const ACTION_ORDER: Record<ProductionRunQueueAction, number> = {
  "generate-storyboard-image": 0,
  "generate-video-clip": 1,
  "generate-voice-track": 2,
  "create-subtitle-track": 3,
  "review-handoff-warnings": 4,
};

function buildTaskId(shotId: string, action: ProductionRunQueueAction): string {
  return `${shotId}:${action}`;
}

function getReadyItems(board: ShotPlanningBoard) {
  return board.items
    .filter((item) => item.status === "ready")
    .sort((a, b) => a.order - b.order);
}

function createLegacyTask(item: ReturnType<typeof getReadyItems>[number]): ProductionRunQueueTask {
  return {
    id: buildTaskId(item.shotId, DEFAULT_ACTION),
    shotId: item.shotId,
    order: item.order,
    title: item.title,
    action: DEFAULT_ACTION,
    status: "queued",
    progress: 0,
  };
}

function getShotData(node?: ShotPlanningSourceNode) {
  return node && typeof node.data === "object" ? (node.data as CanvasNodeData).shot : undefined;
}

function compareTasks(a: ProductionRunQueueTask, b: ProductionRunQueueTask): number {
  if (a.order !== b.order) return a.order - b.order;
  if (a.shotId !== b.shotId) return a.shotId.localeCompare(b.shotId);
  if (ACTION_ORDER[a.action] !== ACTION_ORDER[b.action]) {
    return ACTION_ORDER[a.action] - ACTION_ORDER[b.action];
  }
  return a.id.localeCompare(b.id);
}

function collectManifestEntries(
  input: CreateRunQueueFromReadyShotsInput,
  readyItems: ReturnType<typeof getReadyItems>,
): Array<{
  brief: ReturnType<typeof buildShotProductionBrief>;
  item: ReturnType<typeof getReadyItems>[number];
}> {
  if (!input.sourceNodes?.length) return [];

  const sourceNodeById = new Map(input.sourceNodes.map((node) => [node.id, node]));
  return readyItems
    .map((item) => {
      const sourceNode = sourceNodeById.get(item.shotId) ?? sourceNodeById.get(item.sourceNodeId);
      const shot = getShotData(sourceNode);
      if (!shot) return null;

      const brief = buildShotProductionBrief({
        ...shot,
        order:
          typeof shot.order === "number" && Number.isFinite(shot.order)
            ? shot.order
            : item.order + 1,
        title: shot.title || item.title,
      });

      return {
        brief,
        item,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
}

function createManifestQueueFromEntries(
  boardId: string,
  matched: ReturnType<typeof collectManifestEntries>,
): ProductionRunQueue | null {
  if (matched.length === 0) return null;

  return buildProductionRunQueue(
    buildProjectPackageManifest({
      shots: matched.map(({ brief, item }) => ({
        id: brief.shotId,
        order: brief.order,
        title: brief.title || item.title,
        intent: brief.voice.voiceIntent,
        visualReference: brief.handoff.source?.referenceImageUrl ?? null,
        status: "ready",
      })),
      productionBriefs: matched.map(({ brief }) => brief),
    }),
    {
      jobId: `shot-planning:${boardId}`,
    },
  );
}

function buildRunQueueDraft(input: CreateRunQueueFromReadyShotsInput): {
  readyItems: ReturnType<typeof getReadyItems>;
  tasks: ProductionRunQueueTask[];
  blockedActions: ProductionRunQueueBlockedAction[];
  productionPreflight?: ProductionRunQueue["productionPreflight"];
  videoProviderDryRun?: ProductionRunQueue["videoProviderDryRun"];
} {
  const readyItems = getReadyItems(input.board);
  if (readyItems.length === 0) {
    return {
      readyItems,
      tasks: [],
      blockedActions: [],
    };
  }

  const manifestEntries = collectManifestEntries(input, readyItems) ?? [];
  const manifestQueue = createManifestQueueFromEntries(input.board.id, manifestEntries);
  const manifestShotIds = new Set(manifestEntries.map(({ item }) => item.shotId));
  const legacyTasks = readyItems
    .filter((item) => !manifestShotIds.has(item.shotId))
    .map(createLegacyTask);

  return {
    readyItems,
    tasks: [...(manifestQueue?.tasks ?? []), ...legacyTasks].sort(compareTasks),
    blockedActions: manifestQueue?.blockedActions ?? [],
    productionPreflight: manifestQueue?.productionPreflight,
    videoProviderDryRun: manifestQueue?.videoProviderDryRun,
  };
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
  return buildRunQueueDraft(input).tasks;
}

/**
 * Build a complete ProductionRunQueue from ready shots in a ShotPlanningBoard.
 * Returns null if no ready shots exist.
 */
export function createProductionRunQueueFromReadyShots(
  input: CreateRunQueueFromReadyShotsInput,
): ProductionRunQueue | null {
  const draft = buildRunQueueDraft(input);
  if (draft.readyItems.length === 0) return null;

  return {
    jobId: `shot-planning:${input.board.id}`,
    status: draft.tasks.length > 0 ? "queued" : "completed",
    totalTasks: draft.tasks.length,
    completedTasks: 0,
    failedTasks: 0,
    skippedTasks: 0,
    progress: draft.tasks.length > 0 ? 0 : 1,
    tasks: draft.tasks,
    blockedActions: draft.blockedActions,
    productionPreflight: draft.productionPreflight,
    videoProviderDryRun: draft.videoProviderDryRun,
  };
}
