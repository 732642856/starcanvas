// ============================================================================
// Shared Types for Canvas Components
// ============================================================================
import type { Node, Edge } from '@xyflow/react'
import type { ReactNode } from 'react'
import type { CinematicShot, ContinuityWarning, SceneAnalysis } from '@/types/cinematic'

// ============================================================================
// Node Types
// ============================================================================
export type AgentNodeType = "text" | "prompt" | "image" | "storyboard" | "shot" | "storyboard-grid" | "document" | "reference" | "group"
export type VideoWorkflowNodeKind =
  | "script"
  | "image-generation"
  | "video-generation"
  | "audio"
  | "subtitle"
  | "composition"
  | "video-result"
  | "tts"
  | "bgm"
  | "upscale"
  | "focus-edit"
  | "reverse-prompt"
  | "poster"
  | "talking-photo"
  | "remix-analysis"
  | "camera-control"
export type StoryboardResultQuality = "composed-grid" | "single-shot" | "fallback-shot"

export type CameraCommandType = "none" | "push" | "pull" | "pan" | "truck" | "follow"

export type CameraCommand = {
  type: CameraCommandType
  startValue?: number
  endValue?: number
  duration?: number
  easing?: "linear" | "ease-in" | "ease-out"
}

export type ShotCameraConfig = {
  commands: CameraCommand[]
  enabled: boolean
}

export type BatchGenerationJobStatus =
  | "queued"
  | "preparing"
  | "generating"
  | "completed"
  | "failed"

export type BatchGenerationShotStatus =
  | "queued"
  | "generating"
  | "completed"
  | "failed"

export type BatchGenerationJob = {
  id: string
  sourceNodeId: string
  targetShotIds: string[]
  status: BatchGenerationJobStatus
  total: number
  completed: number
  failed: number
  progress: number
  activeShotId?: string
  message?: string
  shots: Record<string, {
    shotNodeId: string
    title?: string
    status: BatchGenerationShotStatus
    imageNodeId?: string
    error?: string
  }>
  startedAt: number
  updatedAt: number
  finishedAt?: number
}

export type CanvasNodeKind =
  | AgentNodeType
  | VideoWorkflowNodeKind
  | "previs"
  | "sketch"
  | "uploaded-image"
  | "uploaded-video"
  | "uploaded-audio"
  | "uploaded-file"
  | "image-result"
  | "text-result"
  | "ai-generated-image"
  | "video-sample-frames"
  | "video-analyze"
  | "video"
  | "agent"
  | "subtitle-srt"
  | "handoff-report"
  | "tts"
  | "continuity-report"

// ============================================================================
// Node Run Status (P1-3 六态模型)
// ============================================================================
/** 对标 TapNow 7 状态机: idle → ready → queued → running → done/error + stale */
export type NodeRunStatus =
  | "idle"
  | "ready"
  | "pending"
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "stale"
  | "cancelled"

export type NodeRunSource =
  | "manual"
  | "ai"
  | "workflow"
  | "retry"
  | "system"

export interface NodeRunMeta {
  /**
   * 节点当前运行状态（六态模型）
   */
  runStatus: NodeRunStatus

  /**
   * 0 - 100，主要给 ComfyUI / 视频生成 / 长任务用
   */
  progress?: number

  /**
   * 给用户看的状态说明
   * 例如：排队中、提交任务中、轮询结果中、下载输出中
   */
  message?: string

  /**
   * 失败原因
   */
  error?: string

  /**
   * 最近一次开始运行时间 (ISO 8601)
   */
  lastRunAt?: string

  /**
   * 最近一次结束时间，成功/失败/取消都可以记录 (ISO 8601)
   */
  lastFinishedAt?: string

  /**
   * 当前运行 ID，可用于 usage metering / history / task 关联
   */
  runId?: string

  /**
   * 当前运行对应的 history id
   * P1-5 节点生成历史会用到
   */
  currentHistoryId?: string

  /**
   * 外部任务 ID
   * 例如：ComfyUI prompt_id、ModelScope task_id、APIMart task_id
   */
  externalTaskId?: string

  /**
   * 外部原始状态
   * 例如 SUCCEED / FAILED / queued / running
   */
  rawStatus?: string

  /**
   * 触发来源
   */
  source?: NodeRunSource

  /**
   * pending 状态的原因
   * 例如：AI 请求自动运行，需要用户确认
   */
  pendingReason?: string

