export type ScriptPipelineCharacter = {
  id?: string
  name: string
  role?: string
  referenceAssetIds?: string[]
  viewSetId?: string
  consistencyLock?: boolean
  faceLock?: boolean
  costumeLock?: boolean
  description?: string
}

export type ScriptPipelineShot = {
  id: string
  order: number
  title: string
  beat: string
  textStoryboard: string
  storyboardPrompt: string
  visualPrompt: string
  imagePrompt: string
  videoPrompt: string
  characters: string[]
  characterBindings: Array<{
    characterId: string
    name: string
    referenceAssetIds: string[]
    viewSetId?: string
    consistencyLock: boolean
    faceLock: boolean
    costumeLock: boolean
  }>
  shotType: string
  cameraMovement: string
  durationSeconds: number
  negativePrompt: string
}

export type ScriptPipelineResult = {
  projectTitle: string
  logline: string
  textStoryboard: string
  shots: ScriptPipelineShot[]
  nineGridPrompt: string
  continuityRules: string[]
  nextActions: string[]
}

export type ScriptPipelineInput = {
  script: string
  projectTitle?: string
  targetShotCount?: number
  characters?: ScriptPipelineCharacter[]
  stylePrompt?: string
  language?: "zh" | "en" | "bilingual"
}

const DEFAULT_NEGATIVE =
  "identity drift, costume change, face swap, extra fingers, fused hands, deformed props, random extra characters, inconsistent location, unreadable panel labels"

function clean(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim()
}

export function normalizeScriptPipelineInput(input: ScriptPipelineInput): ScriptPipelineInput {
  const script = clean(input.script)
  if (!script) throw new Error("script is required")
  const targetShotCount = Math.max(1, Math.min(9, Math.round(input.targetShotCount || 9)))
  return {
    ...input,
    script,
    projectTitle: clean(input.projectTitle) || "未命名项目",
    targetShotCount,
    characters: (input.characters || []).filter((c) => clean(c.name)),
    stylePrompt: clean(input.stylePrompt) || "cinematic Chinese costume comedy storyboard, consistent character design, professional film previsualization",
    language: input.language || "bilingual",
  }
}

export function buildScriptPipelineSystemPrompt(): string {
  return [
    "You are StarCanvas Pipeline Director.",
    "Convert a script into a production-ready storyboard pipeline.",
    "Return STRICT JSON only. No markdown.",
    "Every shot must include text storyboard, polished storyboard prompt, polished image prompt, character bindings, and polished video prompt.",
    "Keep recurring characters consistent. Bind characters by provided id/name/reference assets when available.",
    "Target max 9 shots for a continuous nine-grid storyboard.",
  ].join("\n")
}

export function buildScriptPipelineUserPrompt(input: ScriptPipelineInput): string {
  const normalized = normalizeScriptPipelineInput(input)
  return JSON.stringify(
    {
      task: "script_to_complete_storyboard_pipeline",
      outputSchema: {
        projectTitle: "string",
        logline: "string",
        textStoryboard: "string",
        shots: [
          {
            id: "shot-01",
            order: 1,
            title: "string",
            beat: "string",
            textStoryboard: "Chinese shot description",
            storyboardPrompt: "polished text storyboard prompt",
            visualPrompt: "polished image design prompt, English preferred",
            imagePrompt: "final image generation prompt",
            videoPrompt: "single-shot I2V prompt: one action + one camera move",
            characters: ["character name"],
            shotType: "wide/medium/close-up/etc",
            cameraMovement: "static/push-in/pan/etc",
            durationSeconds: 3,
            negativePrompt: DEFAULT_NEGATIVE,
          },
        ],
        nineGridPrompt: "one prompt for a continuous 3x3 storyboard grid",
        continuityRules: ["identity/costume/scene/prop rules"],
        nextActions: ["generate-nine-grid", "generate-shot-images", "generate-videos"],
      },
      input: normalized,
    },
    null,
    2,
  )
}

function bindCharacters(shot: any, characters: ScriptPipelineCharacter[]): ScriptPipelineShot["characterBindings"] {
  const names: string[] = Array.isArray(shot.characters) ? shot.characters.map(clean).filter(Boolean) : []
  return names.map((name) => {
    const found = characters.find((c) => clean(c.name) === name || clean(c.id) === name)
    return {
      characterId: clean(found?.id) || name,
      name: found?.name || name,
      referenceAssetIds: found?.referenceAssetIds || [],
      viewSetId: found?.viewSetId,
      consistencyLock: found?.consistencyLock ?? true,
      faceLock: found?.faceLock ?? true,
      costumeLock: found?.costumeLock ?? true,
    }
  })
}

