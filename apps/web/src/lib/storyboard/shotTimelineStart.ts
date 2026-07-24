import type { ShotProductionBrief } from "./shotProductionBrief.ts";
import { buildSubtitleTimeline } from "./storyboardSubtitleTimeline.ts";

export type ResolveShotTimelineStartInput = {
  explicitTimelineStart?: unknown;
  persistedSubtitleStart?: unknown;
  briefs?: ShotProductionBrief[];
  shotId?: string;
};

function validTimelineStart(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export function resolveShotTimelineStart({
  explicitTimelineStart,
  persistedSubtitleStart,
  briefs = [],
  shotId,
}: ResolveShotTimelineStartInput): number {
  if (validTimelineStart(explicitTimelineStart)) return explicitTimelineStart;
  if (validTimelineStart(persistedSubtitleStart)) return persistedSubtitleStart;

  const briefIndex = briefs.findIndex((brief) => brief.shotId === shotId);
  if (briefIndex < 0) return 0;

  const computedTimelineStart =
    buildSubtitleTimeline(briefs).shots[briefIndex]?.startTimeSeconds;
  return validTimelineStart(computedTimelineStart) ? computedTimelineStart : 0;
}
