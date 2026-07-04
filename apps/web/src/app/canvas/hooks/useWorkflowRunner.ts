// ============================================================================
// useWorkflowRunner - Execute video workflow nodes sequentially via AI
// ============================================================================
"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useReactFlow } from "@xyflow/react"
import type { Node, Edge } from "@xyflow/react"
import * as Sentry from "@sentry/nextjs"
import type { CanvasNodeData, CanvasNodeKind, NodeRunMeta, NodeRunSource } from "../components/canvas/types"
import { useAIUsageStore } from "../features/canvas/usage/useAIUsageStore"
import { estimateCostUsd } from "../features/canvas/usage/estimateCost"
import type { AIUsageRecord, AITaskType } from "../features/canvas/usage/aiUsageTypes"
import {
  createRunningRunMeta,
  createSucceededRunMeta,
  createFailedRunMeta,
  createIdleRunMeta,
} from "../utils/nodeRunMeta"
import { createRunHistoryItem } from "../utils/node-run-history"

function appendAIUsageRecord(record: Omit<AIUsageRecord, "id" | "currency" | "finishedAt">) {
  useAIUsageStore.getState().addUsageRecord({
    ...record,
    id: `usage-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    currency: "USD",
    finishedAt: new Date().toISOString(),
  })
}

// ---- 内部类型：用于上游数据解析 ----
interface ParsedSceneEntry {
  sceneId?: string
  id?: string
  characters?: (string | { name?: string })[]
  location?: string
  timeOfDay?: string
  shots?: ParsedShotEntry[]
}

interface ParsedShotEntry {
  shotId?: string
  id?: string
  description?: string
  action?: string
  dialogue?: string
  visualPrompt?: string
}

interface ParsedScriptPayload {
  scenes?: ParsedSceneEntry[]
  characters?: unknown[]
}

interface StreamChunk {
  done?: boolean
  content?: string
  error?: unknown
  usage?: StreamUsage
  /** 图片生成副产物 */
  type?: string
  imageUrl?: string
  prompt?: string
  model?: string
  generatedImage?: {
    imageUrl?: string
    prompt?: string
    model?: string
  }
}
import { useRunHistoryStore } from "../stores/useRunHistoryStore"
import type { NodeRunHistoryInput } from "../types/node-run-history"
import { buildRestorePromptPatch, sanitizeHistoryRawOutput } from "../utils/history-safety"
import { VIDEO_ANALYSIS_RAW_KIND, VIDEO_ANALYSIS_RAW_VERSION } from "../types/video-analysis"
import type { VideoKeyframeRef } from "../types/video-analysis"
import type { ExecutionPlan } from "../utils/execution-plan"
import { analyzeVideoKeyframes } from "../utils/real-video-analyzer"
import { collectWorkflowVideoSources, extractWorkflowVideoFrames } from "../utils/real-video-frame-extractor"
import { quickLayout } from "../utils/dagre-layout"
import type { WorkflowRunEvent } from "../types/workflow-run"
import { enhancePromptWithCinematicContext } from "@/lib/cinematic/context"
import { getDefaultModel, getDefaultImageModel, getRuntimeProviderState } from "@/lib/ai/client"
import { buildRunRequest } from "@/lib/ai/run-request"
import { normalizeGenerationError, formatGenerationErrorForDisplay } from "@/lib/ai/normalizeGenerationError"
import { persistImageDataUrl } from "@/lib/assets/localImageStore"
import { buildVideoGenerationInput, generateVideoFromImage, VideoGenerationError, videoResultToNodeData, type VideoGenBackend } from "../utils/videoGenerationService"
import { resolveProviderReadableVideoSourceImage } from "../utils/videoSourceImage"
import { generateImageFromPrompt } from "../utils/imageGeneration"
import { requestImageUpscale } from "../utils/upscaleService"
import { applyFocusEdit } from "../utils/focusEditService"
import { requestTalkingPhoto } from "../utils/talkingPhotoService"
import { reverseImagePrompt } from "../utils/reversePromptService"
import { createReversePromptCanvasArtifacts } from "../utils/reversePromptCanvasArtifacts"
import { analyzeRemix, generateCameraControl, generatePoster } from "../utils/newWorkflowServices"
import { composeVideo } from "../utils/videoCompositionBrowser"
import type { VideoClipInput, AudioTrackInput, SubtitleInput } from "../utils/videoCompositionBrowser"
import { importStoryboardDraftToCanvas } from "@/features/storyboard/importDraftToCanvas"
import { buildStoryboardDraftFromVideoAnalysis } from "@/features/storyboard/videoAnalysisToStoryboardDraft"
import { imageUrlToBase64 } from "../utils/imagePromptReverser"

interface RunContext {
  runId: string
  source: NodeRunSource
}

export type WorkflowStepStatus = "pending" | "running" | "done" | "error"

interface WorkflowRunnerState {
  isRunning: boolean
  currentStep: string | null
  stepStatuses: Record<string, WorkflowStepStatus>
  error: string | null
  progress: number
}

const WORKFLOW_ORDER: CanvasNodeKind[] = [
  "text",
  "script",
  "storyboard",
  "image-generation",
  "image-result",
  "focus-edit",
  "reverse-prompt",
  "poster",
  "video-sample-frames",
  "video-analyze",
  "camera-control",
  "remix-analysis",
  "video-generation",
  "audio",
  "subtitle",
  "composition",
  "video-result",
]

function getStepIndex(kind: CanvasNodeKind): number {
  return WORKFLOW_ORDER.indexOf(kind)
}

/**
 * 从当前节点和上游数据构建最小历史输入快照。
 * 用于在 buildNodeExecutionContext 完整接入前捕获运行上下文。
 */
function buildHistoryInputFromNode(
  node: Node<CanvasNodeData>,
  allNodes: Node<CanvasNodeData>[],
  edges: Edge[],
  overridePrompt?: string,
): NodeRunHistoryInput {
  const d = node.data as CanvasNodeData
  const rawPrompt = overridePrompt ?? d.prompt ?? d.content ?? ""

  // 上游内容
  const upstreamEdges = edges.filter((e) => e.target === node.id)
  const inputTexts = upstreamEdges
    .map((edge) => {
      const upstream = allNodes.find((n) => n.id === edge.source)
      if (!upstream) return null
      const ud = upstream.data as CanvasNodeData | undefined
      const text = ((ud?.prompt ?? ud?.content ?? "").trim())
      if (!text) return null
      return {
        nodeId: upstream.id,
        nodeType: upstream.type ?? "unknown",
        text,
        title: ud?.title,
      }
    })
    .filter((v): v is NonNullable<typeof v> => v !== null)

  return {
    prompt: rawPrompt,
    displayPrompt: rawPrompt,
    promptParts: rawPrompt ? [{ type: "text", text: rawPrompt }] : [],
    mentions: [],
    inputTexts,
    referenceImages: [],
    referenceVideos: [],
    settingsSnapshot: { nodeKind: d.nodeKind },
  }
}

function isTextModelStep(kind: CanvasNodeKind): boolean {
  return ["text", "script", "storyboard", "subtitle"].includes(kind)
}

function isImageModelStep(kind: CanvasNodeKind): boolean {
  return ["image-generation", "image-result"].includes(kind)
}

function isFocusEditStep(kind: CanvasNodeKind): boolean {
  return kind === "focus-edit"
}

function isPosterStep(kind: CanvasNodeKind): boolean {
  return kind === "poster"
}

function isReversePromptStep(kind: CanvasNodeKind): boolean {
  return kind === "reverse-prompt"
}

function isVideoSampleFramesStep(kind: CanvasNodeKind): boolean {
  return kind === "video-sample-frames"
}

function isVideoAnalyzeStep(kind: CanvasNodeKind): boolean {
  return kind === "video-analyze"
}

function isVideoGenerationStep(kind: CanvasNodeKind): boolean {
  return kind === "video-generation"
}

function isCameraControlStep(kind: CanvasNodeKind): boolean {
  return kind === "camera-control"
}

function isRemixAnalysisStep(kind: CanvasNodeKind): boolean {
  return kind === "remix-analysis"
}

function isTtsStep(kind: CanvasNodeKind): boolean {
  return kind === "audio" || kind === "tts"
}

function isTalkingPhotoStep(kind: CanvasNodeKind): boolean {
  return kind === "talking-photo"
}

function isUpscaleStep(kind: CanvasNodeKind): boolean {
  return kind === "upscale"
}

function isPassThroughStep(kind: CanvasNodeKind): boolean {
  return ["video-result"].includes(kind)
}

/** 秒数 → SRT 时间戳格式 (HH:MM:SS,mmm) */
function formatSrtTime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  const ms = Math.floor((seconds % 1) * 1000)
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms).padStart(3, "0")}`
}

function collectReferenceImageUrls(
  node: Node<CanvasNodeData>,
  allNodes: Node<CanvasNodeData>[],
  edges: Edge[],
): string[] {
  const refs: string[] = []
  const seen = new Set<string>()
  const pushRef = (value?: string) => {
    if (!value || seen.has(value)) return
    if (value.startsWith("blob:")) return
    refs.push(value)
    seen.add(value)
  }

  pushRef(node.data.sketchImageDataUrl)

  for (const edge of edges.filter((e) => e.target === node.id)) {
    const upstreamNode = allNodes.find((n) => n.id === edge.source)
    const data = upstreamNode?.data
    pushRef(data?.sketchImageDataUrl)
    pushRef(data?.imageUrl)
    pushRef(data?.resultUrl)
  }

  return refs
}

// Build system prompts for each step
function getSystemPrompt(kind: CanvasNodeKind): string {
  switch (kind) {
    case "script":
      return "你是一个专业的故事开发顾问。用户会提供新闻链接、文章摘录、资料片段或随手想法。你的任务不是直接写分镜，而是把杂乱输入提炼成可继续创作的故事种子。请输出：1. 核心事件；2. 可改编主题；3. 主角可能性；4. 主要冲突；5. 类型方向；6. 情绪基调；7. 可继续发展成完整故事的 3 个创意角度。内容要具体、可拍、避免空泛。"
    case "storyboard":
      return "你是一个专业的分镜师。根据脚本内容，生成分镜描述列表。每个分镜包括：镜头编号、景别、画面描述、运镜方式、时长。用JSON数组格式输出。"
    case "image-generation":
      return "你是一个专业的AI图像提示词工程师。将分镜描述转换为详细的英文图像生成提示词（prompt）。只输出提示词，不要解释。"
    case "subtitle":
      return "你是一个专业的字幕编辑。根据脚本和画面内容，生成带时间轴的字幕文本。"
    case "composition":
      return "你是一个专业的视频后期编辑。描述如何将各元素合成为最终视频。包括转场、节奏、色调。"
    default:
      return "你是一个专业的AI创作助手。"
  }
}

// Usage info extracted from SSE stream
export interface StreamUsage {
  promptTokens?: number
  completionTokens?: number
  totalTokens?: number
}

// Read SSE stream and collect all text content + usage metadata
async function readSSEStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onDelta?: (delta: string) => void,
  onImageGenerated?: (data: { imageUrl: string; prompt: string; model: string }) => void,
): Promise<{ text: string; usage: StreamUsage | null }> {
  const decoder = new TextDecoder()
  let result = ""
  let usage: StreamUsage | null = null
  let buffer = ""

  const processDataLine = (data: string) => {
    if (!data || data === "[DONE]") return

    let parsed: StreamChunk
    try {
      parsed = JSON.parse(data)
    } catch {
      // Ignore malformed complete lines; incomplete lines are preserved by buffer.
      return
    }

    if (parsed.done) return

    // Error in stream
    if (parsed.error) {
      const normalized = normalizeGenerationError({ body: parsed.error })
      throw Object.assign(new Error(formatGenerationErrorForDisplay(normalized)), { generationError: normalized })
    }

    // Text content
    if (parsed.content) {
      // Detect inline [USAGE] markers
      const usageMatch = parsed.content.match(/\[USAGE\](.+?)\[\/USAGE\]/)
      if (usageMatch) {
        try {
          const raw = JSON.parse(usageMatch[1])
          usage = {
            promptTokens: raw.prompt_tokens,
            completionTokens: raw.completion_tokens,
            totalTokens: raw.total_tokens,
          }
        } catch {}
        // Strip usage markers from content
        const cleanContent = parsed.content.replace(/\[USAGE\].+?\[\/USAGE\]/g, "")
        if (cleanContent.trim()) {
          result += cleanContent
          onDelta?.(cleanContent)
        }
      } else {
        result += parsed.content
        onDelta?.(parsed.content)
      }
    }

    // Image generated event
    if (parsed.type === "image_generated" && parsed.imageUrl) {
      onImageGenerated?.({
        imageUrl: parsed.imageUrl,
        prompt: parsed.prompt || "",
        model: parsed.model || "",
      })
    }
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split(/\r?\n/)
    buffer = lines.pop() ?? ""

    for (const line of lines) {
      if (!line.trim() || !line.startsWith("data: ")) continue
      processDataLine(line.slice(6))
    }
  }

  buffer += decoder.decode()
  const finalLine = buffer.trim()
  if (finalLine.startsWith("data: ")) {
    processDataLine(finalLine.slice(6))
  }

  return { text: result, usage }
}

function resolveLocalModelOverrides(overrides?: { defaultModel?: string; imageModel?: string }): { textModel?: string; imageModel?: string } {
  return {
    textModel: overrides?.defaultModel,
    imageModel: overrides?.imageModel,
  }
}

export function useWorkflowRunner(options?: { onRunEvent?: (event: WorkflowRunEvent) => void }) {
  const onRunEvent = options?.onRunEvent
  const { getNodes, setNodes, setEdges, getEdges } = useReactFlow()
  const [state, setState] = useState<WorkflowRunnerState>({
    isRunning: false,
    currentStep: null,
    stepStatuses: {},
    error: null,
    progress: 0,
  })
  const abortRef = useRef(false)
  const runningNodeIdsRef = useRef<Set<string>>(new Set())
  const isMountedRef = useRef(true)

  useEffect(() => {
    isMountedRef.current = true
    return () => { isMountedRef.current = false }
  }, [])

  const updateNodeData = useCallback((nodeId: string, updates: Partial<CanvasNodeData>) => {
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id !== nodeId) return node
        return { ...node, data: { ...node.data, ...updates } }
      })
    )
  }, [setNodes])

  // ==========================================================================
  // EXECUTE SINGLE STEP
  // ==========================================================================
  const executeStep = useCallback(async (
    node: Node<CanvasNodeData>,
    allNodes: Node<CanvasNodeData>[],
    edges: Edge[],
    runContext?: RunContext,
    overridePrompt?: string,
  ): Promise<string> => {
    const kind = (node.data.nodeKind || "script") as CanvasNodeKind
    const stepLabel: string = node.data.title || String(kind)

    return await Sentry.startSpan(
      { op: "workflow.step.execute", name: stepLabel, attributes: { nodeKind: kind, nodeId: node.id } },
      async (span) => {
        // 如果组件已卸载，跳过后续所有操作
        if (!isMountedRef.current) return ""
        // Get upstream content from connected nodes
    const upstreamEdges = edges.filter((e) => e.target === node.id)
    const upstreamContent: string[] = []

    for (const edge of upstreamEdges) {
      const upstreamNode = allNodes.find((n) => n.id === edge.source)
      if (upstreamNode) {
        const d = upstreamNode.data
        upstreamContent.push(
          d.content || d.prompt || d.summary || d.instruction || ""
        )
      }
    }

    const upstreamText = upstreamContent.join("\n\n")
    const currentContent = overridePrompt ?? (node.data.content || node.data.prompt || "")

    // Resolve model names from config (respects .env.local + Local Override)
    const runtimeProvider = await getRuntimeProviderState()
    const localModels = resolveLocalModelOverrides(runtimeProvider.overrides ?? undefined)
    const [resolvedTextModel, resolvedImageModel] = await Promise.all([
      localModels.textModel ? Promise.resolve(localModels.textModel) : getDefaultModel(),
      localModels.imageModel ? Promise.resolve(localModels.imageModel) : getDefaultImageModel(),
    ])
    const provider = runtimeProvider.usageProvider

    // ------------------------------------------------------------------
    // TEXT MODEL STEP
    // ------------------------------------------------------------------
    if (isTextModelStep(kind)) {
      const startedAt = new Date().toISOString()
      const providerOverrides = runtimeProvider.overrides

      const runRequest = buildRunRequest({
        nodeKind: kind,
        taskType: "text",
        prompt: currentContent,
        upstreamContent: upstreamText || undefined,
        localDefaultModel: localModels.textModel,
        envDefaultModel: resolvedTextModel,
        providerOverrides: providerOverrides ? { ...providerOverrides } as Record<string, unknown> : undefined,
        systemOverride: getSystemPrompt(kind),
      })

      const model = runRequest.model
      const res = await fetch("/api/ai/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(runRequest),
      })

      if (!res.ok) {
        const text = await res.text().catch(() => "")
        const normalized = normalizeGenerationError({ status: res.status, body: text, provider })
        throw Object.assign(new Error(formatGenerationErrorForDisplay(normalized)), { generationError: normalized })
      }

      const reader = res.body?.getReader()
      if (!reader) throw new Error("No response stream")

      let streamedText = ""
      const { text, usage } = await readSSEStream(
        reader,
        (delta) => {
          streamedText += delta
          updateNodeData(node.id, {
            content: streamedText,
            runMeta: createRunningRunMeta({ runId: runContext?.runId, source: runContext?.source, message: "AI 生成中..." }),
            summary: streamedText.slice(0, 200) + (streamedText.length > 200 ? "..." : ""),
          })
        }
      )
      const finalResult = text || streamedText

      if (!finalResult.trim()) throw new Error("AI returned empty response")

      // ── Record AI usage ──────────────────────────────────
      const costUsd = estimateCostUsd({
        provider,
        model,
        taskType: "text",
        inputTokens: usage?.promptTokens,
        outputTokens: usage?.completionTokens,
      })

      appendAIUsageRecord({
        nodeId: node.id,
        runId: runContext?.runId,
        provider,
        model,
        taskType: "text",
        inputTokens: usage?.promptTokens,
        outputTokens: usage?.completionTokens,
        totalTokens: usage?.totalTokens,
        estimatedCostUsd: costUsd,
        startedAt,
        status: "success",
      })

      updateNodeData(node.id, {
        content: finalResult.trim(),
        prompt: finalResult.trim(),
        summary: finalResult.trim().slice(0, 200) + (finalResult.length > 200 ? "..." : ""),
        runMeta: createSucceededRunMeta({ runId: runContext?.runId, message: "Storyboard 生成完成" }),
      })

      // ---- Continuity Check (storyboard only) ----
      if (kind === "storyboard") {
        try {
          const { ContinuityGuard, formatContinuityReport } = await import("../utils/continuityGuard");
          const guard = new ContinuityGuard();

          let parsedScriptData: { scenes: { sceneId: string; characters: string[]; location: string; timeOfDay: string }[] } | null = null;
          let shotSequenceData: { shots: { shotId: string; sceneId: string; instructions: { fragments: { text: string; characterName?: string }[] } }[] } | null = null;

          // 1. Find upstream script node
          for (const edge of upstreamEdges) {
            const upstream = allNodes.find((n) => n.id === edge.source);
            if (upstream?.type === "script" || upstream?.type === "text") {
              const scriptContent = (upstream.data as CanvasNodeData)?.content || (upstream.data as CanvasNodeData)?.prompt || "";
              if (scriptContent.trim()) {
                try {
                  const parsed = JSON.parse(scriptContent) as ParsedScriptPayload;
                  if (Array.isArray(parsed.scenes)) {
                    parsedScriptData = {
                      scenes: parsed.scenes.map((s: ParsedSceneEntry, i: number) => ({
                        sceneId: s.sceneId || s.id || `scene_${i + 1}`,
                        characters: Array.isArray(s.characters) ? s.characters.map((c) => typeof c === "string" ? c : c?.name || "").filter(Boolean) : [],
                        location: s.location || "",
                        timeOfDay: s.timeOfDay || "",
                      }))
                    };
                  }
                } catch {}
              }
              break;
            }
          }

          // 2. Parse storyboard output as shotSequence
          try {
            const parsed = JSON.parse(finalResult.trim()) as ParsedScriptPayload;
            if (Array.isArray(parsed.scenes)) {
              const shots: { shotId: string; sceneId: string; instructions: { fragments: { text: string; characterName?: string }[] } }[] = [];
              for (const scene of parsed.scenes) {
                const sceneId = scene.sceneId || scene.id || "";
                if (Array.isArray(scene.shots)) {
                  for (const shot of scene.shots) {
                    shots.push({
                      shotId: shot.shotId || shot.id || `shot_${shots.length + 1}`,
                      sceneId,
                      instructions: {
                        fragments: [
                          { text: [shot.description, shot.action, shot.dialogue].filter(Boolean).join(" ") },
                          ...(shot.visualPrompt ? [{ text: shot.visualPrompt }] : []),
                        ],
                      },
                    });
                  }
                }
              }
              shotSequenceData = { shots };
            }
          } catch {}

          // 3. Run check and write results
          if (parsedScriptData && shotSequenceData) {
            const issues = guard.checkAllContinuity(parsedScriptData, shotSequenceData);
            const report = formatContinuityReport(issues);
            // 通过 setNodes 深层合并 runMeta（updateNodeData 只支持浅层更新）
            if (isMountedRef.current) {
            setNodes((nds) =>
              nds.map((n) => {
                if (n.id !== node.id) return n;
                return {
                  ...n,
                  data: {
                    ...n.data,
                    runMeta: {
                      ...(n.data?.runMeta || {}),
                      continuityChecked: true,
                      continuityIssues: issues,
                      continuityReport: report,
                    },
                  },
                };
              })
            );
            }
          }
        } catch (guardErr) {
          console.warn("[ContinuityGuard] 连续性检查失败，不影响主流程:", guardErr);
        }
      }

      return finalResult.trim()
    }

    // ------------------------------------------------------------------
    // IMAGE MODEL STEP
    // ------------------------------------------------------------------
    if (isImageModelStep(kind)) {
      const startedAt = new Date().toISOString()
      const providerOverrides = runtimeProvider.overrides

      // Cinematic enhancement (still needed as async call for upstream node walk)
      const baseImagePrompt = upstreamText || currentContent || "A cinematic scene"
      const cinematicPrompt = enhancePromptWithCinematicContext(baseImagePrompt, node.id, allNodes, edges)

      const runRequest = buildRunRequest({
        nodeKind: kind,
        taskType: "image",
        prompt: currentContent,
        upstreamContent: upstreamText || undefined,
        localImageModel: localModels.imageModel,
        envDefaultImageModel: resolvedImageModel,
        cinematicPrompt,
        providerOverrides: providerOverrides ? { ...providerOverrides } as Record<string, unknown> : undefined,
      })

      const model = runRequest.model
      const referenceImages = collectReferenceImageUrls(node, allNodes, edges)
      const finalPrompt = referenceImages.length > 0
        ? [
            runRequest.message,
            "",
            "Use the connected sketch/reference image(s) as composition and visual guidance. Preserve layout, blocking, camera angle, and action direction unless the prompt explicitly changes them.",
          ].join("\n")
        : runRequest.message

      const result = await generateImageFromPrompt({
        prompt: finalPrompt,
        model,
        size: "1792x1024",
        sourceImage: referenceImages.length > 0 ? referenceImages : undefined,
      })

      const imageUrl: string = result.imageUrl

      // Persist base64 image to IndexedDB before storing in node data
      let displayUrl = imageUrl
      let assetId: string | undefined = result.assetId
      if (imageUrl.startsWith("data:image")) {
        try {
          const persisted = await persistImageDataUrl(imageUrl, {
            fileName: `workflow-${Date.now()}.png`,
          })
          displayUrl = persisted.objectUrl
          assetId = persisted.assetId
        } catch (err) {
          console.error("[WorkflowRunner] Failed to persist generated image:", err)
          Sentry.captureException(err)
        }
      }

      // ── Record AI usage ──────────────────────────────────
      const costUsd = estimateCostUsd({
        provider,
        model,
        taskType: "image",
        imageCount: 1,
      })

      appendAIUsageRecord({
        nodeId: node.id,
        runId: runContext?.runId,
        provider,
        model,
        taskType: "image",
        imageCount: 1,
        estimatedCostUsd: costUsd,
        startedAt,
        status: "success",
      })

      // For image-generation node, create/update the image-result node
      if (kind === "image-generation") {
        const downstreamEdges = edges.filter((e) => e.source === node.id)
        const resultNodeId = downstreamEdges[0]?.target

        if (resultNodeId) {
          updateNodeData(resultNodeId, {
            imageUrl: displayUrl,
            generatedImageUrl: imageUrl,
            assetId,
            nodeKind: "ai-generated-image" as CanvasNodeKind,
            source: "generated" as const,
            persistence: assetId ? "indexeddb" as const : undefined,
            displayWidth: 280,
            displayHeight: 200,
            runMeta: createSucceededRunMeta({ runId: runContext?.runId, message: "图片已生成" }),
            summary: `已生成图片 (${finalPrompt.slice(0, 50)}...)`,
          })
        } else {
          // Create a new image-result node
          const newNode = {
            id: `node-${Date.now()}`,
            type: "image" as const,
            position: { x: node.position.x + 340, y: node.position.y },
            data: {
              title: "生成结果",
              imageUrl: displayUrl,
              generatedImageUrl: imageUrl,
              assetId,
              nodeKind: "ai-generated-image" as CanvasNodeKind,
              source: "generated" as const,
              persistence: assetId ? "indexeddb" as const : undefined,
              displayWidth: 280,
              displayHeight: 200,
              status: "done" as const,
              runMeta: createSucceededRunMeta({ runId: runContext?.runId, message: "图片已生成" }),
              createdAt: Date.now(),
            },
          }
          setNodes((nds) => [...nds, newNode])
          setEdges((eds) => [...eds, {
            id: `edge-${node.id}-${newNode.id}`,
            source: node.id,
            target: newNode.id,
            type: "creative",
            animated: true,
          }])
        }
      }

      updateNodeData(node.id, {
        status: "done",
        runMeta: createSucceededRunMeta({ runId: runContext?.runId, message: "图片已生成" }),
        summary: `图片已生成`,
      })

      return displayUrl
    }

    // ------------------------------------------------------------------
    // POSTER STEP (brief to generated poster image)
    // ------------------------------------------------------------------
    if (isPosterStep(kind)) {
      const subject = (node.data.content || node.data.prompt || node.data.instruction || upstreamText || "").trim()
      if (!subject) {
        const message = "AI 海报缺少主题，请在节点或上游文本中填写角色、片名、卖点或风格。"
        updateNodeData(node.id, {
          runMeta: createFailedRunMeta({ runId: runContext?.runId, error: message, message }),
          summary: message,
        })
        throw new Error(message)
      }

      updateNodeData(node.id, {
        status: "running",
        runMeta: createRunningRunMeta({ runId: runContext?.runId, source: runContext?.source, message: "正在生成 AI 海报..." }),
        summary: "正在生成 AI 海报...",
      })

      const result = await generatePoster({
        subject,
        posterType: (node.data as any).posterType,
        style: (node.data as any).style || node.data.model || "cinematic",
        extras: upstreamText,
      })
      const imageDataUrl = result.image.startsWith("data:image")
        ? result.image
        : `data:image/png;base64,${result.image}`
      let displayUrl = imageDataUrl
      let assetId: string | undefined
      try {
        const persisted = await persistImageDataUrl(imageDataUrl, { fileName: `poster-${Date.now()}.png` })
        displayUrl = persisted.objectUrl
        assetId = persisted.assetId
      } catch (err) {
        Sentry.captureException(err)
      }

      updateNodeData(node.id, {
        status: "done",
        imageUrl: displayUrl,
        resultUrl: displayUrl,
        assetId,
        source: "generated",
        persistence: assetId ? "indexeddb" : "remote",
        outputs: [{ label: "海报图", type: "image", url: displayUrl }],
        generationOutput: {
          status: "ready",
          imageUrl: displayUrl,
          assetId,
          posterType: result.posterType,
          prompt: result.prompt,
          revisedPrompt: result.revisedPrompt,
          aspectRatio: result.aspectRatio,
          size: result.size,
        },
        runMeta: createSucceededRunMeta({ runId: runContext?.runId, message: "AI 海报生成完成" }),
        summary: "AI 海报生成完成",
      })
      return displayUrl
    }

    if (isReversePromptStep(kind)) {
      let sourceImageUrl: string | undefined
      let sourceImageAssetId: string | undefined

      for (const edge of upstreamEdges) {
        if (sourceImageUrl) break
        const upstreamNode = allNodes.find((n) => n.id === edge.source)
        if (!upstreamNode) continue
        const ud = upstreamNode.data as CanvasNodeData | undefined
        const upstreamKind = String(ud?.nodeKind || upstreamNode.type || "")
        if (upstreamKind.includes("video") || upstreamKind.includes("audio")) continue

        const candidate =
          ud?.imageUrl ||
          ud?.resultUrl ||
          ud?.assetUrl ||
          ud?.thumbnailUrl
        if (candidate) {
          sourceImageUrl = candidate
          sourceImageAssetId = ud?.assetId
        }
      }

      if (!sourceImageUrl) {
        const message = "反推提示词缺少源图片，请连接上传图片、生成图片或视频抽帧节点。"
        updateNodeData(node.id, {
          runMeta: createFailedRunMeta({ runId: runContext?.runId, error: message, message }),
          summary: message,
        })
        throw new Error(message)
      }

      updateNodeData(node.id, {
        status: "running",
        runMeta: createRunningRunMeta({
          runId: runContext?.runId,
          source: runContext?.source,
          message: "正在分析参考图并反推提示词...",
        }),
        summary: "正在从图片反推生图提示词...",
      })

      try {
        const result = await reverseImagePrompt({
          imageUrl: sourceImageUrl,
          assetId: sourceImageAssetId,
        })
        const summary = [
          result.prompt,
          result.negativePrompt ? `Negative prompt: ${result.negativePrompt}` : "",
          typeof result.qualityScore === "number"
            ? `Quality score: ${result.qualityScore.toFixed(2)}`
            : "",
        ]
          .filter(Boolean)
          .join("\n\n")

        updateNodeData(node.id, {
          status: "done",
          nodeKind: "reverse-prompt",
          content: result.prompt,
          prompt: result.prompt,
          text: result.prompt,
          negativePrompt: result.negativePrompt,
          syncToAssetLibrary: true,
          assetLibraryType: "prompt",
          assetLibraryFolder: "Others",
          assetLibraryTags: ["reverse-prompt", "image-to-prompt", "prompt"],
          outputs: [{ label: "反推提示词", type: "prompt" }],
          generationOutput: {
            status: "ready",
            type: "reverse-prompt",
            prompt: result.prompt,
            negativePrompt: result.negativePrompt,
            qualityScore: result.qualityScore,
            language: result.language,
            sourceImageUrl,
            sourceNodeId: node.id,
            sourceImageAssetId,
          },
          runMeta: createSucceededRunMeta({
            runId: runContext?.runId,
            message: "反推提示词完成",
          }),
          summary,
        })
        return result.prompt
      } catch (error: any) {
        const message = error?.message || "反推提示词失败"
        updateNodeData(node.id, {
          status: "error",
          errorMessage: message,
          runMeta: createFailedRunMeta({
            runId: runContext?.runId,
            error: message,
            message,
          }),
          summary: message,
        })
        Sentry.captureException(error)
        throw error
      }
    }

    // ------------------------------------------------------------------
    // CAMERA CONTROL STEP (scene text to camera movement plan)
    // ------------------------------------------------------------------
    if (isCameraControlStep(kind)) {
      const sceneDescription = (node.data.content || node.data.prompt || node.data.instruction || upstreamText || "").trim()
      if (!sceneDescription) {
        const message = "摄影机控制缺少场景描述，请在节点或上游文本中填写画面、动作和情绪。"
        updateNodeData(node.id, {
          runMeta: createFailedRunMeta({ runId: runContext?.runId, error: message, message }),
          summary: message,
        })
        throw new Error(message)
      }

      updateNodeData(node.id, {
        status: "running",
        runMeta: createRunningRunMeta({ runId: runContext?.runId, source: runContext?.source, message: "正在规划摄影机运动..." }),
        summary: "正在规划摄影机运动...",
      })

      const result = await generateCameraControl(sceneDescription, {
        preset: (node.data as any).preset,
        useLLM: Boolean((node.data as any).useLLM),
      })
      const movements = result.plan.movements
        .map((movement) => `${movement.name}｜${movement.duration}｜${movement.description}`)
        .join("\n")
      const summary = `${result.plan.sceneMood}\n${movements}\n${result.plan.notes || ""}`.trim()

      updateNodeData(node.id, {
        status: "done",
        content: summary,
        summary,
        generationOutput: {
          status: "ready",
          plan: result.plan,
          source: result.source,
        },
        runMeta: createSucceededRunMeta({ runId: runContext?.runId, message: "摄影机控制规划完成" }),
      })
      return summary
    }

    // ------------------------------------------------------------------
    // REMIX ANALYSIS STEP (reference description to reusable structure)
    // ------------------------------------------------------------------
    if (isRemixAnalysisStep(kind)) {
      const videoDescription = (node.data.content || node.data.prompt || node.data.instruction || upstreamText || "").trim()
      if (!videoDescription) {
        const message = "参考视频结构分析缺少视频描述、链接或关键帧摘要。"
        updateNodeData(node.id, {
          runMeta: createFailedRunMeta({ runId: runContext?.runId, error: message, message }),
          summary: message,
        })
        throw new Error(message)
      }

      updateNodeData(node.id, {
        status: "running",
        runMeta: createRunningRunMeta({ runId: runContext?.runId, source: runContext?.source, message: "正在拆解参考视频结构..." }),
        summary: "正在拆解参考视频结构...",
      })

      const result = await analyzeRemix(videoDescription, {
        templateId: (node.data as any).templateId,
        category: (node.data as any).category,
        useLLM: Boolean((node.data as any).useLLM),
      })
      const structure = result.template.structure
        .map((step) => `${step.timestamp} ${step.type}: ${step.description}`)
        .join("\n")
      const summary = `${result.template.name}\n${result.template.hookPattern}\n${structure}`.trim()

      updateNodeData(node.id, {
        status: "done",
        content: summary,
        summary,
        generationOutput: {
          status: "ready",
          result,
        },
        runMeta: createSucceededRunMeta({ runId: runContext?.runId, message: "参考视频结构拆解完成" }),
      })
      return summary
    }

    // ------------------------------------------------------------------
    // VIDEO SAMPLE FRAMES (real browser extraction)
    // ------------------------------------------------------------------
    if (isVideoSampleFramesStep(kind)) {
      const videoSources = collectWorkflowVideoSources(node, allNodes, edges)
      const sourceVideo = videoSources[0]

      if (!sourceVideo) {
        const message = "未找到真实视频素材，请先连接上传视频或视频生成结果。"
        updateNodeData(node.id, {
          runMeta: createFailedRunMeta({
            runId: runContext?.runId,
            error: "未找到真实视频素材",
            message: "请先连接上传视频或视频生成结果",
          }),
          summary: "请先连接视频素材节点，再运行真实抽帧。",
        })
        throw new Error(message)
      }

      updateNodeData(node.id, {
        runMeta: createRunningRunMeta({
          runId: runContext?.runId,
          source: runContext?.source,
          message: "正在读取视频并抽取关键帧...",
        }),
      })

      const frames = await extractWorkflowVideoFrames(sourceVideo, {
        count: 4,
        maxFrames: 6,
        sceneDetection: true,
      })

      updateNodeData(node.id, {
        runMeta: createSucceededRunMeta({ runId: runContext?.runId, message: `已抽取 ${frames.length} 帧` }),
        summary: `已从「${sourceVideo.name ?? "视频素材"}」抽取 ${frames.length} 个真实关键帧`,
        generationOutput: {
          frames,
          images: frames.map(f => f.imageUrl),
          sourceVideo,
          mode: "real-browser-extraction",
        },
        outputs: [{ label: "抽帧结果", type: "image" }],
      })

      return `已从真实视频抽取 ${frames.length} 个关键帧`
    }

    // ------------------------------------------------------------------
    // VIDEO ANALYZE (real local frame analysis)
    // ------------------------------------------------------------------
    if (isVideoAnalyzeStep(kind)) {
      // 从上一步的 generationOutput 中提取关键帧
      const upstreamNodes = allNodes.filter(n =>
        upstreamEdges.some(e => e.source === n.id),
      )

      let keyframes: VideoKeyframeRef[] = []

      for (const upNode of upstreamNodes) {
        const genOut = upNode.data.generationOutput as any
        if (genOut?.frames && Array.isArray(genOut.frames) && genOut.frames.length > 0) {
          keyframes = genOut.frames
          break
        }
      }

      if (keyframes.length === 0) {
        const sourceVideo = collectWorkflowVideoSources(node, allNodes, edges)[0]
        if (sourceVideo) {
          updateNodeData(node.id, {
            runMeta: createRunningRunMeta({
              runId: runContext?.runId,
              source: runContext?.source,
              message: "未找到上游关键帧，正在从视频素材抽帧...",
            }),
          })
          keyframes = await extractWorkflowVideoFrames(sourceVideo, {
            count: 4,
            maxFrames: 6,
            sceneDetection: true,
          })
        }
      }

      if (keyframes.length === 0) {
        const message = "未检测到关键帧，请先连接视频抽帧节点或视频素材。"
        updateNodeData(node.id, {
          runMeta: createFailedRunMeta({
            runId: runContext?.runId,
            error: "未检测到关键帧",
            message,
          }),
          summary: message,
        })
        throw new Error(message)
      }

      const result = await analyzeVideoKeyframes(keyframes)

      updateNodeData(node.id, {
        runMeta: createSucceededRunMeta({ runId: runContext?.runId, message: "本地视频分析完成" }),
        content: result.summary,
        prompt: result.summary,
        summary: result.summary.slice(0, 200),
        generationOutput: result,
        outputs: [{ label: "分析结果", type: "text" }],
      })

      const existingStoryboardDrafts = allNodes.filter(
        (candidate) =>
          candidate.data?.sourceType === "reference-video" &&
          candidate.data?.sourceMeta?.videoAnalysisNodeId === node.id,
      )
      const draftShots = buildStoryboardDraftFromVideoAnalysis(result, {
        videoAnalysisNodeId: node.id,
        sourceTitle: node.data.title || "视频分析",
        maxShots: 8,
      })

      if (draftShots.length > 0 && existingStoryboardDrafts.length === 0) {
        const draftNodes = importStoryboardDraftToCanvas(draftShots, {
          columns: 4,
          baseX: node.position.x,
          baseY: node.position.y + 260,
          existingNodeCount: 0,
        }).map((draftNode) => ({
          ...draftNode,
          selected: true as const,
          data: {
            ...draftNode.data,
            title: draftNode.data.title || "参考视频镜头",
            role: "video-analysis-storyboard-draft",
            isStoryboardProcessNode: true,
            sourceType: "reference-video",
            sourceMeta: {
              ...(draftNode.data.sourceMeta ?? {}),
              videoAnalysisNodeId: node.id,
              runId: runContext?.runId,
            },
          },
        }))
        const draftEdges = draftNodes.map((draftNode) => ({
          id: `edge-${node.id}-${draftNode.id}`,
          source: node.id,
          target: draftNode.id,
          type: "creative",
          animated: false,
          data: { relation: "video-analysis-storyboard-draft" },
        }))

        setNodes((nds) => [
          ...nds.map((existing) => ({ ...existing, selected: false })),
          ...draftNodes,
        ])
        setEdges((eds) => [
          ...eds,
          ...draftEdges.filter((edge) => !eds.some((existing) => existing.id === edge.id)),
        ])
      }

      return result.summary
    }

    // ------------------------------------------------------------------
    // AGENT STEP (Phase 1: DirectorAgent — story breakdown)
    // P0-2: 支持自动重试（最多 2 次，指数退避 + jitter）
    // ------------------------------------------------------------------
    if (kind === "agent") {
      const input = node.data.content ?? ""
      if (!input.trim()) {
        updateNodeData(node.id, {
          runMeta: createFailedRunMeta({ runId: runContext?.runId, error: "Agent 输入为空", message: "请先在 Agent 节点粘贴剧本文本" }),
          summary: "请输入剧本后重新运行",
        })
        return ""
      }

      const _providerOverrides = runtimeProvider.overrides

      // ── P2-7: Multi-Agent Film Crew Pipeline ──
      // 使用 7 角色 Agent 系统（DEV PLAN.md 设计）替代单一 DirectorAgent
      // Agent 角色：Writer → StoryboardArtist → Cinematographer → Director → PromptEngineer → ProductionDesigner → Router
      const agentPrompt = `你是一个专业的影视 AI 团队，包含以下 7 个专门角色协同工作：

【编剧 Writer】
- 分析剧本结构，提取角色关系和叙事弧线
- 为每个角色创建详细设定（外观、性格、动机）

【分镜师 Storyboard Artist】
- 将剧本拆解为结构化的分镜方案
- 识别场景边界（地点变化、时间跳跃、人物关系变化）
- 为每个场景标注地点、时间、出场角色、场景功能

【摄影师 Cinematographer】
- 为每个镜头指定景别（extreme-wide/wide/medium/close-up/extreme-close-up）
- 指定机位（eye-level/low-angle/high-angle/dutch/over-shoulder/POV）
- 指定运镜方式（static/push-in/tracking/handheld/steadicam/drone等）
- 遵守 180 度轴线规则

【导演 Director】
- 把控叙事节奏和视觉风格方向
- 设计情绪曲线（calm/tense/fear/anger/joy/sadness/intimacy/isolation/suspense/revelation）
- 确保每个场景有 start → peak → end 的情绪变化

【Prompt 工程师 Prompt Engineer】
- 为每个镜头生成可直接用于 AI 生图的 visualPrompt（英文）
- 生成 negativePrompt 避免常见画面错误

【美术指导 Production Designer】
- 设计色彩方案和灯光方案
- 确保场景间视觉连贯性

【路由 Router】
- 协调各 Agent 间数据传递
- 确保完整输出链路

请按以下 JSON 格式输出完整分镜方案：

{
  "title": "作品标题",
  "characters": [
    {
      "name": "角色名",
      "description": "详细外观描述（年龄/身高/体型/发型/面部特征/服装）",
      "role": "主角/配角/群演",
      "traits": ["性格特征1", "性格特征2"]
    }
  ],
  "scenes": [
    {
      "sceneNumber": 1,
      "location": "场景地点",
      "timeOfDay": "日/夜/黄昏/清晨",
      "mood": "整体氛围",
      "emotionalCurve": { "start": "calm", "peak": "tense", "end": "suspense" },
      "colorPalette": ["#色值1", "#色值2", "#色值3"],
      "lighting": "灯光方案描述",
      "shots": [
        {
          "shotNumber": 1,
          "shotType": "远景/全景/中景/近景/特写/大特写",
          "cameraAngle": "平视/低角度/高角度/荷兰角/过肩/POV",
          "cameraMovement": "固定/推近/拉远/横摇/竖摇/跟拍/手持/稳定器/无人机",
          "description": "详细的画面描述（含构图、光线、情绪）",
          "dialogue": "对白（如有）",
          "action": "角色动作和调度描述",
          "duration": "预估秒数",
          "visualPrompt": "英文 AI 生图提示词",
          "negativePrompt": "英文负面提示词"
        }
      ]
    }
  ]
}

关键规则：
1. 每个场景至少 2 个分镜
2. 角色描述要具体到可用于 AI 生图（面部特征、体型、服装细节）
3. visualPrompt 和 negativePrompt 必须是英文
4. 相邻镜头景别要有节奏变化
5. 情绪曲线避免连续多个镜头情绪不变
6. 只输出 JSON，不要其他文字`

      // ── P0-2: Agent 重试循环 ──────────────────────────────
      const MAX_AGENT_RETRIES = 2
      let lastError: Error | null = null
      let finalOutput = ""

      for (let attempt = 0; attempt <= MAX_AGENT_RETRIES; attempt++) {
        const isRetry = attempt > 0
        const attemptLabel = isRetry ? `Agent 重试第 ${attempt} 次...` : "Agent 分析中..."

        updateNodeData(node.id, {
          runMeta: createRunningRunMeta({
            runId: runContext?.runId,
            source: runContext?.source,
            message: attemptLabel,
          }),
          summary: isRetry ? `正在重新分析... (第 ${attempt} 次重试)` : "正在分析剧本...",
        })

        // 重试时添加 jitter 延迟（500ms/1000ms/2000ms）
        if (isRetry) {
          const jitterMs = 500 * Math.pow(2, attempt - 1) + Math.random() * 300
          await new Promise((resolve) => setTimeout(resolve, jitterMs))
        }

        try {
          const runRequest = buildRunRequest({
            nodeKind: kind,
            taskType: "text",
            prompt: input,
            upstreamContent: upstreamText || undefined,
            localDefaultModel: localModels.textModel,
            envDefaultModel: resolvedTextModel,
            providerOverrides: _providerOverrides ? { ..._providerOverrides } as Record<string, unknown> : undefined,
            systemOverride: isRetry
              ? `${agentPrompt}\n\n【重要】上一次输出格式不正确或解析失败。请严格遵循 JSON 格式，确保所有必填字段完整。`
              : agentPrompt,
          })

          const res = await fetch("/api/ai/chat/stream", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(runRequest),
          })

          if (!res.ok) {
            const text = await res.text().catch(() => "")
            const normalized = normalizeGenerationError({ status: res.status, body: text, provider })
            const err = Object.assign(new Error(formatGenerationErrorForDisplay(normalized)), { generationError: normalized })
            // Only retry on 5xx / 429, not on 4xx
            if (res.status >= 500 || res.status === 429) {
              if (attempt < MAX_AGENT_RETRIES) { lastError = err; continue }
            }
            throw err
          }

          const reader = res.body?.getReader()
          if (!reader) {
            const err = new Error("Agent 无响应流")
            if (attempt < MAX_AGENT_RETRIES) { lastError = err; continue }
            throw err
          }

          let fullOutput = ""
          const { text: resultText, usage } = await readSSEStream(reader, (delta) => {
            fullOutput += delta
            updateNodeData(node.id, {
              agentOutput: fullOutput,
              summary: fullOutput.slice(0, 200) + (fullOutput.length > 200 ? "..." : ""),
              runMeta: createRunningRunMeta({
                runId: runContext?.runId,
                source: runContext?.source,
                message: isRetry ? `Agent 重试分析中...` : "Agent 分析中...",
              }),
            })
          })

          finalOutput = resultText || fullOutput
          if (!finalOutput.trim()) {
            const err = new Error("Agent 返回空结果")
            if (attempt < MAX_AGENT_RETRIES) { lastError = err; continue }
            throw err
          }

          // ── P0-3: 尝试 JSON 解析以验证输出 ──
          // 解析失败也触发重试（可能是格式问题）
          try {
            JSON.parse(finalOutput.trim())
          } catch {
            const err = new Error("Agent 输出非有效 JSON")
            if (attempt < MAX_AGENT_RETRIES) { lastError = err; continue }
            throw err
          }

          // Success — break out of retry loop
          break
        } catch (err) {
          lastError = err instanceof Error ? err : new Error(String(err))
          if (attempt >= MAX_AGENT_RETRIES) throw lastError
          // Otherwise continue to next retry attempt
        }
      }

      // ── Retries exhausted? ──
      if (!finalOutput.trim() && lastError) {
        throw lastError
      }

      // Store structured output and mark done
      updateNodeData(node.id, {
        agentOutput: finalOutput,
        agentStatus: "done",
        runMeta: createSucceededRunMeta({ runId: runContext?.runId, message: "剧本分析完成" }),
        summary: `已生成 ${(finalOutput.match(/"sceneNumber"/g) || []).length} 个场景`,
        content: finalOutput,
      })

      // ── Record AI usage ──
      const agentEndedAt = new Date().toISOString()
      appendAIUsageRecord({
        nodeId: node.id,
        runId: runContext?.runId,
        provider,
        model: "agent-model",
        taskType: "text",
        estimatedCostUsd: estimateCostUsd({ provider, model: "agent-model", taskType: "text" }),
        startedAt: agentEndedAt,
        status: "success",
      })

      // ── Phase 2: auto-orchestrate — parse Agent JSON → create node chain ──
      try {
        const plan = JSON.parse(finalOutput)

        const newNodes: Node<CanvasNodeData>[] = []
        const newEdges: Edge[] = []

        // For each character → ContentNode
        if (Array.isArray(plan.characters)) {
          plan.characters.forEach((char: Record<string, unknown>, i: number) => {
            const charId = `agent-char-${node.id}-${i}`
            newNodes.push({
              id: charId,
              type: "content",
              position: { x: 0, y: 0 },
              data: {
                nodeKind: "text" as CanvasNodeKind,
                title: `角色: ${char.name ?? ""}`,
                content: `【${char.role ?? ""}】${char.name ?? ""}\n\n${char.description ?? ""}`,
                createdAt: Date.now(),
              },
            })
            newEdges.push({
              id: `e-${node.id}-${charId}`,
              source: node.id,
              target: charId,
              type: "creative",
              animated: false,
              style: { stroke: "rgba(168, 85, 247, 0.3)", strokeWidth: 1.5 },
            })
          })
        }

        // For each scene.shot → ContentNode (shot details)
        if (Array.isArray(plan.scenes)) {
          plan.scenes.forEach((scene: Record<string, unknown>) => {
            const shots = scene.shots as Array<Record<string, unknown>> ?? []
            shots.forEach((shot: Record<string, unknown>, j: number) => {
              const shotId = `agent-shot-${node.id}-${String(scene.sceneNumber ?? "")}-${j}`
              const shotLabel = `S${scene.sceneNumber ?? "?"}_SHOT${shot.shotNumber ?? j + 1}`
              const shotDesc = [
                `【分镜 ${shotLabel}】`,
                shot.description ?? "",
                shot.dialogue ? `对白: ${shot.dialogue}` : "",
                shot.action ? `动作: ${shot.action}` : "",
                `景别: ${shot.shotType ?? ""}  运镜: ${shot.cameraMovement ?? ""}  时长: ${shot.duration ?? ""}s`,
                `氛围: ${scene.mood ?? ""}  时段: ${scene.timeOfDay ?? ""}`,
              ].filter(Boolean).join("\n")

              newNodes.push({
                id: shotId,
                type: "content",
                position: { x: 0, y: 0 },
                data: {
                  nodeKind: "shot" as CanvasNodeKind,
                  title: shotLabel,
                  content: shotDesc,
                  prompt: `Generate a storyboard image for: ${shot.description ?? ""}. ${shot.shotType ?? ""} shot, ${shot.cameraMovement ?? ""} camera movement.`,
                  createdAt: Date.now(),
                },
              })
              newEdges.push({
                id: `e-${node.id}-${shotId}`,
                source: node.id,
                target: shotId,
                type: "creative",
                animated: false,
                style: { stroke: "rgba(168, 85, 247, 0.3)", strokeWidth: 1.5 },
              })
            })
          })
        }

        if (newNodes.length > 0) {
          const currentNodes = getNodes()
          const currentEdges = getEdges()

          // Only layout new nodes (don't reposition existing ones)
          const layoutedNew = quickLayout(newNodes, newEdges, 3)

          // Find bottom edge of existing canvas content
          const maxExistingY = currentNodes.reduce(
            (max, n) => Math.max(max, n.position.y + (n.measured?.height ?? 200)),
            0,
          )
          const existingMinX = currentNodes.reduce(
            (min, n) => Math.min(min, n.position.x),
            Infinity,
          )
          const offsetX = Number.isFinite(existingMinX) ? existingMinX : 100

          // Position new nodes below existing content
          const positioned = layoutedNew.map((n) => ({
            ...n,
            position: {
              x: n.position.x + offsetX,
              y: n.position.y + maxExistingY + 100,
            },
          }))

          const allNodes = [...currentNodes, ...positioned]

          // Mark agent-created nodes as selected
          const newIds = new Set(newNodes.map((n) => n.id))
          const allWithSelection = allNodes.map((n) =>
            newIds.has(n.id) ? { ...n, selected: true as const } : n,
          )
          setNodes(allWithSelection)
          setEdges([...currentEdges, ...newEdges])

          // Write child node IDs back to the agent node (for batch-generate button)
          const childIds = newNodes.map((nn) => nn.id)
          setNodes((nds) =>
            nds.map((n) =>
              n.id === node.id
                ? { ...n, data: { ...n.data, _childNodeIds: childIds } }
                : n,
            ),
          )
        }
      } catch (parseErr) {
        console.warn("[Agent] auto-orchestrate failed (JSON parse), Agent output still displayed:", parseErr)
        Sentry.captureException(parseErr)
      }

      return finalOutput
    }

    // ------------------------------------------------------------------
    // VIDEO GENERATION STEP (image-to-video)
    // ------------------------------------------------------------------
    if (isVideoGenerationStep(kind)) {
      const startedAt = new Date().toISOString()

      // Find upstream image node for the source image
      let sourceImageUrl: string | undefined
      let blockedBlobUrl: string | undefined
      for (const edge of upstreamEdges) {
        const upstreamNode = allNodes.find((n) => n.id === edge.source)
        if (upstreamNode) {
          const ud = upstreamNode.data as CanvasNodeData | undefined
          const selected = await resolveProviderReadableVideoSourceImage(ud, {
            bridgeLocalAssetToProviderUrl: async ({ assetId, imageUrl }) => {
              return imageUrlToBase64(imageUrl, assetId)
            },
          })
          if (selected.url) { sourceImageUrl = selected.url; break }
          if (!blockedBlobUrl) blockedBlobUrl = selected.blockedBlobUrl
        }
      }

      if (!sourceImageUrl) {
        throw new VideoGenerationError({
          message: blockedBlobUrl
            ? "上游图片只有本地预览地址，且未找到可桥接的原始图片资产。请重新上传该图片，或使用已生成的原始图片结果。"
            : "未找到上游图片节点，请先连接一个图片结果节点（image-result）到视频生成节点。",
          code: "INVALID_IMAGE",
          retryable: false,
        })
      }

      const motionPrompt = (node.data as CanvasNodeData).prompt
        || (node.data as CanvasNodeData).content
        || upstreamText
        || ""

      // Update node to generating state
      updateNodeData(node.id, {
        status: "running",
        runMeta: createRunningRunMeta({ runId: runContext?.runId, source: runContext?.source, message: "视频生成中..." }),
        summary: "正在生成视频...",
      })

      try {
        const result = await generateVideoFromImage(
          buildVideoGenerationInput({
            imageUrl: sourceImageUrl,
            motionPrompt: motionPrompt || undefined,
            backend: process.env.NEXT_PUBLIC_VIDEO_BACKEND as VideoGenBackend || undefined,
          }),
          (progress) => {
            updateNodeData(node.id, {
              summary: `${progress.message} (${progress.percent}%)`,
              runMeta: createRunningRunMeta({
                runId: runContext?.runId,
                source: runContext?.source,
                message: `${progress.message} (${progress.percent}%)`,
              }),
            })
          },
        )

        // Write result data to node
        const nodePatch = videoResultToNodeData(result)
        updateNodeData(node.id, {
          ...nodePatch,
          runMeta: createSucceededRunMeta({ runId: runContext?.runId, message: "视频生成完成" }),
        })

        // Record usage
        appendAIUsageRecord({
          nodeId: node.id,
          runId: runContext?.runId,
          provider,
          model: result.backend,
          taskType: "video",
          videoSeconds: result.durationSeconds,
          startedAt,
          status: "success",
        })

        return JSON.stringify(nodePatch)
      } catch (error: any) {
        const errMsg = error instanceof VideoGenerationError
          ? error.message
          : `视频生成失败：${error?.message || "未知错误"}`

        updateNodeData(node.id, {
          status: "error",
          errorMessage: errMsg,
          runMeta: createFailedRunMeta({ error: errMsg, runId: runContext?.runId, message: errMsg }),
        })

        // Record failed usage
        appendAIUsageRecord({
          nodeId: node.id,
          runId: runContext?.runId,
          provider,
          model: (error instanceof VideoGenerationError ? "video-error" : "video-generation"),
          taskType: "video",
          videoSeconds: 5,
          startedAt,
          status: "failed",
          error: errMsg,
        })

        throw error
      }
    }

    // ------------------------------------------------------------------
    // TTS STEP (audio)
    // ------------------------------------------------------------------
    if (isTtsStep(kind)) {
      try {
        // 1. 从节点数据中获取文本和声音描述
        const text = node.data.content || ""
        const voiceDescription = (node.data as any).voiceDescription || 
          node.data.shot?.voiceConfig?.instruct || ""

        if (!text.trim()) {
          throw new Error("文本为空，无法生成配音")
        }

        updateNodeData(node.id, {
          runMeta: createRunningRunMeta({ runId: runContext?.runId, message: "语音合成中..." }),
        })

        const { generateTts, ttsResultToNodeData } = await import("../utils/ttsService")

        const input = {
          text: text.trim(),
          voiceDescription: voiceDescription || undefined,
        }

        const result = await generateTts(input, (progress) => {
          // 更新进度（通过 message 传递进度信息）
          updateNodeData(node.id, {
            runMeta: createRunningRunMeta({
              runId: runContext?.runId,
              message: `语音合成中... ${progress.percent}%`,
            }),
          })
        })

        const nodeData = ttsResultToNodeData(result)
        
        updateNodeData(node.id, {
          ...nodeData,
          content: text.trim(),
          runMeta: createSucceededRunMeta({
            runId: runContext?.runId,
            message: `配音已生成 (${(result.durationMs / 1000).toFixed(1)}s, ${result.backend})`,
          }),
        })

        return result.audioBase64
      } catch (error: any) {
        updateNodeData(node.id, {
          runMeta: createFailedRunMeta({
            runId: runContext?.runId,
            error: error.message || "TTS 生成失败",
          }),
        })
        Sentry.captureException(error)
        return ""
      }
    }

    // ------------------------------------------------------------------
    // TALKING PHOTO STEP (image + text/audio to talking video)
    // ------------------------------------------------------------------
    if (isTalkingPhotoStep(kind)) {
      let sourceImageUrl: string | undefined
      let sourceImageAssetId: string | undefined
      let audioUrl: string | undefined
      let audioAssetId: string | undefined
      const textInputs: string[] = []

      for (const edge of upstreamEdges) {
        const upstreamNode = allNodes.find((n) => n.id === edge.source)
        if (!upstreamNode) continue
        const ud = upstreamNode.data as CanvasNodeData | undefined
        const upstreamKind = ud?.nodeKind || upstreamNode.type

        if (!sourceImageUrl) {
          const imgUrl = ud?.imageUrl || ud?.resultUrl || ud?.assetUrl || ud?.thumbnailUrl
          if (imgUrl && !String(upstreamKind).includes("video") && !String(upstreamKind).includes("audio")) {
            sourceImageUrl = imgUrl
            sourceImageAssetId = ud?.assetId
          }
        }

        if (!audioUrl && (String(upstreamKind).includes("audio") || upstreamKind === "tts")) {
          const audioData = ud as (CanvasNodeData & {
            voiceAudioUrl?: string
            voiceAudioAssetId?: string
            audioUrl?: string
            audioAssetId?: string
          }) | undefined
          audioUrl = audioData?.resultUrl || audioData?.assetUrl || audioData?.audioUrl || audioData?.voiceAudioUrl
          audioAssetId = audioData?.audioAssetId || audioData?.voiceAudioAssetId || audioData?.assetId
        }

        const text = ud?.content || ud?.prompt || ud?.summary || ud?.text || ""
        if (text.trim()) textInputs.push(text.trim())
      }

      if (!sourceImageUrl) {
        const message = "数字人缺少角色头像，请连接上传图片或生成图片节点。"
        updateNodeData(node.id, {
          runMeta: createFailedRunMeta({ runId: runContext?.runId, error: message, message }),
          summary: message,
        })
        throw new Error(message)
      }

      const talkingText = (node.data.content || node.data.prompt || textInputs.join("\n\n")).trim()
      if (!audioUrl && !talkingText) {
        const message = "数字人缺少口播台词，请在节点或上游文本节点输入文案。"
        updateNodeData(node.id, {
          runMeta: createFailedRunMeta({ runId: runContext?.runId, error: message, message }),
          summary: message,
        })
        throw new Error(message)
      }

      updateNodeData(node.id, {
        runMeta: createRunningRunMeta({ runId: runContext?.runId, source: runContext?.source, message: "正在提交数字人生成任务..." }),
        summary: "正在生成照片说话视频...",
      })

      try {
        const result = await requestTalkingPhoto({
          imageUrl: sourceImageUrl,
          imageAssetId: sourceImageAssetId,
          text: talkingText || undefined,
          audioUrl,
          audioAssetId,
          mode: "lip-sync",
          audioSource: audioUrl ? "upload" : "text-to-speech",
        })

        if (result.status === "not_ready") {
          updateNodeData(node.id, {
            runMeta: createFailedRunMeta({
              runId: runContext?.runId,
              error: result.message,
              message: `${result.message}。请部署 MuseTalk/SadTalker 或接入 D-ID/HeyGen 后重试。`,
            }),
            summary: result.message,
            generationOutput: {
              status: "not_ready",
              guide: result.guide,
              recommendedNextSteps: result.recommendedNextSteps,
            },
          })
          throw Object.assign(new Error(result.message), { partialText: result.message })
        }

        updateNodeData(node.id, {
          status: "done",
          resultUrl: result.videoUrl,
          imageUrl: result.videoUrl,
          videoDurationMs: result.durationMs,
          outputs: [{ label: "口播视频", type: "video", url: result.videoUrl }],
          generationOutput: {
            status: "ready",
            videoUrl: result.videoUrl,
            durationMs: result.durationMs,
            text: talkingText,
          },
          runMeta: createSucceededRunMeta({ runId: runContext?.runId, message: result.message ?? "数字人视频生成完成" }),
          summary: "数字人视频生成完成",
        })
        return result.videoUrl
      } catch (error: any) {
        const message = error?.message || "数字人生成失败"
        updateNodeData(node.id, {
          status: "error",
          errorMessage: message,
          runMeta: createFailedRunMeta({ runId: runContext?.runId, error: message, message }),
          summary: message,
        })
        Sentry.captureException(error)
        throw error
      }
    }

    // ------------------------------------------------------------------
    // FOCUS EDIT STEP (masked image edit)
    // ------------------------------------------------------------------
    if (isFocusEditStep(kind)) {
      let sourceImageUrl: string | undefined
      let sourceImageAssetId: string | undefined

      for (const edge of upstreamEdges) {
        if (sourceImageUrl) break
        const upstreamNode = allNodes.find((n) => n.id === edge.source)
        if (!upstreamNode) continue
        const ud = upstreamNode.data as CanvasNodeData | undefined
        const upstreamKind = String(ud?.nodeKind || upstreamNode.type || "")
        if (upstreamKind.includes("video") || upstreamKind.includes("audio")) continue

        const candidate = ud?.imageUrl || ud?.resultUrl || ud?.assetUrl || ud?.thumbnailUrl
        if (candidate) {
          sourceImageUrl = candidate
          sourceImageAssetId = ud?.assetId
        }
      }

      const ownImageUrl = node.data.imageUrl || node.data.resultUrl || node.data.assetUrl || node.data.thumbnailUrl
      if (!sourceImageUrl && ownImageUrl) {
        sourceImageUrl = ownImageUrl
        sourceImageAssetId = node.data.assetId
      }

      if (!sourceImageUrl) {
        const message = "局部精修缺少源图片，请连接上传图片、生成图片或视频抽帧节点。"
        updateNodeData(node.id, {
          runMeta: createFailedRunMeta({ runId: runContext?.runId, error: message, message }),
          summary: message,
        })
        throw new Error(message)
      }

      const maskDataUrl = node.data.focusEditMaskDataUrl || node.data.maskDataUrl
      if (!maskDataUrl) {
        const message = "局部精修缺少蒙版，请先在图片上涂抹要修改的区域。"
        updateNodeData(node.id, {
          runMeta: createFailedRunMeta({ runId: runContext?.runId, error: message, message }),
          summary: message,
        })
        throw new Error(message)
      }

      const editInstruction = (
        node.data.instruction ||
        node.data.prompt ||
        node.data.content ||
        upstreamText ||
        ""
      ).trim()
      if (!editInstruction) {
        const message = "局部精修缺少修改描述，请在节点中填写 prompt 或 instruction。"
        updateNodeData(node.id, {
          runMeta: createFailedRunMeta({ runId: runContext?.runId, error: message, message }),
          summary: message,
        })
        throw new Error(message)
      }

      updateNodeData(node.id, {
        status: "running",
        runMeta: createRunningRunMeta({ runId: runContext?.runId, source: runContext?.source, message: "正在提交局部精修任务..." }),
        summary: "正在按蒙版精修图片...",
      })

      const startedAt = new Date().toISOString()
      const model = node.data.model || resolvedImageModel || "gpt-image-2"

      try {
        const result = await applyFocusEdit({
          imageUrl: sourceImageUrl,
          sourceAssetId: node.data.sourceImageAssetId ?? sourceImageAssetId,
          maskDataUrl,
          prompt: editInstruction,
          model,
          requestId: `focus-edit-${node.id}-${Date.now()}`,
        })

        const costUsd = estimateCostUsd({
          provider,
          model: result.model || model,
          taskType: "image",
          imageCount: 1,
        })

        appendAIUsageRecord({
          nodeId: node.id,
          runId: runContext?.runId,
          provider,
          model: result.model || model,
          taskType: "image",
          imageCount: 1,
          estimatedCostUsd: costUsd,
          startedAt,
          status: "success",
        })

        updateNodeData(node.id, {
          status: "done",
          imageUrl: result.imageUrl,
          resultUrl: result.imageUrl,
          assetId: result.assetId,
          source: "generated",
          persistence: result.assetId ? "indexeddb" : "remote",
          sourceImageAssetId: sourceImageAssetId ?? node.data.sourceImageAssetId,
          outputs: [{ label: "精修图片", type: "image", url: result.imageUrl }],
          generationOutput: {
            status: "ready",
            imageUrl: result.imageUrl,
            assetId: result.assetId,
            sourceImageUrl,
            instruction: editInstruction,
            requestId: result.requestId,
            attempts: result.attempts,
            model: result.model || model,
          },
          runMeta: createSucceededRunMeta({ runId: runContext?.runId, message: "局部精修完成" }),
          summary: "局部精修完成",
        })
        return result.imageUrl
      } catch (error: any) {
        const message = error?.message || "局部精修失败"
        updateNodeData(node.id, {
          status: "error",
          errorMessage: message,
          runMeta: createFailedRunMeta({ runId: runContext?.runId, error: message, message }),
          summary: message,
        })
        Sentry.captureException(error)
        throw error
      }
    }

    // ------------------------------------------------------------------
    // UPSCALE STEP (image to HD image)
    // ------------------------------------------------------------------
    if (isUpscaleStep(kind)) {
      let sourceImageUrl: string | undefined
      let sourceImageAssetId: string | undefined

      const ownImageUrl = node.data.imageUrl || node.data.resultUrl || node.data.assetUrl || node.data.thumbnailUrl
      if (ownImageUrl) {
        sourceImageUrl = ownImageUrl
        sourceImageAssetId = node.data.assetId
      }

      for (const edge of upstreamEdges) {
        if (sourceImageUrl) break
        const upstreamNode = allNodes.find((n) => n.id === edge.source)
        if (!upstreamNode) continue
        const ud = upstreamNode.data as CanvasNodeData | undefined
        const upstreamKind = String(ud?.nodeKind || upstreamNode.type || "")
        if (upstreamKind.includes("video") || upstreamKind.includes("audio")) continue

        const candidate = ud?.imageUrl || ud?.resultUrl || ud?.assetUrl || ud?.thumbnailUrl
        if (candidate) {
          sourceImageUrl = candidate
          sourceImageAssetId = ud?.assetId
        }
      }

      if (!sourceImageUrl) {
        const message = "HD 增强缺少图片输入，请连接上传图片、生成图片或视频抽帧节点。"
        updateNodeData(node.id, {
          runMeta: createFailedRunMeta({ runId: runContext?.runId, error: message, message }),
          summary: message,
        })
        throw new Error(message)
      }

      updateNodeData(node.id, {
        runMeta: createRunningRunMeta({ runId: runContext?.runId, source: runContext?.source, message: "正在提交高清放大任务..." }),
        summary: "正在准备图片高清放大...",
      })

      try {
        const result = await requestImageUpscale({
          imageUrl: sourceImageUrl,
          assetId: sourceImageAssetId,
          scale: 2,
        })

        if (result.status === "not_ready") {
          const message = result.clientFallback?.available
            ? `${result.message}，当前可先使用视频抽帧/局部精修链路，部署 Real-ESRGAN 后可启用高清放大。`
            : result.message
          updateNodeData(node.id, {
            runMeta: createFailedRunMeta({ runId: runContext?.runId, error: result.message, message }),
            summary: result.message,
            generationOutput: {
              status: "not_ready",
              clientFallback: result.clientFallback,
              recommendedNextSteps: result.recommendedNextSteps,
            },
          })
          throw Object.assign(new Error(result.message), { partialText: result.message })
        }

        updateNodeData(node.id, {
          status: "done",
          imageUrl: result.imageUrl,
          resultUrl: result.imageUrl,
          outputs: [{ label: "高清图片", type: "image", url: result.imageUrl }],
          generationOutput: {
            status: "ready",
            imageUrl: result.imageUrl,
            sourceImageUrl,
          },
          runMeta: createSucceededRunMeta({ runId: runContext?.runId, message: result.message ?? "HD 增强完成" }),
          summary: "HD 增强完成",
        })
        return result.imageUrl
      } catch (error: any) {
        const message = error?.message || "HD 增强失败"
        updateNodeData(node.id, {
          status: "error",
          errorMessage: message,
          runMeta: createFailedRunMeta({ runId: runContext?.runId, error: message, message }),
          summary: message,
        })
        Sentry.captureException(error)
        throw error
      }
    }

    // ------------------------------------------------------------------
    // COMPOSITION STEP (ffmpeg.wasm 视频合成)
    // ------------------------------------------------------------------
    if (kind === "composition") {
      try {
        // 收集上游的：视频、音频、字幕
        const clips: VideoClipInput[] = []
        let narrationAudio: AudioTrackInput | undefined
        let subtitleContent: SubtitleInput | undefined

        for (const edge of upstreamEdges) {
          const upstream = allNodes.find((n) => n.id === edge.source)
          if (!upstream) continue
          const ud = upstream.data as CanvasNodeData | undefined
          const uk = ud?.nodeKind || upstream.type

          if (uk === "video-result" || uk === "video-generation") {
            const videoUrl = ud?.resultUrl || ud?.imageUrl || ""
            if (videoUrl) {
              clips.push({ data: videoUrl })
            }
          }

          if (uk === "audio") {
            const audioUrl = ud?.resultUrl || ""
            if (audioUrl) {
              narrationAudio = { data: audioUrl, volume: 1 }
            }
          }

          if (uk === "subtitle") {
            const segments = ud?.shot?.subtitleTimeline?.segments || ud?.segments || []
            if (Array.isArray(segments) && segments.length > 0) {
              const srtLines: string[] = []
              segments.forEach((seg: any, i: number) => {
                const start = formatSrtTime(seg.startSeconds || seg.start || 0)
                const end = formatSrtTime(seg.endSeconds || seg.end || 0)
                srtLines.push(`${i + 1}\n${start} --> ${end}\n${seg.text || ""}\n`)
              })
              subtitleContent = { srtContent: srtLines.join("\n") }
            }
          }
        }

        if (clips.length === 0) {
          updateNodeData(node.id, {
            runMeta: createFailedRunMeta({ error: "合成失败：没有找到可合成的视频片段", runId: runContext?.runId }),
          })
          return ""
        }

        const result = await composeVideo({
          clips,
          narration: narrationAudio,
          subtitle: subtitleContent,
          outputName: `starcanvas-${node.id.slice(0, 8)}`,
        })

        updateNodeData(node.id, {
          resultUrl: result.url,
          summary: `✅ 视频合成完成 (${clips.length} 段, 请查看预览)`,
          runMeta: createSucceededRunMeta({ message: `合成完成: ${result.filename}`, runId: runContext?.runId }),
        })
        return result.url
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "未知错误"
        updateNodeData(node.id, {
          runMeta: createFailedRunMeta({ error: `合成失败: ${msg}`, runId: runContext?.runId }),
        })
        return ""
      }
    }

    // ------------------------------------------------------------------
    // PASS-THROUGH STEP (video-result)
    // ------------------------------------------------------------------
    if (isPassThroughStep(kind)) {
      updateNodeData(node.id, {
        runMeta: createSucceededRunMeta({ runId: runContext?.runId, message: "已接收" }),
        summary: upstreamText
          ? `已接收上游数据 (${upstreamText.slice(0, 100)}...)`
          : "等待上游输入",
      })
      return upstreamText
    }

    // Default: pass through upstream content
    updateNodeData(node.id, {
      runMeta: createSucceededRunMeta({ runId: runContext?.runId, message: "已接收" }),
      summary: upstreamText
        ? `已接收上游数据 (${upstreamText.slice(0, 100)}...)`
        : "等待上游输入",
    })
    return upstreamText
      })
  }, [getEdges, getNodes, updateNodeData, setNodes, setEdges])

  // ==========================================================================
  // RUN SINGLE NODE
  // ==========================================================================
  const runNode = useCallback(async (nodeId: string, overridePrompt?: string) => {
    if (runningNodeIdsRef.current.has(nodeId)) return

    runningNodeIdsRef.current.add(nodeId)
    const allNodes = getNodes()
    const allEdges = getEdges()
    const node = allNodes.find((n) => n.id === nodeId)

    if (!node) {
      runningNodeIdsRef.current.delete(nodeId)
      return
    }

    const kind = (node.data.nodeKind || "script") as CanvasNodeKind
    const stepLabel: string = (node.data.title || String(kind)) as string
    const runId = crypto.randomUUID()
    const source: NodeRunSource = "manual"

    // ── Capture history input before execution ──────────
    const historyInput = buildHistoryInputFromNode(node, allNodes, allEdges, overridePrompt)
    const startedAt = new Date().toISOString()

    // Resolve model names once for this run (used in catch for usage recording)
    const runtimeProvider = await getRuntimeProviderState()
    const localModels = resolveLocalModelOverrides(runtimeProvider.overrides ?? undefined)
    const [resolvedTextModel, resolvedImageModel] = await Promise.all([
      localModels.textModel ? Promise.resolve(localModels.textModel) : getDefaultModel(),
      localModels.imageModel ? Promise.resolve(localModels.imageModel) : getDefaultImageModel(),
    ])
    const provider = runtimeProvider.usageProvider

    // ── Inject resolved model info into historyInput.settingsSnapshot ──
    const activeModel = (isImageModelStep(kind) || isFocusEditStep(kind)) ? resolvedImageModel : resolvedTextModel
    historyInput.settingsSnapshot = {
      ...historyInput.settingsSnapshot,
      model: activeModel,
      provider: runtimeProvider.usageProvider,
    }

    setState((prev) => ({
      ...prev,
      isRunning: true,
      currentStep: stepLabel,
      stepStatuses: { ...prev.stepStatuses, [nodeId]: "running" },
    }))

    updateNodeData(nodeId, { runMeta: createRunningRunMeta({ runId, source, message: "手动运行" }) })

    // ── P0-2 fix: 单节点运行也发射 WorkflowRunEvent ─────
    onRunEvent?.({
      type: "run-started",
      runId,
      startedAt,
      nodes: [{
        nodeId,
        nodeType: node.type ?? "unknown",
        title: stepLabel,
        depth: 0,
      }],
      mode: "single-node",
    })
    onRunEvent?.({
      type: "node-started",
      runId,
      nodeId,
      startedAt,
    })

    try {
      const outputText = await executeStep(node, allNodes, allEdges, { runId, source }, overridePrompt)

      // ── Record succeeded history ──────────────────────
      const finishedAt = new Date().toISOString()
      const latestNodes = getNodes()
      const updatedNode = latestNodes.find((n) => n.id === nodeId)
      const updatedData = (updatedNode?.data ?? {}) as CanvasNodeData
      const resultUrl = updatedData.resultUrl ?? updatedData.imageUrl

      // Sanitize: don't store base64/blob URLs in run history (localStorage)
      const safeResultUrl = resultUrl && !resultUrl.startsWith("data:") && !resultUrl.startsWith("blob:")
        ? resultUrl
        : undefined

      // ── 视频分析节点：用 TypedRawOutput 包装完整结构化结果 ──
      //   格式 { kind: VIDEO_ANALYSIS_RAW_KIND, version: VIDEO_ANALYSIS_RAW_VERSION, data: VideoAnalysisResult }
      //   未来其他节点（图片分析、字幕分析等）通过 kind 区分
      const rawOutput =
        kind === "video-analyze" && updatedData.generationOutput
          ? sanitizeHistoryRawOutput({
              kind: VIDEO_ANALYSIS_RAW_KIND,
              version: VIDEO_ANALYSIS_RAW_VERSION,
              data: updatedData.generationOutput,
            })
          : undefined

      const historyItem = createRunHistoryItem({
        runId,
        nodeId,
        nodeType: node.type ?? "unknown",
        status: "succeeded",
        input: historyInput,
        output: {
          text: outputText || undefined,
          imageUrls: safeResultUrl ? [safeResultUrl] : undefined,
          raw: rawOutput,
        },
        message: stepLabel + " 执行成功",
        startedAt,
        finishedAt,
        source: "manual",
      })
      useRunHistoryStore.getState().append(historyItem)

      // Set currentHistoryId on runMeta
      const currentRunMeta = updatedData.runMeta
      if (currentRunMeta) {
        updateNodeData(nodeId, {
          runMeta: { ...currentRunMeta, currentHistoryId: historyItem.id } as NodeRunMeta,
        })
      }

      setState((prev) => ({
        ...prev,
        stepStatuses: { ...prev.stepStatuses, [nodeId]: "done" },
        isRunning: false,
        currentStep: null,
      }))

      // ── P0-2 fix: emit node-succeeded + run-finished ──
      const runEndedAt = new Date().toISOString()
      onRunEvent?.({
        type: "node-succeeded",
        runId,
        nodeId,
        endedAt: runEndedAt,
        outputSummary: outputText?.slice(0, 100) || undefined,
      })
      onRunEvent?.({
        type: "run-finished",
        runId,
        endedAt: runEndedAt,
        status: "success",
      })
    } catch (err: any) {
      const finishedAt = new Date().toISOString()
      const normalized = err?.generationError || normalizeGenerationError({ error: err, provider })
      const safeError = formatGenerationErrorForDisplay(normalized)
      console.debug("[WorkflowRunner] runNode failed raw:", normalized.raw)
      Sentry.captureException(err)

      const failedRunMeta = createFailedRunMeta({
        error: safeError,
        runId,
        message: safeError,
      })

      updateNodeData(nodeId, {
        runMeta: failedRunMeta,
      })

      const latestNodesAfterFailure = getNodes()
      const failedNodeData = (latestNodesAfterFailure.find((n) => n.id === nodeId)?.data ?? {}) as CanvasNodeData
      const partialText =
        typeof err?.partialText === "string" && err.partialText.trim()
          ? err.partialText.trim()
          : typeof failedNodeData.content === "string" && failedNodeData.content.trim()
            ? failedNodeData.content.trim()
            : typeof failedNodeData.summary === "string" && failedNodeData.summary.trim()
              ? failedNodeData.summary.trim()
              : ""

      // ── Record failed history ──────────────────────────
      const historyItem = createRunHistoryItem({
        runId,
        nodeId,
        nodeType: node.type ?? "unknown",
        status: "failed",
        input: historyInput,
        output: partialText ? { text: partialText } : undefined,
        error: safeError,
        message: stepLabel + " 执行失败",
        startedAt,
        finishedAt: new Date().toISOString(),
        source: "manual",
      })
      useRunHistoryStore.getState().append(historyItem)

      // Set currentHistoryId without losing failed status/error metadata
      updateNodeData(nodeId, {
        runMeta: { ...failedRunMeta, currentHistoryId: historyItem.id } as NodeRunMeta,
      })

      // ── Record failed usage ─────────────────────────────
      const isImg = isImageModelStep(kind) || isFocusEditStep(kind)
      const taskType: AITaskType = isImg ? "image" : "text"
      appendAIUsageRecord({
        nodeId,
        provider,
        model: isImg ? resolvedImageModel : resolvedTextModel,
        taskType,
        startedAt,
        status: "failed",
        error: safeError,
      })

      setState((prev) => ({
        ...prev,
        stepStatuses: { ...prev.stepStatuses, [nodeId]: "error" },
        error: safeError,
        isRunning: false,
        currentStep: null,
      }))

      // ── P0-2 fix: emit node-failed + run-finished ─────
      const failEndedAt = new Date().toISOString()
      onRunEvent?.({
        type: "node-failed",
        runId,
        nodeId,
        endedAt: failEndedAt,
        error: safeError,
      })
      onRunEvent?.({
        type: "run-finished",
        runId,
        endedAt: failEndedAt,
        status: "failed",
        error: safeError,
      })
    } finally {
      runningNodeIdsRef.current.delete(nodeId)
    }
  }, [getNodes, getEdges, executeStep, updateNodeData, onRunEvent])

  // ==========================================================================
  // RUN FULL WORKFLOW
  // ==========================================================================
  const runWorkflow = useCallback(async () => {
    if (state.isRunning) return

    abortRef.current = false
    const allNodes = getNodes()
    const allEdges = getEdges()

    // Find all workflow nodes
    const workflowNodes = allNodes.filter(
      (n) => n.type === "workflow" || n.type === "agent" || (n.type === "content" && n.data.nodeKind === "text")
    )

    if (workflowNodes.length === 0) return

    // Sort by workflow order
    const sortedNodes = [...workflowNodes].sort((a, b) => {
      const aIdx = getStepIndex((a.data.nodeKind || "script") as CanvasNodeKind)
      const bIdx = getStepIndex((b.data.nodeKind || "script") as CanvasNodeKind)
      return aIdx - bIdx
    })

    // Initialize statuses
    const initialStatuses: Record<string, WorkflowStepStatus> = {}
    sortedNodes.forEach((n) => {
      initialStatuses[n.id] = "pending"
    })

    setState({
      isRunning: true,
      currentStep: null,
      stepStatuses: initialStatuses,
      error: null,
      progress: 0,
    })

    // ── P2-3A: emit run-started ──────────────────────────
    const planRunId = crypto.randomUUID()
    const planStartedAt = new Date().toISOString()
    onRunEvent?.({
      type: "run-started",
      runId: planRunId,
      startedAt: planStartedAt,
      nodes: sortedNodes.map((n, i) => ({
        nodeId: n.id,
        nodeType: n.type ?? "unknown",
        title: (n.data.title as string) || (n.data.nodeKind as string) || "节点",
        depth: i,
      })),
      mode: "full",
    })

    let failingNodeId: string | undefined

    try {
      for (let i = 0; i < sortedNodes.length; i++) {
        if (abortRef.current) break

        const node = sortedNodes[i]
        const kind = (node.data.nodeKind || "script") as CanvasNodeKind
        const stepLabel: string = (node.data.title || String(kind)) as string

        // ── P2-3A: emit node-started ─────────────────────
        const nodeStartedAt = new Date().toISOString()
        onRunEvent?.({
          type: "node-started",
          runId: planRunId,
          nodeId: node.id,
          startedAt: nodeStartedAt,
        })

        // Mark as running
        setState((prev) => ({
          ...prev,
          currentStep: stepLabel,
          stepStatuses: { ...prev.stepStatuses, [node.id]: "running" },
          progress: Math.round(((i) / sortedNodes.length) * 100),
        }))

        const runId = crypto.randomUUID()
        const source: NodeRunSource = "workflow"

        updateNodeData(node.id, { runMeta: createRunningRunMeta({ runId, source, message: "工作流 " + (i + 1) + "/" + sortedNodes.length }) })

        failingNodeId = node.id

        // Execute
        await executeStep(node, allNodes, allEdges, { runId, source })

        // ── P2-3A: emit node-succeeded ────────────────────
        const nodeEndedAt = new Date().toISOString()
        onRunEvent?.({
          type: "node-succeeded",
          runId: planRunId,
          nodeId: node.id,
          endedAt: nodeEndedAt,
          outputSummary: (node.data.summary as string) || undefined,
        })

        // Mark as done
        setState((prev) => ({
          ...prev,
          stepStatuses: { ...prev.stepStatuses, [node.id]: "done" },
          progress: Math.round(((i + 1) / sortedNodes.length) * 100),
        }))
      }

      // ── P2-3A: emit run-finished (success) ──────────────
      onRunEvent?.({
        type: "run-finished",
        runId: planRunId,
        endedAt: new Date().toISOString(),
        status: "success",
      })
    } catch (err: any) {
      const workflowProvider = (await getRuntimeProviderState()).usageProvider
      const normalized = err?.generationError || normalizeGenerationError({ error: err, provider: workflowProvider })
      const safeError = formatGenerationErrorForDisplay(normalized)
      console.debug("[WorkflowRunner] workflow failed raw:", normalized.raw)
      Sentry.captureException(err)
      // ── P2-3A: emit run-finished (failed) ───────────────
      onRunEvent?.({
        type: "run-finished",
        runId: planRunId,
        endedAt: new Date().toISOString(),
        status: "failed",
        error: safeError,
      })

      // Mark the failing node as failed (otherwise it stays "running")
      if (failingNodeId) {
        updateNodeData(failingNodeId, {
          runMeta: createFailedRunMeta({
            runId: planRunId,
            error: safeError,
            message: safeError,
          }),
        })
      }

      setState((prev) => ({
        ...prev,
        error: safeError,
        isRunning: false,
        stepStatuses: failingNodeId
          ? { ...prev.stepStatuses, [failingNodeId]: "error" as const }
          : prev.stepStatuses,
      }))
      return
    }

    setState((prev) => ({
      ...prev,
      isRunning: false,
      currentStep: null,
      progress: 100,
    }))
  }, [state.isRunning, getNodes, getEdges, executeStep, updateNodeData, onRunEvent])

  const stopWorkflow = useCallback(() => {
    abortRef.current = true
    setState((prev) => ({
      ...prev,
      isRunning: false,
      currentStep: null,
    }))
  }, [])

  // ==========================================================================
  // P1-6.3: RESTORE PROMPT FROM HISTORY
  // ==========================================================================

  /**
   * 从历史记录中恢复 prompt 到当前节点。
   * 纯数据操作，不触发运行。
   */
  const restorePromptFromHistory = useCallback(
    (nodeId: string, historyId: string) => {
      const historyItem = useRunHistoryStore.getState().findById(historyId)
      if (!historyItem) {
        console.warn("[WorkflowRunner] History item not found:", historyId)
        return
      }

      const patch = buildRestorePromptPatch(historyItem.input)
      updateNodeData(nodeId, patch as Partial<CanvasNodeData>)
    },
    [updateNodeData],
  )

  // ==========================================================================
  // P1-6.4: RETRY FROM HISTORY (简化版)
  // ==========================================================================

  /**
   * 从历史记录中重试节点运行。
   * 简化策略：恢复 prompt → 调用当前 runNode。
   * 完整重试（复用历史 context/settings）放 P2。
   */
  const retryFromHistory = useCallback(
    (nodeId: string, historyId: string) => {
      const historyItem = useRunHistoryStore.getState().findById(historyId)
      if (!historyItem) {
        console.warn("[WorkflowRunner] History item not found:", historyId)
        return
      }

      // 确保节点未被占用
      if (runningNodeIdsRef.current.has(nodeId)) {
        console.warn("[WorkflowRunner] Node is busy, cannot retry:", nodeId)
        return
      }

      // 1. 恢复 prompt
      const patch = buildRestorePromptPatch(historyItem.input)
      updateNodeData(nodeId, patch as Partial<CanvasNodeData>)

      // 2. 异步调用 runNode（不 await，避免阻塞 UI）
      //    runNode 内部会读取最新的节点数据（即刚恢复的 prompt）
      //    source 标记为 "retry" 由 runNode 自动处理
      setTimeout(() => {
        runNode(nodeId)
      }, 0)
    },
    [updateNodeData, runNode],
  )

  // ==========================================================================
  // P1-7: RUN AGENT FROM CANVAS — AgentNode 运行的公开入口
  // ==========================================================================

  const runAgentFromCanvas = useCallback(async (nodeId: string) => {
    const node = getNodes().find((n) => n.id === nodeId)
    if (!node) return
    const content = (node.data as Record<string, unknown>)?.content as string ?? ""
    if (!content.trim()) {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === nodeId
            ? { ...n, data: { ...n.data, agentStatus: "error" as const, agentOutput: "请先输入剧本内容" } }
            : n,
        ),
      )
      return
    }
    // Execute via runNode which handles history/stats/error/usage
    await runNode(nodeId)
  }, [getNodes, setNodes, runNode])

  // ==========================================================================
  // P2-2: RUN EXECUTION PLAN — 级联执行
  // ==========================================================================

  /**
   * 串行执行整个 ExecutionPlan。
   * 每个 step 复用 runNode（history/stats/error/usage 全部保留）。
   * 一个 step 失败则标记后续为 skipped，并停止执行。
   */
  const runExecutionPlan = useCallback(async (
    plan: ExecutionPlan,
  ): Promise<ExecutionPlan> => {
    if (state.isRunning) return plan

    abortRef.current = false
    const stepsToRun = plan.steps.filter((s) => s.status === "pending")

    // 深拷贝 plan（避免修改原始对象）
    const planCopy: ExecutionPlan = {
      ...plan,
      status: "running",
      startedAt: new Date().toISOString(),
      steps: plan.steps.map((s) => ({ ...s })),
    }

    // 初始化 step statuses
    const initialStatuses: Record<string, WorkflowStepStatus> = {}
    for (const step of planCopy.steps) {
      initialStatuses[step.nodeId] = "pending"
    }

    setState({
      isRunning: true,
      currentStep: null,
      stepStatuses: initialStatuses,
      error: null,
      progress: 0,
    })

    // ── P2-3A: emit run-started ──────────────────────────
    const planRunId = planCopy.id
    const planStartedAt = planCopy.startedAt!
    const nodesForPanel = planCopy.steps.map((s) => {
      const n = getNodes().find((nd) => nd.id === s.nodeId)
      return {
        nodeId: s.nodeId,
        nodeType: n?.type ?? "unknown",
        title: (n?.data?.title as string) || s.nodeId,
        depth: s.depth,
      }
    })
    onRunEvent?.({
      type: "run-started",
      runId: planRunId,
      startedAt: planStartedAt,
      nodes: nodesForPanel,
      mode: planCopy.mode,
    })

    try {
      for (let i = 0; i < planCopy.steps.length; i++) {
        // 检查取消
        if (abortRef.current) {
          planCopy.status = "cancelled"
          planCopy.finishedAt = new Date().toISOString()
          for (let j = i; j < planCopy.steps.length; j++) {
            planCopy.steps[j].status = "cancelled"
          }
          // ── P2-3A: emit node-skipped + run-finished ─────
          for (let j = i; j < planCopy.steps.length; j++) {
            onRunEvent?.({ type: "node-skipped", runId: planRunId, nodeId: planCopy.steps[j].nodeId, reason: "流程已取消" })
          }
          onRunEvent?.({ type: "run-finished", runId: planRunId, endedAt: new Date().toISOString(), status: "cancelled" })
          break
        }

        const step = planCopy.steps[i]

        // 并发保护：节点已在运行时跳过
        if (runningNodeIdsRef.current.has(step.nodeId)) {
          step.status = "skipped"
          onRunEvent?.({ type: "node-skipped", runId: planRunId, nodeId: step.nodeId, reason: "节点正在运行中" })
          continue
        }

        // 标记运行中
        step.status = "running"
        step.startedAt = new Date().toISOString()
        const node = getNodes().find((n) => n.id === step.nodeId)
        const stepLabel: string = (node?.data?.title as string) || step.nodeId

        // ── P2-3A: emit node-started ─────────────────────
        onRunEvent?.({
          type: "node-started",
          runId: planRunId,
          nodeId: step.nodeId,
          startedAt: step.startedAt,
        })

        setState((prev) => ({
          ...prev,
          currentStep: stepLabel,
          stepStatuses: { ...prev.stepStatuses, [step.nodeId]: "running" },
          progress: Math.round((i / planCopy.steps.length) * 100),
        }))

        try {
          // 核心调用：复用已存在的 runNode
          await runNode(step.nodeId)

          step.status = "succeeded"
          step.finishedAt = new Date().toISOString()
          step.durationMs = step.startedAt
            ? Date.now() - new Date(step.startedAt).getTime()
            : undefined

          // ── P2-3A: emit node-succeeded ──────────────────
          onRunEvent?.({
            type: "node-succeeded",
            runId: planRunId,
            nodeId: step.nodeId,
            endedAt: step.finishedAt,
            outputSummary: (node?.data?.summary as string) || undefined,
          })

          setState((prev) => ({
            ...prev,
            stepStatuses: { ...prev.stepStatuses, [step.nodeId]: "done" },
            progress: Math.round(((i + 1) / planCopy.steps.length) * 100),
          }))
        } catch (err: any) {
          step.status = "failed"
          step.error = err.message || "执行失败"
          step.finishedAt = new Date().toISOString()
          step.durationMs = step.startedAt
            ? Date.now() - new Date(step.startedAt).getTime()
            : undefined

          // ── P2-3A: emit node-failed ─────────────────────
          onRunEvent?.({
            type: "node-failed",
            runId: planRunId,
            nodeId: step.nodeId,
            endedAt: step.finishedAt,
            error: step.error!,
          })

          // 剩余步骤标记 skipped
          for (let j = i + 1; j < planCopy.steps.length; j++) {
            planCopy.steps[j].status = "skipped"
            onRunEvent?.({ type: "node-skipped", runId: planRunId, nodeId: planCopy.steps[j].nodeId, reason: "上游节点失败" })
          }

          planCopy.status = "failed"
          planCopy.finishedAt = new Date().toISOString()

          // ── P2-3A: emit run-finished (failed) ───────────
          onRunEvent?.({
            type: "run-finished",
            runId: planRunId,
            endedAt: planCopy.finishedAt,
            status: "failed",
            error: step.error!,
          })

          setState((prev) => ({
            ...prev,
            stepStatuses: { ...prev.stepStatuses, [step.nodeId]: "error" },
            error: step.error!,
            isRunning: false,
            currentStep: null,
          }))
          break
        }
      }

      // 全部成功
      if (planCopy.status === "running") {
        planCopy.status = "succeeded"
        planCopy.finishedAt = new Date().toISOString()

        // ── P2-3A: emit run-finished (success) ────────────
        onRunEvent?.({
          type: "run-finished",
          runId: planRunId,
          endedAt: planCopy.finishedAt,
          status: "success",
        })

        setState((prev) => ({
          ...prev,
          isRunning: false,
          currentStep: null,
          progress: 100,
        }))
      }
    } catch (err: any) {
      planCopy.status = "failed"
      planCopy.finishedAt = new Date().toISOString()

      // ── P2-3A: emit run-finished (failed) ───────────────
      onRunEvent?.({
        type: "run-finished",
        runId: planRunId,
        endedAt: planCopy.finishedAt,
        status: "failed",
        error: err.message || "执行计划异常",
      })

      setState((prev) => ({
        ...prev,
        error: err.message || "执行计划异常",
        isRunning: false,
        currentStep: null,
      }))
    }

    return planCopy
  }, [state.isRunning, runNode, getNodes, setState, onRunEvent])

  return {
    state,
    runWorkflow,
    runNode,
    runAgentFromCanvas,
    runExecutionPlan,
    stopWorkflow,
    restorePromptFromHistory,
    retryFromHistory,
  }
}