export function normalizeScriptPipelineResult(raw: any, input: ScriptPipelineInput): ScriptPipelineResult {
  const normalized = normalizeScriptPipelineInput(input)
  const rawShots = Array.isArray(raw?.shots) ? raw.shots : []
  const shots: ScriptPipelineShot[] = rawShots.slice(0, normalized.targetShotCount).map((shot: any, index: number): ScriptPipelineShot => {
    const order = Number.isFinite(Number(shot.order)) ? Number(shot.order) : index + 1
    const id = clean(shot.id) || `shot-${String(order).padStart(2, "0")}`
    const title = clean(shot.title) || `镜头 ${order}`
    const beat = clean(shot.beat) || clean(shot.textStoryboard) || title
    const textStoryboard = clean(shot.textStoryboard) || beat
    const visualPrompt = clean(shot.visualPrompt || shot.imagePrompt) || `${normalized.stylePrompt}, ${textStoryboard}`
    const videoPrompt = clean(shot.videoPrompt) || `Single continuous shot, ${beat}, ${clean(shot.cameraMovement) || "subtle push-in"}, 3 seconds.`
    return {
      id,
      order,
      title,
      beat,
      textStoryboard,
      storyboardPrompt: clean(shot.storyboardPrompt) || `润色这个文字分镜，保持镜头动机、调度、声画关系清晰：${textStoryboard}`,
      visualPrompt,
      imagePrompt: clean(shot.imagePrompt) || `${visualPrompt}. Keep character identity, costume, props, and location consistent.`,
      videoPrompt,
      characters: Array.isArray(shot.characters) ? shot.characters.map(clean).filter(Boolean) : [],
      characterBindings: bindCharacters(shot, normalized.characters || []),
      shotType: clean(shot.shotType) || "medium shot",
      cameraMovement: clean(shot.cameraMovement) || "subtle push-in",
      durationSeconds: Math.max(1, Math.min(8, Number(shot.durationSeconds) || 3)),
      negativePrompt: clean(shot.negativePrompt) || DEFAULT_NEGATIVE,
    }
  })

  return {
    projectTitle: clean(raw?.projectTitle) || normalized.projectTitle || "未命名项目",
    logline: clean(raw?.logline) || clean(normalized.script).slice(0, 120),
    textStoryboard: clean(raw?.textStoryboard) || shots.map((s) => `${s.order}. ${s.textStoryboard}`).join("\n"),
    shots,
    nineGridPrompt:
      clean(raw?.nineGridPrompt) ||
      `Create a continuous 3x3 storyboard grid for ${normalized.projectTitle}. ${shots.map((s) => `${s.order}. ${s.imagePrompt}`).join(" ")}`,
    continuityRules: Array.isArray(raw?.continuityRules)
      ? raw.continuityRules.map(clean).filter(Boolean)
      : ["same character identity across all panels", "same costume and key props", "single scene continuity unless shot text says otherwise"],
    nextActions: Array.isArray(raw?.nextActions)
      ? raw.nextActions.map(clean).filter(Boolean)
      : ["generate-nine-grid", "generate-shot-images", "enhance-video-prompts", "generate-videos"],
  }
}

export function createDryRunScriptPipeline(input: ScriptPipelineInput): ScriptPipelineResult {
  const normalized = normalizeScriptPipelineInput(input)
  const sentences = normalized.script
    .split(/[。！？!?；;\n]+/)
    .map(clean)
    .filter(Boolean)
  const count = Math.min(normalized.targetShotCount || 9, Math.max(1, sentences.length))
  const shots = Array.from({ length: count }, (_, index) => {
    const beat = sentences[index] || sentences[sentences.length - 1] || normalized.script
    return {
      id: `shot-${String(index + 1).padStart(2, "0")}`,
      order: index + 1,
      title: `镜头 ${index + 1}`,
      beat,
      textStoryboard: beat,
      storyboardPrompt: `将镜头 ${index + 1} 润色为可执行文字分镜：${beat}`,
      visualPrompt: `${normalized.stylePrompt}, shot ${index + 1}, ${beat}, cinematic composition, clear blocking`,
      imagePrompt: `${normalized.stylePrompt}, shot ${index + 1}, ${beat}, consistent characters, professional storyboard panel`,
      videoPrompt: `Single continuous 3-second shot: ${beat}. One clear action, subtle camera movement, preserve identity and costume.`,
      characters: (normalized.characters || []).map((c) => c.name),
      shotType: index % 3 === 0 ? "wide shot" : index % 3 === 1 ? "medium shot" : "close-up",
      cameraMovement: index % 2 === 0 ? "subtle push-in" : "static",
      durationSeconds: 3,
      negativePrompt: DEFAULT_NEGATIVE,
    }
  })
  return normalizeScriptPipelineResult(
    {
      projectTitle: normalized.projectTitle,
      logline: sentences[0] || normalized.script,
      shots,
    },
    normalized,
  )
}
