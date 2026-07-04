// ============================================================================
// videoCompositionBrowser.ts — 浏览器端视频合成引擎
// 基于 @ffmpeg/ffmpeg.wasm (MIT)，在浏览器中直接合成多段视频+音频+字幕
// ============================================================================
"use client"

import { FFmpeg } from "@ffmpeg/ffmpeg"
import { fetchFile, toBlobURL } from "@ffmpeg/util"
import { buildFinalCompositionArgs } from "./videoCompositionPlan"

// ── 单例 ────────────────────────────────────────────────────────────────────
const BASE_URL = "https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm"

let ffmpeg: FFmpeg | null = null
let loadPromise: Promise<void> | null = null
let loaded = false

/**
 * 获取 FFmpeg 单例（懒加载，仅首次调用的 30MB 下载）
 */
export async function getFFmpeg(): Promise<FFmpeg> {
  if (loaded && ffmpeg) return ffmpeg

  if (!loadPromise) {
    loadPromise = (async () => {
      try {
        ffmpeg = new FFmpeg()
        await ffmpeg.load({
          coreURL: await toBlobURL(`${BASE_URL}/ffmpeg-core.js`, "text/javascript"),
          wasmURL: await toBlobURL(`${BASE_URL}/ffmpeg-core.wasm`, "application/wasm"),
        })
        loaded = true

        // 监听进度
        ffmpeg.on("progress", ({ progress, time }) => {
          // 可由外部回调消费
          onProgressCallbacks.forEach((cb) => cb({ percent: Math.round(progress * 100), time }))
        })
      } catch (err) {
        loadPromise = null // 失败可重试
        throw err
      }
    })()
  }

  return loadPromise.then(() => ffmpeg!)
}

// ── 进度回调 ────────────────────────────────────────────────────────────────
type ProgressCallback = (p: { percent: number; time: number }) => void
const onProgressCallbacks: ProgressCallback[] = []

export function onCompositionProgress(cb: ProgressCallback) {
  onProgressCallbacks.push(cb)
  return () => {
    const idx = onProgressCallbacks.indexOf(cb)
    if (idx >= 0) onProgressCallbacks.splice(idx, 1)
  }
}

// ── 输入数据 ────────────────────────────────────────────────────────────────

export interface VideoClipInput {
  /** Blob 或 File 或 URL string */
  data: Blob | File | string
  /** 可选：该片段的帧率，默认 24 */
  fps?: number
}

export interface AudioTrackInput {
  data: Blob | File | string
  /** 音量：0~1，默认 1 */
  volume?: number
  /** 延迟（秒），默认 0 */
  delay?: number
}

export interface SubtitleInput {
  /** SRT 格式字幕文本 */
  srtContent: string
  /** 字幕样式 */
  style?: {
    fontSize?: number
    fontColor?: string
    alignment?: "top" | "middle" | "bottom"
  }
}

export interface CompositionInput {
  /** 视频片段（按顺序拼接） */
  clips: VideoClipInput[]
  /** 背景音乐 */
  bgm?: AudioTrackInput
  /** 旁白/配音 */
  narration?: AudioTrackInput
  /** 字幕 */
  subtitle?: SubtitleInput
  /** 输出文件名（不含扩展名） */
  outputName?: string
  /** 输出宽度，默认 1080 */
  width?: number
  /** 输出高度，默认 1920 */
  height?: number
  /** 输出帧率，默认 24 */
  fps?: number
}

export interface CompositionResult {
  /** 合成后的视频 Blob */
  blob: Blob
  /** 下载 URL（用于 <video src=... 或 a.download） */
  url: string
  /** 文件名 */
  filename: string
  /** 时长（秒） */
  durationSeconds: number
}

// ── 核心合成 ────────────────────────────────────────────────────────────────

/**
 * 合成多段视频 + 音频 + 字幕为一个 MP4
 *
 * 流程：
 * 1. 将所有片段写入 FFmpeg 虚拟文件系统
 * 2. 用 concat demuxer 拼接视频
 * 3. 叠加音频（如有）
 * 4. 叠加字幕（如有）
 * 5. 输出 MP4
 */