  /**
   * 连续性检查结果（六维）
   */
  continuityChecked?: boolean
  continuityIssues?: Array<{
    dimension: "character" | "scene" | "action" | "style" | "time" | "prop"
    severity: "error" | "warning" | "info"
    message: string
    shotId?: string
    sceneId?: string
  }>
  continuityReport?: string
  dismissedIssues?: string[]
}

// @deprecated 旧五态模型，保留仅用于兼容读取，新代码请使用 NodeRunStatus
export type WorkflowNodeStatus = "draft" | "ready" | "running" | "done" | "error"

/** 声线克隆登记状态 */
export type VoiceCloneStatus = "registering" | "ready" | "failed" | "expired"

/** 角色声线档案（来自 Voice Clone 服务） */
export type VoiceProfile = {
  profileId: string
  characterId: string
  characterName: string
  status: VoiceCloneStatus
  refText?: string
  tags?: string[]
  audioDurationSeconds?: number
  sampleRate?: number
  createdAt: string
  updatedAt: string
  errorMessage?: string
}

/** AI 配音配置 */
export type VoiceConfig = {
  mode: "design" | "clone" | "auto"
  text: string
  /** 语音设计模式：属性描述（如 "female, young adult, low pitch, american accent"） */
  instruct?: string
  /** 克隆模式：参考音频存储 ID */
  refAudioId?: string
  /** 克隆模式：参考音频转写文本 */
  refText?: string
  /** 语速倍率（默认 1.0） */
  speed?: number
  /** 推理步数（默认 32，16 可加速） */
  numStep?: number
}

/** AI 配音状态 */
export type VoiceGenerationStatus = "idle" | "generating" | "succeeded" | "failed"

export type CharacterIdentityAsset = {
  id: string
  name: string
  aliases?: string[]
  role?: string
  /** Stable actor-like identity: face, age range, build, hairstyle, silhouette, distinctive marks */
  visualSignature?: string
  /** Costume or wardrobe that must stay recognizable across panels */
  costume?: string
  /** Identifying props that should persist when the character appears */
  props?: string[]
  physicalTraits?: string[]
  colorPalette?: string[]
  referenceAssetId?: string
  notes?: string
  /** Voice Clone profile ID — links to a registered voice profile from the Voice Clone service */
  voiceProfileId?: string
  /** Voice profile status (synced from Voice Clone service) */
  voiceProfileStatus?: VoiceCloneStatus
  /** 三视图生成结果 URL（CharacterViewPanel 渲染） */
  frontViewUrl?: string
  sideViewUrl?: string
  backViewUrl?: string
  frontViewAssetId?: string
  sideViewAssetId?: string
  backViewAssetId?: string
  viewGenerationStatus?: "idle" | "generating" | "done" | "failed"
}

export type StoryboardShotData = {
  id: string
  order: number
  title: string
  shotType?: string
  cameraMovement?: string
  duration?: string
  description: string
  visualPrompt: string
  negativePrompt?: string
  dialogue?: string
  notes?: string
  /** 角色一致性资产：用于跨镜头保持同一角色的脸、发型、服装、道具和轮廓稳定 */
  characterIdentities?: CharacterIdentityAsset[]
  /** 专业分镜导演层输出：保留镜头动机、构图、调度、连续性等成熟镜头语言信息 */
  cinematicShot?: CinematicShot
  sceneAnalysis?: SceneAnalysis
  continuityWarnings?: ContinuityWarning[]
  sourceStoryboardNodeId?: string
  generatedImageNodeId?: string
  generatedImageUrl?: string
  generatedImageAssetId?: string
  referenceImageUrl?: string
  sourceType?: string
  sourceMeta?: Record<string, unknown>
  generationStatus?: "idle" | "queued" | "generating" | "retrying" | "succeeded" | "failed"
  generationError?: string
  generationStartedAt?: number
  generationFinishedAt?: number
  generationRequestId?: string
  generationAttempts?: number
  generationErrorCode?: string
  generationRetryable?: boolean
  lastGeneratedAt?: string
  status?: "draft" | "ready" | "generating" | "done" | "error"
  errorMessage?: string

  // --- AI 配音 ---
  voiceConfig?: VoiceConfig
  voiceAudioUrl?: string
  voiceAudioAssetId?: string
  voiceGenerationStatus?: VoiceGenerationStatus
  voiceGenerationError?: string
  // --- 字幕时间轴 ---
  /** 当前分镜在影片序列中的累积字幕时间轴数据 */
  subtitleTimeline?: {
    startTimeSeconds: number
    durationSeconds: number
    segments: Array<{
      index: number
      startSeconds: number
      endSeconds: number
      text: string
    }>
  }
}

