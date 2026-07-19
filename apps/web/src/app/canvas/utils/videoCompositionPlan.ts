export type PlannedAudioInput = {
  filename: string
  volume?: number
  delay?: number
}

export type PlannedSubtitleInput = {
  filename: string
  style?: {
    fontSize?: number
    fontColor?: string
    alignment?: "top" | "middle" | "bottom"
  }
}

export type FinalCompositionArgsInput = {
  concatOutput: string
  outputFile: string
  audioInputs?: readonly PlannedAudioInput[]
  subtitle?: PlannedSubtitleInput
  width?: number
  height?: number
  fps?: number
}

export type MultiClipConcatArgsInput = {
  clipFiles: readonly string[]
  outputFile: string
  width?: number
  height?: number
  fps?: number
}

function positiveInt(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && value! > 0 ? Math.round(value!) : fallback
}

function nonNegativeNumber(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && value! >= 0 ? value! : fallback
}

export function buildMultiClipConcatArgs(input: MultiClipConcatArgsInput): string[] {
  if (input.clipFiles.length < 2) throw new Error("至少需要两个视频片段才能拼接")
  const width = positiveInt(input.width, 1080)
  const height = positiveInt(input.height, 1920)
  const fps = positiveInt(input.fps, 24)
  const normalizedLabels = input.clipFiles.map((_, index) => `v${index}`)
  const filters = [
    ...normalizedLabels.map(
      (label, index) =>
        `[${index}:v]setpts=PTS-STARTPTS,scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${fps}[${label}]`,
    ),
    `${normalizedLabels.map((label) => `[${label}]`).join("")}concat=n=${input.clipFiles.length}:v=1:a=0[vout]`,
  ]

  return [
    ...input.clipFiles.flatMap((filename) => ["-i", filename]),
    "-filter_complex", filters.join(";"),
    "-map", "[vout]",
    "-c:v", "libx264",
    "-preset", "fast",
    "-crf", "23",
    "-pix_fmt", "yuv420p",
    "-an",
    "-y",
    input.outputFile,
  ]
}

function escapeSubtitlePath(filename: string): string {
  return filename
    .replace(/\\/g, "/")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]")
}

function toAssPrimaryColour(color: string | undefined): string {
  const normalized = color?.trim().toLowerCase()
  if (!normalized || normalized === "white") return "&H00FFFFFF"
  if (normalized === "black") return "&H00000000"
  if (normalized === "yellow") return "&H0000FFFF"

  const hex = normalized.match(/^#?([0-9a-f]{6})$/i)?.[1]
  if (!hex) return "&H00FFFFFF"

  const rr = hex.slice(0, 2)
  const gg = hex.slice(2, 4)
  const bb = hex.slice(4, 6)
  return `&H00${bb}${gg}${rr}`.toUpperCase()
}

function buildSubtitleStyle(style: PlannedSubtitleInput["style"]): string {
  const fontSize = positiveInt(style?.fontSize, 24)
  const alignment = style?.alignment === "top" ? 8 : style?.alignment === "middle" ? 4 : 2
  const primaryColour = toAssPrimaryColour(style?.fontColor)
  return [
    `FontSize=${fontSize}`,
    `PrimaryColour=${primaryColour}`,
    "OutlineColour=&H80000000",
    "BorderStyle=1",
    "Outline=2",
    `Alignment=${alignment}`,
    "MarginV=48",
  ].join(",")
}

export function buildFinalCompositionArgs(input: FinalCompositionArgsInput): string[] {
  const width = positiveInt(input.width, 1080)
  const height = positiveInt(input.height, 1920)
  const fps = positiveInt(input.fps, 24)
  const audioInputs = input.audioInputs ?? []

  const args = [
    "-i", input.concatOutput,
    ...audioInputs.flatMap((audio) => ["-i", audio.filename]),
  ]

  const filterParts: string[] = [
    `[0:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1[vbase]`,
  ]

  if (input.subtitle) {
    filterParts.push(
      `[vbase]subtitles=${escapeSubtitlePath(input.subtitle.filename)}:force_style='${buildSubtitleStyle(input.subtitle.style)}'[vout]`,
    )
  } else {
    filterParts.push("[vbase]null[vout]")
  }

  const audioLabels: string[] = []
  for (let index = 0; index < audioInputs.length; index++) {
    const audio = audioInputs[index]
    const inputIndex = index + 1
    const volume = nonNegativeNumber(audio.volume, 1)
    const delayMs = Math.round(nonNegativeNumber(audio.delay, 0) * 1000)
    const filters = [`volume=${volume}`]
    if (delayMs > 0) filters.push(`adelay=${delayMs}|${delayMs}`)
    filterParts.push(`[${inputIndex}:a]${filters.join(",")}[a${index}]`)
    audioLabels.push(`[a${index}]`)
  }

  if (audioLabels.length === 1) {
    filterParts.push(`${audioLabels[0]}anull[aout]`)
  } else if (audioLabels.length > 1) {
    filterParts.push(`${audioLabels.join("")}amix=inputs=${audioLabels.length}:duration=longest:dropout_transition=2[aout]`)
  }

  const finalArgs = [
    ...args,
    "-filter_complex", filterParts.join(";"),
    "-map", "[vout]",
    ...(audioLabels.length > 0 ? ["-map", "[aout]"] : ["-map", "0:a?"]),
    "-c:v", "libx264",
    "-preset", "fast",
    "-crf", "23",
    "-pix_fmt", "yuv420p",
    "-c:a", "aac",
    "-b:a", "192k",
    "-r", String(fps),
    "-movflags", "+faststart",
    "-shortest",
    "-y",
    input.outputFile,
  ]

  return finalArgs
}