export async function composeVideo(input: CompositionInput): Promise<CompositionResult> {
  const ff = await getFFmpeg()

  const w = input.width ?? 1080
  const h = input.height ?? 1920
  const fps = input.fps ?? 24
  const outputName = input.outputName ?? "starcanvas-composition"
  const outputFile = `${outputName}.mp4`

  // ---- 1. 写入所有视频片段 ----
  const clipFiles: string[] = []
  for (let i = 0; i < input.clips.length; i++) {
    const name = `clip_${i}.mp4`
    const data = await resolveFile(input.clips[i].data)
    await ff.writeFile(name, await fetchFile(data))
    clipFiles.push(name)
  }

  // ---- 2. 创建 concat demuxer 列表 ----
  const concatList = clipFiles.map((f) => `file '${f}'`).join("\n")
  await ff.writeFile("concat_list.txt", new TextEncoder().encode(concatList))

  // ---- 3. 拼接视频 ----
  const concatOutput = "concat_temp.mp4"
  await ff.exec([
    "-f", "concat",
    "-safe", "0",
    "-i", "concat_list.txt",
    "-c", "copy",
    concatOutput,
  ])

  const inputFiles = [concatOutput]

  // ---- 4. 准备音频输入 ----
  const audioInputs: Array<{ filename: string; volume?: number; delay?: number }> = []

  if (input.narration) {
    const name = "narration_audio"
    const data = await resolveFile(input.narration.data)
    await ff.writeFile(`${name}.wav`, await fetchFile(data))
    audioInputs.push({
      filename: `${name}.wav`,
      volume: input.narration.volume ?? 1,
      delay: input.narration.delay ?? 0,
    })
  }

  if (input.bgm) {
    const name = "bgm_audio"
    const data = await resolveFile(input.bgm.data)
    await ff.writeFile(`${name}.wav`, await fetchFile(data))
    audioInputs.push({
      filename: `${name}.wav`,
      volume: input.bgm.volume ?? 0.3,
      delay: input.bgm.delay ?? 0,
    })
  }

  // ---- 5. 写入字幕（SRT） ----
  const srtName = "subtitles.srt"
  if (input.subtitle) {
    await ff.writeFile(srtName, new TextEncoder().encode(input.subtitle.srtContent))
  }

  // ---- 6. 最终输出 ----
  const allArgs = buildFinalCompositionArgs({
    concatOutput,
    outputFile,
    audioInputs,
    subtitle: input.subtitle ? { filename: srtName, style: input.subtitle.style } : undefined,
    width: w,
    height: h,
    fps,
  })

  await ff.exec(allArgs)

  // ---- 7. 读取结果 ----
  const data = await ff.readFile(outputFile)
  const blob = new Blob([data as BlobPart], { type: "video/mp4" })
  const url = URL.createObjectURL(blob)

  // 清理临时文件
  for (const f of [...clipFiles, "concat_list.txt", concatOutput, ...audioInputs.map((audio) => audio.filename)]) {
    try { await ff.deleteFile(f) } catch {}
  }
  if (input.subtitle) {
    try { await ff.deleteFile(srtName) } catch {}
  }
  try { await ff.deleteFile(outputFile) } catch {}

  return {
    blob,
    url,
    filename: outputFile,
    durationSeconds: 0, // 后期可从 metadata 提取
  }
}

// ── 片段拼接（快速版，无音频/字幕处理）────────────────────────────────────

export async function concatClips(clips: VideoClipInput[]): Promise<CompositionResult> {
  return composeVideo({ clips })
}

// ── 下载结果 ────────────────────────────────────────────────────────────────

export function downloadVideo(result: CompositionResult) {
  const a = document.createElement("a")
  a.href = result.url
  a.download = result.filename
  a.click()
}

// ── 辅助 ────────────────────────────────────────────────────────────────────

async function resolveFile(data: Blob | File | string): Promise<Blob | File> {
  if (typeof data === "string") {
    const resp = await fetch(data)
    return resp.blob()
  }
  return data
}