export type StoryboardGridData = {
  id: string
  title: string
  sourceStoryboardNodeId?: string
  shotNodeIds: string[]
  columns: 1 | 2 | 3
  maxShots: number
  shotStates?: Array<{
    shotNodeId: string
    order?: number
    title?: string
    status: "missing" | "generating" | "ready" | "failed"
    imageUrl?: string
    errorMessage?: string
  }>
  outputImageUrl?: string
  outputImageNodeId?: string
  status?: "draft" | "generating" | "done" | "error"
  errorMessage?: string
}

export type StoryboardCompositeSettings = {
  layout: "auto" | "2x2" | "1x4" | "4x1"
  showShotNumber: boolean
  showShotTitle: boolean
  stylePrompt: string
  strategy: "auto-compose-or-generate" | "always-generate-composite"
}

export type ProjectSceneBibleData = {
  id: string
  sceneNumber?: number
  location?: string
  timeOfDay?: string
  characters?: string[]
  summary?: string
  atmosphere?: string
  lightingStyle?: string
  colorPalette?: string[]
}

export type ProjectVisualBibleData = {
  name?: string
  description?: string
  colorPalette?: string[]
  lightingStyle?: string
  cameraNotes?: string
  aspectRatio?: string
  stylePrompt?: string
}

export type StoryboardAssistantStage = "idea" | "story" | "storyboard-text"

/** 运行时元数据（不持久化，仅前端运行时使用） */
export interface RuntimeMeta {
  batchProgress?: string
  retryCount?: number
  batchPending?: boolean
  fallbackComposite?: boolean
  childNodeIds?: string[]
}

export type SketchPoint = {
  x: number
  y: number
  pressure?: number
  t?: number
}

export type SketchStroke = {
  id: string
  color: string
  size: number
  points: SketchPoint[]
}

