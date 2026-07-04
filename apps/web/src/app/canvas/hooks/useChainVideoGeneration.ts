/**
 * useChainVideoGeneration — 链式视频生成 hook
 *
 * 对标 AI Video Storyboard Platform (MIT) 的链式生成机制：
 *   每个镜头的尾帧自动成为下一个镜头的首帧，确保多镜头视觉连续性。
 *
 * 输入：shot 节点列表（按时间线顺序）
 * 输出：每个 shot 的视频 URL + 链式进度回调
 */
"use client"

import { useCallback, useRef, useState } from "react"
import type { Node } from "@xyflow/react"
import type { CanvasNodeData } from "../components/canvas/types"
import { getRuntimeProviderState } from "@/lib/ai/client"

// ── 类型 ──────────────────────────────────────────────

export interface ChainShot {
  nodeId: string
  index: number
  title: string
  imageUrl?: string
  prompt?: string
}

export type ChainProgressCallback = (progress: {
  currentShot: number
  totalShots: number
  status: "idle" | "generating" | "done" | "error"
  shotNodeId: string
  shotTitle: string
  videoUrl?: string
  error?: string
  percent: number
}) => void

// ── Hook ──────────────────────────────────────────────

export function useChainVideoGeneration() {
  const [isChainGenerating, setIsChainGenerating] = useState(false)
  const [chainProgress, setChainProgress] = useState<Map<string, {
    status: string; percent: number; videoUrl?: string; error?: string
  }>>(new Map())

  const abortRef = useRef<AbortController | null>(null)

  const generateChain = useCallback(async (
    shots: ChainShot[],
    onProgress?: ChainProgressCallback,
  ): Promise<Map<string, string>> => {
    setIsChainGenerating(true)
    const controller = new AbortController()
    abortRef.current = controller
    const results = new Map<string, string>()
    let previousFrameUrl: string | undefined

    for (let i = 0; i < shots.length; i += 1) {
      if (controller.signal.aborted) break

      const shot = shots[i]
      const total = shots.length

      setChainProgress((prev) => {
        const next = new Map(prev)
        next.set(shot.nodeId, { status: "generating", percent: 0 })
        return next
      })

      onProgress?.({
        currentShot: i + 1,
        totalShots: total,
        status: "generating",
        shotNodeId: shot.nodeId,
        shotTitle: shot.title || `镜头 ${i + 1}`,
        percent: 0,
      })

      try {
        const runtimeProvider = await getRuntimeProviderState()
        const prompt = shot.prompt || `cinematic shot, ${shot.title || ""}`
        const requestBody: Record<string, unknown> = {
          prompt,
          imageUrl: previousFrameUrl || shot.imageUrl,
          duration: 5,
          ...(runtimeProvider.overrides ? {
            overrides: {
              baseUrl: runtimeProvider.overrides.baseUrl,
              videoModel: runtimeProvider.overrides.videoModel,
              timeoutMs: runtimeProvider.overrides.timeoutMs,
            },
          } : {}),
        }

        // 调用视频生成 API
        const res = await fetch("/api/ai/generate-video", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        })

        if (!res.ok) throw new Error(`Video API error: ${res.status}`)

        // SSE 流式读取进度
        const reader = res.body?.getReader()
        if (!reader) throw new Error("No response body")

        const decoder = new TextDecoder()
        let buffer = ""
        let videoUrl = ""

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split("\n")
          buffer = lines.pop() || ""

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue
            try {
              const event = JSON.parse(line.slice(6))

              if (event.type === "progress") {
                const pct = event.percent || 0
                setChainProgress((prev) => {
                  const next = new Map(prev)
                  next.set(shot.nodeId, { status: "generating", percent: pct })
                  return next
                })
                onProgress?.({
                  currentShot: i + 1,
                  totalShots: total,
                  status: "generating",
                  shotNodeId: shot.nodeId,
                  shotTitle: shot.title || `镜头 ${i + 1}`,
                  percent: pct,
                })
              } else if (event.type === "result" && event.videoUrl) {
                videoUrl = event.videoUrl
              }
            } catch {
              // skip non-JSON
            }
          }
        }

        if (!videoUrl) throw new Error("Video generation produced no URL")

        results.set(shot.nodeId, videoUrl)
        previousFrameUrl = videoUrl // 下一个镜头的首帧 = 当前镜头的尾帧

        setChainProgress((prev) => {
          const next = new Map(prev)
          next.set(shot.nodeId, { status: "done", percent: 100, videoUrl })
          return next
        })

        onProgress?.({
          currentShot: i + 1,
          totalShots: total,
          status: "done",
          shotNodeId: shot.nodeId,
          shotTitle: shot.title || `镜头 ${i + 1}`,
          videoUrl,
          percent: 100,
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : "Generation failed"
        setChainProgress((prev) => {
          const next = new Map(prev)
          next.set(shot.nodeId, { status: "error", percent: 0, error: message })
          return next
        })
        onProgress?.({
          currentShot: i + 1,
          totalShots: total,
          status: "error",
          shotNodeId: shot.nodeId,
          shotTitle: shot.title || `镜头 ${i + 1}`,
          error: message,
          percent: 0,
        })
      }
    }

    setIsChainGenerating(false)
    return results
  }, [])

  const cancelChain = useCallback(() => {
    abortRef.current?.abort()
    setIsChainGenerating(false)
  }, [])

  return {
    isChainGenerating,
    chainProgress,
    generateChain,
    cancelChain,
  }
}
