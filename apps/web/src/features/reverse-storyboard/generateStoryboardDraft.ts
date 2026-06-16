/**
 * generateStoryboardDraft — Pure function: map extracted frames to storyboard shots.
 *
 * Rule-based MVP generation:
 *   - Each frame becomes one shot
 *   - Shot duration = next frame's time - current frame's time
 *   - Last shot gets a default duration
 *   - Camera defaults to "medium shot / static"
 *   - Description and visualPrompt use the frame timestamp
 */
import type {
  ExtractedVideoFrame,
  ReverseStoryboardShot,
  StoryboardDraftOptions,
} from "./types"

const DEFAULT_LAST_DURATION = 3

function generateId(): string {
  return `rs_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

/**
 * Generate an array of reverse storyboard shots from extracted video frames.
 */
export function generateStoryboardDraft(
  frames: ExtractedVideoFrame[],
  options: StoryboardDraftOptions = {},
): ReverseStoryboardShot[] {
  if (frames.length === 0) return []

  const lastDuration = options.defaultLastShotDurationSec ?? DEFAULT_LAST_DURATION

  return frames.map((frame, i) => {
    const nextFrame = frames[i + 1]
    const durationSec =
      nextFrame != null
        ? Math.round((nextFrame.timeSec - frame.timeSec) * 10) / 10
        : lastDuration

    const shotNumber = i + 1
    const totalShots = frames.length

    return {
      id: generateId(),
      sourceFrameId: frame.id,
      timeSec: frame.timeSec,
      title: `分镜 ${shotNumber}/${totalShots}`,
      description: `基于参考视频 ${formatTime(frame.timeSec)} 处画面生成的分镜`,
      camera: "medium shot / static camera",
      durationSec,
      visualPrompt: `keyframe at t=${frame.timeSec}s from reference video`,
      thumbnail: frame.dataUrl,
    }
  })
}

function formatTime(totalSec: number): string {
  const mins = Math.floor(totalSec / 60)
  const secs = (totalSec % 60).toFixed(1)
  return mins > 0 ? `${mins}分${secs}秒` : `${secs}秒`
}