export type CanvasNodeData = {
  label?: ReactNode
  title?: string
  nodeKind?: CanvasNodeKind
  workflowRole?: string

  // ---- 新：统一运行状态 ----
  runMeta?: NodeRunMeta

  // ---- 旧：兼容字段，禁止新写入 ----
  status?: WorkflowNodeStatus
  errorMessage?: string
  pendingExecution?: boolean  // AI suggested run_node, waiting for user confirmation

  // ---- 业务字段 ----
  summary?: string
  prompt?: string
  content?: string
  /** 文本内容（非 markdown 类型节点的纯文本展示，兼容旧数据） */
  text?: string
  negativePrompt?: string
  instruction?: string
  inputs?: Array<{ id?: string; label: string; type?: string }>
  outputs?: Array<{ id?: string; label: string; type?: string; url?: string }>
  duration?: string
  model?: string
  resultUrl?: string
  imageUrl?: string
  assetUrl?: string
  fileName?: string
  fileSize?: number
  mimeType?: string
  imageWidth?: number
  imageHeight?: number
  displayWidth?: number
  displayHeight?: number
  aspectRatio?: number
  characterFacingAngle?: number
  sketchStrokes?: SketchStroke[]
  sketchImageDataUrl?: string
  createdAt?: number
  uploadedAt?: string
  assetKind?: string
  assetPurpose?: string
  storyboard?: any
  shot?: StoryboardShotData
  storyboardGrid?: StoryboardGridData
  agentOutput?: string
  agentStatus?: "idle" | "running" | "done" | "error"
  agentPhase?: string
  runtimeMeta?: RuntimeMeta
  /** @deprecated 迁移到 runtimeMeta.childNodeIds */
  _childNodeIds?: string[]
  /** @deprecated 迁移到 runtimeMeta.batchProgress */
  _batchProgress?: string
  /** @deprecated 迁移到 runtimeMeta.retryCount */
  _retryCount?: number
  /** @deprecated 迁移到 runtimeMeta.batchPending */
  _batchPending?: boolean
  /** @deprecated 迁移到 runtimeMeta.fallbackComposite */
  _fallbackComposite?: boolean
  /** @deprecated 迁移到 runtimeMeta */
  previs3d?: any
  generationJob?: any
  sourcePromptId?: string
  sourceGenerationJobId?: string
  sourceType?: "shot" | "storyboard" | "prompt" | "image" | string
  sourceMeta?: Record<string, unknown>
  sourceStoryboardNodeId?: string
  sourceShotId?: string
  sourceShotOrder?: number
  sourceShotTitle?: string
  sourcePrompt?: string
  generatedAt?: string
  generationId?: string
  generationOutput?: any
  syncToAssetLibrary?: boolean
  assetLibraryType?: AssetType
  assetLibraryFolder?: string
  assetLibraryTags?: string[]
  characterAssetSeeds?: Array<{
    id: string
    name: string
    role: string
    notes?: string
  }>
  compositeSettings?: StoryboardCompositeSettings
  storyboardAssistantStage?: StoryboardAssistantStage
  projectScenes?: ProjectSceneBibleData[]
  projectVisualBible?: ProjectVisualBibleData
  autoSizeMode?: "auto" | "fixed-width-height-grows" | "manual"
  writingMode?: "normal" | "focus"
  generation?: any
  cinematicParams?: import("../panels/CinematicParamPanel").CinematicParams
  colorGradePrompt?: string
  panoramaPrompt?: string
  timelineStartTimeSeconds?: number
  timelineDurationSeconds?: number
  timelineTrackId?: number
  generatedShotNodeIds?: string[]
  generatedStoryboardGridNodeId?: string
  storyboardOutputImageNodeId?: string
  storyboardOutputImageUrl?: string
  storyboardOutputAssetId?: string
  storyboardBatchJob?: BatchGenerationJob
  storyboardResultQuality?: StoryboardResultQuality
  storyboardWarning?: string
  storyboardError?: string
  storyboardErrorPhase?: string
  storyboardProcessVisible?: boolean
  role?: string
  isStoryboardProcessNode?: boolean
  isStoryboardFinalOutput?: boolean
  hiddenByStoryboardProcessMode?: boolean
  // --- Video metadata (V1-3，全部可选) ---
  videoDurationMs?: number
  videoWidth?: number
  videoHeight?: number
  videoFps?: number
  videoFrameCount?: number
  thumbnailUrl?: string

  // --- Image asset persistence (IndexedDB / remote) ---
  assetId?: string
  sourceImageAssetId?: string
  /** Provider-readable image URL/data URL. Prefer this over blob preview URLs when calling AI services. */
  generatedImageUrl?: string
  /** Mask data used by focus-edit nodes. */
  focusEditMaskDataUrl?: string
  /** @deprecated Use focusEditMaskDataUrl for focus-edit nodes. */
  maskDataUrl?: string
  /** @internal Where the image data lives: "indexeddb" | "remote" | "missing" */
  persistence?: "indexeddb" | "remote" | "missing"
  /** @internal Source of the image: "upload" | "generated" | "remote" */
  source?: "upload" | "generated" | "remote"
  /** @internal Error identifier when image asset is not found on restore */
  loadError?: string

  // --- Subtitle / Handoff node fields ---
  /** SRT 字幕原始内容 */
  srtContent?: string
  /** 字幕分段信息 */
  segments?: Array<{ index: number; start: number; end: number; text: string }>
  /** 字幕总时长（秒） */
  totalDurationSeconds?: number
  /** 字幕格式标识 */
  format?: string
  /** 交接报告元数据 */
  totalWarnings?: number
  affectedShotCount?: number
  affectedShotIds?: string[]

  // --- Persistence internal marker (deprecated, kept for reading old data) ---
  /** @deprecated Use `persistence` field instead */
  _imageStripped?: boolean
}

// ============================================================================
// Creative Flow Types
// ============================================================================
export type CreativeFlowId = "mood" | "character" | "storyboard" | "first_frame" | "background" | "video"
export type RightPanelMode = "chat" | "storyboard" | "previs" | "models" | "queue" | "asset" | "profile"

export type CreativeFlowConfig = {
  id: CreativeFlowId
  icon: string
  label: string
  title: string
  desc: string
  draft: string
  mode: RightPanelMode
  nodeKind?: "prompt" | "storyboard" | "previs"
  primaryOutput: string
  workflowSteps: string[]
  nextAction: string
}

