/**
 * useVideoFrameExtractor — Browser-side video frame extraction hook.
 *
 * Uses <video> + <canvas> to capture key frames at computed timestamps.
 * Returns extracted frames as data URLs with progress tracking.
 */
"use client"

import { useCallback, useRef, useState } from "react"
import type { ExtractedVideoFrame, FrameExtractionOptions } from "./types"
import { computeFrameTimes } from "./computeFrameTimes.ts"

export type ExtractStatus =
  | "idle"
  | "loading-video"
  | "extracting"
  | "done"
  | "error"

export interface FrameExtractorState {
  status: ExtractStatus
  frames: ExtractedVideoFrame[]
  error: string | null
  progress: number // 0–1
  videoWidth: number
  videoHeight: number
  videoDuration: number // seconds
}

export function useVideoFrameExtractor() {
  const [state, setState] = useState<FrameExtractorState>({
    status: "idle",
    frames: [],
    error: null,
    progress: 0,
    videoWidth: 0,
    videoHeight: 0,
    videoDuration: 0,
  })

  const abortRef = useRef(false)

  const reset = useCallback(() => {
    abortRef.current = true
    setState({
      status: "idle",
      frames: [],
      error: null,
      progress: 0,
      videoWidth: 0,
      videoHeight: 0,
      videoDuration: 0,
    })
  }, [])

  /**
   * Load a video file and extract key frames.
   * Returns the extracted frames (also available via state.frames).
   */
  const extractFromFile = useCallback(
    async (
      file: File,
      options: FrameExtractionOptions = {},
    ): Promise<ExtractedVideoFrame[]> => {
      abortRef.current = false

      const count = options.count ?? 8
      const maxFrames = options.maxFrames ?? 12
      const format = options.format ?? "image/jpeg"
      const quality = options.quality ?? 0.85

      try {
        setState((prev) => ({ ...prev, status: "loading-video", error: null }))

        // Load video metadata
        const videoUrl = URL.createObjectURL(file)
        const videoMeta = await loadVideoMeta(videoUrl)

        if (abortRef.current) {
          URL.revokeObjectURL(videoUrl)
          return []
        }

        setState((prev) => ({
          ...prev,
          status: "extracting",
          videoWidth: videoMeta.width,
          videoHeight: videoMeta.height,
          videoDuration: videoMeta.duration,
          progress: 0,
        }))

        // Compute frame times
        const times = computeFrameTimes(videoMeta.duration, { count, maxFrames })
        const totalFrames = times.length

        // Extract each frame
        const frames: ExtractedVideoFrame[] = []

        for (let i = 0; i < totalFrames; i++) {
          if (abortRef.current) break

          const frame = await captureFrame({
            videoUrl,
            timeSec: times[i],
            frameIndex: i,
            totalFrames,
            format,
            quality,
            sourceWidth: videoMeta.width,
            sourceHeight: videoMeta.height,
          })

          frames.push(frame)

          setState((prev) => ({
            ...prev,
            progress: (i + 1) / totalFrames,
            frames: [...frames],
          }))
        }

        URL.revokeObjectURL(videoUrl)

        if (abortRef.current) {
          setState((prev) => ({ ...prev, status: "idle" }))
          return []
        }

        setState((prev) => ({ ...prev, status: "done", progress: 1 }))
        return frames
      } catch (err) {
        const message = err instanceof Error ? err.message : "视频帧提取失败"
        setState((prev) => ({ ...prev, status: "error", error: message }))
        return []
      }
    },
    [],
  )

  return { state, extractFromFile, reset }
}

// ── Internal Helpers ──────────────────────────────────

interface VideoMeta {
  width: number
  height: number
  duration: number
}

function loadVideoMeta(url: string): Promise<VideoMeta> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video")
    video.preload = "metadata"
    video.muted = true

    const cleanup = () => {
      video.removeEventListener("loadedmetadata", onLoad)
      video.removeEventListener("error", onError)
    }

    const onLoad = () => {
      cleanup()
      resolve({
        width: video.videoWidth || 1280,
        height: video.videoHeight || 720,
        duration: video.duration || 0,
      })
    }

    const onError = () => {
      cleanup()
      reject(new Error("无法加载视频文件，可能是格式不支持"))
    }

    video.addEventListener("loadedmetadata", onLoad)
    video.addEventListener("error", onError)

    video.src = url
    video.load()
  })
}

interface CaptureFrameOptions {
  videoUrl: string
  timeSec: number
  frameIndex: number
  totalFrames: number
  format: "image/jpeg" | "image/png"
  quality: number
  sourceWidth: number
  sourceHeight: number
}

function captureFrame(opts: CaptureFrameOptions): Promise<ExtractedVideoFrame> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video")
    const canvas = document.createElement("canvas")
    const ctx = canvas.getContext("2d")

    if (!ctx) {
      reject(new Error("Canvas 2D context not available"))
      return
    }

    canvas.width = opts.sourceWidth
    canvas.height = opts.sourceHeight

    const cleanup = () => {
      video.removeEventListener("seeked", onSeeked)
      video.removeEventListener("error", onError)
    }

    const onSeeked = () => {
      cleanup()
      ctx.drawImage(video, 0, 0, opts.sourceWidth, opts.sourceHeight)
      const dataUrl = canvas.toDataURL(opts.format, opts.quality)

      const id = `frame_${opts.frameIndex}_${Date.now()}`
      resolve({
        id,
        timeSec: opts.timeSec,
        dataUrl,
        width: opts.sourceWidth,
        height: opts.sourceHeight,
      })
    }

    const onError = () => {
      cleanup()
      reject(new Error(`帧 ${opts.frameIndex + 1}/${opts.totalFrames} 提取失败`))
    }

    video.addEventListener("seeked", onSeeked)
    video.addEventListener("error", onError)

    video.preload = "auto"
    video.muted = true
    video.src = opts.videoUrl

    // Set currentTime after src is set
    video.currentTime = Math.min(opts.timeSec, opts.totalFrames > 0 ? opts.timeSec : 0)
  })
}
