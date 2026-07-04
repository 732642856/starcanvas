import type { Node } from "@xyflow/react";
import type { CanvasNodeData } from "../components/canvas/types";
import { parseDurationToSeconds } from "../../../lib/storyboard/subtitleFormatter.ts";

type ShotPatch = Partial<NonNullable<CanvasNodeData["shot"]>>;

export function applyShotParameterPatchToNode(
  node: Node<CanvasNodeData>,
  patch: ShotPatch,
): Node<CanvasNodeData> {
  if (!node.data?.shot) return node;

  const nextShot = { ...node.data.shot, ...patch };
  const nextData: CanvasNodeData = {
    ...node.data,
    shot: nextShot,
  };

  if (patch.title !== undefined) {
    nextData.title = patch.title;
  }

  if (patch.description !== undefined) {
    nextData.content = patch.description;
  }

  if (patch.duration !== undefined) {
    nextData.duration = patch.duration;
    const durationSeconds = parseDurationToSeconds(patch.duration);
    if (durationSeconds !== undefined) {
      nextData.timelineDurationSeconds = durationSeconds;
    }
  }

  return {
    ...node,
    data: nextData,
  };
}