// ============================================================================
// Asset Types
// ============================================================================
export type AssetFolder = "Character" | "Scene" | "Item" | "Style" | "Sound Effect" | "Others"
export type AssetType = "image" | "video" | "audio" | "text" | "prompt" | "character" | "scene" | "style" | "other"

export type AssetItem = {
  id: string
  type: AssetType
  name: string
  src?: string
  thumbnail?: string
  folder: AssetFolder
  favorite?: boolean
  tags?: string[]
  isPanorama?: boolean
  createdAt: number
  metadata?: Record<string, unknown>
}

export type AssetLibraryState = {
  isOpen: boolean
  scope: "personal" | "team"
  query: string
  selectedFolder?: AssetFolder
  assets: AssetItem[]
}

// ============================================================================
// Bible System Types
// ============================================================================
export type CharacterBibleData = {
  id: string
  name: string
  aliases?: string[]
  role?: string
  visualSignature?: string
  costume?: string
  props?: string[]
  physicalTraits?: string[]
  colorPalette?: string[]
  referenceAssetIds?: string[]
  backstory?: string
  arcDescription?: string
  notes?: string
  referenceImageUrl?: string
  createdAt: number

  /** 六层身份锚点（对标 Moyin Creator） */
  identityAnchors?: import("../../types/identity-anchors").IdentityAnchors
  /** 负面提示词互补系统 */
  negativePrompt?: import("../../types/identity-anchors").CharacterNegativePrompt
}

export type SceneBibleData = {
  id: string
  sceneNumber: number
  location: string
  timeOfDay?: string
  weather?: string
  atmosphere?: string
  characters?: string[]
  props?: string[]
  lightingStyle?: string
  colorPalette?: string[]
  description?: string
  referenceImageUrl?: string
  createdAt: number
}

export type VisualStyleBibleData = {
  id: string
  name: string
  description?: string
  colorPalette?: string[]
  lightingStyle?: string
  aspectRatio?: string
  filmStock?: string
  cameraNotes?: string
  referenceUrls?: string[]
  moodboardAssetIds?: string[]
  createdAt: number
}

// ============================================================================
// Context Menu Types
// ============================================================================
export type ContextMenuState =
  | null
  | {
      type: "canvas"
      screenX: number
      screenY: number
      canvasX: number
      canvasY: number
    }
  | {
      type: "node"
      nodeId: string
      nodeType: string
      screenX: number
      screenY: number
    }
  | {
      type: "edge"
      edgeId: string
      screenX: number
      screenY: number
    }

// ============================================================================
// Floating Toolbar Types
// ============================================================================
export type FloatingToolbarState =
  | null
  | {
      type: "image-hover"
      nodeId: string
      position: { x: number; y: number; above: boolean }
    }
  | {
      type: "text-format"
      nodeId: string
      position: { x: number; y: number; above: boolean }
    }

// ============================================================================
// Chat Types
// ============================================================================
export type ChatMode = "ASK" | "EXECUTE" | "STORYBOARD" | "ORGANIZE" | "IMAGE_PROMPT"

export type ChatMessage = {
  id: string
  role: "assistant" | "user" | "system"
  content: string
  actions?: string[]
  statusSteps?: Array<{
    id?: string
    label: string
    status?: "done" | "running" | "pending" | "warning"
    detail?: string
  }>
  suggestions?: Array<{
    label: string
    prompt: string
    mode?: ChatMode
  }>
  needsUserConfirmation?: boolean
  createdAt: string
}

// ============================================================================
// Canvas Operation Types (internal UI operations)
// NOTE: These are internal canvas UI operations (context menus, toolbar, etc.),
// NOT the same as AI-generated chat CanvasAction (see hooks/useChatSSE.ts).
// The AI chat system uses a different structure: { action, nodeType, nodeId, ... }
// ============================================================================
export type CanvasOperationType =
  | "create_node"
  | "update_node"
  | "delete_node"
  | "connect_nodes"
  | "create_group"
  | "layout_canvas"
  | "generate_prompt"
  | "split_storyboard"
  | "generate_image_prompt"
  | "generate_storyboard"
  | "ask_clarification"
  | "no_action"
  | "select_node"
  | "focus_node"
  | "run_node"
  | "apply_asset_workflow"
  | "generate_image"
  | "open_panel"
  | "sync_storyboard"
  | "clear_canvas"
  | "focus_canvas"
  | "save_canvas"
  | "create_workflow_template"

