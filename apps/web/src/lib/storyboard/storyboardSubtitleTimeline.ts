/**
 * Storyboard Subtitle Timeline — cumulative multi-shot subtitle calculation.
 *
 * Takes all shot production briefs with their durations and dialogue,
 * computes cumulative timecode offsets, and generates unified SRT/VTT
 * subtitle files for the entire storyboard sequence.
 *
 * Also adds subtitleTimeline data to StoryboardShotData for per-shot
 * subtitle display during VideoNode playback.
 */

import type { ShotProductionBrief } from "./shotProductionBrief";
import type { StoryboardShotData } from "@/app/canvas/components/canvas/types";
import {
  formatDialogueAsSrt,
  parseDurationToSeconds,
  formatSrtTimecode,
  convertSrtToVtt,
  type SubtitleSegment,
} from "./subtitleFormatter.ts";

// ============================================================================
// Types
// ============================================================================

/** Time-offset subtitle segment (cumulative across all shots). */
export type TimelineSubtitleSegment = SubtitleSegment & {
  /** Which shot this segment belongs to */
  shotId: string;
  /** Segment index within shot (0-based) */
  localIndex: number;
};

/** Per-shot timeline data for VideoNode subtitle overlay. */
export type ShotSubtitleTimeline = {
  /** Shot-level start time in cumulative seconds */
  startTimeSeconds: number;
  /** Shot duration in seconds */
  durationSeconds: number;
  /** Subtitle segments within this shot (offsets relative to shot start) */
  segments: SubtitleSegment[];
};

/** Full multi-shot timeline result. */
export type StoryboardSubtitleTimeline = {
  /** Total sequence duration in seconds */
  totalDurationSeconds: number;
  /** Cumulative timeline data per shot */
  shots: ShotSubtitleTimeline[];
  /** All segments with cumulative timecodes (for SRT/VTT export) */
  segments: TimelineSubtitleSegment[];
  /** Generated SRT content */
  srt: string;
  /** Generated VTT content */
  vtt: string;
};

// ============================================================================
// Core calculation
// ============================================================================

const FALLBACK_DURATION_SECONDS = 5;
const MIN_SHOT_DURATION = 0.5;

/**
 * Parse a brief's duration field into seconds, with fallback.
 */
function briefDurationSeconds(brief: ShotProductionBrief): number {
  const dur = parseDurationToSeconds(brief.visual.duration);
  if (dur !== undefined && dur > 0) return dur;
  return FALLBACK_DURATION_SECONDS;
}

/**
 * Build a cumulative multi-shot subtitle timeline from a sequence of briefs.
 *
 * For each shot:
 * 1. Parse duration
 * 2. Segment dialogue via formatDialogueAsSrt
 * 3. Offset segment timecodes by cumulative time
 */
export function buildSubtitleTimeline(
  briefs: ShotProductionBrief[],
): StoryboardSubtitleTimeline {
  const shots: ShotSubtitleTimeline[] = [];
  const segments: TimelineSubtitleSegment[] = [];
  let cumulativeTime = 0;

  for (const brief of briefs) {
    const durationSeconds = Math.max(
      briefDurationSeconds(brief),
      MIN_SHOT_DURATION,
    );

    const shotTimeline: ShotSubtitleTimeline = {
      startTimeSeconds: cumulativeTime,
      durationSeconds,
      segments: [],
    };

    // Segment dialogue using subtitleFormatter
    const dialogue = brief.voice.dialogue ?? brief.subtitle.text ?? "";
    if (dialogue.trim()) {
      const formatted = formatDialogueAsSrt(dialogue, {
        durationSeconds,
      });

      for (const seg of formatted.segments) {
        const timelineSeg: TimelineSubtitleSegment = {
          ...seg,
          // Offset by cumulative time
          startSeconds: cumulativeTime + seg.startSeconds,
          endSeconds: cumulativeTime + seg.endSeconds,
          shotId: brief.shotId,
          localIndex: seg.index - 1,
        };
        segments.push(timelineSeg);
        shotTimeline.segments.push({
          index: seg.index,
          startSeconds: seg.startSeconds,
          endSeconds: seg.endSeconds,
          text: seg.text,
        });
      }
    }

    shots.push(shotTimeline);
    cumulativeTime += durationSeconds;
  }

  // Generate unified SRT
  const srt = segments
    .map(
      (seg, idx) =>
        `${idx + 1}\n${formatSrtTimecode(seg.startSeconds)} --> ${formatSrtTimecode(seg.endSeconds)}\n${seg.text}\n`,
    )
    .join("\n");

  return {
    totalDurationSeconds: cumulativeTime,
    shots,
    segments,
    srt,
    vtt: convertSrtToVtt(
      segments
        .map(
          (seg, idx) =>
            `${idx + 1}\n${formatSrtTimecode(seg.startSeconds)} --> ${formatSrtTimecode(seg.endSeconds)}\n${seg.text}\n`,
        )
        .join("\n"),
    ),
  };
}

/**
 * Build subtitle timeline data and merge it back into StoryboardShotData
 * for downstream consumption (e.g., VideoNode subtitle overlay).
 */
export function enrichShotsWithSubtitleTimeline(
  shots: StoryboardShotData[],
  briefs: ShotProductionBrief[],
): StoryboardShotData[] {
  const timeline = buildSubtitleTimeline(briefs);

  return shots.map((shot) => {
    // Find the matching timeline entry using brief matching
    const briefIdx = briefs.findIndex((b) => b.shotId === shot.id);
    const shotTimeline =
      briefIdx >= 0 ? timeline.shots[briefIdx] : undefined;

    if (!shotTimeline || shotTimeline.segments.length === 0) return shot;

    return {
      ...shot,
      subtitleTimeline: shotTimeline,
    } as StoryboardShotData & { subtitleTimeline: ShotSubtitleTimeline };
  });
}

// ============================================================================
// Filename helpers
// ============================================================================

export function subtitleTimelineFilename(
  projectName: string,
  format: "srt" | "vtt",
): string {
  const safe = projectName
    .replace(/[\/\\:*?"<>|]/g, "-")
    .replace(/\s+/g, "_")
    .slice(0, 80);
  return `${safe}_字幕.${format}`;
}

// ============================================================================
// Multi-format export
// ============================================================================

export type SubtitleExportBundle = {
  srt: string;
  vtt: string;
  segments: TimelineSubtitleSegment[];
  totalDurationSeconds: number;
};

export function buildSubtitleExport(
  briefs: ShotProductionBrief[],
): SubtitleExportBundle {
  const timeline = buildSubtitleTimeline(briefs);
  return {
    srt: timeline.srt,
    vtt: timeline.vtt,
    segments: timeline.segments,
    totalDurationSeconds: timeline.totalDurationSeconds,
  };
}
