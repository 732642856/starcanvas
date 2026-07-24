"use client"

export type TtsBackend = "kokoro" | "voxcpm" | "mock"

export type VoiceQuickTag = {
  value: string
  label: string
}

export const VOICE_QUICK_TAGS: VoiceQuickTag[] = [
  { value: "年轻女声", label: "年轻女声" },
  { value: "沉稳男声", label: "沉稳男声" },
  { value: "活泼", label: "活泼" },
  { value: "低沉", label: "低沉" },
  { value: "温柔", label: "温柔" },
  { value: "稍快语速", label: "稍快语速" },
  { value: "缓慢", label: "缓慢" },
  { value: "有磁性", label: "有磁性" },
  { value: "沙哑", label: "沙哑" },
  { value: "带口音", label: "带口音" },
  { value: "老年声", label: "老年声" },
  { value: "童声", label: "童声" },
]

export class TtsGenerationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "TtsGenerationError"
  }
}

function toTtsGenerationError(error: unknown, fallback = "语音合成失败"): TtsGenerationError {
  if (error instanceof TtsGenerationError) return error
  if (error instanceof Error && error.message) {
    return new TtsGenerationError(error.message)
  }
  return new TtsGenerationError(fallback)
}

export function voiceDescriptionToInstruct(desc: string): string {
  return desc.trim()
}

export function inferVoiceDescriptionFromShot(shot?: any): { description: string; reason: string } {
  if (!shot) return { description: "", reason: "" }
  const mood = shot?.sceneAnalysis?.mood || ""
  if (mood.includes("悲伤") || mood.includes("感人")) {
    return { description: "温柔、缓慢、略带悲伤", reason: `根据场景氛围「${mood}」推荐` }
  }
  if (mood.includes("紧张") || mood.includes("激烈")) {
    return { description: "语速稍快、有力度", reason: `根据场景氛围「${mood}」推荐` }
  }
  return { description: "自然、清晰", reason: "默认推荐" }
}

export function lookupCharacterVoiceProfile(characterIdentities?: any[]): { profileId: string } | null {
  if (!characterIdentities || characterIdentities.length === 0) return null
  const first = characterIdentities[0]
  if (first?.voiceProfileId) {
    return { profileId: first.voiceProfileId }
  }
  return null
}

export async function registerVoiceClone(params: {
  audioFile: File
  characterId: string
  characterName: string
  refText?: string
  tags?: string[]
}): Promise<{ profileId: string }> {
  const baseUrl = process.env.NEXT_PUBLIC_VOICE_CLONE_BASE_URL || "http://localhost:8765"
  const form = new FormData()
  form.append("audio", params.audioFile)
  form.append("character_id", params.characterId)
  form.append("character_name", params.characterName)
  if (params.refText) form.append("ref_text", params.refText)
  if (params.tags?.length) form.append("tags", params.tags.join(","))

  let response: Response
  try {
    response = await fetch(`${baseUrl}/api/voice-clone/register`, {
      method: "POST",
      body: form,
    })
  } catch {
    throw new TtsGenerationError(
      "声线克隆服务未启动或无法访问。请先启动本地服务：uvicorn services.voice_clone.main:app --host 0.0.0.0 --port 8765，或配置 NEXT_PUBLIC_VOICE_CLONE_BASE_URL。",
    )
  }

  const data = await response.json().catch(() => null) as {
    profile_id?: string
    detail?: string
    message?: string
  } | null

  if (!response.ok || !data?.profile_id) {
    throw new TtsGenerationError(data?.detail || data?.message || "声线克隆注册失败")
  }

  return { profileId: data.profile_id }
}

export function invalidateProfileCache(): void {}

export async function generateTtsAudio(params: {
  text: string
  voiceConfig?: { instruct?: string; refAudioId?: string; refText?: string; speed?: number }
  backend?: TtsBackend
}): Promise<{ audioBlob: Blob }> {
  try {
    const runtime = await import("./ttsService")
    return await runtime.generateTtsAudio(params)
  } catch (error) {
    throw toTtsGenerationError(error)
  }
}

export async function persistTtsAudio(
  blob: Blob,
  options: { fileName: string },
): Promise<{ objectUrl: string; assetId: string }> {
  try {
    const runtime = await import("./ttsService")
    return await runtime.persistTtsAudio(blob, options)
  } catch (error) {
    throw toTtsGenerationError(error, "语音文件保存失败")
  }
}