export type CanvasOperation = {
  type: CanvasOperationType
  params?: Record<string, any>
}

// Keep old names as aliases for backward compatibility
/** @deprecated Use CanvasOperationType instead. The AI chat system uses a separate CanvasAction type in hooks/useChatSSE.ts */
export type CanvasActionType = CanvasOperationType
/** @deprecated Use CanvasOperation instead. The AI chat system uses a separate CanvasAction type in hooks/useChatSSE.ts */
export type CanvasAction = CanvasOperation

// ============================================================================
// Storyboard Types (from @creative-canvas/canvas)
// ============================================================================
export type StoryboardLayerType =
  | "stick_figure"
  | "subject"
  | "character"
  | "prop"
  | "background"
  | "foreground"
  | "camera"
  | "annotation"

export type StoryboardShotType =
  | "wide"
  | "medium"
  | "close_up"
  | "over_shoulder"
  | "insert"
  | "custom"

export type StoryboardCameraMovement =
  | "static"
  | "pan"
  | "tilt"
  | "dolly"
  | "truck"
  | "zoom"
  | "handheld"
  | "custom"

export type StoryboardLayer = {
  id: string
  name: string
  type: StoryboardLayerType
  visible: boolean
  locked: boolean
  zIndex: number
  opacity: number
  transform: {
    x: number
    y: number
    scale: number
    rotation: number
  }
  semanticTags: string[]
}

export type StoryboardFrameContent = {
  frameId: string
  title: string
  inputMode: StoryboardLayerType
  intentText: string
  backgroundPrompt: string
  shotType: StoryboardShotType
  cameraMovement: StoryboardCameraMovement
  promptDraft: string
  generatedPrompt: string
  negativePrompt: string
  layers: StoryboardLayer[]
  references: Array<any>
}

// ============================================================================
// Node Styles
// ============================================================================
export const nodeToneStyles: Record<CanvasNodeKind, {
  eyebrow: string
  body: string
  meta: string
  border: string
  background: string
}> = {
  text: {
    eyebrow: "text-slate-300",
    body: "text-slate-200/75",
    meta: "text-slate-300/60",
    border: "1px solid rgba(148, 163, 184, 0.2)",
    background: "rgba(100, 116, 139, 0.1)",
  },
  prompt: {
    eyebrow: "text-slate-300",
    body: "text-slate-200/75",
    meta: "text-slate-300/60",
    border: "1px solid rgba(148, 163, 184, 0.2)",
    background: "rgba(100, 116, 139, 0.1)",
  },
  "reverse-prompt": {
    eyebrow: "text-violet-200",
    body: "text-violet-100/80",
    meta: "text-violet-200/60",
    border: "1px solid rgba(167, 139, 250, 0.24)",
    background: "rgba(139, 92, 246, 0.14)",
  },
  image: {
    eyebrow: "text-slate-300",
    body: "text-slate-200/75",
    meta: "text-slate-300/60",
    border: "1px solid rgba(148, 163, 184, 0.2)",
    background: "rgba(100, 116, 139, 0.1)",
  },
  storyboard: {
    eyebrow: "text-slate-300",
    body: "text-slate-200/75",
    meta: "text-slate-300/60",
    border: "1px solid rgba(148, 163, 184, 0.2)",
    background: "rgba(100, 116, 139, 0.1)",
  },
  document: {
    eyebrow: "text-slate-300",
    body: "text-slate-200/75",
    meta: "text-slate-300/60",
    border: "1px solid rgba(148, 163, 184, 0.22)",
    background: "rgba(100, 116, 139, 0.12)",
  },
  shot: {
    eyebrow: "text-slate-300",
    body: "text-slate-200/75",
    meta: "text-slate-300/60",
    border: "1px solid rgba(148, 163, 184, 0.2)",
    background: "rgba(100, 116, 139, 0.1)",
  },
  "storyboard-grid": {
    eyebrow: "text-slate-300",
    body: "text-slate-200/75",
    meta: "text-slate-300/60",
    border: "1px solid rgba(148, 163, 184, 0.2)",
    background: "rgba(100, 116, 139, 0.1)",
  },
  reference: {
    eyebrow: "text-slate-300",
    body: "text-slate-200/75",
    meta: "text-slate-300/60",
    border: "1px solid rgba(148, 163, 184, 0.2)",
    background: "rgba(100, 116, 139, 0.1)",
  },
  group: {
    eyebrow: "text-slate-300",
    body: "text-slate-200/75",
    meta: "text-slate-300/60",
    border: "1px dashed rgba(148, 163, 184, 0.25)",
    background: "rgba(100, 116, 139, 0.06)",
  },
  sketch: {
    eyebrow: "text-indigo-300",
    body: "text-indigo-200/75",
    meta: "text-indigo-300/60",
    border: "1px solid rgba(129, 140, 248, 0.25)",
    background: "rgba(129, 140, 248, 0.1)",
  },
  previs: {
    eyebrow: "text-slate-300",
    body: "text-slate-200/75",
    meta: "text-slate-300/60",
    border: "1px solid rgba(148, 163, 184, 0.2)",
    background: "rgba(100, 116, 139, 0.1)",
  },
  "uploaded-image": {
    eyebrow: "text-slate-300",
    body: "text-slate-200/75",
    meta: "text-slate-300/60",
    border: "1px solid rgba(148, 163, 184, 0.2)",
    background: "rgba(100, 116, 139, 0.1)",
  },
  "uploaded-video": {
    eyebrow: "text-slate-300",
    body: "text-slate-200/75",
    meta: "text-slate-300/60",
    border: "1px solid rgba(148, 163, 184, 0.2)",
    background: "rgba(100, 116, 139, 0.1)",
  },
  "uploaded-audio": {
    eyebrow: "text-slate-300",
    body: "text-slate-200/75",
    meta: "text-slate-300/60",
    border: "1px solid rgba(148, 163, 184, 0.2)",
    background: "rgba(100, 116, 139, 0.1)",
  },
  "uploaded-file": {
    eyebrow: "text-slate-300",
    body: "text-slate-200/75",
    meta: "text-slate-300/60",
    border: "1px solid rgba(148, 163, 184, 0.2)",
    background: "rgba(100, 116, 139, 0.1)",
  },
  "image-result": {
    eyebrow: "text-slate-300",
    body: "text-slate-200/75",
    meta: "text-slate-300/60",
    border: "1px solid rgba(148, 163, 184, 0.2)",
    background: "rgba(100, 116, 139, 0.1)",
  },
  "text-result": {
    eyebrow: "text-slate-300",
    body: "text-slate-200/75",
    meta: "text-slate-300/60",
    border: "1px solid rgba(148, 163, 184, 0.2)",
    background: "rgba(100, 116, 139, 0.1)",
  },
  script: {
    eyebrow: "text-slate-300",
    body: "text-slate-200/75",
    meta: "text-slate-300/60",
    border: "1px solid rgba(148, 163, 184, 0.2)",
    background: "rgba(100, 116, 139, 0.1)",
  },
  "image-generation": {
    eyebrow: "text-slate-300",
    body: "text-slate-200/75",
    meta: "text-slate-300/60",
    border: "1px solid rgba(148, 163, 184, 0.2)",
    background: "rgba(100, 116, 139, 0.1)",
  },
  "video-generation": {
    eyebrow: "text-slate-300",
    body: "text-slate-200/75",
    meta: "text-slate-300/60",
    border: "1px solid rgba(148, 163, 184, 0.2)",
    background: "rgba(100, 116, 139, 0.1)",
  },
  audio: {
    eyebrow: "text-slate-300",
    body: "text-slate-200/75",
    meta: "text-slate-300/60",
    border: "1px solid rgba(148, 163, 184, 0.2)",
    background: "rgba(100, 116, 139, 0.1)",
  },
  subtitle: {
    eyebrow: "text-slate-300",
    body: "text-slate-200/75",
    meta: "text-slate-300/60",
    border: "1px solid rgba(148, 163, 184, 0.2)",
    background: "rgba(100, 116, 139, 0.1)",
  },
  composition: {
    eyebrow: "text-slate-300",
    body: "text-slate-200/75",
    meta: "text-slate-300/60",
    border: "1px solid rgba(148, 163, 184, 0.2)",
    background: "rgba(100, 116, 139, 0.1)",
  },
  "video-result": {
    eyebrow: "text-slate-300",
    body: "text-slate-200/75",
    meta: "text-slate-300/60",
    border: "1px solid rgba(148, 163, 184, 0.2)",
    background: "rgba(100, 116, 139, 0.1)",
  },
  "ai-generated-image": {
    eyebrow: "text-slate-300",
    body: "text-slate-200/75",
    meta: "text-slate-300/60",
    border: "1px solid rgba(148, 163, 184, 0.2)",
    background: "rgba(100, 116, 139, 0.1)",
  },
  "video-sample-frames": {
    eyebrow: "text-slate-300",
    body: "text-slate-200/75",
    meta: "text-slate-300/60",
    border: "1px solid rgba(148, 163, 184, 0.2)",
    background: "rgba(100, 116, 139, 0.1)",
  },
  "video-analyze": {
    eyebrow: "text-slate-300",
    body: "text-slate-200/75",
    meta: "text-slate-300/60",
    border: "1px solid rgba(148, 163, 184, 0.2)",
    background: "rgba(100, 116, 139, 0.1)",
  },
  agent: {
    eyebrow: "text-purple-300",
    body: "text-purple-200/75",
    meta: "text-purple-300/60",
    border: "1px solid rgba(168, 85, 247, 0.2)",
    background: "rgba(168, 85, 247, 0.1)",
  },
  video: {
    eyebrow: "text-amber-300",
    body: "text-amber-200/75",
    meta: "text-amber-300/60",
    border: "1px solid rgba(245, 158, 11, 0.2)",
    background: "rgba(245, 158, 11, 0.1)",
  },
  "subtitle-srt": {
    eyebrow: "text-blue-300",
    body: "text-blue-200/75",
    meta: "text-blue-300/60",
    border: "1px solid rgba(59, 130, 246, 0.2)",
    background: "rgba(59, 130, 246, 0.1)",
  },
  "handoff-report": {
    eyebrow: "text-yellow-300",
    body: "text-yellow-200/75",
    meta: "text-yellow-300/60",
    border: "1px solid rgba(234, 179, 8, 0.3)",
    background: "rgba(234, 179, 8, 0.1)",
  },
  tts: {
    eyebrow: "text-pink-300",
    body: "text-pink-200/75",
    meta: "text-pink-300/60",
    border: "1px solid rgba(236, 72, 153, 0.25)",
    background: "rgba(236, 72, 153, 0.1)",
  },
  bgm: {
    eyebrow: "text-emerald-300",
    body: "text-emerald-200/75",
    meta: "text-emerald-300/60",
    border: "1px solid rgba(16, 185, 129, 0.25)",
    background: "rgba(16, 185, 129, 0.1)",
  },
  upscale: {
    eyebrow: "text-cyan-300",
    body: "text-cyan-200/75",
    meta: "text-cyan-300/60",
    border: "1px solid rgba(6, 182, 212, 0.25)",
    background: "rgba(6, 182, 212, 0.1)",
  },
  "focus-edit": {
    eyebrow: "text-violet-300",
    body: "text-violet-200/75",
    meta: "text-violet-300/60",
    border: "1px solid rgba(139, 92, 246, 0.25)",
    background: "rgba(139, 92, 246, 0.1)",
  },
  poster: {
    eyebrow: "text-rose-300",
    body: "text-rose-200/75",
    meta: "text-rose-300/60",
    border: "1px solid rgba(244, 63, 94, 0.25)",
    background: "rgba(244, 63, 94, 0.1)",
  },
  "talking-photo": {
    eyebrow: "text-fuchsia-300",
    body: "text-fuchsia-200/75",
    meta: "text-fuchsia-300/60",
    border: "1px solid rgba(217, 70, 239, 0.25)",
    background: "rgba(217, 70, 239, 0.1)",
  },
  "remix-analysis": {
    eyebrow: "text-orange-300",
    body: "text-orange-200/75",
    meta: "text-orange-300/60",
    border: "1px solid rgba(249, 115, 22, 0.25)",
    background: "rgba(249, 115, 22, 0.1)",
  },
  "camera-control": {
    eyebrow: "text-sky-300",
    body: "text-sky-200/75",
    meta: "text-sky-300/60",
    border: "1px solid rgba(56, 189, 248, 0.25)",
    background: "rgba(56, 189, 248, 0.1)",
  },
  "continuity-report": {

    eyebrow: "text-teal-300",

    body: "text-teal-200/75",

    meta: "text-teal-300/60",

    border: "1px solid rgba(20, 184, 166, 0.25)",

    background: "rgba(20, 184, 166, 0.1)",

  },

}
