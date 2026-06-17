// ============================================================================
// StarCanvas - 主画布组件 (TapNow-inspired 重构版)
// ============================================================================
"use client";

import "@xyflow/react/dist/style.css";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  BackgroundVariant,
  ReactFlow,
  ReactFlowProvider,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  getBezierPath,
  BaseEdge,
  type Edge,
  type Node,
  type ReactFlowInstance,
  type Viewport,
  type XYPosition,
  type EdgeProps,
  type EdgeMouseHandler,
} from "@xyflow/react";
import { useReactFlow } from "@xyflow/react";
import {
  memo,
  type ChangeEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import dynamic from "next/dynamic";

// ============================================================================
// ICONS
// ============================================================================
import {
  ZoomIn,
  ZoomOut,
  Maximize,
  Grid3X3,
  Layout,
  HelpCircle,
  Search,
  Minimize2,
  MessageCircle,
  Download,
  Sparkles,
  Loader2,
  Wand2,
  Image as ImageIcon,
  Settings2,
  Eye,
  ArrowLeft,
  ArrowRight,
  Play,
  ListChecks,
  ClipboardList,
  BookOpen,
  FileText,
  Table2,
  Subtitles,
  Printer,
  Clapperboard,
  Palette,
  TrendingUp,
  UserRound,
  RotateCcw,
  GitCompare,
  X,
  type LucideIcon,
} from "lucide-react";

// ============================================================================
// DESIGN SYSTEM
// ============================================================================
import { DESIGN_TOKENS, ICON_CONFIG } from "./styles/designSystem";

// ============================================================================
// TYPES
// ============================================================================
import type {
  CanvasNodeData,
  CanvasNodeKind,
  AssetItem,
  StoryboardResultQuality,
  BatchGenerationJob,
  BatchGenerationJobStatus,
  BatchGenerationShotStatus,
} from "./components/canvas/types";

// ============================================================================
// HOOKS & STORES
// ============================================================================
import { useCanvasStore, loadBibleFromIDB } from "./stores/canvasStore";
import { useCanvasDropUpload } from "./hooks/useCanvasDropUpload";
import { useHistoryDrop } from "./hooks/useHistoryDrop";
import type { ChatAttachment } from "./hooks/useChatAttachments";

// ============================================================================
// COMPONENTS
// ============================================================================
import { EmptyCanvasGuide } from "./components/canvas/EmptyCanvasGuide";
import { CanvasDropOverlay } from "./components/canvas/CanvasDropOverlay";
import { AssetLibraryPanel } from "./components/canvas/AssetLibraryPanel";
import { CharacterAssetLibraryPanel } from "./components/canvas/CharacterAssetLibraryPanel";
import { ProductionRunQueuePanel } from "./components/canvas/ProductionRunQueuePanel";
import { ShotPlanningPanel } from "@/features/production/ShotPlanningPanel";
import { useProductionRunExecutor } from "./hooks/useProductionRunExecutor";
import { StoryboardBatchProgressOverlay } from "./components/canvas/StoryboardBatchProgressOverlay";
import { CanvasContextMenu } from "./components/menus/CanvasContextMenu";
import PropertyPanel from "./components/panels/PropertyPanel";
import { NodeContextMenu } from "./components/menus/NodeContextMenu";
import { EdgeContextMenu } from "./components/menus/EdgeContextMenu";
import { ImageHoverToolbar } from "./components/toolbar/ImageHoverToolbar";
import SelectionToolbar from "./components/toolbar/SelectionToolbar";
import { LeftToolbar } from "./components/toolbar/LeftToolbar";
import { ExportDropdown, type ExportActions } from "./components/toolbar/ExportDropdown";
import { BibleDropdown, type BibleActions } from "./components/toolbar/BibleDropdown";
import { WorkflowTemplatesDialog } from "./components/toolbar/WorkflowTemplatesDialog";
import { useWorkflowTemplates, type WorkflowTemplate } from "./hooks/useWorkflowTemplates";
import { AddNodePanel } from "./components/toolbar/AddNodePanel";
import { ChatPanel } from "./components/chat/ChatPanel";
import { SettingsPanel } from "./components/panels/SettingsPanel";
import {
  ProjectBiblePanel,
  type ProjectSceneBibleItem,
  type ProjectSceneBiblePatch,
  type ProjectVisualBible,
  type ProjectVisualBiblePatch,
} from "./components/panels/ProjectBiblePanel";
import { CharacterBiblePanel } from "./components/panels/CharacterBiblePanel";
import { SceneBiblePanel } from "./components/panels/SceneBiblePanel";
import { VisualStyleBiblePanel } from "./components/panels/VisualStyleBiblePanel";
import { EmotionCurvePanel } from "./components/panels/EmotionCurvePanel";
import type { EmotionCurveDataPoint } from "./components/panels/EmotionCurvePanel";
import { ShotListTable } from "./components/panels/ShotListTable";
import { StyleLibraryPanel } from "./components/panels/StyleLibraryPanel";
import { DraggableAngleControl } from "./components/canvas/DraggableAngleControl";
import { VersionComparePanel } from "./components/history/VersionComparePanel";
// 重型面板全部懒加载 — 减少首屏编译体积
import { type AgentMode } from "./components/chat/AgentModeSwitcher";
import { BatchActionPanel, type BatchAction } from "./components/canvas/BatchActionPanel";
// 制片层面板 — 全部 next/dynamic 懒加载
const CharacterViewPanel = dynamic(() => import("./components/canvas/CharacterViewModal").then(m => ({ default: m.CharacterViewPanel })), { ssr: false });
const CinematicParamPanel = dynamic(() => import("./components/panels/CinematicParamPanel").then(m => ({ default: m.CinematicParamPanelInner })), { ssr: false });
const ColorGradePanel = dynamic(() => import("./components/panels/ColorGradePanel").then(m => ({ default: m.ColorGradePanel })), { ssr: false });
const TimelinePanel = dynamic(() => import("./components/panels/TimelinePanel").then(m => ({ default: m.TimelinePanel })), { ssr: false });
const PanoramaPanel = dynamic(() => import("./components/panels/PanoramaPanel").then(m => ({ default: m.PanoramaPanel })), { ssr: false });
const CrewAgentPanel = dynamic(() => import("./components/panels/CrewAgentPanel").then(m => ({ default: m.CrewAgentPanel })), { ssr: false });
const SourceTracePanel = dynamic(() => import("./components/preview/SourceTracePanel").then(m => ({ default: m.SourceTracePanel })), { ssr: false });
const NodeHistoryPanel = dynamic(() => import("./components/history/NodeHistoryPanel").then(m => ({ default: m.NodeHistoryPanel })), { ssr: false });
const VideoRemixPanel = dynamic(() => import("./components/panels/VideoRemixPanel").then(m => ({ default: m.VideoRemixPanel })), { ssr: false });
const ScriptImportPanel = dynamic(() => import("./components/panels/ScriptImportPanel").then(m => ({ default: m.ScriptImportPanel })), { ssr: false });
const ReverseStoryboardPanel = dynamic(() => import("@/features/reverse-storyboard/ReverseStoryboardPanel").then(m => ({ default: m.ReverseStoryboardPanelInner })), { ssr: false });
const ShotLibraryPanel = dynamic(() => import("@/features/shot-library/ShotLibraryPanel").then(m => ({ default: m.ShotLibraryPanelInner })), { ssr: false });
const AIScriptPanel = dynamic(() => import("@/features/ai-script/AIScriptPanel").then(m => ({ default: m.AIScriptPanelInner })), { ssr: false });
import { importStoryboardDraftToCanvas } from "@/features/storyboard/importDraftToCanvas"
import { useOnboarding } from "@/features/onboarding/useOnboarding"
import { completeStep } from "@/features/onboarding/onboardingStorage"
const OnboardingPanel = dynamic(() => import("@/features/onboarding/OnboardingPanel").then(m => ({ default: m.OnboardingPanelInner })), { ssr: false })
import type { ScriptImportPayload } from "./components/panels/ScriptImportPanel";
import type { VideoRemixImportPayload } from "./components/panels/VideoRemixPanel";
import type { CinematicParams } from "./components/panels/CinematicParamPanel";
import type { TimelineClip } from "./components/panels/TimelinePanel";
// 恢复孤立组件
import { ChainGeneratePanel } from "./components/panels/ChainGeneratePanel";
import { ParamControlPanel } from "./components/panels/ParamControlPanel";
import { StoryboardShotEditorPanel } from "./components/panels/StoryboardShotEditorPanel";
import { BgmPanel } from "./components/nodes/BgmPanel";
import { AngleControlPanel } from "./components/nodes/AngleControlPanel";
import { BackgroundRemoverPanel } from "./components/canvas/BackgroundRemoverPanel";
import { AudioWaveform } from "./components/nodes/AudioWaveform";
import { CanvasDiagnosticsPanel } from "./components/canvas/CanvasDiagnosticsPanel";
import { CinemaLabPanel } from "./components/nodes/CinemaLabPanel";
import { TransitionPicker } from "./components/nodes/TransitionPicker";
import { ExportPreflightPanel } from "./components/panels/ExportPreflightPanel";
import { FileUploadPanel } from "./components/panels/FileUploadPanel";
import { WorkspaceHistoryPanel } from "./components/history/WorkspaceHistoryPanel";
import { WorkflowRunPanel } from "./components/workflow/WorkflowRunPanel";
import { PromptPreviewPanel } from "./components/preview/PromptPreviewPanel";
import ImageNode, {
  registerImageHoverHandlers,
  unregisterImageHoverHandlers,
} from "./components/nodes/ImageNode";
import ContentNode from "./components/nodes/ContentNode";
import { ContinuityReportNode } from "./components/nodes/ContinuityReportNode";
import SketchNode from "./components/nodes/SketchNode";
import WorkflowNode from "./components/nodes/WorkflowNode";
import ShotNode from "./components/nodes/ShotNode";
import StoryboardGridNode from "./components/nodes/StoryboardGridNode";
import VideoNode from "./components/nodes/VideoNode";
import AgentNode from "./components/nodes/AgentNode";
import { generateId } from "./utils/generateId";
import { quickLayout } from "./utils/dagre-layout";
import { parseStoryboardTextToShots } from "./utils/storyboardParser";
import BatchProgressBar, {
  type BatchProgressHandle,
} from "./components/nodes/BatchProgressBar";
import { generateImageFromPrompt, friendlyErrorMessage, retryWithBackoff, ImageGenerationError } from "./utils/imageGeneration";
import { generateTtsAudio, persistTtsAudio } from "./utils/ttsService";
import { composeStoryboardGrid } from "./utils/storyboardGridComposer";
import { buildVideoWorkflowTemplate } from "./utils/videoWorkflowTemplate";
import { useWorkflowRunner } from "./hooks/useWorkflowRunner";
import { buildExecutionPlan } from "./utils/execution-plan";
import { useCanvasPersistence } from "./hooks/useCanvasPersistence";
import {
  createFailedRunMeta,
  createIdleRunMeta,
  createPendingRunMeta,
  createRunningRunMeta,
  createSucceededRunMeta,
} from "./utils/nodeRunMeta";
import {
  persistImageFile,
  persistImageDataUrl,
  hydrateImageAsset,
  getLocalImageAsset,
  revokeAllTrackedObjectUrls,
} from "@/lib/assets/localImageStore";
import {
  createDocumentNode,
  isTextDocumentFile,
  readTextDocumentFile,
} from "@/lib/documents/textDocumentImport";
import { prepareReferenceImageForGeneration } from "@/lib/images/prepareReferenceImage";
import {
  getImageProviderCapability,
  assertImageToImageSupported,
} from "@/lib/ai/imageProviderCapabilities";
import {
  normalizeGenerationError,
  formatGenerationErrorForDisplay,
} from "@/lib/ai/normalizeGenerationError";
import { createImageGenerationSnapshot } from "@/lib/ai/createGenerationSnapshot";
import { getDefaultImageModel } from "@/lib/ai/client";
import { createShotImageNode } from "@/lib/storyboard/createShotImageNode";
import {
  STORYBOARD_SHOT_LAYOUT,
  createNormalizedShotTitle,
  createStoryboardSourceEdge,
  getStoryboardGridPosition,
  getStoryboardShotPosition,
} from "@/lib/storyboard/layoutStoryboardShots";
import {
  CHAT_PANEL_WIDTH,
  LEFT_TOOLBAR_SAFE_WIDTH,
  STORYBOARD_FINAL_OUTPUT_OFFSET_X,
  STORYBOARD_FINAL_OUTPUT_VIEW_PADDING,
  STORYBOARD_PROCESS_NODE_OFFSET_X,
  STORYBOARD_PROCESS_IMAGE_OFFSET_X,
  STORYBOARD_PROCESS_GRID_OFFSET_X,
  getStoryboardProcessNodePosition,
  getStoryboardProcessImagePosition,
  getStoryboardProcessGridPosition,
  getStoryboardFinalOutputPosition,
  getViewportForNodePosition,
} from "./utils/canvasPositionUtils";
import {
  isStoryboardProcessNode,
  isStoryboardFinalOutputNode,
  getVisibleCanvasNodes,
  applyFallbackCanvasLayout,
  applyCanvasVisibilityRecovery,
  applyCanvasVisibilityAndLayoutRecovery,
} from "./utils/canvasVisibilityUtils";
import {
  DEFAULT_STORYBOARD_COMPOSITE_SETTINGS,
  STORYBOARD_FRAME_ASPECT_RATIO,
  buildStoryboardCompositePrompt,
  createStoryboardCompositeEdges,
  getShotImageUrlFromCanvas,
  shouldUseLocalStoryboardCompose,
  validateStoryboardGridImageUrls,
  type StoryboardCompositeLayout,
  type StoryboardCompositeSettings,
} from "@/lib/storyboard/storyboardComposite";
import {
  applyCharacterAssetLibraryPatchToShots,
  collectCharacterAssetLibraryItemsFromShots,
  type CharacterAssetLibraryPatch,
} from "@/lib/storyboard/characterAssetLibrary";
import { buildCharacterConsistencyPrompt } from "@/lib/storyboard/characterIdentitySummary";
import { buildStoryboardImagePrompt } from "@/lib/storyboard/storyboardImagePrompt";
import { buildShotProductionBriefs, buildShotProductionBrief } from "@/lib/storyboard/shotProductionBrief";
import { buildProjectPackageManifest } from "@/lib/storyboard/projectPackageManifest";
import { buildProductionRunQueue } from "@/lib/storyboard/productionRunQueue";
import { generateStoryboardPdfHtml, storyboardPdfFilename } from "@/lib/storyboard/storyboardPdfExport";
import {
  generateScreenplayMarkdown,
  screenplayFilename,
  generateCharacterTableCsv,
  characterTableFilename,
  generateStoryboardTableCsv,
  storyboardTableFilename,
} from "@/lib/storyboard/storyboardExportFormats";
import { buildSubtitleExport, subtitleTimelineFilename } from "@/lib/storyboard/storyboardSubtitleTimeline";
import { generateVideoCompositionScript, type VideoCompositionInput } from "@/lib/storyboard/storyboardVideoComposition";
import { downloadJianyingDraft } from "@/lib/jianying/jianyingDraftExport";
import { formatDialogueAsSrt, parseDurationToSeconds } from "@/lib/storyboard/subtitleFormatter";
import {
  exportToJianyingDraft,
  buildJianyingCompatiblePackage,
  extractVideoNodesFromCanvas,
  extractAudioNodesFromCanvas,
  extractSubtitleNodesFromCanvas,
  downloadJsonFile,
  downloadZipBuffer,
} from "./utils/jianyingDraftExport";
import type {
  ChatCanvasAction,
  ApplyActionsReport,
  ApplyActionResult,
} from "./features/canvas/actions/chatActions";
import type { WorkflowRunEvent } from "./types/workflow-run";
import type { CanvasSnapshot } from "./types/canvas-snapshot";
import { useCanvasSnapshotStore } from "./stores/useCanvasSnapshotStore";
import { useWorkspaceHistoryStore } from "./stores/useWorkspaceHistoryStore";
import {
  CANVAS_SNAPSHOT_SCHEMA_VERSION,
  sanitizeAndValidateCanvasSnapshot,
} from "./utils/canvasSnapshotSanitizer";

// ============================================================================
// DEBUG SWITCHES
// ============================================================================
const isDebugEnabled = (key: string) =>
  typeof window !== "undefined" && window.localStorage.getItem(key) === "1";

const DEBUG_DROP = isDebugEnabled("DEBUG_DROP_UPLOAD");
const DEBUG_AI = isDebugEnabled("DEBUG_AI_PAYLOAD");
const DEBUG_NODE = isDebugEnabled("DEBUG_NODE_ACTIONS");

// ============================================================================
// CONSTANTS
// ============================================================================
const DEFAULT_ZOOM = 0.85;
// (CHAT_PANEL_WIDTH and LEFT_TOOLBAR_SAFE_WIDTH imported from canvasPositionUtils)
const IMAGE_NODE_TITLE_HEIGHT = 22;
const IMAGE_NODE_SIZE = {
  minWidth: 120,
  minHeight: 96,
  maxWidth: 220,
  maxHeight: 180,
};
const NODE_DEFAULT_SIZE = {
  content: { width: 680, height: 560 },
  image: { width: 220, height: 172 },
  workflow: { width: 280, height: 170 },
  agent: { width: 360, height: 300 },
  sketch: { width: 560, height: 430 },
} satisfies Record<
  "content" | "image" | "workflow" | "agent" | "sketch",
  { width: number; height: number }
>;
const ZOOM_CONSTRAINTS = {
  minZoom: 0.25,
  maxZoom: 2,
};
const SHOT_GENERATION_WATCHDOG_TIMEOUT_MS = 90_000;
const SHOT_GENERATION_WATCHDOG_INTERVAL_MS = 10_000;
const SHOT_GENERATION_BATCH_CONCURRENCY = 3;
// (Position/visibility utilities imported from canvasPositionUtils.ts and canvasVisibilityUtils.ts)

function applyStoryboardProcessVisibility(params: {
  nodes: Node<CanvasNodeData>[];
  edges: Edge[];
  sourceNodeId: string;
  showProcess: boolean;
}) {
  const processNodeIds = new Set(
    params.nodes
      .filter((node) => isStoryboardProcessNode(node, params.sourceNodeId))
      .map((node) => node.id),
  );
  const finalOutputNodeIds = new Set(
    params.nodes
      .filter((node) => isStoryboardFinalOutputNode(node, params.sourceNodeId))
      .map((node) => node.id),
  );

  const nodes = params.nodes.map((node) => {
    if (processNodeIds.has(node.id)) {
      return {
        ...node,
        hidden: !params.showProcess,
        data: {
          ...node.data,
          hiddenByStoryboardProcessMode: !params.showProcess,
        },
      };
    }
    if (finalOutputNodeIds.has(node.id)) {
      return { ...node, hidden: false };
    }
    return node;
  });

  const edges = params.edges.map((edge) => {
    const touchesProcess = processNodeIds.has(edge.source) || processNodeIds.has(edge.target);
    const isSourceToFinal = edge.source === params.sourceNodeId && finalOutputNodeIds.has(edge.target);
    if (isSourceToFinal) return { ...edge, hidden: false };
    if (touchesProcess) return { ...edge, hidden: !params.showProcess };
    return edge;
  });

  return { nodes, edges };
}

async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<Array<PromiseSettledResult<R>>> {
  const results: Array<PromiseSettledResult<R>> = new Array(items.length);
  let nextIndex = 0;

  async function runNext() {
    const currentIndex = nextIndex;
    nextIndex += 1;
    if (currentIndex >= items.length) return;

    try {
      results[currentIndex] = {
        status: "fulfilled",
        value: await worker(items[currentIndex], currentIndex),
      };
    } catch (reason) {
      results[currentIndex] = { status: "rejected", reason };
    }

    await runNext();
  }

  const workerCount = Math.min(Math.max(1, limit), items.length);
  await Promise.all(Array.from({ length: workerCount }, () => runNext()));
  return results;
}

// ============================================================================
// Custom Edge Component
// ============================================================================
const CreativeEdge = memo(
  ({
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    style = {},
    animated,
  }: EdgeProps) => {
    const [edgePath] = getBezierPath({
      sourceX,
      sourceY,
      sourcePosition,
      targetX,
      targetY,
      targetPosition,
    });

    return (
      <>
        <BaseEdge
          id={id}
          path={edgePath}
          style={{
            ...style,
            stroke: DESIGN_TOKENS.nodeEdge,
            strokeWidth: 1.5,
            filter: animated
              ? "drop-shadow(0 0 3px rgba(148, 163, 184, 0.3))"
              : undefined,
          }}
        />
        {animated && (
          <circle r={4} fill={DESIGN_TOKENS.nodeHandle}>
            <animateMotion dur="2s" repeatCount="indefinite" path={edgePath} />
          </circle>
        )}
      </>
    );
  },
);
CreativeEdge.displayName = "CreativeEdge";

// ============================================================================
// Node Types
// ============================================================================
// Module-level mutable ref for AgentNode's onRunAgent callback.
// Set once when the component mounts via StarCanvasInner.
let _runAgentFn: ((nodeId: string) => void) | undefined;
let _runBatchGenerateFn: ((nodeIds: string[]) => void) | undefined;
let _updateAgentContentFn: ((nodeId: string, content: string) => void) | undefined;
let _runVideoRetryFn: ((nodeId: string) => void) | undefined;
let _videoUpscaleFn: ((nodeId: string) => void) | undefined;
let _doUndo: (() => void) | undefined;
let _doRedo: (() => void) | undefined;

// ── Undo/redo stacks ──
interface UndoEntry { nodes: Node<CanvasNodeData>[]; edges: Edge[] }
const _undoStack: UndoEntry[] = []
const _redoStack: UndoEntry[] = []
const MAX_UNDO = 50
let _undoTimer: ReturnType<typeof setTimeout> | undefined
let _lastUndoActionType: string | undefined

/**
 * Push a history entry for undo/redo.
 * @param entry - snapshot of nodes + edges
 * @param actionType - optional action type for smarter debounce. Different action types are never debounced against each other.
 */
export function pushUndo(entry: UndoEntry, actionType?: string) {
  // Never debounce 'move' actions — each drag stop should be independently undoable.
  // For other actions, coalesce rapid mutations of the SAME type within 300ms.
  if (actionType !== "move" && _undoTimer && _lastUndoActionType === actionType && actionType) {
    return
  }
  if (_undoTimer) clearTimeout(_undoTimer)
  _undoTimer = setTimeout(() => { _undoTimer = undefined }, 300)
  _lastUndoActionType = actionType

  _undoStack.push(entry)
  if (_undoStack.length > MAX_UNDO) _undoStack.shift()
  _redoStack.length = 0 // clear redo on new action
}

export function tryUndo() {
  _doUndo?.()
}

export function tryRedo() {
  _doRedo?.()
}

const nodeTypes = {
  image: ImageNode,
  content: ContentNode,
  text: ContentNode,
  sketch: SketchNode,
  "continuity-report": ContinuityReportNode,
  workflow: WorkflowNode,
  shot: ShotNode,
  storyboardGrid: StoryboardGridNode,
  video: (props: any) => <VideoNode {...props} onRetry={_runVideoRetryFn} onUpscale={_videoUpscaleFn} />,
  agent: (props: any) => (
    <AgentNode
      {...props}
      onRunAgent={_runAgentFn}
      onBatchGenerate={_runBatchGenerateFn}
      onUpdateAgentContent={_updateAgentContentFn}
    />
  ),
};

const edgeTypes = { creative: CreativeEdge };

// ============================================================================
// STAR CANVAS (OUTER - provides ReactFlowProvider)
// rc.2b: accepts projectId for per-project canvas storage isolation
// ============================================================================
export default function StarCanvas({ projectId }: { projectId?: string }) {
  return (
    <ReactFlowProvider>
      <StarCanvasInner projectId={projectId} />
    </ReactFlowProvider>
  );
}

// ============================================================================
// HELPERS (used across the component)
// ============================================================================
// Extracts readable text from a canvas node for export/package generation
function getNodeText(node: Node<CanvasNodeData>): string {
  const data = (node.data || {}) as Record<string, unknown>;
  return [data.title, data.summary, data.content, data.prompt]
    .filter(Boolean)
    .join("\n");
}

function parseTimelineDurationSeconds(value: unknown, fallback = 5): number {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(1, value);
  if (typeof value !== "string") return fallback;
  const parsed = parseDurationToSeconds(value);
  return parsed && Number.isFinite(parsed) ? Math.max(1, parsed) : fallback;
}

function buildTimelineClipsFromNodes(nodes: Node<CanvasNodeData>[]): TimelineClip[] {
  let cursor = 0;
  const clips: TimelineClip[] = [];

  for (const node of nodes) {
    const data = node.data || {};
    const shot = data.shot;
    const title = data.title || data.fileName || shot?.title || "未命名片段";
    const duration = parseTimelineDurationSeconds(
      data.timelineDurationSeconds ?? data.duration ?? shot?.duration ?? data.totalDurationSeconds,
      5,
    );

    // 优先使用节点已设置的真实时间，否则按 cursor 顺序累加（兼容旧数据）
    const hasRealTime = data.timelineStartTimeSeconds !== undefined;
    const startTime = hasRealTime ? data.timelineStartTimeSeconds! : cursor;
    if (!hasRealTime) cursor += duration;

    const videoUrl = data.resultUrl || data.assetUrl || (data.nodeKind === "uploaded-video" ? data.imageUrl : undefined);
    const imageUrl = shot?.generatedImageUrl || data.imageUrl || data.thumbnailUrl;

    // 所有节点都在时间轴上显示（MVP：统一放到 video 轨道）
    clips.push({
      id: `tl-clip-${node.id}`,
      nodeId: node.id,
      type: "video",
      label: String(title),
      startTime,
      duration,
      thumbnailUrl: imageUrl,
    });
  }

  return clips;
}

// ============================================================================
// STAR CANVAS INNER (uses hooks that require ReactFlow context)
// rc.2b: accepts projectId for per-project canvas storage isolation
// ============================================================================
function StarCanvasInner({ projectId }: { projectId?: string }) {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [reactFlowInstance, setReactFlowInstance] =
    useState<ReactFlowInstance | null>(null);
  // ★ nodesRef.current 是同步更新的节点快照，_rfGetNodes() 读取 ReactFlow 内部异步状态可能拿到旧值
  // 所有读节点操作统一用 nodesRef.current，不再使用 useReactFlow 的 getNodes/getEdges
  const fileInputRef = useRef<HTMLInputElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);
  const pendingDocumentUploadPositionRef = useRef<{ x: number; y: number } | null>(null);

  // ========================================================================
  // ZUSTAND STORE
  // ========================================================================
  const {
    viewport,
    setViewport,
    fitViewOnce,
    setFitViewOnce,
    selectedNodeId,
    setSelectedNodeId,
    contextMenu,
    setContextMenu,
    closeContextMenu,
    floatingToolbar,
    setFloatingToolbar,
    closeFloatingToolbar,
    assetLibrary,
    openAssetLibrary,
    closeAssetLibrary,
    setAssetLibraryQuery,
    setAssetLibraryFolder,
    addAsset,
    removeAsset,
    toggleAssetFavorite,
    clipboardNode,
    setClipboardNode,
    previewImageNodeId,
    setPreviewImageNodeId,
    cropImageNodeId,
    setCropImageNodeId,
    showCanvasHint,
    dismissCanvasHint,
    isCanvasRestored,
    setIsCanvasRestored,
    clearPersistedCanvas,
    allowAIAutoRun,
    showPromptPreview,
    promptPreviewNodeId,
    closePromptPreview,
  } = useCanvasStore();

  const [showPropertyPanel, setShowPropertyPanel] = useState(false);
  const [selectionCount, setSelectionCount] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  // ========================================================================
  // REACT FLOW STATE
  // ========================================================================
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<CanvasNodeData>>(
    [],
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  // Cache nodes/edges in refs so callbacks don't need state deps (avoids re-registering)
  const nodesRef = useRef(nodes);
  // Snapshot before drag start for undo/redo
  const dragStartSnapshotRef = useRef<UndoEntry | null>(null);
  const edgesRef = useRef(edges);
  const latestShotGenerationRequestIdsRef = useRef<Record<string, string>>({});
  nodesRef.current = nodes;
  edgesRef.current = edges;
  const batchProgressRef = useRef<BatchProgressHandle>(null);

  // Centralized node/edge update helper — replaces the repeated pattern:
  //   setNodes((nds) => { const updated = ...; nodesRef.current = updated; return updated; })
  const applyNodeUpdates = useCallback(
    (mapper: (nds: Node<CanvasNodeData>[]) => Node<CanvasNodeData>[]) => {
      setNodes((nds) => {
        const updated = mapper(nds);
        nodesRef.current = updated;
        return updated;
      });
    },
    [setNodes],
  );
  const applyEdgeUpdates = useCallback(
    (mapper: (eds: Edge[]) => Edge[]) => {
      setEdges((eds) => {
        const updated = mapper(eds);
        edgesRef.current = updated;
        return updated;
      });
    },
    [setEdges],
  );

  useEffect(() => {
    return () => {
      revokeAllTrackedObjectUrls();
      // Clean up module-level bridge variables to prevent stale closures
      _runAgentFn = undefined;
      _runBatchGenerateFn = undefined;
      _updateAgentContentFn = undefined;
      _runVideoRetryFn = undefined;
      _videoUpscaleFn = undefined;
    };
  }, []);

  // Auto-load bible characters from IndexedDB on mount
  useEffect(() => {
    loadBibleFromIDB().then((chars) => {
      if (chars.length > 0) {
        useCanvasStore.setState({ bibleCharacters: chars })
      }
    })
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const now = Date.now();
      setNodes((nds) => {
        const hasActiveGeneration = nds.some(
          (n) => n.data.shot?.generationStatus === "generating" || n.data.shot?.generationStatus === "retrying",
        );
        if (!hasActiveGeneration) return nds;

        return nds.map((node) => {
          const shot = node.data.shot;
          if (!shot || (shot.generationStatus !== "generating" && shot.generationStatus !== "retrying")) return node;

          const startedAt = shot.generationStartedAt ?? 0;
          if (!startedAt || now - startedAt < SHOT_GENERATION_WATCHDOG_TIMEOUT_MS) {
            return node;
          }

          if (shot.generationRequestId) {
            delete latestShotGenerationRequestIdsRef.current[node.id];
          }

          const message = "图片生成超过 90 秒仍未返回，已自动标记为失败。请点击重试。";
          return {
            ...node,
            data: {
              ...node.data,
              generation: node.data.generation
                ? {
                    ...node.data.generation,
                    status: "failed" as const,
                    completedAt: new Date().toISOString(),
                    error: message,
                  }
                : node.data.generation,
              shot: {
                ...shot,
                status: "error" as const,
                generationStatus: "failed" as const,
                generationFinishedAt: now,
                generationErrorCode: "WATCHDOG_TIMEOUT",
                generationRetryable: true,
                errorMessage: message,
                generationError: message,
              },
            },
          };
        });
      });
    }, SHOT_GENERATION_WATCHDOG_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [setNodes]);

  // ========================================================================
  // LOCAL STATE
  // ========================================================================
  const [chatOpen, setChatOpen] = useState(true);
  const [showHistory, setShowHistory] = useState(false);
  const [showWorkspaceHistory, setShowWorkspaceHistory] = useState(false);
  const [showTemplatesDialog, setShowTemplatesDialog] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [showHelp, setShowHelp] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showAddNodePanel, setShowAddNodePanel] = useState(false);
  const [showNodeHistory, setShowNodeHistory] = useState(false);
  const [showScriptImportPanel, setShowScriptImportPanel] = useState(false);
  const [showVideoRemixPanel, setShowVideoRemixPanel] = useState(false);
  const [showProjectBiblePanel, setShowProjectBiblePanel] = useState(false);
  const [showCharacterBiblePanel, setShowCharacterBiblePanel] = useState(false);
  const [showShotList, setShowShotList] = useState(false);
  const [showStyleLibrary, setShowStyleLibrary] = useState(false);
  const [showAngleControl, setShowAngleControl] = useState(false);
  const [showVersionCompare, setShowVersionCompare] = useState(false);
  const [showSceneBiblePanel, setShowSceneBiblePanel] = useState(false);
  const [showStyleBiblePanel, setShowStyleBiblePanel] = useState(false);
  const [showEmotionCurve, setShowEmotionCurve] = useState(false);
  const [showCharacterLibrary, setShowCharacterLibrary] = useState(false);
  const [showChainGenerate, setShowChainGenerate] = useState(false);
  const [showParamControl, setShowParamControl] = useState(false);
  const [showShotEditor, setShowShotEditor] = useState(false);
  const [showBgRemover, setShowBgRemover] = useState(false);
  const [showBgm, setShowBgm] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [showCinemaLab, setShowCinemaLab] = useState(false);
  const [showTransitionPicker, setShowTransitionPicker] = useState(false);
  const [transitionState, setTransitionState] = useState<{ effect: string; duration: number }>({
    effect: "fade",
    duration: 1.0,
  });
  const [agentMode, setAgentMode] = useState<AgentMode>("ask");
  // 制片层面板
  const [showCharacterView, setShowCharacterView] = useState(false);
  const [showCinematicParams, setShowCinematicParams] = useState(false);
  const [showColorGrade, setShowColorGrade] = useState(false);
  const [showTimeline, setShowTimeline] = useState(false);
  const [showPanorama, setShowPanorama] = useState(false);
  const [showCrewAgentPanel, setShowCrewAgentPanel] = useState(false);
  const [showReverseStoryboard, setShowReverseStoryboard] = useState(false);
  const [showShotLibrary, setShowShotLibrary] = useState(false);
  const [showAIScript, setShowAIScript] = useState(false);

  // ── Onboarding ──────────────────────────────────────
  const onboarding = useOnboarding();

  const onboardingStepActions = useMemo(
    () => ({
      "choose-style": () => {
        setShowStyleLibrary(true)
        onboarding.completeStep("choose-style")
      },
      "adjust-cinematic-params": () => {
        setShowCinematicParams(true)
        onboarding.completeStep("adjust-cinematic-params")
      },
      "generate-ai-script": () => {
        setShowAIScript(true)
        onboarding.completeStep("generate-ai-script")
      },
      "import-script-to-canvas": () => {
        // This is completed via the AI Script panel's onImportShots callback
        setShowAIScript(true)
      },
      "apply-shot-preset": () => {
        setShowShotLibrary(true)
        onboarding.completeStep("apply-shot-preset")
      },
      "adjust-color-grade": () => {
        setShowColorGrade(true)
        onboarding.completeStep("adjust-color-grade")
      },
    }),
    [onboarding],
  )
  const [showExportPreflight, setShowExportPreflight] = useState(false);
  const [exportPreflightType, setExportPreflightType] = useState<"json" | "zip">("json");
  const [showFileUpload, setShowFileUpload] = useState(false);
  const [showProductionQueue, setShowProductionQueue] = useState(false);
  const [showShotPlanning, setShowShotPlanning] = useState(false);
  const [historyNodeId, setHistoryNodeId] = useState<string | null>(null);
  const [isComposingSelectedShots, setIsComposingSelectedShots] = useState(false);
  const [showStoryboardCompositeSettings, setShowStoryboardCompositeSettings] =
    useState(false);
  const [storyboardCompositeSettings, setStoryboardCompositeSettings] =
    useState<StoryboardCompositeSettings>(DEFAULT_STORYBOARD_COMPOSITE_SETTINGS);
  const [draftStoryboardCompositeSettings, setDraftStoryboardCompositeSettings] =
    useState<StoryboardCompositeSettings>(DEFAULT_STORYBOARD_COMPOSITE_SETTINGS);
  const [storyboardBatchJob, setStoryboardBatchJob] =
    useState<BatchGenerationJob | null>(null);

  const handleDismissStoryboardBatchJob = useCallback(() => {
    setStoryboardBatchJob(null);
  }, []);

  // SourceTracePanel state
  const [showSourceTrace, setShowSourceTrace] = useState(false);
  const [traceHistoryId, setTraceHistoryId] = useState<string | null>(null);
  const [traceNodeInfo, setTraceNodeInfo] = useState<{
    nodeId: string;
    nodeTitle?: string;
  } | null>(null);

  // P2-3A: WorkflowRunPanel state
  const [showRunPanel, setShowRunPanel] = useState(false);
  const [runEvents, setRunEvents] = useState<WorkflowRunEvent[]>([]);
  const appendWorkspaceHistory = useWorkspaceHistoryStore((state) => state.append);
  const addCanvasSnapshot = useCanvasSnapshotStore((state) => state.addSnapshot);
  const snapshotStoreSnapshots = useCanvasSnapshotStore((state) => state.snapshots);
  const latestSnapshotId = snapshotStoreSnapshots[0]?.id;

  const addWorkspaceHistoryEvent = useCallback(
    (event: Parameters<typeof appendWorkspaceHistory>[0]) => {
      appendWorkspaceHistory(event);
    },
    [appendWorkspaceHistory],
  );

  const characterLibraryItems = useMemo(
    () => collectCharacterAssetLibraryItemsFromShots(
      nodes.map((node) => node.data.shot).filter((shot): shot is NonNullable<CanvasNodeData["shot"]> => Boolean(shot)),
    ),
    [nodes],
  );

  const sceneBibleItems = useMemo<ProjectSceneBibleItem[]>(() => {
    const itemById = new Map<string, ProjectSceneBibleItem>();

    for (const node of nodes) {
      const shot = node.data.shot;
      if (!shot) continue;
      const sceneAnalysis = shot.sceneAnalysis;
      const storedScene = node.data.projectScenes?.[0];
      const fallbackId = shot.cinematicShot?.sceneId || shot.sourceStoryboardNodeId || "scene-unknown";
      const sceneId = sceneAnalysis?.sceneId || storedScene?.id || fallbackId;
      const location = sceneAnalysis?.location || storedScene?.location || "未命名场景";
      const existing = itemById.get(sceneId);
      const shotTitle = shot.title || node.data.title || `镜头 ${shot.order}`;
      const characters = sceneAnalysis?.characters ?? storedScene?.characters ?? shot.characterIdentities?.map((character) => character.name).filter(Boolean) ?? [];
      const next: ProjectSceneBibleItem = existing
        ? {
            ...existing,
            shotCount: existing.shotTitles.includes(shotTitle) ? existing.shotCount : existing.shotCount + 1,
            shotTitles: existing.shotTitles.includes(shotTitle) ? existing.shotTitles : [...existing.shotTitles, shotTitle],
            characters: [...new Set([...existing.characters, ...characters])],
          }
        : {
            id: sceneId,
            sceneNumber: sceneAnalysis?.sceneNumber ?? storedScene?.sceneNumber,
            location,
            timeOfDay: sceneAnalysis?.timeOfDay ?? storedScene?.timeOfDay,
            characters: [...new Set(characters)],
            summary: sceneAnalysis?.summary ?? storedScene?.summary,
            atmosphere: storedScene?.atmosphere,
            lightingStyle: storedScene?.lightingStyle,
            colorPalette: storedScene?.colorPalette,
            shotCount: 1,
            shotTitles: [shotTitle],
          };
      itemById.set(sceneId, next);
    }

    return [...itemById.values()].sort((a, b) => (a.sceneNumber ?? 9999) - (b.sceneNumber ?? 9999));
  }, [nodes]);

  // 情绪曲线数据：从分镜中的 dramaticWeight / dramaticTension 汇总
  const emotionCurveData = useMemo<EmotionCurveDataPoint[]>(() => {
    // 优先从 cinematic shot 的 dramaticWeight 收集
    const shotWeights = nodes
      .map((node) => node.data.shot?.cinematicShot?.dramaticWeight)
      .filter((w): w is number => typeof w === "number");

    if (shotWeights.length > 0) {
      // 如果已有 cinematic shot 数据，按场景分组
      const sceneMap = new Map<string, number[]>();
      for (const node of nodes) {
        const shot = node.data.shot;
        if (!shot?.cinematicShot) continue;
        const sceneId = shot.cinematicShot.sceneId || "default";
        if (!sceneMap.has(sceneId)) sceneMap.set(sceneId, []);
        sceneMap.get(sceneId)!.push(shot.cinematicShot.dramaticWeight);
      }
      if (sceneMap.size > 0) {
        return Array.from(sceneMap.entries()).map(([sceneId, weights], index) => {
          const maxWeight = Math.max(...weights);
          const avgWeight = weights.reduce((a, b) => a + b, 0) / weights.length;
          return {
            sceneIndex: index,
            tension: Math.round((maxWeight * 0.6 + avgWeight * 0.4) * 10) / 10,
            label: sceneBibleItems.find((item) => item.id === sceneId)?.location || `场景 ${index + 1}`,
          };
        });
      }
    }

    // fallback: 用 sceneBibleItems 生成基本曲线
    return sceneBibleItems.map((item, index) => {
      const baseTension = Math.min(5 + (index / Math.max(sceneBibleItems.length, 1)) * 4, 9);
      return {
        sceneIndex: index,
        tension: Math.round(baseTension * 10) / 10,
        label: item.location || `场景 ${index + 1}`,
        function: item.summary,
      };
    });
  }, [nodes, sceneBibleItems]);

  const projectVisualBible = useMemo<ProjectVisualBible>(() => {
    const sourceVisuals = nodes.map((node) => node.data.projectVisualBible).filter(Boolean) as NonNullable<CanvasNodeData["projectVisualBible"]>[];
    const sourcePrompts = nodes
      .map((node) => node.data.compositeSettings?.stylePrompt || node.data.projectVisualBible?.stylePrompt)
      .filter((value): value is string => Boolean(value?.trim()));
    const colorPalette = sourceVisuals.flatMap((item) => item.colorPalette ?? []);
    const latest = sourceVisuals[sourceVisuals.length - 1];
    return {
      name: latest?.name || "项目视觉风格",
      description: latest?.description || "",
      colorPalette: [...new Set(colorPalette)],
      lightingStyle: latest?.lightingStyle || "",
      cameraNotes: latest?.cameraNotes || "",
      aspectRatio: latest?.aspectRatio || "16:9",
      stylePrompt: latest?.stylePrompt || sourcePrompts[sourcePrompts.length - 1] || storyboardCompositeSettings.stylePrompt || "",
      sourceCount: sourceVisuals.length + sourcePrompts.length,
    };
  }, [nodes, storyboardCompositeSettings.stylePrompt]);

  const timelineClips = useMemo(() => buildTimelineClipsFromNodes(nodes), [nodes]);
  const [timelineCurrentTime, setTimelineCurrentTime] = useState(0);
  const [isTimelinePlaying, setIsTimelinePlaying] = useState(false);
  const playIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 播放控制
  const toggleTimelinePlay = useCallback(() => {
    setIsTimelinePlaying((prev) => {
      if (prev) {
        if (playIntervalRef.current) {
          clearInterval(playIntervalRef.current);
          playIntervalRef.current = null;
        }
        return false;
      }
      const maxTime = Math.max(0, ...nodesRef.current.map((n) =>
        (n.data?.timelineStartTimeSeconds ?? 0) + (n.data?.timelineDurationSeconds ?? 5),
      ));
      playIntervalRef.current = setInterval(() => {
        setTimelineCurrentTime((t) => {
          if (t >= maxTime) {
            if (playIntervalRef.current) {
              clearInterval(playIntervalRef.current);
              playIntervalRef.current = null;
            }
            setIsTimelinePlaying(false);
            return 0;
          }
          return t + 0.1;
        });
      }, 100);
      return true;
    });
  }, []);

  // 清理播放定时器
  useEffect(() => {
    return () => {
      if (playIntervalRef.current) {
        clearInterval(playIntervalRef.current);
      }
    };
  }, []);

  // 根据时间轴当前时间过滤可见节点
  const visibleNodes = useMemo(() => {
    // 时间轴收起时始终显示全部
    if (!showTimeline) return nodes;
    return nodes.map((node) => {
      const start = node.data?.timelineStartTimeSeconds ?? 0;
      const duration = node.data?.timelineDurationSeconds ?? 5;
      const isVisible = timelineCurrentTime >= start && timelineCurrentTime < start + duration;
      return {
        ...node,
        style: {
          ...node.style,
          opacity: isVisible ? 1 : 0.08,
        },
      };
    });
  }, [nodes, timelineCurrentTime, showTimeline]);

  // 同步过滤 edges：只保留两端节点都可见的连接
  const visibleEdges = useMemo(() => {
    if (!showTimeline) return edges;
    const visibleNodeIds = new Set(
      nodes
        .filter((node) => {
          const start = node.data?.timelineStartTimeSeconds ?? 0;
          const duration = node.data?.timelineDurationSeconds ?? 5;
          return timelineCurrentTime >= start && timelineCurrentTime < start + duration;
        })
        .map((n) => n.id),
    );
    return edges.filter((e) => visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target));
  }, [edges, nodes, timelineCurrentTime, showTimeline]);

  const productionRunQueue = useMemo(() => {
    const briefs = buildShotProductionBriefs(nodes);
    if (briefs.length === 0) return null;
    const manifest = buildProjectPackageManifest({ shots: briefs.map((b) => ({ id: b.shotId, order: b.order, title: b.title })), productionBriefs: briefs });
    return buildProductionRunQueue(manifest, { jobId: "canvas-production-run" });
  }, [nodes]);

  // Derive project title from storyboard content node
  const projectTitle = useMemo(() => {
    const storyboardNode = nodes.find(
      (n) =>
        (n.type === "content" || n.type === "storyboard") &&
        ((n.data as Record<string, unknown>)?.nodeKind === "storyboard" ||
          (n.data as Record<string, unknown>)?.storyboardAssistantStage != null),
    );
    return (storyboardNode?.data as Record<string, unknown>)?.title as string | undefined;
  }, [nodes]);

  // Extract planning-relevant fields from canvas nodes
  const planningNodes = useMemo(
    () =>
      nodes
        .filter((n) => n.type === "shot" || n.type === "storyboardImage" || n.type === "storyboardText")
        .map((n) => ({
          id: n.id,
          title: (n.data as Record<string, unknown>)?.title as string | undefined,
          description: (n.data as Record<string, unknown>)?.description as string | undefined,
          shotPresetId: (n.data as Record<string, unknown>)?.shotPresetId as string | undefined,
          stylePresetId: (n.data as Record<string, unknown>)?.stylePresetId as string | undefined,
          durationSec: (n.data as Record<string, unknown>)?.duration as number | undefined,
        })),
    [nodes],
  );

  // ── Production Run Executor (Step 3: real executor mapping) ──
  const productionExecutor = useProductionRunExecutor({
    queue: productionRunQueue,
    onExecuteTask: useCallback(
      async (task, signal) => {
        // 找到包含该 shot 的 canvas node
        const shotNode = nodesRef.current.find(
          (n) => n.data.shot?.id === task.shotId,
        );
        if (!shotNode) {
          throw new Error(`找不到 shotId=${task.shotId} 对应的画布节点`);
        }

        switch (task.action) {
          case "generate-storyboard-image": {
            // 使用 shotNode.data.prompt 或 shot.visualPrompt 作为生成提示词
            const prompt =
              shotNode.data.prompt?.trim() ||
              shotNode.data.shot?.visualPrompt?.trim() ||
              "";
            if (!prompt) {
              throw new Error("缺少视觉提示词，无法生成分镜图");
            }

            // 标记 shotNode 为 generating
            setNodes((nds) =>
              nds.map((n) =>
                n.id === shotNode.id
                  ? { ...n, data: { ...n.data, generationStatus: "generating" as const } }
                  : n,
              ),
            );

            try {
              const model = await getDefaultImageModel();
              const result = await generateImageFromPrompt({
                prompt,
                model,
                size: "1792x1024",
              });

              const imageNodeId = generateId();
              const nodeWidth =
                typeof shotNode.width === "number" ? shotNode.width : 320;

              setNodes((nds) => [
                ...nds.map((n) =>
                  n.id === shotNode.id
                    ? {
                        ...n,
                        data: {
                          ...n.data,
                          generationStatus: "succeeded" as const,
                          imageUrl: result.imageUrl,
                          generatedImageUrl: result.imageUrl,
                          errorMessage: undefined,
                        },
                      }
                    : n,
                ),
                {
                  id: imageNodeId,
                  type: "image",
                  position: {
                    x: (shotNode.position.x ?? 0) + nodeWidth + 80,
                    y: shotNode.position.y ?? 0,
                  },
                  data: {
                    title: shotNode.data.title
                      ? `${shotNode.data.title} 图`
                      : "分镜图",
                    imageUrl: result.imageUrl,
                    assetId: result.assetId,
                    nodeKind: "ai-generated-image",
                    sourceShotId: shotNode.id,
                    sourcePromptId: shotNode.id,
                    sourceType: "shot",
                    prompt,
                    model,
                    source: "generated",
                    persistence: result.assetId ? "indexeddb" : undefined,
                    displayWidth: 320,
                    displayHeight: 180,
                    createdAt: Date.now(),
                  },
                } as any,
              ]);

              setEdges((eds) => [
                ...eds,
                {
                  id: `edge-gen-${shotNode.id}-${imageNodeId}`,
                  source: shotNode.id,
                  target: imageNodeId,
                  type: "creative",
                  animated: true,
                  style: { stroke: "rgba(168, 85, 247, 0.3)", strokeWidth: 1.5 },
                },
              ]);
            } catch (err: any) {
              setNodes((nds) =>
                nds.map((n) =>
                  n.id === shotNode.id
                    ? {
                        ...n,
                        data: {
                          ...n.data,
                          generationStatus: "failed" as const,
                          errorMessage: friendlyErrorMessage(err?.message || ""),
                        },
                      }
                    : n,
                ),
              );
              throw err;
            }
            break;
          }

          case "generate-voice-track": {
            const dialogue = shotNode.data.shot?.dialogue?.trim() || "";
            if (!dialogue) {
              // 无台词，跳过此任务（标记完成）
              return;
            }

            const voiceConfig = shotNode.data.shot?.voiceConfig || {
              mode: "auto" as const,
              text: "",
            };

            try {
              const ttsResult = await generateTtsAudio({
                text: dialogue,
                voiceConfig,
              });
              const persistedAudio = await persistTtsAudio(ttsResult.audioBlob, {
                fileName: `${shotNode.data.title || "shot"}-voice.wav`,
              });

              const audioNodeId = generateId();
              const nodeWidth =
                typeof shotNode.width === "number" ? shotNode.width : 320;

              setNodes((nds) => [
                ...nds,
                {
                  id: audioNodeId,
                  type: "audio",
                  position: {
                    x: (shotNode.position.x ?? 0) + nodeWidth + 80,
                    y: (shotNode.position.y ?? 0) + 100,
                  },
                  data: {
                    title: shotNode.data.title
                      ? `${shotNode.data.title} 配音`
                      : "配音",
                    audioUrl: persistedAudio.objectUrl,
                    audioAssetId: persistedAudio.assetId,
                    durationSeconds: Math.max(1, Math.round(dialogue.length * 0.18)),
                    nodeKind: "tts-audio",
                    sourceShotId: shotNode.id,
                    sourceType: "shot",
                    dialogue,
                    voiceConfig,
                    createdAt: Date.now(),
                  },
                } as any,
              ]);

              setEdges((eds) => [
                ...eds,
                {
                  id: `edge-tts-${shotNode.id}-${audioNodeId}`,
                  source: shotNode.id,
                  target: audioNodeId,
                  type: "creative",
                  animated: true,
                  style: { stroke: "rgba(34, 197, 94, 0.3)", strokeWidth: 1.5 },
                },
              ]);
            } catch (err: any) {
              throw new Error(`配音生成失败: ${err?.message || "未知错误"}`);
            }
            break;
          }

          case "create-subtitle-track": {
            const dialogue = shotNode.data.shot?.dialogue?.trim() || "";
            if (!dialogue) {
              // 无台词，跳过
              return;
            }

            // 从 shot 中获取时长（优先使用 shot.duration 解析，默认 5 秒）
            const rawDuration = shotNode.data.shot?.duration;
            const shotDuration =
              parseDurationToSeconds(rawDuration) ??
              (typeof rawDuration === "number" ? rawDuration : 5);

            // 生成 SRT 格式字幕
            const subtitleResult = formatDialogueAsSrt(dialogue, {
              durationSeconds: shotDuration,
              maxCharsPerLine: 40,
              minSegmentDuration: 1,
            });

            const subtitleNodeId = generateId();
            const nodeWidth =
              typeof shotNode.width === "number" ? shotNode.width : 320;

            // 将 SRT 内容存储为文本节点的内容
            const subtitleText = [
              `# 字幕`,
              ``,
              `**格式**: SRT`,
              `**总时长**: ${subtitleResult.totalDurationSeconds}s`,
              `**段落数**: ${subtitleResult.segments.length}`,
              ``,
              `## SRT 内容`,
              `---`,
              subtitleResult.srt,
              `---`,
              `## 时间轴`,
              ...subtitleResult.segments.map(
                (seg) =>
                  `- ${seg.startSeconds}s → ${seg.endSeconds}s: ${seg.text}`,
              ),
            ].join("\n");

            setNodes((nds) => [
              ...nds,
              {
                id: subtitleNodeId,
                type: "text",
                position: {
                  x: (shotNode.position.x ?? 0) + nodeWidth + 80,
                  y: (shotNode.position.y ?? 0) + 200,
                },
                data: {
                  title: shotNode.data.title
                    ? `${shotNode.data.title} 字幕`
                    : "字幕",
                  text: subtitleText,
                  nodeKind: "subtitle-srt",
                  sourceShotId: shotNode.id,
                  sourceType: "shot",
                  format: "srt",
                  srtContent: subtitleResult.srt,
                  segments: subtitleResult.segments,
                  totalDurationSeconds: subtitleResult.totalDurationSeconds,
                  createdAt: Date.now(),
                },
              } as any,
            ]);

            setEdges((eds) => [
              ...eds,
              {
                id: `edge-sub-${shotNode.id}-${subtitleNodeId}`,
                source: shotNode.id,
                target: subtitleNodeId,
                type: "creative",
                animated: true,
                style: { stroke: "rgba(59, 130, 246, 0.3)", strokeWidth: 1.5 },
              },
            ]);
            break;
          }

          case "review-handoff-warnings": {
            // 幂等性：如果已有交接报告节点，跳过
            const existingReport = nodesRef.current.find(
              (n) => n.data.nodeKind === "handoff-report",
            );
            if (existingReport) break;

            // 汇总所有 shot 节点的 handoffWarnings
            const warningsByShot: Array<{
              shotNode: Node;
              warnings: string[];
            }> = [];

            for (const n of nodesRef.current) {
              const shot = n.data.shot;
              if (!shot) continue;

              // 使用 buildShotProductionBrief 构建生产简报，提取 handoff.warnings
              const brief = buildShotProductionBrief(shot);
              const warnings = brief.handoff.warnings || [];

              if (warnings.length > 0) {
                warningsByShot.push({ shotNode: n, warnings });
              }
            }

            // 生成报告文本
            const now = new Date().toISOString().slice(0, 19).replace("T", " ");
            const reportTitle = `交接警告报告`;
            const totalWarnings = warningsByShot.reduce(
              (sum, item) => sum + item.warnings.length,
              0,
            );

            let reportText = [
              `# ${reportTitle}`,
              ``,
              `**生成时间**: ${now}`,
              `**涉及镜头数**: ${warningsByShot.length}`,
              `**警告总数**: ${totalWarnings}`,
              ``,
            ];

            if (warningsByShot.length === 0) {
              reportText.push(`✅ 所有镜头无交接警告。`);
            } else {
              reportText.push(`## 逐镜头警告详情`);
              reportText.push(``);

              for (const { shotNode, warnings } of warningsByShot) {
                const title =
                  shotNode.data.title ||
                  (shotNode.data.shot as any)?.id ||
                  shotNode.id;
                reportText.push(`### ${title}`);
                reportText.push(``);
                for (let i = 0; i < warnings.length; i++) {
                  reportText.push(`- **${i + 1}**. ${warnings[i]}`);
                }
                reportText.push(``);
              }
            }

            const reportTextStr = reportText.join("\n");
            const reportNodeId = generateId();

            // 找到所有有警告的镜头节点中最左侧和最上侧的位置
            const xPositions = warningsByShot.map(
              (item) => item.shotNode.position.x ?? 0,
            );
            const avgX =
              xPositions.length > 0
                ? xPositions.reduce((a, b) => a + b, 0) / xPositions.length
                : 0;
            const minY = warningsByShot.reduce(
              (min, item) =>
                Math.min(min, item.shotNode.position.y ?? Infinity),
              Infinity,
            );

            setNodes((nds) => [
              ...nds,
              {
                id: reportNodeId,
                type: "text",
                position: {
                  x: avgX,
                  y: minY !== Infinity ? minY - 220 : 0,
                },
                data: {
                  title: reportTitle,
                  text: reportTextStr,
                  nodeKind: "handoff-report",
                  sourceType: "production-run",
                  totalWarnings,
                  affectedShotCount: warningsByShot.length,
                  affectedShotIds: warningsByShot.map(
                    (item) => item.shotNode.id,
                  ),
                  createdAt: Date.now(),
                },
              } as any,
            ]);

            // 创建从报告节点到每个有警告的镜头节点的引用边
            const reportEdges = warningsByShot.map(({ shotNode }) => ({
              id: `edge-handoff-${reportNodeId}-${shotNode.id}`,
              source: reportNodeId,
              target: shotNode.id,
              type: "creative",
              animated: true,
              style: {
                stroke: "rgba(234, 179, 8, 0.4)",
                strokeWidth: 1.5,
                strokeDasharray: "6 3",
              },
            }));

            if (reportEdges.length > 0) {
              setEdges((eds) => [...eds, ...reportEdges]);
            }
            break;
          }

          default:
            throw new Error(`未知的生产任务动作: ${(task as any).action}`);
        }
      },
      [setNodes, setEdges],
    ),
  });

  const handleApplyCharacterAssetPatch = useCallback((assetKey: string, patch: CharacterAssetLibraryPatch) => {
    pushUndo({ nodes: nodesRef.current, edges: edgesRef.current }, "bible-patch");
    setNodes((nds) => {
      const shotNodeIndexes: number[] = [];
      const shots = nds.flatMap((node, index) => {
        if (!node.data.shot) return [];
        shotNodeIndexes.push(index);
        return [node.data.shot];
      });
      const syncedShots = applyCharacterAssetLibraryPatchToShots(shots, assetKey, patch);
      let shotIndex = 0;
      const updated = nds.map((node, index) => {
        if (!shotNodeIndexes.includes(index)) return node;
        const nextShot = syncedShots[shotIndex];
        shotIndex += 1;
        if (!nextShot || nextShot === node.data.shot) return node;
        return {
          ...node,
          data: {
            ...node.data,
            shot: nextShot,
          },
        };
      });
      nodesRef.current = updated;
      return updated;
    });
  }, [setNodes]);

  const handleApplySceneBiblePatch = useCallback((sceneId: string, patch: ProjectSceneBiblePatch) => {
    pushUndo({ nodes: nodesRef.current, edges: edgesRef.current }, "bible-patch");
    setNodes((nds) => {
      const updated = nds.map((node) => {
        const shot = node.data.shot;
        if (!shot) return node;
        const currentSceneId = shot.sceneAnalysis?.sceneId || shot.cinematicShot?.sceneId || shot.sourceStoryboardNodeId || "scene-unknown";
        const storedScenes = node.data.projectScenes ?? [];
        const storedScene = storedScenes.find((scene) => scene.id === sceneId);
        if (currentSceneId !== sceneId && !storedScene) return node;

        const nextScene = {
          id: sceneId,
          sceneNumber: shot.sceneAnalysis?.sceneNumber ?? storedScene?.sceneNumber,
          location: patch.location ?? shot.sceneAnalysis?.location ?? storedScene?.location,
          timeOfDay: patch.timeOfDay ?? shot.sceneAnalysis?.timeOfDay ?? storedScene?.timeOfDay,
          characters: shot.sceneAnalysis?.characters ?? storedScene?.characters,
          summary: patch.summary ?? shot.sceneAnalysis?.summary ?? storedScene?.summary,
          atmosphere: patch.atmosphere ?? storedScene?.atmosphere,
          lightingStyle: patch.lightingStyle ?? storedScene?.lightingStyle,
          colorPalette: patch.colorPalette ?? storedScene?.colorPalette,
        };

        return {
          ...node,
          data: {
            ...node.data,
            projectScenes: [nextScene, ...storedScenes.filter((scene) => scene.id !== sceneId)],
            shot: shot.sceneAnalysis
              ? {
                  ...shot,
                  sceneAnalysis: {
                    ...shot.sceneAnalysis,
                    location: nextScene.location || shot.sceneAnalysis.location,
                    timeOfDay: nextScene.timeOfDay || shot.sceneAnalysis.timeOfDay,
                    summary: nextScene.summary || shot.sceneAnalysis.summary,
                  },
                }
              : shot,
          },
        };
      });
      nodesRef.current = updated;
      return updated;
    });
  }, [setNodes]);

  const handleApplyProjectVisualPatch = useCallback((patch: ProjectVisualBiblePatch) => {
    pushUndo({ nodes: nodesRef.current, edges: edgesRef.current }, "bible-patch");
    const nextVisual = {
      name: patch.name || "项目视觉风格",
      description: patch.description,
      colorPalette: patch.colorPalette,
      lightingStyle: patch.lightingStyle,
      cameraNotes: patch.cameraNotes,
      aspectRatio: patch.aspectRatio,
      stylePrompt: patch.stylePrompt,
    };
    setStoryboardCompositeSettings((settings) => ({
      ...settings,
      stylePrompt: patch.stylePrompt ?? settings.stylePrompt,
    }));
    setDraftStoryboardCompositeSettings((settings) => ({
      ...settings,
      stylePrompt: patch.stylePrompt ?? settings.stylePrompt,
    }));
    setNodes((nds) => {
      const preferredSourceId = selectedNodeId && nds.some((node) => node.id === selectedNodeId)
        ? selectedNodeId
        : nds.find((node) => ["storyboard", "document", "text", "prompt"].includes(String(node.data.nodeKind)))?.id;
      const updated = nds.map((node) =>
        node.id === preferredSourceId
          ? {
              ...node,
              data: {
                ...node.data,
                projectVisualBible: nextVisual,
                compositeSettings: {
                  ...(node.data.compositeSettings ?? DEFAULT_STORYBOARD_COMPOSITE_SETTINGS),
                  stylePrompt: patch.stylePrompt ?? node.data.compositeSettings?.stylePrompt ?? DEFAULT_STORYBOARD_COMPOSITE_SETTINGS.stylePrompt,
                },
              },
            }
          : node,
      );
      nodesRef.current = updated;
      return updated;
    });
  }, [selectedNodeId, setNodes]);

  const createDocumentDerivedNode = useCallback(
    (nodeId: string, target: "inspiration" | "storyboard") => {
      const sourceNode = nodesRef.current.find((node) => node.id === nodeId);
      if (!sourceNode || sourceNode.data.nodeKind !== "document") return;

      const sourceText = [
        sourceNode.data.content,
        sourceNode.data.prompt,
        sourceNode.data.summary,
      ]
        .filter(
          (part): part is string =>
            typeof part === "string" && part.trim().length > 0,
        )
        .map((part) => part.trim())[0];

      if (!sourceText) {
        setNodes((nds) =>
          nds.map((node) =>
            node.id === nodeId
              ? {
                  ...node,
                  data: {
                    ...node.data,
                    errorMessage: "这个文档节点是空的，请先补充正文。",
                  },
                }
              : node,
          ),
        );
        return;
      }

      const derivedNodeId = generateId();
      const isStoryboard = target === "storyboard";
      const defaultSize = isStoryboard
        ? NODE_DEFAULT_SIZE.content
        : NODE_DEFAULT_SIZE.workflow;
      const derivedNode: Node<CanvasNodeData> = {
        id: derivedNodeId,
        type: isStoryboard ? "content" : "workflow",
        position: {
          x: sourceNode.position.x + (sourceNode.measured?.width || defaultSize.width) + 80,
          y: sourceNode.position.y,
        },
        width: defaultSize.width,
        height: defaultSize.height,
        measured: defaultSize,
        data: isStoryboard
          ? {
              title: "故事分镜",
              nodeKind: "storyboard",
              content: sourceText,
              prompt: sourceText,
              summary: `由文档《${sourceNode.data.title || sourceNode.data.fileName || "未命名文档"}》转入。`,
              storyboardAssistantStage: "idea",
              autoSizeMode: "fixed-width-height-grows",
              displayWidth: defaultSize.width,
              displayHeight: defaultSize.height,
              sourceType: "document",
              sourcePromptId: nodeId,
              createdAt: Date.now(),
            }
          : {
              ...getWorkflowDefaults("script"),
              title: "灵感碎片",
              content: sourceText,
              prompt: sourceText,
              summary: `从文档《${sourceNode.data.title || sourceNode.data.fileName || "未命名文档"}》提炼故事种子。`,
              sourceType: "document",
              sourcePromptId: nodeId,
              createdAt: Date.now(),
            },
      };

      setNodes((nds) => [
        ...nds.map((node) =>
          node.id === nodeId
            ? { ...node, data: { ...node.data, errorMessage: undefined } }
            : node,
        ),
        derivedNode,
      ]);
      setEdges((eds) => [
        ...eds,
        {
          id: `edge-${nodeId}-${derivedNodeId}`,
          source: nodeId,
          target: derivedNodeId,
          type: "creative",
          animated: true,
          style: { stroke: DESIGN_TOKENS.nodeEdge, strokeWidth: 1.5 },
          data: {
            relation: isStoryboard
              ? "document-to-storyboard"
              : "document-to-inspiration",
          },
        },
      ]);
      setSelectedNodeId(derivedNodeId);
      addWorkspaceHistoryEvent({
        id: generateId(),
        type: "node-created",
        title: isStoryboard ? "文档进入故事分镜" : "文档转为灵感碎片",
        summary: sourceNode.data.title || sourceNode.data.fileName,
        nodeId: derivedNodeId,
        relatedNodeIds: [nodeId, derivedNodeId],
        createdAt: new Date().toISOString(),
      });
    },
    [setNodes, setEdges, setSelectedNodeId, addWorkspaceHistoryEvent],
  );

  const handleCreateStoryboardAssistantFromInspiration = useCallback(
    (nodeId: string) => {
      const sourceNode = nodesRef.current.find((node) => node.id === nodeId);
      if (!sourceNode || sourceNode.data.nodeKind !== "script") return;

      const sourceTextParts = [
        sourceNode.data.content,
        sourceNode.data.prompt,
        sourceNode.data.summary,
      ]
        .filter(
          (part): part is string =>
            typeof part === "string" && part.trim().length > 0,
        )
        .map((part) => part.trim());
      const sourceText = Array.from(new Set(sourceTextParts)).join("\n\n");

      if (!sourceText.trim()) {
        setNodes((nds) =>
          nds.map((node) =>
            node.id === nodeId
              ? {
                  ...node,
                  data: {
                    ...node.data,
                    errorMessage: "请先运行灵感碎片，或粘贴一段可提炼为故事种子的内容。",
                  },
                }
              : node,
          ),
        );
        return;
      }

      const storyboardNodeId = generateId();
      const storyboardNode: Node<CanvasNodeData> = {
        id: storyboardNodeId,
        type: "content",
        position: {
          x: sourceNode.position.x + NODE_DEFAULT_SIZE.workflow.width + 80,
          y: sourceNode.position.y,
        },
        data: {
          title: "故事分镜",
          nodeKind: "storyboard",
          content: sourceText,
          prompt: sourceText,
          summary: "由灵感碎片提炼出的故事种子，可继续生成完整故事。",
          storyboardAssistantStage: "idea",
          autoSizeMode: "fixed-width-height-grows",
          displayWidth: NODE_DEFAULT_SIZE.content.width,
          displayHeight: NODE_DEFAULT_SIZE.content.height,
          createdAt: Date.now(),
        },
        width: NODE_DEFAULT_SIZE.content.width,
        height: NODE_DEFAULT_SIZE.content.height,
        measured: NODE_DEFAULT_SIZE.content,
      };

      setNodes((nds) => [
        ...nds.map((node) =>
          node.id === nodeId
            ? { ...node, data: { ...node.data, errorMessage: undefined } }
            : node,
        ),
        storyboardNode,
      ]);
      setEdges((eds) => [
        ...eds,
        {
          id: `edge-${nodeId}-${storyboardNodeId}`,
          source: nodeId,
          target: storyboardNodeId,
          type: "creative",
          animated: true,
          style: { stroke: DESIGN_TOKENS.nodeEdge, strokeWidth: 1.5 },
          data: { relation: "inspiration-to-storyboard" },
        },
      ]);
      setSelectedNodeId(storyboardNodeId);
      addWorkspaceHistoryEvent({
        id: generateId(),
        type: "node-created",
        title: "灵感碎片进入故事分镜",
        summary: sourceNode.data.title || sourceNode.data.summary,
        nodeId: storyboardNodeId,
        relatedNodeIds: [nodeId, storyboardNodeId],
        createdAt: new Date().toISOString(),
      });
    },
    [setNodes, setEdges, setSelectedNodeId, addWorkspaceHistoryEvent],
  );

  const handleSplitStoryboardNode = useCallback(
    (
      nodeId: string,
      createGrid = true,
      options: { processVisible?: boolean } = {},
    ): { shotNodeIds: string[]; gridNodeId?: string } => {
      // ★ 用 nodesRef.current 替代 _rfGetNodes()：setNodes 异步，ref 同步
      const currentNodes = nodesRef.current as Node<CanvasNodeData>[];
      const sourceNode = currentNodes.find((node) => node.id === nodeId);
      if (!sourceNode) return { shotNodeIds: [] };

      // 去重：清理所有关联此源节点的旧 Shot/Grid 节点
      // 不仅按 generatedShotNodeIds 匹配，也按 sourceStoryboardNodeId 匹配
      // 解决 persisted state 中 generatedShotNodeIds 丢失导致旧节点残留的问题
      const explicitIds = new Set<string>([
        ...(sourceNode.data.generatedShotNodeIds ?? []),
        ...(sourceNode.data.generatedStoryboardGridNodeId ? [sourceNode.data.generatedStoryboardGridNodeId] : []),
      ]);
      const idsToRemove = new Set<string>([
        ...explicitIds,
        // 扫描 currentNodes（ReactFlow 内部状态），找出引用此源节点的孤儿 Shot/Grid 节点
        ...currentNodes
          .filter((n) => {
            const d = n.data;
            return n.type === "shot" || n.type === "storyboardGrid" || d?.role === "storyboard-process" || d?.isStoryboardProcessNode;
          })
          .filter((n) => {
            const d = n.data;
            return d?.sourceStoryboardNodeId === nodeId ||
                   d?.shot?.sourceStoryboardNodeId === nodeId ||
                   d?.storyboardGrid?.sourceStoryboardNodeId === nodeId;
          })
          .map((n) => n.id),
      ]);

      const sourceTextParts = [
        sourceNode.data.content,
        sourceNode.data.prompt,
        sourceNode.data.summary,
      ]
        .filter(
          (part): part is string =>
            typeof part === "string" && part.trim().length > 0,
        )
        .map((part) => part.trim());
      const sourceText = Array.from(new Set(sourceTextParts)).join("\n\n");
      const parsedShots = parseStoryboardTextToShots(sourceText, nodeId);
      const seenShotKeys = new Set<string>();
      const shots = parsedShots.filter((shot) => {
        const key = [
          shot.order,
          shot.title,
          shot.description,
          shot.visualPrompt,
        ]
          .join("|")
          .replace(/\s+/g, " ")
          .trim()
          .toLowerCase();
        if (seenShotKeys.has(key)) return false;
        seenShotKeys.add(key);
        return true;
      });
      if (shots.length === 0) {
        const message = sourceText.trim()
          ? "没有识别到可拆分的分镜格式。建议使用 1. / 2. / 镜头1 / Markdown 表格等格式。"
          : "这个文本节点是空的，请先粘贴文字分镜。";
        setNodes((nds) =>
          nds.map((node) =>
            node.id === nodeId
              ? { ...node, data: { ...node.data, errorMessage: message } }
              : node,
          ),
        );
        return { shotNodeIds: [] };
      }

      const processVisible = options.processVisible !== false;
      const shotNodes: Node<CanvasNodeData>[] = shots.map((shot, index) => {
        const normalizedTitle = createNormalizedShotTitle(shot);
        const normalizedShot: typeof shot = {
          ...shot,
          title: normalizedTitle,
          sourceStoryboardNodeId: nodeId,
        };

        return {
          id: generateId(),
          type: "shot",
          position: getStoryboardProcessNodePosition(sourceNode, index),
          hidden: !processVisible,
          data: {
            title: normalizedTitle,
            nodeKind: "shot",
            sourceStoryboardNodeId: nodeId,
            role: "storyboard-process",
            isStoryboardProcessNode: true,
            hiddenByStoryboardProcessMode: !processVisible,
            shot: { ...normalizedShot, id: generateId() },
            content: shot.description,
            prompt: shot.visualPrompt,
            displayWidth: STORYBOARD_SHOT_LAYOUT.shotWidth,
            displayHeight: STORYBOARD_SHOT_LAYOUT.shotHeight,
            createdAt: Date.now(),
          },
          width: STORYBOARD_SHOT_LAYOUT.shotWidth,
          height: STORYBOARD_SHOT_LAYOUT.shotHeight,
          measured: {
            width: STORYBOARD_SHOT_LAYOUT.shotWidth,
            height: STORYBOARD_SHOT_LAYOUT.shotHeight,
          },
        };
      });

      const shotNodesForGrid = shotNodes.slice(0, 9);
      const gridColumns = shotNodesForGrid.length <= 1 ? 1 : shotNodesForGrid.length <= 2 ? 2 : 3;
      const gridMaxShots = shotNodesForGrid.length;

      const gridNodeId = generateId();
      const shouldCreateGridNode = createGrid && shotNodesForGrid.length > 1;
      const gridNode: Node<CanvasNodeData> | null = shouldCreateGridNode
        ? {
            id: gridNodeId,
            type: "storyboardGrid",
            position: getStoryboardProcessGridPosition(sourceNode, shotNodesForGrid.length),
            hidden: !processVisible,
            data: {
              title: "分镜合成预览",
              nodeKind: "storyboard-grid",
              role: "storyboard-process",
              isStoryboardProcessNode: true,
              hiddenByStoryboardProcessMode: !processVisible,
              storyboardGrid: {
                id: generateId(),
                title: "分镜合成预览",
                sourceStoryboardNodeId: nodeId,
                shotNodeIds: shotNodesForGrid.map((node) => node.id),
                columns: gridColumns,
                maxShots: gridMaxShots,
                shotStates: shotNodesForGrid.map((node) => ({
                  shotNodeId: node.id,
                  order: node.data.shot?.order,
                  title: node.data.shot?.title,
                  status: "missing" as const,
                })),
                status: "draft",
              },
              displayWidth: 360,
              displayHeight: 360,
              createdAt: Date.now(),
            },
            width: 360,
            height: 360,
            measured: {
              width: 360,
              height: 360,
            },
          }
        : null;

      // Flowise 模式：用函数式更新器，保证状态一致性
      const newShotIds = shotNodes.map((shotNode) => shotNode.id);
      const newGridId = gridNode?.id;

      // 更新源节点数据 + 插入新节点
      setNodes((nds) => {
        const existing = nds.filter((n) => !idsToRemove.has(n.id));
        return [
          ...existing.map((node) =>
            node.id === nodeId
              ? {
                  ...node,
                  hidden: node.hidden === true ? false : node.hidden,
                  data: {
                    ...node.data,
                    title: node.data.title || "分镜剧本 Source",
                    nodeKind: node.data.nodeKind || "text",
                    errorMessage: undefined,
                    generatedShotNodeIds: newShotIds,
                    generatedStoryboardGridNodeId: newGridId,
                    storyboardProcessVisible: processVisible,
                  },
                }
              : node,
          ),
          ...shotNodes,
          ...(gridNode ? [gridNode] : []),
        ];
      });

      const storyboardEdges = shotNodes.map((shotNode) => ({
        ...createStoryboardSourceEdge(nodeId, shotNode.id),
        style: { stroke: DESIGN_TOKENS.nodeEdge, strokeWidth: 1.5 },
      }));
      const gridEdges = gridNode
        ? shotNodes.slice(0, 9).map((shotNode) => ({
            id: `edge-${shotNode.id}-${gridNode.id}`,
            source: shotNode.id,
            target: gridNode.id,
            type: "creative",
            animated: false,
            style: { stroke: DESIGN_TOKENS.nodeEdge, strokeWidth: 1.5 },
          }))
        : [];

      setEdges((eds) => {
        const existing = eds.filter(
          (e) => !idsToRemove.has(e.source) && !idsToRemove.has(e.target),
        );
        return [...existing, ...storyboardEdges, ...gridEdges];
      });

      // 同步 ref（保持向后兼容）
      // ★ 重要：必须同步 setNodes 中对源节点的修改（storyboardProcessVisible 等），
      // 否则后续代码用 nodesRef.current 读取时拿不到这些字段
      const sourceNodeUpdate = {
        hidden: false,
        data: {
          ...sourceNode.data,
          title: sourceNode.data.title || "分镜剧本 Source",
          nodeKind: sourceNode.data.nodeKind || "text",
          errorMessage: undefined,
          generatedShotNodeIds: newShotIds,
          generatedStoryboardGridNodeId: newGridId,
          storyboardProcessVisible: processVisible,
        },
      };
      nodesRef.current = nodesRef.current
        .filter((n) => !idsToRemove.has(n.id))
        .map((n) => n.id === nodeId ? { ...n, ...sourceNodeUpdate } : n)
        .concat(shotNodes)
        .concat(gridNode ? [gridNode] : []);
      edgesRef.current = edgesRef.current
        .filter((e) => !idsToRemove.has(e.source) && !idsToRemove.has(e.target))
        .concat(storyboardEdges)
        .concat(gridEdges);

      // 轻量平移：向右露出 Shot 节点，但确保源节点不推出屏幕
      if (shotNodes.length > 0 && reactFlowInstance) {
        const sourceX = sourceNode.position.x;
        const firstShotX = shotNodes[0].position.x;
        const currentViewport = reactFlowInstance.getViewport();
        const viewportWidth = window.innerWidth / currentViewport.zoom;
        const viewportRight = -currentViewport.x / currentViewport.zoom + viewportWidth;

        if (firstShotX > viewportRight - 100) {
          // 目标视口：Shot 节点在左侧 200px 处，但源节点至少离左侧 50px
          const targetX = -(firstShotX - 200);
          const minX = -(sourceX - 50);
          const clampedX = Math.max(targetX, minX);
          reactFlowInstance.setViewport(
            { x: clampedX, y: currentViewport.y, zoom: currentViewport.zoom },
            { duration: 400 },
          );
        }
      }

      addWorkspaceHistoryEvent({
        id: generateId(),
        type: "shots-split",
        title: `拆出 ${shotNodes.length} 个 Shot`,
        summary: sourceNode.data.title || "文字分镜",
        nodeId: shotNodes[0]?.id || nodeId,
        relatedNodeIds: [nodeId, ...shotNodes.map((node) => node.id)],
        createdAt: new Date().toISOString(),
      });
      return {
        shotNodeIds: shotNodes.map((node) => node.id),
        gridNodeId: gridNode?.id,
      };
    },
    [setNodes, setEdges, addWorkspaceHistoryEvent, reactFlowInstance],
  );

  const handleGenerateShotImage = useCallback(
    async (nodeId: string, options?: { processVisibleOverride?: boolean }): Promise<boolean> => {
      const currentNodes = nodesRef.current as Node<CanvasNodeData>[];
      const shotNode = currentNodes.find((node) => node.id === nodeId);
      const shot = shotNode?.data.shot;
      if (!shotNode || !shot) return false;

      const basePrompt = (shot.visualPrompt || shot.description || "").trim();

      // 注入角色一致性信息到提示词（对标 TapNow NBP + 小云雀资产联动）
      const characterPrompt = buildCharacterConsistencyPrompt(
        shot.characterIdentities,
      );
      const prompt = characterPrompt
        ? `${basePrompt} ${characterPrompt}`
        : basePrompt;
      const sourceStoryboardNode = shot.sourceStoryboardNodeId
        ? currentNodes.find((node) => node.id === shot.sourceStoryboardNodeId)
        : undefined;
      const startedAt = Date.now();
      if (!prompt) {
        const message = "请先填写生图 Prompt 或镜头描述";
        setNodes((nds) => {
          const updated = nds.map((node) =>
            node.id === nodeId && node.data.shot
              ? {
                  ...node,
                  data: {
                    ...node.data,
                    shot: {
                      ...node.data.shot,
                      status: "error" as const,
                      generationStatus: "failed" as const,
                      generationStartedAt: startedAt,
                      generationFinishedAt: Date.now(),
                      generationErrorCode: "EMPTY_PROMPT",
                      generationRetryable: false,
                      errorMessage: message,
                      generationError: message,
                    },
                  },
                }
              : node,
          );
          nodesRef.current = updated;
          return updated;
        });
        return false;
      }

      const requestId = generateId();
      latestShotGenerationRequestIdsRef.current[nodeId] = requestId;
      const model = await getDefaultImageModel() || "gpt-image-2";
      const size = "1792x1024";
      const nextAttempt = (shot.generationAttempts || 0) + 1;
      const generationSnapshot = createImageGenerationSnapshot({
        requestId,
        mode: "text-to-image",
        userPrompt: prompt,
        model,
        size,
        sourceNodeId: nodeId,
      });

      setNodes((nds) => {
        const updated = nds.map((node) =>
          node.id === nodeId && node.data.shot
            ? {
                ...node,
                data: {
                  ...node.data,
                  prompt,
                  generation: generationSnapshot,
                  shot: {
                    ...node.data.shot,
                    status: "generating" as const,
                    generationStatus: "generating" as const,
                    generationStartedAt: startedAt,
                    generationFinishedAt: undefined,
                    generationRequestId: requestId,
                    generationAttempts: nextAttempt,
                    generationErrorCode: undefined,
                    generationRetryable: undefined,
                    errorMessage: undefined,
                    generationError: undefined,
                  },
                },
              }
            : node,
        );
        nodesRef.current = updated;
        return updated;
      });

      try {
        const result = await retryWithBackoff(
          () =>
            generateImageFromPrompt({
              prompt,
              model,
              size,
              requestId,
            }),
          {
            maxRetries: 2,
            onRetry: (_error: unknown, attempt: number, delayMs: number) => {
              setNodes((nds) => {
                const updated = nds.map((node) =>
                  node.id === nodeId && node.data.shot
                    ? {
                        ...node,
                        data: {
                          ...node.data,
                          shot: {
                            ...node.data.shot,
                            generationStatus: "retrying" as const,
                            generationAttempts: nextAttempt + attempt + 1,
                          },
                        },
                      }
                    : node,
                );
                nodesRef.current = updated;
                return updated;
              });
            },
          },
        );
        if (latestShotGenerationRequestIdsRef.current[nodeId] !== requestId) {
          return false;
        }
        const generatedAt = new Date().toISOString();
        const completedSnapshot = {
          ...generationSnapshot,
          enhancedPrompt: result.prompt,
          model: result.model || model,
          status: "succeeded" as const,
          completedAt: generatedAt,
        };
        const latestNodesForShot = nodesRef.current as Node<CanvasNodeData>[];
        const latestShotNode = latestNodesForShot.find((node) => node.id === nodeId) ?? shotNode;
        const latestShot = latestShotNode.data.shot ?? shot;
        const latestSourceStoryboardNode = latestShot.sourceStoryboardNodeId
          ? latestNodesForShot.find((node) => node.id === latestShot.sourceStoryboardNodeId)
          : sourceStoryboardNode;
        const sourceStoryboardNodeId = latestSourceStoryboardNode?.id ?? latestShot.sourceStoryboardNodeId;
        const latestProcessVisible = options?.processVisibleOverride !== undefined
          ? options.processVisibleOverride
          : latestSourceStoryboardNode?.data.storyboardProcessVisible !== false;
        const shotOrderIndex = Math.max(0, (latestShot.order ?? 1) - 1);
        const imageNodeId = latestShot.generatedImageNodeId || generateId();
        const { imageNode, edge } = createShotImageNode({
          shotNode: latestShotNode,
          existingNodes: nodesRef.current as Node<CanvasNodeData>[],
          existingEdges: edgesRef.current,
          generationResult: {
            imageUrl: result.imageUrl,
            assetId: result.assetId,
            model: result.model || model,
            generationId: result.requestId || requestId,
            generationSnapshot: completedSnapshot,
            enhancedPrompt: result.prompt,
          },
          prompt,
          generatedAt,
          imageNodeId,
        });

        setNodes((nds) => {
          const imageExists = nds.some((node) => node.id === imageNode.id);
          const processImageNode: Node<CanvasNodeData> = {
            ...imageNode,
            position: latestSourceStoryboardNode
              ? getStoryboardProcessImagePosition(latestSourceStoryboardNode, shotOrderIndex)
              : imageNode.position,
            hidden: !latestProcessVisible,
            data: {
              ...imageNode.data,
              title: imageNode.data.title || "镜头过程图",
              role: "shot-image",
              sourceType: "shot",
              sourceStoryboardNodeId,
              isStoryboardProcessNode: true,
              hiddenByStoryboardProcessMode: !latestProcessVisible,
            },
          };
          const updated = nds.map((node) => {
            if (node.id === nodeId && node.data.shot) {
              if (node.data.shot.generationRequestId !== requestId) return node;
              return {
                ...node,
                data: {
                  ...node.data,
                  prompt,
                  generation: completedSnapshot,
                  shot: {
                    ...node.data.shot,
                    generatedImageUrl: result.imageUrl,
                    generatedImageAssetId: result.assetId,
                    generatedImageNodeId: imageNode.id,
                    status: "done" as const,
                    generationStatus: "succeeded" as const,
                    generationFinishedAt: Date.now(),
                    generationRequestId: result.requestId || requestId,
                    generationAttempts: result.attempts || node.data.shot.generationAttempts || nextAttempt,
                    generationErrorCode: undefined,
                    generationRetryable: undefined,
                    errorMessage: undefined,
                    generationError: undefined,
                    lastGeneratedAt: generatedAt,
                  },
                },
              };
            }
            if (node.id === imageNode.id) return processImageNode;
            return node;
          });
          const nextNodes = imageExists ? updated : [...updated, processImageNode];
          nodesRef.current = nextNodes;
          return nextNodes;
        });

        setEdges((eds) => {
          const filtered = eds.filter(
            (existingEdge) =>
              existingEdge.id !== edge.id &&
              !(
                existingEdge.source === nodeId &&
                existingEdge.target === imageNode.id &&
                (existingEdge.data as Record<string, unknown> | undefined)
                  ?.relation === "generated-image"
              ),
          );
          const nextEdges = [
            ...filtered,
            {
              ...edge,
              hidden: !latestProcessVisible,
              style: { stroke: DESIGN_TOKENS.nodeEdge, strokeWidth: 1.5 },
            },
          ];
          edgesRef.current = nextEdges;
          return nextEdges;
        });
        addWorkspaceHistoryEvent({
          id: generateId(),
          type: "image-generated",
          title: `生成镜头图片：${shot.title || shotNode.data.title || "未命名镜头"}`,
          summary: prompt.slice(0, 80),
          nodeId: imageNode.id,
          relatedNodeIds: [nodeId, imageNode.id],
          createdAt: new Date().toISOString(),
        });
        return true;
      } catch (error: any) {
        if (latestShotGenerationRequestIdsRef.current[nodeId] !== requestId) {
          return false;
        }
        const message = error?.message || "生成失败";
        setNodes((nds) => {
          const updated = nds.map((node) =>
            node.id === nodeId && node.data.shot
              ? {
                  ...node,
                  data: {
                    ...node.data,
                    generation: {
                      ...generationSnapshot,
                      status: "failed" as const,
                      completedAt: new Date().toISOString(),
                      error: message,
                    },
                    shot: {
                      ...node.data.shot,
                      status: "error" as const,
                      generationStatus: "failed" as const,
                      generationFinishedAt: Date.now(),
                      generationRequestId: error?.requestId || requestId,
                      generationAttempts: error?.attempts || node.data.shot.generationAttempts || nextAttempt,
                      generationErrorCode: error?.code || "UNKNOWN_ERROR",
                      generationRetryable: error?.retryable ?? true,
                      errorMessage: message,
                      generationError: message,
                    },
                  },
                }
              : node,
          );
          nodesRef.current = updated;
          return updated;
        });
        return false;
      } finally {
        if (latestShotGenerationRequestIdsRef.current[nodeId] === requestId) {
          setNodes((nds) => {
            const updated = nds.map((node) => {
              if (node.id !== nodeId || !node.data.shot) return node;
              if (
                node.data.shot.generationRequestId !== requestId ||
                (node.data.shot.generationStatus !== "generating" && node.data.shot.generationStatus !== "retrying")
              ) {
                return node;
              }
              const message = "图片生成没有返回最终状态，已自动结束。请点击重试。";
              return {
                ...node,
                data: {
                  ...node.data,
                  generation: {
                    ...generationSnapshot,
                    status: "failed" as const,
                    completedAt: new Date().toISOString(),
                    error: message,
                  },
                  shot: {
                    ...node.data.shot,
                    status: "error" as const,
                    generationStatus: "failed" as const,
                    generationFinishedAt: Date.now(),
                    generationErrorCode: "FINAL_STATE_GUARD",
                    generationRetryable: true,
                    errorMessage: message,
                    generationError: message,
                  },
                },
              };
            });
            nodesRef.current = updated;
            return updated;
          });
        }
      }
    },
    [setNodes, setEdges, addWorkspaceHistoryEvent],
  );

  const finalizeStoryboardResult = useCallback(
    (params: {
      sourceNodeId: string;
      mode: StoryboardResultQuality;
      imageUrl: string;
      assetId?: string;
      imageNodeId?: string;
      shotImageNodeId?: string;
      warning?: string;
      message: string;
      relatedProcessNodeIds?: string[];
    }) => {
      // ★ 用 nodesRef.current 替代 _rfGetNodes()
      const currentNodes = nodesRef.current as Node<CanvasNodeData>[];
      const sourceNode = currentNodes.find((node) => node.id === params.sourceNodeId);
      const finalImageNodeId = params.imageNodeId || params.shotImageNodeId || generateId();
      const outputPosition = getStoryboardFinalOutputPosition(sourceNode);
      let nextNodes: Node<CanvasNodeData>[] = [];
      let finalNodeExists = false;

      setNodes((nds) => {
        nextNodes = nds.map((node) => {
          if (node.id === params.sourceNodeId) {
            return {
              ...node,
              data: {
                ...node.data,
                runMeta: createSucceededRunMeta({ message: params.message }),
                errorMessage: undefined,
                storyboardOutputImageNodeId: finalImageNodeId,
                storyboardOutputImageUrl: params.imageUrl,
                storyboardOutputAssetId: params.assetId,
                storyboardResultQuality: params.mode,
                storyboardWarning: params.warning,
                storyboardError: undefined,
                storyboardErrorPhase: undefined,
                // 不再强制 storyboardProcessVisible: false
                // 保留当前可见性，避免第二次一键生图时所有过程节点被隐藏
              },
            };
          }

          if (node.id === finalImageNodeId || node.id === params.shotImageNodeId) {
            finalNodeExists = true;
            return {
              ...node,
              type: "image",
              hidden: false,
              position: node.id === params.shotImageNodeId ? outputPosition : node.position,
              data: {
                ...node.data,
                title: "最终分镜图",
                imageUrl: params.imageUrl,
                assetId: params.assetId ?? node.data.assetId,
                nodeKind: "ai-generated-image",
                sourcePromptId: params.sourceNodeId,
                sourceStoryboardNodeId: params.sourceNodeId,
                sourceType: "storyboard",
                role: "storyboard-final-output",
                isStoryboardFinalOutput: true,
                isStoryboardProcessNode: false,
                hiddenByStoryboardProcessMode: false,
                source: "generated",
                persistence: params.assetId ? "indexeddb" : node.data.persistence,
                displayWidth: node.data.displayWidth ?? 380,
                displayHeight: node.data.displayHeight ?? 214,
                createdAt: node.data.createdAt ?? Date.now(),
              },
            };
          }

          return node;
        });

        if (!finalNodeExists) {
          nextNodes = [
            ...nextNodes,
            {
              id: finalImageNodeId,
              type: "image",
              position: outputPosition,
              hidden: false,
              data: {
                title: "最终分镜图",
                imageUrl: params.imageUrl,
                assetId: params.assetId,
                nodeKind: "ai-generated-image",
                sourcePromptId: params.sourceNodeId,
                sourceStoryboardNodeId: params.sourceNodeId,
                sourceType: "storyboard",
                role: "storyboard-final-output",
                isStoryboardFinalOutput: true,
                source: "generated",
                persistence: params.assetId ? "indexeddb" : undefined,
                displayWidth: 380,
                displayHeight: 214,
                createdAt: Date.now(),
              },
            },
          ];
        }

        // 不再强制 applyStoryboardProcessVisibility({ showProcess: false })
        // 最终图片生成后，保留过程节点当前可见性（用户可通过"隐藏过程"按钮手动隐藏）
        // 只确保最终图片节点和源→最终图的边是可见的
        nextNodes = nextNodes.map((node) => {
          if (node.id === finalImageNodeId || node.id === params.shotImageNodeId) {
            return { ...node, hidden: false };
          }
          // 源节点保持可见
          if (node.id === params.sourceNodeId) {
            return { ...node, hidden: node.hidden === true ? false : node.hidden };
          }
          return node;
        });

        // 诊断日志：一键生图完成后打印所有节点状态
        if (typeof window !== "undefined" && process.env.NODE_ENV === "development") {
          console.log("[finalizeStoryboardResult] nodes after visibility apply:", nextNodes.map(n => ({
            id: n.id,
            type: n.type,
            hidden: n.hidden,
            role: n.data?.role,
            isProcess: n.data?.isStoryboardProcessNode,
            isFinal: n.data?.isStoryboardFinalOutput,
          })));
        }

        nodesRef.current = nextNodes;
        setEdges(edgesRef.current);
        return nextNodes;
      });

      if (reactFlowInstance) {
        reactFlowInstance.setViewport(
          getViewportForNodePosition(outputPosition, reactFlowInstance.getViewport()),
          { duration: 400 },
        );
      }

      setEdges((eds) => {
        const sourceToFinalEdgeId = `edge-storyboard-final-${params.sourceNodeId}-${finalImageNodeId}`;
        const cleanedEdges = eds.filter((edge) => {
          const touchesFinal = edge.source === finalImageNodeId || edge.target === finalImageNodeId;
          return !touchesFinal || edge.id === sourceToFinalEdgeId;
        });
        const withFinalEdge = cleanedEdges.some((edge) => edge.id === sourceToFinalEdgeId)
          ? cleanedEdges
          : [
              ...cleanedEdges,
              {
                id: sourceToFinalEdgeId,
                source: params.sourceNodeId,
                target: finalImageNodeId,
                type: "creative",
                animated: true,
                hidden: false,
                data: { relation: "storyboard-final-output" },
                style: { stroke: DESIGN_TOKENS.nodeEdge, strokeWidth: 1.5 },
              },
            ];
        // 不再强制 applyStoryboardProcessVisibility({ showProcess: false })
        // 只确保源→最终图的边可见
        const result = withFinalEdge.map((edge) => {
          if (edge.id === sourceToFinalEdgeId) return { ...edge, hidden: false };
          return edge;
        });
        edgesRef.current = result;
        return result;
      });
    },
    [setNodes, setEdges, reactFlowInstance],
  );

  const handleGenerateStoryboardGrid = useCallback(
    async (nodeId: string): Promise<boolean> => {
      // ★ 用 nodesRef.current 替代 _rfGetNodes()：setNodes 后状态同步在 ref 中
      const currentNodes = nodesRef.current as Node<CanvasNodeData>[];
      const gridNode = currentNodes.find((node) => node.id === nodeId);
      const grid = gridNode?.data.storyboardGrid;
      if (!gridNode || !grid) return false;

      const shotNodes = grid.shotNodeIds
        .map((shotId) => currentNodes.find((node) => node.id === shotId))
        .filter((node): node is Node<CanvasNodeData> => Boolean(node));
      const shotStates = shotNodes.map((node) => {
        const shot = node.data.shot;
        return {
          shotNodeId: node.id,
          order: shot?.order,
          title: shot?.title,
          status:
            shot?.generationStatus === "generating" || shot?.generationStatus === "retrying" || shot?.status === "generating"
              ? ("generating" as const)
              : shot?.generationStatus === "failed" || shot?.status === "error"
                ? ("failed" as const)
                : shot?.generatedImageUrl
                  ? ("ready" as const)
                  : ("missing" as const),
          imageUrl: shot?.generatedImageUrl,
          errorMessage: shot?.generationError || shot?.errorMessage,
        };
      });
      const imageUrls = shotStates.map((state) => state.imageUrl || null);

      setNodes((nds) =>
        nds.map((node) =>
          node.id === nodeId
            ? {
                ...node,
                data: {
                  ...node.data,
                  storyboardGrid: {
                    ...grid,
                    shotStates,
                    status: "generating",
                    errorMessage: undefined,
                  },
                },
              }
            : node,
        ),
      );

      try {
        const validation = validateStoryboardGridImageUrls(
          imageUrls,
          shotNodes.map((n) => n.data.shot?.title || n.data.title || ""),
        );
        if (!validation.valid) {
          throw new Error(validation.message);
        }
        const dataUrl = await composeStoryboardGrid({
          images: imageUrls.slice(0, grid.maxShots || 9),
          columns: grid.columns || 3,
        });
        const persisted = await persistImageDataUrl(dataUrl, {
          fileName: `storyboard-grid-${Date.now()}.png`,
        });
        // ★ 用 nodesRef.current 替代 _rfGetNodes()
        const latestNodes = nodesRef.current as Node<CanvasNodeData>[];
        const imageNodeId = grid.outputImageNodeId || generateId();
        const sourceNodeForOutput = grid.sourceStoryboardNodeId
          ? latestNodes.find((node) => node.id === grid.sourceStoryboardNodeId)
          : undefined;
        const outputPosition = sourceNodeForOutput
          ? getStoryboardFinalOutputPosition(sourceNodeForOutput)
          : { x: gridNode.position.x + STORYBOARD_FINAL_OUTPUT_OFFSET_X, y: gridNode.position.y };
        const newImageNode: Node<CanvasNodeData> = {
          id: imageNodeId,
          type: "image",
          position: outputPosition,
          hidden: false,
          data: {
            title: "最终分镜图",
            imageUrl: persisted.objectUrl,
            assetId: persisted.assetId,
            nodeKind: "ai-generated-image",
            sourcePromptId: grid.sourceStoryboardNodeId || nodeId,
            sourceStoryboardNodeId: grid.sourceStoryboardNodeId,
            sourceType: "storyboard",
            role: "storyboard-final-output",
            isStoryboardFinalOutput: true,
            isStoryboardProcessNode: false,
            hiddenByStoryboardProcessMode: false,
            source: "generated",
            persistence: "indexeddb",
            displayWidth: 380,
            displayHeight: 214,
            createdAt: Date.now(),
          },
        };

        setNodes((nds) => {
          const exists = nds.some((node) => node.id === imageNodeId);
          const updated = nds
            .map((node) =>
              node.id === nodeId
                ? {
                    ...node,
                    data: {
                      ...node.data,
                      storyboardGrid: {
                        ...grid,
                        shotStates,
                        outputImageUrl: persisted.objectUrl,
                        outputImageNodeId: imageNodeId,
                        status: "done" as const,
                      },
                    },
                  }
                : node.id === grid.sourceStoryboardNodeId
                  ? {
                      ...node,
                      data: {
                        ...node.data,
                        storyboardOutputImageNodeId: imageNodeId,
                        storyboardOutputImageUrl: persisted.objectUrl,
                      },
                    }
                  : node.id === imageNodeId
                  ? {
                      ...node,
                      hidden: false,
                      position: outputPosition,
                      data: {
                        ...node.data,
                        title: "最终分镜图",
                        imageUrl: persisted.objectUrl,
                        assetId: persisted.assetId,
                        sourceStoryboardNodeId: grid.sourceStoryboardNodeId,
                        sourceType: "storyboard",
                        role: "storyboard-final-output",
                        isStoryboardFinalOutput: true,
                        isStoryboardProcessNode: false,
                        hiddenByStoryboardProcessMode: false,
                      },
                    }
                  : node,
            )
            .concat(exists ? [] : [newImageNode]);
          nodesRef.current = updated;
          return updated;
        });
        if (reactFlowInstance) {
          reactFlowInstance.setViewport(
            getViewportForNodePosition(outputPosition, reactFlowInstance.getViewport()),
            { duration: 400 },
          );
        }
        setEdges((eds) => {
          const finalEdgeId = `edge-storyboard-final-${grid.sourceStoryboardNodeId || nodeId}-${imageNodeId}`;
          const updated = eds.some((edge) => edge.id === finalEdgeId)
            ? eds.map((edge) => (edge.id === finalEdgeId ? { ...edge, hidden: false } : edge))
            : [
                ...eds,
                {
                  id: finalEdgeId,
                  source: grid.sourceStoryboardNodeId || nodeId,
                  target: imageNodeId,
                  type: "creative",
                  animated: true,
                  hidden: false,
                  data: { relation: "storyboard-final-output" },
                  style: { stroke: DESIGN_TOKENS.nodeEdge, strokeWidth: 1.5 },
                },
              ];
          edgesRef.current = updated;
          return updated;
        });
        return true;
      } catch (error: any) {
        setNodes((nds) =>
          nds.map((node) =>
            node.id === nodeId
              ? {
                  ...node,
                  data: {
                    ...node.data,
                    storyboardGrid: {
                      ...grid,
                      shotStates,
                      status: "error",
                      errorMessage:
                        error?.message ||
                        "分镜合成图输出失败。请先确认镜头图片已生成；这个节点只是预览和合成分镜图，不会自己调用生图模型。",
                    },
                  },
                }
              : node,
          ),
        );
        return false;
      }
    },
    [setNodes, setEdges, reactFlowInstance],
  );

  const getStoryboardShotNodes = useCallback((sourceNodeId: string) => {
    // ★ 用 nodesRef.current 替代 _rfGetNodes()：ref 始终同步
    const currentNodes = nodesRef.current as Node<CanvasNodeData>[];
    const directShotNodes = currentNodes.filter(
      (node) =>
        node.type === "shot" &&
        node.data.shot &&
        (node.data.sourceStoryboardNodeId === sourceNodeId ||
          node.data.shot.sourceStoryboardNodeId === sourceNodeId),
    );
    if (directShotNodes.length > 0) return directShotNodes;

    const gridNode = currentNodes.find(
      (node) =>
        node.type === "storyboardGrid" &&
        node.data.storyboardGrid?.sourceStoryboardNodeId === sourceNodeId,
    );
    const gridShotIds = gridNode?.data.storyboardGrid?.shotNodeIds ?? [];
    return gridShotIds
      .map((shotId) => currentNodes.find((node) => node.id === shotId))
      .filter((node): node is Node<CanvasNodeData> =>
        Boolean(node?.type === "shot" && node.data.shot),
      );
  }, []);

  const getStoryboardGridNode = useCallback((sourceNodeId: string) => {
    const currentNodes = nodesRef.current as Node<CanvasNodeData>[];
    const bySource = currentNodes.find(
      (node) =>
        node.type === "storyboardGrid" &&
        node.data.storyboardGrid?.sourceStoryboardNodeId === sourceNodeId,
    );
    if (bySource) return bySource;

    const shotIds = getStoryboardShotNodes(sourceNodeId).map((node) => node.id);
    return currentNodes.find(
      (node) =>
        node.type === "storyboardGrid" &&
        node.data.storyboardGrid?.shotNodeIds?.some((shotId) =>
          shotIds.includes(shotId),
        ),
    );
  }, [getStoryboardShotNodes]);

  const createStoryboardBatchJob = useCallback(
    (params: {
      sourceNodeId: string;
      shotNodes: Node<CanvasNodeData>[];
      status?: BatchGenerationJobStatus;
      message?: string;
    }): BatchGenerationJob => {
      const now = Date.now();
      const shots = Object.fromEntries(
        params.shotNodes.map((shotNode) => [
          shotNode.id,
          {
            shotNodeId: shotNode.id,
            title: shotNode.data.shot?.title || shotNode.data.title,
            status: "queued" as BatchGenerationShotStatus,
          },
        ]),
      );
      return {
        id: generateId(),
        sourceNodeId: params.sourceNodeId,
        targetShotIds: params.shotNodes.map((shotNode) => shotNode.id),
        status: params.status ?? "queued",
        total: params.shotNodes.length,
        completed: 0,
        failed: 0,
        progress: 0,
        message: params.message,
        shots,
        startedAt: now,
        updatedAt: now,
      };
    },
    [],
  );

  const syncStoryboardBatchJobToSource = useCallback(
    (job: BatchGenerationJob) => {
      setStoryboardBatchJob(job);
      setNodes((nds) => {
        const updated = nds.map((node) =>
          node.id === job.sourceNodeId
            ? { ...node, data: { ...node.data, storyboardBatchJob: job } }
            : node,
        );
        nodesRef.current = updated;
        return updated;
      });
    },
    [setNodes],
  );

  const updateStoryboardBatchJob = useCallback(
    (updater: (job: BatchGenerationJob) => BatchGenerationJob) => {
      setStoryboardBatchJob((current) => {
        if (!current) return current;
        const next = updater({ ...current, shots: { ...current.shots } });
        setNodes((nds) => {
          const updated = nds.map((node) =>
            node.id === next.sourceNodeId
              ? { ...node, data: { ...node.data, storyboardBatchJob: next } }
              : node,
          );
          nodesRef.current = updated;
          return updated;
        });
        return next;
      });
    },
    [setNodes],
  );

  const getSelectedShotNodes = useCallback(
    () => {
      const currentNodes = nodesRef.current as Node<CanvasNodeData>[];
      return currentNodes.filter(
        (n) => n.selected && n.type === "shot" && n.data.shot,
      );
    },
    [],
  );

  const handleGenerateStoryboardImageFromSource = useCallback(
    async (nodeId: string) => {
      const currentNodes = nodesRef.current as Node<CanvasNodeData>[];
      const sourceNode = currentNodes.find((node) => node.id === nodeId);
      if (!sourceNode) return;

      const sourceKind = sourceNode.data.nodeKind;
      const canGenerateFromSource =
        sourceNode.type === "content" ||
        sourceKind === "storyboard" ||
        sourceKind === "text" ||
        sourceKind === "prompt" ||
        sourceKind === "document";
      if (!canGenerateFromSource) return;

      const updateSourceRunMeta = (params: {
        message: string;
        progress?: number;
        status?: "pending" | "running" | "succeeded" | "failed";
        error?: string;
      }) => {
        setNodes((nds) => {
          const updated: Node<CanvasNodeData>[] = nds.map((node): Node<CanvasNodeData> => {
            if (node.id !== nodeId) return node;

            const runMeta =
              params.status === "failed"
                ? createFailedRunMeta({ error: params.error || params.message, message: params.message })
                : params.status === "succeeded"
                  ? createSucceededRunMeta({ message: params.message })
                  : params.status === "running"
                    ? createRunningRunMeta({ source: "manual", message: params.message })
                    : createPendingRunMeta({ source: "manual", message: params.message });

            return {
              ...node,
              data: {
                ...node.data,
                errorMessage: params.status === "failed" ? params.error || params.message : undefined,
                runMeta: {
                  ...runMeta,
                  source: "manual",
                  progress: params.progress ?? runMeta.progress,
                },
              },
            };
          });
          nodesRef.current = updated;
          return updated;
        });
      };

      updateSourceRunMeta({
        status: "pending",
        progress: 8,
        message: "准备生成分镜图：多镜头只调用一次生图模型，直接输出一张多格分镜图",
      });

      // 一键生图时过程节点默认隐藏，只显示最终合成图
      // 用户可通过"显示过程"按钮查看/编辑 Shot 节点
      const processVisible = false;

      let shotNodes = getStoryboardShotNodes(nodeId);
      let gridNode = getStoryboardGridNode(nodeId);

      // ★ 如果已有过程节点（不是首次拆分），立即设为 hidden + 写入 storyboardProcessVisible
      // 如果没有过程节点，会走 split 分支，handleSplitStoryboardNode 内部会处理
      if (shotNodes.length > 0) {
        // ★ 同步更新 nodesRef，确保后续代码读到一致的状态
        const updatedNodes = nodesRef.current.map((node) => {
          if (node.id === nodeId) {
            return { ...node, data: { ...node.data, storyboardProcessVisible: false } };
          }
          if (isStoryboardProcessNode(node, nodeId)) {
            return { ...node, hidden: true, data: { ...node.data, hiddenByStoryboardProcessMode: true } };
          }
          return node;
        });
        setNodes(() => updatedNodes);
        nodesRef.current = updatedNodes;
      }
      if (shotNodes.length === 0) {
        updateSourceRunMeta({
          status: "running",
          progress: 18,
          message: "正在拆分镜头：系统会创建可编辑的镜头卡片",
        });
        const created = handleSplitStoryboardNode(nodeId, true, { processVisible });
        // ★ 用 nodesRef.current 而非 _rfGetNodes()：setNodes 是异步的，
        // _rfGetNodes() 读的是 ReactFlow 内部状态，可能还没同步新节点。
        // nodesRef.current 在 handleSplitStoryboardNode 末尾被同步更新，
        // 调用返回后已包含新创建的 shot/grid 节点。
        const latestNodesAfterSplit = nodesRef.current as Node<CanvasNodeData>[];
        shotNodes = created.shotNodeIds
          .map((shotId) => latestNodesAfterSplit.find((node) => node.id === shotId))
          .filter((node): node is Node<CanvasNodeData> =>
            Boolean(node?.type === "shot" && node.data.shot),
          );
        gridNode = created.gridNodeId
          ? latestNodesAfterSplit.find((node) => node.id === created.gridNodeId)
          : getStoryboardGridNode(nodeId);
      }

      if (shotNodes.length === 0) {
        const message = "没有可生成的镜头。请先写完整故事，或输入已经拆分好的文字分镜。";
        updateSourceRunMeta({ status: "failed", progress: 100, message, error: message });
        return;
      }

      const latestNodesForProcess = nodesRef.current as Node<CanvasNodeData>[];
      const existingProcessImageNodeIds = latestNodesForProcess
        .filter(
          (node) =>
            node.data.sourceStoryboardNodeId === nodeId &&
            (node.data.role === "shot-image" || node.data.sourceType === "shot"),
        )
        .map((node) => node.id);
      const processNodeIds = new Set([
        ...shotNodes.map((node) => node.id),
        ...existingProcessImageNodeIds,
        ...(gridNode ? [gridNode.id] : []),
      ]);
      // 一键分镜图入口遵循开源画布常见模式：最终产物任务与过程节点任务隔离。
      // 多镜头只触发一次最终图生成，不隐式级联到每个 shot 的独立生图任务。

      const candidateShotNodes = shotNodes.slice(0, 9);

      // === 多镜头：一次 AI 调用直接生成多格分镜图，禁止回退到逐镜头生图 ===
      if (candidateShotNodes.length > 1) {
        const batchJob = createStoryboardBatchJob({
          sourceNodeId: nodeId,
          shotNodes: candidateShotNodes,
          status: "preparing",
          message: `准备生成 ${candidateShotNodes.length} 个镜头的多格分镜图`,
        });
        syncStoryboardBatchJobToSource(batchJob);

        updateSourceRunMeta({
          status: "running",
          progress: 35,
          message: `正在生成多格分镜图：${candidateShotNodes.length} 个镜头一次合成`,
        });

        const storyboardPrompt = buildStoryboardImagePrompt(candidateShotNodes);
        const directRequestId = generateId();
        const model = await getDefaultImageModel() || "gpt-image-2";

        try {
          syncStoryboardBatchJobToSource({
            ...batchJob,
            status: "generating",
            progress: 35,
            activeShotId: candidateShotNodes[0]?.id,
            message: "正在调用生图模型生成一张多格分镜图",
            updatedAt: Date.now(),
            shots: Object.fromEntries(
              Object.entries(batchJob.shots).map(([shotId, shot]) => [
                shotId,
                { ...shot, status: "generating" as BatchGenerationShotStatus },
              ]),
            ),
          });

          const result = await generateImageFromPrompt({
            prompt: storyboardPrompt,
            model,
            size: "1792x1024",
            requestId: directRequestId,
          });

          updateSourceRunMeta({
            status: "running",
            progress: 85,
            message: "分镜图已生成，正在保存...",
          });

          syncStoryboardBatchJobToSource({
            ...batchJob,
            status: "generating",
            completed: 0,
            failed: 0,
            progress: 85,
            activeShotId: undefined,
            message: "分镜图已生成，正在保存到画布",
            updatedAt: Date.now(),
            shots: Object.fromEntries(
              Object.entries(batchJob.shots).map(([shotId, shot]) => [
                shotId,
                { ...shot, status: "generating" as BatchGenerationShotStatus },
              ]),
            ),
          });

          const persisted = result.imageUrl.startsWith("data:image")
            ? await persistImageDataUrl(result.imageUrl, {
                fileName: `storyboard-direct-${Date.now()}.png`,
              })
            : {
                objectUrl: result.imageUrl,
                assetId: result.assetId,
              };

          const imageNodeId = generateId();
          const latestNodes = nodesRef.current as Node<CanvasNodeData>[];
          const sourceNodeForOutput = latestNodes.find((node) => node.id === nodeId);
          const outputPosition = sourceNodeForOutput
            ? getStoryboardFinalOutputPosition(sourceNodeForOutput)
            : { x: 0, y: 0 };

          const newImageNode: Node<CanvasNodeData> = {
            id: imageNodeId,
            type: "image",
            position: outputPosition,
            hidden: false,
            data: {
              title: "分镜图",
              imageUrl: persisted.objectUrl,
              assetId: persisted.assetId,
              nodeKind: "ai-generated-image",
              sourcePromptId: nodeId,
              sourceStoryboardNodeId: nodeId,
              sourceType: "storyboard",
              role: "storyboard-final-output",
              isStoryboardFinalOutput: true,
              isStoryboardProcessNode: false,
              hiddenByStoryboardProcessMode: false,
              source: "generated",
              persistence: persisted.assetId ? "indexeddb" : "remote",
              displayWidth: 380,
              displayHeight: 214,
              createdAt: Date.now(),
            },
          };

          setNodes((nds) => [...nds, newImageNode]);
          nodesRef.current = [...nodesRef.current, newImageNode];

          // 更新源节点记录输出
          setNodes((nds) => {
            const updated = nds.map((node) =>
              node.id === nodeId
                ? {
                    ...node,
                    data: {
                      ...node.data,
                      storyboardOutputImageNodeId: imageNodeId,
                      storyboardOutputImageUrl: persisted.objectUrl,
                      storyboardError: undefined,
                      storyboardErrorPhase: undefined,
                    },
                  }
                : node,
            );
            nodesRef.current = updated;
            return updated;
          });

          // 创建源→最终图的边
          const sourceToFinalEdgeId = `edge-${nodeId}-${imageNodeId}`;
          setEdges((eds) => {
            const filtered = eds.filter(
              (e) =>
                e.id !== sourceToFinalEdgeId &&
                !((e.data as Record<string, unknown> | undefined)?.isStoryboardProcessEdge as boolean),
            );
            const nextEdges = [
              ...filtered,
              {
                id: sourceToFinalEdgeId,
                source: nodeId,
                target: imageNodeId,
                type: "creative",
                animated: false,
                hidden: false,
                style: { stroke: DESIGN_TOKENS.nodeEdge, strokeWidth: 1.5 },
                data: { relation: "generated-image", isStoryboardFinalEdge: true },
              } as Edge,
            ];
            edgesRef.current = nextEdges;
            return nextEdges;
          });

          // 视口移动到最终图
          if (reactFlowInstance) {
            reactFlowInstance.setViewport(
              getViewportForNodePosition(outputPosition, reactFlowInstance.getViewport()),
              { duration: 400 },
            );
          }

          const summary = `分镜图已生成：已合成 ${candidateShotNodes.length} 个镜头。`;
          const completedBatchJob: BatchGenerationJob = {
            ...batchJob,
            status: "completed",
            completed: candidateShotNodes.length,
            failed: 0,
            progress: 100,
            activeShotId: undefined,
            message: summary,
            updatedAt: Date.now(),
            finishedAt: Date.now(),
            shots: Object.fromEntries(
              Object.entries(batchJob.shots).map(([shotId, shot]) => [
                shotId,
                { ...shot, status: "completed" as BatchGenerationShotStatus, imageNodeId },
              ]),
            ),
          };
          syncStoryboardBatchJobToSource(completedBatchJob);
          updateSourceRunMeta({ status: "succeeded", progress: 100, message: summary });

          addWorkspaceHistoryEvent({
            id: generateId(),
            type: "image-generated",
            title: "一键生成分镜图",
            summary,
            nodeId: imageNodeId,
            relatedNodeIds: [nodeId, ...candidateShotNodes.map((node) => node.id), imageNodeId].filter(
              (id): id is string => Boolean(id),
            ),
            createdAt: new Date().toISOString(),
          });
          return;
        } catch (error: any) {
          const message = error?.message || "分镜图生成失败";
          const finalMessage = `多格分镜图生成失败：${message}。已停止，不会继续逐张生成镜头图以避免浪费算力。可逐张手动为每个镜头生成图片后再次合成分镜图。`;
          const failedBatchJob: BatchGenerationJob = {
            ...batchJob,
            status: "failed",
            completed: 0,
            failed: candidateShotNodes.length,
            progress: 100,
            activeShotId: undefined,
            message: finalMessage,
            updatedAt: Date.now(),
            finishedAt: Date.now(),
            shots: Object.fromEntries(
              Object.entries(batchJob.shots).map(([shotId, shot]) => [
                shotId,
                { ...shot, status: "failed" as BatchGenerationShotStatus, error: finalMessage },
              ]),
            ),
          };
          syncStoryboardBatchJobToSource(failedBatchJob);
          updateSourceRunMeta({ status: "failed", progress: 100, message: finalMessage, error: finalMessage });
          setNodes((nds) => {
            const updated = nds.map((node) =>
              node.id === nodeId
                ? {
                    ...node,
                    data: {
                      ...node.data,
                      storyboardError: finalMessage,
                      storyboardErrorPhase: "direct-storyboard-generation",
                    },
                  }
                : node,
            );
            nodesRef.current = updated;
            return updated;
          });
          return;
        }
      }

      // === 单镜头：生成一张镜头图作为最终结果 ===
      const latestNodesBeforeGeneration = nodesRef.current as Node<CanvasNodeData>[];
      const missingShotNodes = candidateShotNodes.filter(
        (shotNode) => !getShotImageUrlFromCanvas({ shotId: shotNode.id, nodes: latestNodesBeforeGeneration }),
      );

      updateSourceRunMeta({
        status: "running",
        progress: missingShotNodes.length > 0 ? 35 : 70,
        message: missingShotNodes.length > 0
          ? "正在生成单镜头分镜图"
          : "镜头图已存在，正在准备最终结果",
      });

      await runWithConcurrency(
        missingShotNodes,
        SHOT_GENERATION_BATCH_CONCURRENCY,
        async (shotNode, index) => {
          updateSourceRunMeta({
            status: "running",
            progress: Math.min(65, 35 + Math.round((index / Math.max(1, missingShotNodes.length)) * 30)),
            message: "正在生成单镜头分镜图",
          });
          return handleGenerateShotImage(shotNode.id, { processVisibleOverride: processVisible });
        },
      );
      const validShotImages: Array<{
        shotNodeId: string;
        imageUrl: string;
        imageNodeId?: string;
        assetId?: string;
      }> = [];
      // ★ 用 nodesRef.current 替代 _rfGetNodes()
      const latestNodesAfterGeneration = nodesRef.current as Node<CanvasNodeData>[];
      candidateShotNodes.forEach((shotNode) => {
        const latestShotNode = latestNodesAfterGeneration.find((node) => node.id === shotNode.id) ?? shotNode;
        const imageUrl = getShotImageUrlFromCanvas({ shotId: latestShotNode.id, nodes: latestNodesAfterGeneration });
        if (!imageUrl) return;
        const imageNodeId = latestShotNode.data.shot?.generatedImageNodeId;
        const imageNode = imageNodeId
          ? latestNodesAfterGeneration.find((node) => node.id === imageNodeId)
          : latestNodesAfterGeneration.find(
              (node) =>
                node.type === "image" &&
                (node.data.sourceShotId === latestShotNode.id ||
                  node.data.generationOutput?.sourceShotId === latestShotNode.id),
            );
        validShotImages.push({
          shotNodeId: latestShotNode.id,
          imageUrl,
          imageNodeId: imageNode?.id ?? imageNodeId,
          assetId: latestShotNode.data.shot?.generatedImageAssetId || imageNode?.data.assetId,
        });
      });

      if (validShotImages.length > 0 && validShotImages.length < candidateShotNodes.length) {
        const failedTitles = candidateShotNodes
          .filter((shot) => !validShotImages.some((v) => v.shotNodeId === shot.id))
          .map((shot) => shot.data.shot?.title || shot.data.title || "未命名镜头");
        const warning =
          failedTitles.length === 1
            ? `镜头「${failedTitles[0]}」图片生成失败，将用占位图替代。可稍后重试该镜头后重新合成。`
            : `${failedTitles.length} 个镜头（${failedTitles.join("、")}）图片生成失败，将用占位图替代。可稍后重试后重新合成。`;
        updateSourceRunMeta({
          status: "running",
          progress: 75,
          message: `${validShotImages.length}/${candidateShotNodes.length} 个镜头已生成，正在合成…`,
        });
        setNodes((nds) => {
          const updated = nds.map((node) =>
            node.id === nodeId
              ? {
                  ...node,
                  data: {
                    ...node.data,
                    generatedShotNodeIds: candidateShotNodes.map((shotNode) => shotNode.id),
                    generatedStoryboardGridNodeId: gridNode?.id,
                    storyboardWarning: warning,
                    storyboardError: undefined,
                    storyboardErrorPhase: undefined,
                  },
                }
              : node,
          );
          nodesRef.current = updated;
          return updated;
        });
        // ★ 不 return，继续走下面的网格合成流程
      }

      if (validShotImages.length === 0) {
        const latestNodesForFailure = nodesRef.current as Node<CanvasNodeData>[];
        const latestCandidateShotNodes = candidateShotNodes
          .map((shotNode) => latestNodesForFailure.find((node) => node.id === shotNode.id) ?? shotNode)
          .filter((shotNode): shotNode is Node<CanvasNodeData> => Boolean(shotNode.data.shot));
        const firstFailedShot = latestCandidateShotNodes.find((shotNode) => {
          const status = shotNode.data.shot?.generationStatus;
          return status === "failed";
        });
        const failureReason = firstFailedShot?.data.shot?.generationError || firstFailedShot?.data.shot?.errorMessage;
        const message = failureReason
          ? `镜头图片生成失败：${failureReason}`
          : "镜头图片生成失败，请稍后重试。";
        updateSourceRunMeta({ status: "failed", progress: 100, message, error: message });
        setNodes((nds) => {
          const updated = nds.map((node) =>
            node.id === nodeId
              ? {
                  ...node,
                  data: {
                    ...node.data,
                    generatedShotNodeIds: candidateShotNodes.map((shotNode) => shotNode.id),
                    generatedStoryboardGridNodeId: gridNode?.id,
                    storyboardError: message,
                    storyboardErrorPhase: "shot-image-generation",
                    storyboardWarning: undefined,
                  },
                }
              : node,
          );
          const visibility = applyStoryboardProcessVisibility({
            nodes: updated,
            edges: edgesRef.current,
            sourceNodeId: nodeId,
            // 错误路径中不强制隐藏过程节点——用户可能需要查看来诊断问题
            showProcess: true,
          });
          nodesRef.current = visibility.nodes;
          edgesRef.current = visibility.edges;
          setEdges(visibility.edges);
          return visibility.nodes;
        });
        return;
      }

      if (validShotImages.length === 1) {
        const [singleShot] = validShotImages;
        const summary = "分镜图已生成：已根据文本生成 1 个镜头。";
        finalizeStoryboardResult({
          sourceNodeId: nodeId,
          mode: "single-shot",
          imageUrl: singleShot.imageUrl,
          assetId: singleShot.assetId,
          imageNodeId: singleShot.imageNodeId,
          shotImageNodeId: singleShot.imageNodeId,
          message: summary,
        });
        addWorkspaceHistoryEvent({
          id: generateId(),
          type: "image-generated",
          title: "一键生成分镜图",
          summary,
          nodeId: singleShot.imageNodeId || nodeId,
          relatedNodeIds: [nodeId, ...candidateShotNodes.map((node) => node.id), singleShot.imageNodeId].filter(
            (id): id is string => Boolean(id),
          ),
          createdAt: new Date().toISOString(),
        });
        return;
      }

      gridNode = gridNode ?? getStoryboardGridNode(nodeId);
      if (!gridNode) {
        const freshSourceNode = (nodesRef.current as Node<CanvasNodeData>[]).find((node) => node.id === nodeId) ?? sourceNode;
        const gridNodeId = generateId();
        const gridCols = candidateShotNodes.length <= 2 ? 2 : 3;
        const newGridNode: Node<CanvasNodeData> = {
          id: gridNodeId,
          type: "storyboardGrid",
          position: getStoryboardProcessGridPosition(freshSourceNode, candidateShotNodes.length),
          hidden: !processVisible,
          data: {
            title: "分镜合成预览",
            nodeKind: "storyboard-grid",
            role: "storyboard-process",
            isStoryboardProcessNode: true,
            hiddenByStoryboardProcessMode: !processVisible,
            storyboardGrid: {
              id: generateId(),
              title: "分镜合成预览",
              sourceStoryboardNodeId: nodeId,
              shotNodeIds: candidateShotNodes.map((node) => node.id),
              columns: gridCols,
              maxShots: candidateShotNodes.length,
              shotStates: candidateShotNodes.map((node) => ({
                shotNodeId: node.id,
                order: node.data.shot?.order,
                title: node.data.shot?.title,
                status: getShotImageUrlFromCanvas({ shotId: node.id, nodes: nodesRef.current as Node<CanvasNodeData>[] })
                  ? ("ready" as const)
                  : ("missing" as const),
              })),
              status: "draft",
            },
            displayWidth: 360,
            displayHeight: 360,
            createdAt: Date.now(),
          },
          width: 360,
          height: 360,
          measured: { width: 360, height: 360 },
        };
        setNodes((nds) => [...nds, newGridNode]);
        setEdges((eds) => [
          ...eds,
          ...candidateShotNodes.map((shotNode) => ({
            hidden: !processVisible,
            id: `edge-${shotNode.id}-${gridNodeId}`,
            source: shotNode.id,
            target: gridNodeId,
            type: "creative",
            animated: false,
            style: { stroke: DESIGN_TOKENS.nodeEdge, strokeWidth: 1.5 },
          })),
        ]);
        gridNode = newGridNode;
      }

      updateSourceRunMeta({
        status: "running",
        progress: 82,
        message: "正在合成最终分镜图：过程面板默认隐藏，最终会输出一张图片节点",
      });
      const composed = await handleGenerateStoryboardGrid(gridNode.id);
      // ★ 用 nodesRef.current 替代 _rfGetNodes()
      const latestNodesAfterCompose = nodesRef.current as Node<CanvasNodeData>[];
      const latestGridNode = latestNodesAfterCompose.find((node) => node.id === gridNode.id);
      const outputImageNodeId = latestGridNode?.data.storyboardGrid?.outputImageNodeId;
      const outputImageUrl = latestGridNode?.data.storyboardGrid?.outputImageUrl;
      const outputAssetId = outputImageNodeId
        ? latestNodesAfterCompose.find((node) => node.id === outputImageNodeId)?.data.assetId
        : undefined;

      if (composed && outputImageUrl) {
        const hasPartials = validShotImages.length < candidateShotNodes.length;
        const failedCount = candidateShotNodes.length - validShotImages.length;
        const summary = hasPartials
          ? `分镜图已生成：已合成 ${validShotImages.length} 个镜头（${failedCount} 个镜头缺图，以占位替代）。可稍后重试缺失镜头后重新合成。`
          : `分镜图已生成：已合成 ${validShotImages.length} 个镜头。`;
        finalizeStoryboardResult({
          sourceNodeId: nodeId,
          mode: "composed-grid",
          imageUrl: outputImageUrl,
          assetId: outputAssetId,
          imageNodeId: outputImageNodeId,
          message: summary,
          ...(hasPartials ? { warning: summary } : {}),
        });
        addWorkspaceHistoryEvent({
          id: generateId(),
          type: "image-generated",
          title: "一键生成分镜图",
          summary,
          nodeId: outputImageNodeId || gridNode.id,
          relatedNodeIds: [nodeId, ...candidateShotNodes.map((node) => node.id), gridNode.id, outputImageNodeId].filter(
            (id): id is string => Boolean(id),
          ),
          createdAt: new Date().toISOString(),
        });
        return;
      }

      const fallbackShot = validShotImages[0];
      const warning = "镜头图已生成，但合成分镜图暂时失败，已使用第一张镜头图作为临时结果。可逐张手动为缺失镜头生成图片后重试合成。";
      finalizeStoryboardResult({
        sourceNodeId: nodeId,
        mode: "fallback-shot",
        imageUrl: fallbackShot.imageUrl,
        assetId: fallbackShot.assetId,
        imageNodeId: fallbackShot.imageNodeId,
        shotImageNodeId: fallbackShot.imageNodeId,
        warning,
        message: "镜头图已生成",
      });
      addWorkspaceHistoryEvent({
        id: generateId(),
        type: "image-generated",
        title: "一键生成分镜图",
        summary: warning,
        nodeId: fallbackShot.imageNodeId || nodeId,
        relatedNodeIds: [nodeId, ...candidateShotNodes.map((node) => node.id), gridNode?.id, fallbackShot.imageNodeId].filter(
          (id): id is string => Boolean(id),
        ),
        createdAt: new Date().toISOString(),
      });
    },
    [
      getStoryboardShotNodes,
      getStoryboardGridNode,
      handleSplitStoryboardNode,
      handleGenerateShotImage,
      handleGenerateStoryboardGrid,
      finalizeStoryboardResult,
      createStoryboardBatchJob,
      syncStoryboardBatchJobToSource,
      buildStoryboardImagePrompt,
      generateImageFromPrompt,
      setNodes,
      setEdges,
      addWorkspaceHistoryEvent,
      reactFlowInstance,
    ],
  );

  const selectedShotNodes = nodes.filter(
    (n) => n.selected && n.type === "shot" && n.data.shot,
  );
  const selectedShotCount = selectedShotNodes.length;
  const getShotImageUrl = useCallback(
    (shotId: string) =>
      getShotImageUrlFromCanvas({ shotId, nodes: nodesRef.current }),
    [],
  );

  const selectedShotMissingCount = selectedShotNodes.filter(
    (n) => !getShotImageUrl(n.id),
  ).length;

  const handleGenerateSelectedShotImages = useCallback(async () => {
    const selectedShots = getSelectedShotNodes();
    if (selectedShots.length < 1) return;

    const toGenerate = selectedShots.filter((n) => !getShotImageUrl(n.id));
    if (toGenerate.length < 1) return;

    batchProgressRef.current?.start(toGenerate.length);

    await runWithConcurrency(
      toGenerate,
      SHOT_GENERATION_BATCH_CONCURRENCY,
      async (node) => {
        const ok = await handleGenerateShotImage(node.id);
        if (ok) {
          batchProgressRef.current?.tick();
        } else {
          batchProgressRef.current?.fail();
        }
      },
    );
  }, [getSelectedShotNodes, getShotImageUrl, handleGenerateShotImage, batchProgressRef]);

  const getStoryboardCompositeImageSize = useCallback(
    (layout: StoryboardCompositeLayout) => {
      const cellWidth = 260;
      const cellHeight = Math.round(cellWidth / STORYBOARD_FRAME_ASPECT_RATIO);
      const gap = 10;
      const width = layout.columns * cellWidth + (layout.columns + 1) * gap;
      const height = layout.rows * cellHeight + (layout.rows + 1) * gap;
      return { width, height };
    },
    [],
  );

  // ========================================================================
  // COMPOSE SELECTED SHOTS — 框选 shot 节点 → 一次生成/合成一张多格分镜图
  // ========================================================================
  const handleComposeSelectedShots = useCallback(async () => {
    const selectedShotNodes = getSelectedShotNodes();
    if (selectedShotNodes.length < 2 || isComposingSelectedShots) return;

    const shotNodeIds = selectedShotNodes.map((node) => node.id);
    const imageUrls = shotNodeIds.map((shotId) => getShotImageUrl(shotId) ?? null);
    const settings = { ...storyboardCompositeSettings, layout: "auto" as const };
    const {
      prompt: compositePrompt,
      sourcePrompt,
      layout,
    } = buildStoryboardCompositePrompt(selectedShotNodes, settings);
    const { columns: cols, rows } = layout;
    const shouldUseLocalCompose = shouldUseLocalStoryboardCompose({
      imageUrls,
      settings,
    });

    const missingImageCount = imageUrls.filter((url) => !url?.trim()).length;
    const shouldGenerateComposite = !shouldUseLocalCompose;

    if (!sourcePrompt && missingImageCount > 0) {
      const message =
        missingImageCount === selectedShotNodes.length
          ? "选中的镜头没有可用于生成的剧本文本、生图 Prompt 或镜头图片"
          : `选中的 ${selectedShotNodes.length} 个镜头中有 ${missingImageCount} 个缺少镜头图片，也没有可用于重新生成整张分镜图的剧本文本或生图 Prompt`;
      setNodes((nds) =>
        nds.map((node) =>
          shotNodeIds.includes(node.id) && node.data.shot
            ? {
                ...node,
                data: {
                  ...node.data,
                  shot: {
                    ...node.data.shot,
                    status: "error" as const,
                    generationStatus: "failed" as const,
                    generationFinishedAt: Date.now(),
                    generationErrorCode: "EMPTY_COMPOSITE_SOURCE",
                    generationRetryable: false,
                    errorMessage: message,
                    generationError: message,
                  },
                },
              }
            : node,
        ),
      );
      return;
    }

    const anchorNode = selectedShotNodes[0];
    const gridNodeId = generateId();
    const model = await getDefaultImageModel() || "gpt-image-2";
    const size = "1792x1024";
    const requestId = generateId();
    const startedAt = Date.now();
    const generationSnapshot = createImageGenerationSnapshot({
      requestId,
      mode: "text-to-image",
      userPrompt: compositePrompt,
      model,
      size,
      sourceNodeId: shotNodeIds.join(","),
    });

    shotNodeIds.forEach((shotId) => {
      latestShotGenerationRequestIdsRef.current[shotId] = requestId;
    });
    setIsComposingSelectedShots(true);
    setNodes((nds) =>
      nds.map((node) =>
        shotNodeIds.includes(node.id) && node.data.shot
          ? {
              ...node,
              data: {
                ...node.data,
                shot: {
                  ...node.data.shot,
                  status: "generating" as const,
                  generationStatus: "generating" as const,
                  generationStartedAt: startedAt,
                  generationFinishedAt: undefined,
                  generationRequestId: requestId,
                  generationAttempts: (node.data.shot.generationAttempts || 0) + 1,
                  generationErrorCode: undefined,
                  generationRetryable: undefined,
                  errorMessage: undefined,
                  generationError: undefined,
                },
              },
            }
          : node,
      ),
    );
    try {
      const result = shouldUseLocalCompose
        ? await composeStoryboardGrid({
            images: imageUrls,
            columns: cols,
          }).then(async (dataUrl) => {
            const persisted = await persistImageDataUrl(dataUrl, {
              fileName: `storyboard-composite-${Date.now()}.png`,
            });
            return {
              imageUrl: persisted.objectUrl,
              assetId: persisted.assetId,
              prompt: compositePrompt,
              model,
            };
          })
        : await generateImageFromPrompt({
            prompt: compositePrompt,
            model,
            size,
            requestId,
          });
      const completedAt = new Date().toISOString();
      const displaySize = getStoryboardCompositeImageSize(layout);
      const completedSnapshot = {
        ...generationSnapshot,
        enhancedPrompt: result.prompt,
        model: result.model || model,
        status: "succeeded" as const,
        completedAt,
      };

      const newImageNode: Node<CanvasNodeData> = {
        id: gridNodeId,
        type: "image",
        position: {
          x: anchorNode.position.x + STORYBOARD_SHOT_LAYOUT.shotWidth + 520,
          y: anchorNode.position.y,
        },
        data: {
          title: `${selectedShotNodes.length} 格分镜图`,
          imageUrl: result.imageUrl,
          assetId: result.assetId,
          nodeKind: "ai-generated-image",
          source: "generated",
          sourceType: "shot",
          sourcePrompt,
          prompt: compositePrompt,
          generation: completedSnapshot,
          generationId: requestId,
          generatedAt: completedAt,
          generationOutput: {
            type: "storyboard-composite",
            sourceShotIds: shotNodeIds,
            layout: {
              columns: cols,
              rows,
              label: layout.label,
              requestedLayout: layout.requestedLayout,
              fallbackFrom: layout.fallbackFrom,
            },
            strategy: settings.strategy,
            localCompose: shouldUseLocalCompose,
            missingImageCount,
            generatedComposite: shouldGenerateComposite,
          },
            compositeSettings: {
              ...settings,
              layout: "auto",
            },
          persistence: result.assetId ? "indexeddb" : "remote",
          displayWidth: displaySize.width,
          displayHeight: displaySize.height,
          createdAt: Date.now(),
        },
      };

      setNodes((nds) => [
        ...nds.map((node) =>
          shotNodeIds.includes(node.id) && node.data.shot
            ? {
                ...node,
                data: {
                  ...node.data,
                  shot: {
                    ...node.data.shot,
                    status: "done" as const,
                    generationStatus: "succeeded" as const,
                    generationFinishedAt: Date.now(),
                    generationRequestId: result.requestId || requestId,
                    generationAttempts: result.attempts || node.data.shot.generationAttempts,
                    generationErrorCode: undefined,
                    generationRetryable: undefined,
                    errorMessage: undefined,
                    generationError: undefined,
                  },
                },
              }
            : node,
        ),
        newImageNode,
      ]);
      setEdges((eds) =>
        createStoryboardCompositeEdges({
          sourceShotIds: shotNodeIds,
          compositeNodeId: gridNodeId,
          existingEdges: eds,
          removePreviousCompositeEdgesForSources: true,
          edgeStyle: { stroke: DESIGN_TOKENS.nodeEdge, strokeWidth: 1.5 },
        }),
      );
      addWorkspaceHistoryEvent({
        id: generateId(),
        type: "image-generated",
        title: `生成 ${selectedShotNodes.length} 格分镜图`,
        summary: shouldUseLocalCompose
          ? "已使用选中镜头图片合成多格分镜图"
          : sourcePrompt.slice(0, 120),
        nodeId: gridNodeId,
        relatedNodeIds: [...shotNodeIds, gridNodeId],
        createdAt: completedAt,
      });
    } catch (error: any) {
      const message = error?.message || "多格分镜图生成失败";
      // 尝试 fallback：选中有镜头图的 shot，按 x 位置排序保稳定
      const shotsWithImage = selectedShotNodes
        .filter((shot) => getShotImageUrl(shot.id))
        .sort((a, b) => a.position.x - b.position.x);
      if (shotsWithImage.length > 0) {
        const fallbackShot = shotsWithImage[0];
        const fallbackImageUrl = getShotImageUrl(fallbackShot.id)!;
        const fallbackWarning =
          "合成分镜图失败，已使用第一张可用镜头图作为结果。可逐张手动为缺失镜头生成图片后重试合成。";
        const fallbackNode = {
          id: gridNodeId,
          type: "image" as const,
          position: {
            x: anchorNode.position.x + STORYBOARD_SHOT_LAYOUT.shotWidth + 520,
            y: anchorNode.position.y,
          },
          data: {
            title: "合成降级结果",
            nodeKind: "ai-generated-image" as const,
            imageUrl: fallbackImageUrl,
            source: "generated" as const,
            sourceType: "shot" as const,
            persistence: "remote" as const,
            displayWidth: 380,
            displayHeight: 214,
            createdAt: Date.now(),
            storyboardWarning: fallbackWarning,
            storyboardSourceNodeId: anchorNode.id,
            _fallbackComposite: true,
          },
        };
        setNodes((nds) => [...nds, fallbackNode]);
        console.warn(
          "[handleComposeSelectedShots] compose failed, fallback to shot image:",
          fallbackShot.id,
          error,
        );
      } else {
        // 没有任何可用镜头图 → 标记 error
        setNodes((nds) =>
          nds.map((node) =>
            shotNodeIds.includes(node.id) && node.data.shot
              ? {
                  ...node,
                  data: {
                    ...node.data,
                    shot: {
                      ...node.data.shot,
                      status: "error" as const,
                      generationStatus: "failed" as const,
                      generationFinishedAt: Date.now(),
                      generationRequestId: error?.requestId || requestId,
                      generationAttempts: error?.attempts || node.data.shot.generationAttempts,
                      generationErrorCode: error?.code || "COMPOSITE_GENERATION_FAILED",
                      generationRetryable: error?.retryable ?? true,
                      errorMessage: message,
                      generationError: message,
                    },
                  },
                }
              : node,
          ),
        );
      }
    } finally {
      setNodes((nds) =>
        nds.map((node) => {
          if (!shotNodeIds.includes(node.id) || !node.data.shot) return node;
          if (
            node.data.shot.generationRequestId !== requestId ||
            (node.data.shot.generationStatus !== "generating" && node.data.shot.generationStatus !== "retrying")
          ) {
            return node;
          }
          const message = "多格分镜图生成没有返回最终状态，已自动结束。请点击重试。";
          return {
            ...node,
            data: {
              ...node.data,
              shot: {
                ...node.data.shot,
                status: "error" as const,
                generationStatus: "failed" as const,
                generationFinishedAt: Date.now(),
                generationErrorCode: "FINAL_STATE_GUARD",
                generationRetryable: true,
                errorMessage: message,
                generationError: message,
              },
            },
          };
        }),
      );
      setIsComposingSelectedShots(false);
    }
  }, [
    getSelectedShotNodes,
    getShotImageUrl,
    isComposingSelectedShots,
    storyboardCompositeSettings,
    getStoryboardCompositeImageSize,
    setNodes,
    setEdges,
    addWorkspaceHistoryEvent,
  ]);


  const workflowRunner = useWorkflowRunner({
    onRunEvent: useCallback((event: WorkflowRunEvent) => {
      // 新 run 开始时清空旧事件
      if (event.type === "run-started") {
        setRunEvents([]);
        setShowRunPanel(true);
      }
      setRunEvents((prev) => [...prev, event]);
    }, []),
  });

  // Wire AgentNode's run button to the workflow runner
  _runAgentFn = workflowRunner.runAgentFromCanvas;

  // Wire VideoNode's retry button to the workflow runner
  _runVideoRetryFn = (nodeId: string) => {
    workflowRunner.runNode(nodeId);
  };

  _videoUpscaleFn = async (nodeId: string) => {
    const node = nodesRef.current.find((n) => n.id === nodeId);
    if (!node) return;
    // Fire and forget — the upscale API will notify via node state updates
    fetch("/api/ai/upscale", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nodeId,
        videoUrl: node.data.resultUrl,
        scale: 2,
      }),
    }).catch((err) => console.error("[upscale] API error:", err));
  };

  // Wire undo/redo for toolbar buttons
  _doUndo = () => {
    const entry = _undoStack.pop();
    if (entry) {
      _redoStack.push({ nodes: nodesRef.current, edges: edgesRef.current });
      setNodes(entry.nodes);
      setEdges(entry.edges);
      nodesRef.current = entry.nodes;
      edgesRef.current = entry.edges;
      // Clear selection to avoid referencing a node that may no longer exist
      setSelectedNodeId(null);
      closeFloatingToolbar();
    }
  };
  _doRedo = () => {
    const entry = _redoStack.pop();
    if (entry) {
      _undoStack.push({ nodes: nodesRef.current, edges: edgesRef.current });
      setNodes(entry.nodes);
      setEdges(entry.edges);
      nodesRef.current = entry.nodes;
      edgesRef.current = entry.edges;
      // Clear selection to avoid referencing a node that may no longer exist
      setSelectedNodeId(null);
      closeFloatingToolbar();
    }
  };

  // Batch generate: iterate agent-created nodes, generate images from prompt
  // Uses BatchProgressBar for global progress + per-node retry support
  const handleBatchGenerateShots = useCallback(
    async (nodeIds: string[]) => {
      if (!nodeIds.length) return;

      // Mark agent node as generating (prevents double-click)
      setNodes((nds) =>
        nds.map((n) =>
          n.data._childNodeIds ? { ...n, data: { ...n.data, _batchProgress: "starting" } } : n,
        ),
      );

      // Start global progress bar
      batchProgressRef.current?.start(nodeIds.length);

      // Filter to only nodes with valid prompts
      const validNodes = nodeIds
        .map((id) => nodesRef.current.find((n) => n.id === id))
        .filter((n): n is NonNullable<typeof n> => Boolean(n?.data?.prompt?.trim()));

      async function generateSingleShot(
        node: NonNullable<typeof validNodes[number]>,
      ): Promise<void> {
        const nodeId = node.id;
        const prompt = node.data.prompt!;

        // Mark as running
        setNodes((nds) =>
          nds.map((n) =>
            n.id === nodeId
              ? { ...n, data: { ...n.data, generationStatus: "generating" as const } }
              : n,
          ),
        );

        try {
          const model = await getDefaultImageModel();
          const result = await generateImageFromPrompt({
            prompt,
            model,
            size: "1792x1024",
          });

          const imageNodeId = generateId();
          const nodeWidth = typeof node.width === "number" ? node.width : 320;

          const imageNode: Node<CanvasNodeData> = {
            id: imageNodeId,
            type: "image",
            position: {
              x: (node.position.x ?? 0) + nodeWidth + 80,
              y: node.position.y ?? 0,
            },
            data: {
              title: node.data.title ? `${node.data.title} 图` : "分镜图",
              imageUrl: result.imageUrl,
              assetId: result.assetId,
              nodeKind: "ai-generated-image",
              sourceShotId: nodeId,
              sourcePromptId: nodeId,
              sourceType: "shot",
              prompt,
              model,
              source: "generated",
              persistence: result.assetId ? "indexeddb" : undefined,
              displayWidth: 320,
              displayHeight: 180,
              createdAt: Date.now(),
            },
          };

          setNodes((nds) => [
            ...nds.map((n) =>
              n.id === nodeId
                ? {
                    ...n,
                    data: {
                      ...n.data,
                      generationStatus: "succeeded" as const,
                      imageUrl: result.imageUrl,
                      generatedImageUrl: result.imageUrl,
                      errorMessage: undefined,
                    },
                  }
                : n,
            ),
            imageNode,
          ]);

          setEdges((eds) => [
            ...eds,
            {
              id: `edge-gen-${nodeId}-${imageNodeId}`,
              source: nodeId,
              target: imageNodeId,
              type: "creative",
              animated: true,
              style: { stroke: "rgba(168, 85, 247, 0.3)", strokeWidth: 1.5 },
            },
          ]);

          batchProgressRef.current?.tick();
        } catch (err: any) {
          setNodes((nds) =>
            nds.map((n) =>
              n.id === nodeId
                ? {
                    ...n,
                    data: {
                      ...n.data,
                      generationStatus: "failed" as const,
                      errorMessage: friendlyErrorMessage(err?.message || ""),
                      _retryCount: ((n.data._retryCount ?? 0) + 1),
                    },
                  }
                : n,
            ),
          );
          batchProgressRef.current?.fail();
        }
      }

      // Run with concurrency pool (max 3 parallel)
      await runWithConcurrency(validNodes, 3, generateSingleShot);
    },
    [setNodes, setEdges],
  );

  // Single-node retry: clear error and re-generate
  const handleRetryGenerate = useCallback(
    async (nodeId: string) => {
      const node = nodesRef.current.find((n) => n.id === nodeId);
      const prompt = node?.data?.prompt ?? "";
      if (!prompt.trim()) return;

      setNodes((nds) =>
        nds.map((n) =>
          n.id === nodeId
            ? { ...n, data: { ...n.data, generationStatus: "generating" as const, errorMessage: undefined } }
            : n,
        ),
      );

      try {
        const model = await getDefaultImageModel();
        const result = await generateImageFromPrompt({ prompt, model, size: "1792x1024" });

        // Create result node similarly to batch flow
        const imageNodeId = generateId();
        const nodeWidth = typeof node?.width === "number" ? node.width : 320;
        const imageNode: Node<CanvasNodeData> = {
          id: imageNodeId,
          type: "image",
          position: { x: (node?.position.x ?? 0) + nodeWidth + 80, y: node?.position.y ?? 0 },
          data: {
            title: node?.data?.title ? `${node.data.title} 图` : "分镜图",
            imageUrl: result.imageUrl,
            assetId: result.assetId,
            nodeKind: "ai-generated-image",
            sourceShotId: nodeId,
            sourcePromptId: nodeId,
            sourceType: "shot",
            prompt,
            model,
            source: "generated",
            persistence: result.assetId ? "indexeddb" : undefined,
            displayWidth: 320,
            displayHeight: 180,
            createdAt: Date.now(),
          },
        };

        setNodes((nds) => [
          ...nds.map((n) =>
            n.id === nodeId
              ? {
                  ...n,
                  data: {
                    ...n.data,
                    generationStatus: "succeeded" as const,
                    imageUrl: result.imageUrl,
                    generatedImageUrl: result.imageUrl,
                    errorMessage: undefined,
                  },
                }
              : n,
          ),
          imageNode,
        ]);

        setEdges((eds) => [
          ...eds,
          {
            id: `edge-gen-${nodeId}-${imageNodeId}`,
            source: nodeId,
            target: imageNodeId,
            type: "creative",
            animated: true,
            style: { stroke: "rgba(168, 85, 247, 0.3)", strokeWidth: 1.5 },
          },
        ]);
      } catch (err: any) {
        setNodes((nds) =>
          nds.map((n) =>
            n.id === nodeId
              ? {
                  ...n,
                  data: {
                    ...n.data,
                    generationStatus: "failed" as const,
                    errorMessage: friendlyErrorMessage(err?.message || ""),
                    _retryCount: ((n.data as any)._retryCount ?? 0) + 1,
                  },
                }
              : n,
          ),
        );
      }

      // Batch complete — re-enable the batch button
      setNodes((nds) =>
        nds.map((n) =>
          n.data._childNodeIds ? { ...n, data: { ...n.data, _batchProgress: undefined } } : n,
        ),
      );
    },
    [setNodes, setEdges],
  );

  _runBatchGenerateFn = handleBatchGenerateShots;

  const hasWorkflowNodes = nodes.some(
    (n) =>
      n.type === "workflow" ||
      n.type === "agent" ||
      (n.type === "content" && n.data.nodeKind === "text"),
  );

  // ========================================================================
  // CANVAS PERSISTENCE — auto-save & restore
  // ========================================================================
  const persistence = useCanvasPersistence({
    projectId,
    isRestored: isCanvasRestored,
    onRestored: () => setIsCanvasRestored(true),
    nodes,
    edges,
    setNodes,
    setEdges,
    viewport,
    setViewport,
    setFitViewOnce,
  });

  // ========================================================================
  // WORKFLOW TEMPLATES — save/load/clone canvas state
  // ========================================================================
  const workflowTemplates = useWorkflowTemplates();

  const handleSaveTemplate = useCallback(
    (name: string) => {
      workflowTemplates.saveAsTemplate(name, nodes, edges);
      setShowTemplatesDialog(false);
    },
    [workflowTemplates, nodes, edges],
  );

  const handleLoadTemplate = useCallback(
    async (template: WorkflowTemplate) => {
      if (nodes.length > 0) {
        const ok = window.confirm(
          "加载模板将替换当前画布上的所有节点。是否继续？",
        );
        if (!ok) return;
      }
      setNodes(template.nodes);
      setEdges(template.edges);
      setFitViewOnce(true);
      setShowTemplatesDialog(false);
    },
    [nodes.length, setNodes, setEdges, setFitViewOnce],
  );

  // ========================================================================
  // SETTINGS & RUN-NODE EVENT LISTENERS
  // ========================================================================
  useEffect(() => {
    const handleOpenSettings = () => setShowSettings(true);
    const handleRunNode = (e: Event) => {
      const nodeId = (e as CustomEvent<{ nodeId: string }>).detail?.nodeId;
      if (nodeId) {
        workflowRunner.runNode(nodeId);
      }
    };
    const handleSettingsUpdated = (e: Event) => {
      const detail = (e as CustomEvent<{ allowAIAutoRun?: boolean }>).detail;
      if (detail?.allowAIAutoRun !== undefined) {
        useCanvasStore.getState().setAllowAIAutoRun(detail.allowAIAutoRun);
      }
    };
    const handleClearPending = (e: Event) => {
      const nodeId = (e as CustomEvent<{ nodeId: string }>).detail?.nodeId;
      if (nodeId) {
        setNodes((nds) =>
          nds.map((n) =>
            n.id === nodeId
              ? {
                  ...n,
                  data: {
                    ...n.data,
                    runMeta: createIdleRunMeta(),
                    pendingExecution: false, // 兼容旧字段，逐步废弃
                  },
                }
              : n,
          ),
        );
      }
    };
    const handleGenerateShot = (e: Event) => {
      const nodeId = (e as CustomEvent<{ nodeId: string }>).detail?.nodeId;
      if (nodeId) handleGenerateShotImage(nodeId);
    };
    const handleGenerateGrid = (e: Event) => {
      const nodeId = (e as CustomEvent<{ nodeId: string }>).detail?.nodeId;
      if (nodeId) handleGenerateStoryboardGrid(nodeId);
    };
    const handleSplitStoryboard = (e: Event) => {
      const nodeId = (e as CustomEvent<{ nodeId: string }>).detail?.nodeId;
      if (nodeId) handleSplitStoryboardNode(nodeId);
    };
    const handleGenerateStoryboardImage = (e: Event) => {
      const nodeId = (e as CustomEvent<{ nodeId: string }>).detail?.nodeId;
      if (nodeId) handleGenerateStoryboardImageFromSource(nodeId);
    };
    const handleCreateStoryboardAssistant = (e: Event) => {
      const nodeId = (e as CustomEvent<{ nodeId: string }>).detail?.nodeId;
      if (nodeId) handleCreateStoryboardAssistantFromInspiration(nodeId);
    };
    window.addEventListener("startrails-open-settings", handleOpenSettings);
    window.addEventListener("startrails-run-node", handleRunNode);
    window.addEventListener("starcanvas:generate-shot", handleGenerateShot);
    window.addEventListener("starcanvas:generate-grid", handleGenerateGrid);
    window.addEventListener("starcanvas:split-storyboard", handleSplitStoryboard);
    window.addEventListener(
      "starcanvas:generate-storyboard-image",
      handleGenerateStoryboardImage,
    );
    window.addEventListener(
      "starcanvas:create-storyboard-assistant",
      handleCreateStoryboardAssistant,
    );
    window.addEventListener(
      "startrails-settings-updated",
      handleSettingsUpdated,
    );
    window.addEventListener("startrails-clear-pending", handleClearPending);
    return () => {
      window.removeEventListener(
        "startrails-open-settings",
        handleOpenSettings,
      );
      window.removeEventListener("startrails-run-node", handleRunNode);
      window.removeEventListener(
        "starcanvas:generate-shot",
        handleGenerateShot,
      );
      window.removeEventListener(
        "starcanvas:generate-grid",
        handleGenerateGrid,
      );
      window.removeEventListener(
        "starcanvas:split-storyboard",
        handleSplitStoryboard,
      );
      window.removeEventListener(
        "starcanvas:generate-storyboard-image",
        handleGenerateStoryboardImage,
      );
      window.removeEventListener(
        "starcanvas:create-storyboard-assistant",
        handleCreateStoryboardAssistant,
      );
      window.removeEventListener(
        "startrails-settings-updated",
        handleSettingsUpdated,
      );
      window.removeEventListener(
        "startrails-clear-pending",
        handleClearPending,
      );
    };
  }, [
    workflowRunner,
    setNodes,
    handleGenerateShotImage,
    handleGenerateStoryboardGrid,
    handleSplitStoryboardNode,
    handleGenerateStoryboardImageFromSource,
    handleCreateStoryboardAssistantFromInspiration,
  ]);

  // ========================================================================
  // DRAG & DROP UPLOAD
  // ========================================================================
  const {
    isDragOver,
    dragError,
    handleDragEnter,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    clearError,
  } = useCanvasDropUpload(setNodes, dismissCanvasHint, (documentNodes) => {
    documentNodes.forEach((node) => {
      addWorkspaceHistoryEvent({
        id: generateId(),
        type: "document-uploaded",
        title: `上传文档：${node.data.title || node.data.fileName || "未命名文档"}`,
        summary: typeof node.data.summary === "string" ? node.data.summary : undefined,
        nodeId: node.id,
        createdAt: new Date().toISOString(),
      });
    });
  });

  // ── 历史产物拖回画布 (P2-4) ──
  // onNodeCreated: 节点创建后自动选中（Zustand store）
  const { handleHistoryDrop } = useHistoryDrop(setNodes, (nodeId) =>
    setSelectedNodeId(nodeId),
  );

  // 组合 drop handler：先检查历史 payload，未命中回退到文件拖放
  const combinedHandleDrop = useCallback(
    (e: React.DragEvent) => {
      if (handleHistoryDrop(e)) return;
      handleDrop(e);
    },
    [handleHistoryDrop, handleDrop],
  );

  // ========================================================================
  // GET SELECTED NODE
  // ========================================================================
  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedNodeId) || null,
    [nodes, selectedNodeId],
  );

  const getCanvasFocusScreenPoint = useCallback(() => {
    const availableWidth =
      window.innerWidth -
      (chatOpen ? CHAT_PANEL_WIDTH : 0) -
      LEFT_TOOLBAR_SAFE_WIDTH;
    return {
      x: LEFT_TOOLBAR_SAFE_WIDTH + Math.max(availableWidth, 0) / 2,
      y: window.innerHeight / 2,
    };
  }, [chatOpen]);

  const getCenteredFlowPosition = useCallback(
    (nodeSize: { width: number; height: number } = { width: 0, height: 0 }) => {
      if (!reactFlowInstance) return { x: 400, y: 300 };
      const centerPosition = reactFlowInstance.screenToFlowPosition(
        getCanvasFocusScreenPoint(),
      );
      return {
        x: centerPosition.x - nodeSize.width / 2,
        y: centerPosition.y - nodeSize.height / 2,
      };
    },
    [reactFlowInstance, getCanvasFocusScreenPoint],
  );

  const focusCanvasNode = useCallback(
    (nodeId: string) => {
      const target = nodesRef.current.find((node) => node.id === nodeId);
      if (!target) return false;
      setSelectedNodeId(nodeId);
      if (!reactFlowInstance) return true;
      reactFlowInstance.setCenter(
        target.position.x + (target.measured?.width ?? target.width ?? 280) / 2,
        target.position.y + (target.measured?.height ?? target.height ?? 200) / 2,
        { duration: 600, zoom: Math.max(viewport.zoom, 1) },
      );
      return true;
    },
    [reactFlowInstance, setSelectedNodeId, viewport.zoom],
  );

  const fitViewToVisibleCanvas = useCallback(
    (duration = 500) => {
      if (!reactFlowInstance) return;
      const visibleNodes = getVisibleCanvasNodes(nodesRef.current);
      if (visibleNodes.length === 0) return;
      const horizontalFocusOffset =
        ((chatOpen ? CHAT_PANEL_WIDTH : 0) - LEFT_TOOLBAR_SAFE_WIDTH) / 2;
      setTimeout(() => {
        reactFlowInstance.fitView({
          nodes: visibleNodes.map((node) => ({ id: node.id })),
          padding: 0.28,
          maxZoom: 1.1,
          duration,
        });
        if (horizontalFocusOffset !== 0) {
          setTimeout(() => {
            const currentViewport = reactFlowInstance.getViewport();
            reactFlowInstance.setViewport(
              {
                ...currentViewport,
                x: currentViewport.x - horizontalFocusOffset,
              },
              { duration: 220 },
            );
          }, duration + 20);
        }
      }, 50);
    },
    [reactFlowInstance, chatOpen],
  );

  // ========================================================================
  // FIT VIEW ON LOAD
  // ========================================================================
  useEffect(() => {
    if (fitViewOnce && reactFlowInstance && nodes.length > 0) {
      fitViewToVisibleCanvas();
      setFitViewOnce(false);
    }
  }, [
    fitViewOnce,
    reactFlowInstance,
    nodes.length,
    setFitViewOnce,
    fitViewToVisibleCanvas,
  ]);

  const recoverCanvasVisibility = useCallback(() => {
    setNodes((nds) => {
      const recovered = applyCanvasVisibilityAndLayoutRecovery(nds);
      nodesRef.current = recovered;
      return recovered;
    });
    setTimeout(() => fitViewToVisibleCanvas(450), 80);
  }, [fitViewToVisibleCanvas, setNodes]);

  useEffect(() => {
    if (!isCanvasRestored || nodes.length === 0) return;
    const visibleNodes = getVisibleCanvasNodes(nodes);
    if (visibleNodes.length > 0) return;

    recoverCanvasVisibility();
  }, [isCanvasRestored, nodes, recoverCanvasVisibility]);

  const visibleCanvasNodeCount = useMemo(() => getVisibleCanvasNodes(nodes).length, [nodes]);
  const hasHiddenOnlyCanvas = isCanvasRestored && nodes.length > 0 && visibleCanvasNodeCount === 0;

  // ========================================================================
  // VIEWPORT CHANGE
  // ========================================================================
  const onMoveEnd = useCallback(
    (_: any, vp: Viewport) => {
      setViewport(vp);
    },
    [setViewport],
  );

  // ========================================================================
  // SELECTION
  // ========================================================================
  const onSelectionChange = useCallback(
    ({ nodes: selectedNodes }: { nodes: Node<CanvasNodeData>[] }) => {
      setShowPropertyPanel(selectedNodes.length === 1);
      setSelectionCount(selectedNodes.length);
      setNodes((nds) => {
        const selectedIds = new Set(selectedNodes.map((node) => node.id));
        let changed = false;
        const updated = nds.map((node) => {
          const shouldBeSelected = selectedIds.has(node.id);
          if (node.selected === shouldBeSelected) return node;
          changed = true;
          return { ...node, selected: shouldBeSelected };
        });
        return changed ? updated : nds;
      });

      if (selectedNodes.length === 1) {
        setSelectedNodeId(selectedNodes[0].id);
      } else {
        setSelectedNodeId(null);
      }
      closeContextMenu();
      closeFloatingToolbar();
    },
    [setNodes, setSelectedNodeId, closeContextMenu, closeFloatingToolbar],
  );

  // ========================================================================
  // CONTEXT MENU - CANVAS
  // ========================================================================
  const handlePaneContextMenu = useCallback(
    (event: ReactMouseEvent<Element> | MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();

      if (!reactFlowInstance) return;

      const bounds = reactFlowWrapper.current?.getBoundingClientRect();
      if (!bounds) return;

      const canvasX =
        (event.clientX - bounds.left - viewport.x) / viewport.zoom;
      const canvasY = (event.clientY - bounds.top - viewport.y) / viewport.zoom;

      setContextMenu({
        type: "canvas",
        screenX: event.clientX,
        screenY: event.clientY,
        canvasX,
        canvasY,
      });
    },
    [reactFlowInstance, viewport, setContextMenu],
  );

  // ========================================================================
  // CONTEXT MENU - NODE
  // ========================================================================
  const handleNodeContextMenu = useCallback(
    (event: ReactMouseEvent<Element>, node: Node<CanvasNodeData>) => {
      event.preventDefault();
      event.stopPropagation();

      setContextMenu({
        type: "node",
        nodeId: node.id,
        nodeType: node.type || "content",
        screenX: event.clientX,
        screenY: event.clientY,
      });
    },
    [setContextMenu],
  );

  // ========================================================================
  // CONTEXT MENU - EDGE
  // ========================================================================
  const handleEdgeContextMenu: EdgeMouseHandler = useCallback(
    (event, edge) => {
      event.preventDefault();
      event.stopPropagation();

      setContextMenu({
        type: "edge",
        edgeId: edge.id,
        screenX: event.clientX,
        screenY: event.clientY,
      });
    },
    [setContextMenu],
  );

  // ========================================================================
  // IMAGE HOVER
  // ========================================================================
  const handleImageNodeMouseEnter = useCallback(
    (nodeId: string, event: MouseEvent) => {
      const bounds = reactFlowWrapper.current?.getBoundingClientRect();
      if (!bounds) return;
      const node = nodesRef.current.find((n) => n.id === nodeId);
      if (!node) return;

      const nodeX = node.position.x * viewport.zoom + viewport.x + bounds.left;
      const nodeY = node.position.y * viewport.zoom + viewport.y + bounds.top;
      const nodeWidth = (node.measured?.width || 280) * viewport.zoom;
      const nodeHeight = (node.measured?.height || 200) * viewport.zoom;

      const screenX = nodeX + nodeWidth / 2;
      const screenY = nodeY + nodeHeight + 10;

      const above = screenY + 60 > window.innerHeight;

      setFloatingToolbar({
        type: "image-hover",
        nodeId,
        position: {
          x: screenX - 130,
          y: above ? nodeY - 70 : screenY,
          above,
        },
      });
    },
    [viewport, setFloatingToolbar],
  );

  const handleImageNodeMouseLeave = useCallback(() => {
    closeFloatingToolbar();
  }, [closeFloatingToolbar]);

  // Track which image node ids are currently registered (stable across renders)
  const registeredNodeIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    const currentImageNodes = nodes.filter((node) => node.type === "image");
    const currentIds = new Set(currentImageNodes.map((n) => n.id));
    const prevIds = registeredNodeIds.current;

    // Unregister nodes that no longer exist
    for (const id of prevIds) {
      if (!currentIds.has(id)) {
        unregisterImageHoverHandlers(id);
      }
    }

    // Register new nodes
    for (const node of currentImageNodes) {
      if (!prevIds.has(node.id)) {
        registerImageHoverHandlers(node.id, {
          onMouseEnter: handleImageNodeMouseEnter,
          onMouseLeave: handleImageNodeMouseLeave,
        });
      }
    }

    // Update tracked set
    registeredNodeIds.current = currentIds;
  }, [nodes, handleImageNodeMouseEnter, handleImageNodeMouseLeave]);

  // ========================================================================
  // FILE UPLOAD
  // ========================================================================
  const handleFileChange = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      if (files.length === 0) return;

      // Calculate center position within visible canvas area, excluding the chat panel.
      let basePosition = getCenteredFlowPosition(NODE_DEFAULT_SIZE.image);

      // Process each file. 这里只读取原图尺寸并控制画布展示尺寸，不压缩、不改写用户原图。
      const newNodes: Node<CanvasNodeData>[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!file.type.startsWith("image/")) continue;

        try {
          const metadataUrl = URL.createObjectURL(file);
          const dimensions = await new Promise<{
            width: number;
            height: number;
          }>((resolve, reject) => {
            const image = new Image();
            image.onload = () => {
              URL.revokeObjectURL(metadataUrl);
              resolve({
                width: image.naturalWidth,
                height: image.naturalHeight,
              });
            };
            image.onerror = () => {
              URL.revokeObjectURL(metadataUrl);
              reject(new Error("图片加载失败"));
            };
            image.src = metadataUrl;
          });

          // Persist to IndexedDB and use its tracked runtime preview URL.
          const { assetId, objectUrl } = await persistImageFile(file, {
            width: dimensions.width,
            height: dimensions.height,
          });

          const maxWidth = IMAGE_NODE_SIZE.maxWidth;
          const maxHeight = IMAGE_NODE_SIZE.maxHeight;
          let width = dimensions.width;
          let height = dimensions.height;

          if (width > maxWidth) {
            const ratio = maxWidth / width;
            width = maxWidth;
            height = height * ratio;
          }
          if (height > maxHeight) {
            const ratio = maxHeight / height;
            height = maxHeight;
            width = width * ratio;
          }

          width = Math.max(width, IMAGE_NODE_SIZE.minWidth);
          height = Math.max(height, IMAGE_NODE_SIZE.minHeight);

          const node: Node<CanvasNodeData> = {
            id: generateId(),
            type: "image",
            position: {
              x: basePosition.x + i * 40,
              y: basePosition.y + i * 40,
            },
            data: {
              title: file.name,
              imageUrl: objectUrl,
              assetId,
              fileName: file.name,
              fileSize: file.size,
              mimeType: file.type,
              imageWidth: dimensions.width,
              imageHeight: dimensions.height,
              displayWidth: width,
              displayHeight: height,
              aspectRatio: dimensions.width / dimensions.height,
              nodeKind: "uploaded-image",
              source: "upload",
              persistence: "indexeddb",
              createdAt: Date.now(),
            },
            measured: {
              width,
              height: height + 22,
            },
          };

          newNodes.push(node);
        } catch (error) {
          console.error("[UPLOAD_IMAGE] Error processing image:", error);
        }
      }

      if (newNodes.length > 0) {
        setNodes((nds) => [...nds, ...newNodes]);
        dismissCanvasHint();
      }

      e.target.value = "";
    },
    [getCenteredFlowPosition, setNodes, dismissCanvasHint],
  );

  const handleUploadClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleDocumentUploadClick = useCallback((position?: { x: number; y: number }) => {
    pendingDocumentUploadPositionRef.current = position ?? null;
    documentInputRef.current?.click();
  }, []);

  const handleCreateCanvasSnapshot = useCallback(() => {
    const snapshotId = generateId();
    const now = new Date().toISOString();
    const textNodes = nodesRef.current.filter(
      (node) =>
        node.data?.nodeKind === "document" ||
        node.data?.nodeKind === "storyboard" ||
        node.data?.nodeKind === "text",
    );
    const primaryTitle = textNodes[0]?.data?.title || "当前画布";
    const snapshot: CanvasSnapshot = {
      id: snapshotId,
      title: `${primaryTitle} · 关键版本`,
      summary: `${nodesRef.current.length} 个节点，${edgesRef.current.length} 条连线`,
      createdAt: now,
      schemaVersion: CANVAS_SNAPSHOT_SCHEMA_VERSION,
      nodeCount: nodesRef.current.length,
      edgeCount: edgesRef.current.length,
      nodes: nodesRef.current,
      edges: edgesRef.current,
      viewport,
    };

    addCanvasSnapshot(snapshot);
    addWorkspaceHistoryEvent({
      id: generateId(),
      type: "snapshot-created",
      title: `保存关键版本：${snapshot.title}`,
      summary: snapshot.summary,
      snapshotId,
      createdAt: now,
    });
  }, [addCanvasSnapshot, addWorkspaceHistoryEvent, viewport]);

  const handleRestoreCanvasSnapshot = useCallback(
    (snapshot: CanvasSnapshot) => {
      const safeSnapshot = sanitizeAndValidateCanvasSnapshot(snapshot);
      if (!safeSnapshot) {
        addWorkspaceHistoryEvent({
          id: generateId(),
          type: "snapshot-restored",
          title: "恢复关键版本失败",
          summary: "快照结构无效或包含不安全数据，已阻止恢复。",
          snapshotId: snapshot.id,
          createdAt: new Date().toISOString(),
        });
        return;
      }

      setNodes(applyCanvasVisibilityAndLayoutRecovery(safeSnapshot.nodes));
      setEdges(safeSnapshot.edges);
      setSelectedNodeId(null);
      setFitViewOnce(true);
      addWorkspaceHistoryEvent({
        id: generateId(),
        type: "snapshot-restored",
        title: `恢复关键版本：${safeSnapshot.title}`,
        summary: safeSnapshot.summary,
        snapshotId: safeSnapshot.id,
        createdAt: new Date().toISOString(),
      });
      setShowWorkspaceHistory(false);
    },
    [setEdges, setFitViewOnce, setNodes, setSelectedNodeId, addWorkspaceHistoryEvent],
  );

  const handleDocumentFileChange = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []).filter(isTextDocumentFile);
      if (files.length === 0) {
        e.target.value = "";
        return;
      }

      const basePosition =
        pendingDocumentUploadPositionRef.current ??
        getCenteredFlowPosition({ width: 560, height: 420 });
      pendingDocumentUploadPositionRef.current = null;
      const newNodes: Node<CanvasNodeData>[] = [];

      try {
        for (let i = 0; i < files.length; i++) {
          const document = await readTextDocumentFile(files[i]);
          newNodes.push(
            createDocumentNode({
              id: generateId(),
              document,
              position: {
                x: basePosition.x + i * 40,
                y: basePosition.y + i * 40,
              },
            }),
          );
        }
      } catch (error: any) {
        console.error("[UPLOAD_DOCUMENT] Error processing document:", error);
      }

      if (newNodes.length > 0) {
        setNodes((nds) => [...nds, ...newNodes]);
        newNodes.forEach((node) => {
          addWorkspaceHistoryEvent({
            id: generateId(),
            type: "document-uploaded",
            title: `上传文档：${node.data.title || node.data.fileName || "未命名文档"}`,
            summary: node.data.summary,
            nodeId: node.id,
            createdAt: new Date().toISOString(),
          });
        });
        dismissCanvasHint();
      }

      e.target.value = "";
    },
    [getCenteredFlowPosition, setNodes, dismissCanvasHint, addWorkspaceHistoryEvent],
  );

  const buildProjectPackage = useCallback(() => {
    const now = new Date().toISOString();
    const plainNodes = nodes.map((node) => {
      const data = node.data || {};
      return {
        id: node.id,
        type: node.type || "workflow",
        position: node.position,
        data: {
          title: data.title,
          nodeKind: data.nodeKind,
          workflowRole: data.workflowRole,
          status: data.status,
          runMeta: data.runMeta ?? undefined,
          summary: data.summary,
          prompt: data.prompt,
          content: data.content,
          duration: data.duration,
          model: data.model,
          fileName: data.fileName,
          fileSize: data.fileSize,
          mimeType: data.mimeType,
          imageUrl: data.imageUrl,
          assetUrl: data.assetUrl,
          resultUrl: data.resultUrl,
          inputs: data.inputs,
          outputs: data.outputs,
          createdAt: data.createdAt,
        },
      };
    });

    const shots = plainNodes
      .filter((node) =>
        [
          "storyboard",
          "image-generation",
          "video-generation",
          "image-result",
        ].includes(String(node.data.nodeKind || "")),
      )
      .map((node, index) => ({
        id: node.id,
        order: index + 1,
        title: node.data.title || `镜头 ${index + 1}`,
        intent: [node.data.summary, node.data.content, node.data.prompt]
          .filter(Boolean)
          .join("\n"),
        visualReference:
          node.data.imageUrl ||
          node.data.assetUrl ||
          node.data.resultUrl ||
          null,
        status: node.data.status || "draft",
      }));

    const visualReferences = plainNodes
      .filter(
        (node) =>
          ["uploaded-image", "reference", "image-result"].includes(
            String(node.data.nodeKind || ""),
          ) || Boolean(node.data.imageUrl),
      )
      .map((node) => ({
        id: node.id,
        title: node.data.title || node.data.fileName || "视觉参考",
        url:
          node.data.imageUrl ||
          node.data.assetUrl ||
          node.data.resultUrl ||
          null,
        mimeType: node.data.mimeType || null,
        note: node.data.summary || node.data.prompt || "",
      }));

    const audioIntent = nodes
      .filter(
        (node) =>
          node.data?.nodeKind === "audio" ||
          node.data?.nodeKind === "uploaded-audio",
      )
      .map((node) => ({
        id: node.id,
        title: node.data.title || "声音意图",
        note: getNodeText(node),
      }));

    const handoffNotes = nodes
      .filter((node) =>
        ["composition", "video-result", "subtitle", "script", "text"].includes(
          String(node.data?.nodeKind || ""),
        ),
      )
      .map((node) => ({
        id: node.id,
        title: node.data.title || "交接说明",
        note: getNodeText(node),
      }));

    const productionBriefs = buildShotProductionBriefs(nodes);
    const productionRunManifest = buildProjectPackageManifest({
      shots,
      productionBriefs,
      visualReferences,
      audioIntent,
      handoffNotes,
    });

    return {
      schema: "startrails-project-package/v1",
      source: "星轨画布（前期）",
      exportedAt: now,
      projectName: "星轨前期项目包",
      summary:
        "由星轨画布（前期）导出，供星轨画布（后期）继续处理节奏、字幕、声音和成片细节。",
      handoffTarget: "星轨画布（后期）",
      stats: {
        nodes: plainNodes.length,
        edges: edges.length,
        shots: shots.length,
        visualReferences: visualReferences.length,
        audioIntent: audioIntent.length,
      },
      shots,
      productionBriefs,
      productionRunManifest,
      visualReferences,
      audioIntent,
      handoffNotes,
      canvas: {
        viewport,
        nodes: plainNodes,
        edges: edges.map((edge) => ({
          id: edge.id,
          source: edge.source,
          target: edge.target,
          sourceHandle: edge.sourceHandle,
          targetHandle: edge.targetHandle,
          type: edge.type,
          animated: edge.animated,
        })),
      },
    };
  }, [nodes, edges, viewport]);

  const handleExportProjectPackage = useCallback(() => {
    const projectPackage = buildProjectPackage();
    const json = JSON.stringify(projectPackage, null, 2);
    const blob = new Blob([json], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const date = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.download = `startrails-project-${date}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }, [buildProjectPackage]);

  // Generate HTML content once (reused by both download and print paths)
  const buildStoryboardHtml = useCallback(() => {
    const briefs = buildShotProductionBriefs(nodes);
    if (briefs.length === 0) return null;
    const imageUrls: Record<string, string> = {};
    for (const brief of briefs) {
      const url = getShotImageUrlFromCanvas({ shotId: brief.shotId, nodes: nodes as any });
      if (url) imageUrls[brief.shotId] = url;
    }
    return { html: generateStoryboardPdfHtml({ title: "星轨分镜本", briefs, imageUrls }), briefs };
  }, [nodes]);

  const handleExportStoryboardPdf = useCallback(() => {
    const result = buildStoryboardHtml();
    if (!result) {
      alert("当前画布没有找到分镜节点，请先通过「故事分镜」流程生成分镜。");
      return;
    }

    const blob = new Blob([result.html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = storyboardPdfFilename("星轨分镜本");
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }, [buildStoryboardHtml]);

  /** 一键打印为 PDF：在新窗口打开分镜本 HTML 并自动调起打印对话框 */
  const handlePrintStoryboardPdf = useCallback(() => {
    const result = buildStoryboardHtml();
    if (!result) {
      alert("当前画布没有找到分镜节点。");
      return;
    }

    const printWindow = window.open("", "_blank", "width=1024,height=768");
    if (!printWindow) {
      // Fallback: download HTML and instruct user
      handleExportStoryboardPdf();
      alert("弹窗被拦截，已下载 HTML 文件，请在浏览器中打开后 Ctrl+P 打印为 PDF。");
      return;
    }

    printWindow.document.write(result.html);
    printWindow.document.close();

    // Wait for images/styles to load, then trigger print
    printWindow.onload = () => {
      setTimeout(() => {
        printWindow.print();
      }, 500);
    };
  }, [buildStoryboardHtml, handleExportStoryboardPdf]);

  const handleExportScreenplay = useCallback(() => {
    const briefs = buildShotProductionBriefs(nodes);
    if (briefs.length === 0) {
      alert("当前画布没有找到分镜节点。");
      return;
    }
    const md = generateScreenplayMarkdown("星轨剧本", briefs);
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = screenplayFilename("星轨剧本");
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }, [nodes]);

  const handleExportCharacterCsv = useCallback(() => {
    const shots = nodes
      .map((node) => node.data.shot)
      .filter((shot): shot is NonNullable<CanvasNodeData["shot"]> => Boolean(shot));
    const characters = collectCharacterAssetLibraryItemsFromShots(shots);
    if (characters.length === 0) {
      alert("当前画布没有找到角色资产，请先在分镜中定义角色。");
      return;
    }
    const csv = generateCharacterTableCsv(characters);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = characterTableFilename("星轨");
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }, [nodes]);

  const handleExportStoryboardCsv = useCallback(() => {
    const briefs = buildShotProductionBriefs(nodes);
    if (briefs.length === 0) {
      alert("当前画布没有找到分镜节点。");
      return;
    }
    const csv = generateStoryboardTableCsv(briefs);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = storyboardTableFilename("星轨");
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }, [nodes]);

  const handleExportSubtitles = useCallback(() => {
    const briefs = buildShotProductionBriefs(nodes);
    if (briefs.length === 0) {
      alert("当前画布没有找到分镜节点。");
      return;
    }
    const bundle = buildSubtitleExport(briefs);

    // Download SRT
    const srtBlob = new Blob([bundle.srt], { type: "text/plain;charset=utf-8" });
    const srtUrl = URL.createObjectURL(srtBlob);
    const srtLink = document.createElement("a");
    srtLink.href = srtUrl;
    srtLink.download = subtitleTimelineFilename("星轨", "srt");
    document.body.appendChild(srtLink);
    srtLink.click();
    srtLink.remove();
    URL.revokeObjectURL(srtUrl);

    // Download VTT
    const vttBlob = new Blob([bundle.vtt], { type: "text/plain;charset=utf-8" });
    const vttUrl = URL.createObjectURL(vttBlob);
    const vttLink = document.createElement("a");
    vttLink.href = vttUrl;
    vttLink.download = subtitleTimelineFilename("星轨", "vtt");
    document.body.appendChild(vttLink);
    vttLink.click();
    vttLink.remove();
    URL.revokeObjectURL(vttUrl);
  }, [nodes]);

  const handleExportCompositionScript = useCallback(() => {
    const briefs = buildShotProductionBriefs(nodes);
    if (briefs.length === 0) {
      alert("当前画布没有找到分镜节点。");
      return;
    }

    // Collect video and audio URLs from shot nodes
    const videoUrls: Record<string, string> = {};
    const audioUrls: Record<string, string> = {};
    for (const node of nodes) {
      const shot = node.data.shot;
      if (!shot) continue;
      const shotId = shot.id;
      // Video from resultUrl or data
      if (node.data.resultUrl) videoUrls[shotId] = node.data.resultUrl;
      // Audio from voice generation
      if (shot.voiceAudioUrl) audioUrls[shotId] = shot.voiceAudioUrl;
    }

    const input: VideoCompositionInput = {
      briefs,
      videoUrls,
      audioUrls,
      projectName: "星轨",
    };

    const { script, scriptFilename } = generateVideoCompositionScript(input);
    const blob = new Blob([script], { type: "text/x-sh;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = scriptFilename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }, [nodes]);

  // ========================================================================
  // 剪映草稿导出
  // ========================================================================

  /** 导出剪映草稿 JSON（draft_content.json） */
  const handleExportToJianyingDraft = useCallback(() => {
    setExportPreflightType("json");
    setShowExportPreflight(true);
  }, []);

  /** 导出剪映兼容包 ZIP（视频 + SRT 字幕 + 音频） */
  const handleExportJianyingCompatible = useCallback(() => {
    setExportPreflightType("zip");
    setShowExportPreflight(true);
  }, []);

  /** 实际执行剪映导出（由 ExportPreflightPanel 调用） */
  const performJianyingExport = useCallback(async (type: "json" | "zip"): Promise<{
    success: boolean; filePath?: string; message?: string; files?: Array<{ path: string; size: number }>
  }> => {
    const videoInputs = extractVideoNodesFromCanvas(nodes);
    const audioInputs = extractAudioNodesFromCanvas(nodes);
    const subtitleInputs = extractSubtitleNodesFromCanvas(nodes);

    if (videoInputs.length === 0 && audioInputs.length === 0 && subtitleInputs.length === 0) {
      alert("当前画布没有找到可导出的视频、音频或字幕节点。请先生成视频或添加字幕。");
      return { success: false, message: "无可用素材" };
    }

    try {
      if (type === "json") {
        const result = exportToJianyingDraft(videoInputs, audioInputs, subtitleInputs);
        downloadJsonFile(result.draftContentJson, `draft_content_${Date.now()}.json`);
        downloadJsonFile(result.draftMetaJson, `draft_meta_info_${Date.now()}.json`);
        return {
          success: true,
          message: `JSON 草稿已生成: ${result.trackCount} 个轨道, ${result.materialCount} 个素材, 时长 ${result.totalDurationSeconds.toFixed(1)}s`,
          files: [
            { path: `draft_content_${Date.now()}.json`, size: new Blob([result.draftContentJson]).size },
            { path: `draft_meta_info_${Date.now()}.json`, size: new Blob([result.draftMetaJson]).size },
          ],
        }
      } else {
        const pkg = await buildJianyingCompatiblePackage(videoInputs, audioInputs, subtitleInputs);
        downloadZipBuffer(pkg.zipBuffer, pkg.fileName);
        return {
          success: true,
          message: `ZIP 兼容包已生成: ${pkg.files.length} 个文件, ${(pkg.zipBuffer.byteLength / 1024 / 1024).toFixed(1)} MB`,
          files: pkg.files,
        }
      }
    } catch (error) {
      throw error;
    }
  }, [nodes]);

  // ========================================================================
  // ADD NODE
  // ========================================================================
  const getWorkflowDefaults = (nodeKind: CanvasNodeKind): CanvasNodeData => {
    const idleMeta = createIdleRunMeta();
    const defaults: Partial<Record<CanvasNodeKind, CanvasNodeData>> = {
      script: {
        title: "灵感碎片",
        workflowRole: "灵感提炼",
        status: "draft", // 兼容旧代码读取
        runMeta: idleMeta,
        summary: "粘贴新闻、文章、链接、资料摘录或随手想法，让 AI 提炼成可继续创作的故事种子。",
        model: "GPT-5.5",
        inputs: [{ label: "新闻 / 文章 / 想法 / 链接" }],
        outputs: [{ label: "故事种子", type: "text" }],
      },
      storyboard: {
        title: "分镜草稿",
        workflowRole: "Storyboard",
        status: "ready",
        runMeta: idleMeta,
        summary: "按创意拆出镜头草稿，先确定画面重点、景别、构图和调度意图。",
        inputs: [{ label: "前期文本" }],
        outputs: [{ label: "镜头草稿", type: "storyboard" }],
      },
      "image-generation": {
        title: "关键画面设计",
        workflowRole: "Text to Image",
        status: "ready",
        runMeta: idleMeta,
        summary: "根据分镜提示词生成角色、场景、首帧或风格板图片。",
        model: "Banana Pro",
        inputs: [{ label: "分镜提示词" }],
        outputs: [{ label: "关键画面", type: "image" }],
      },
      "video-generation": {
        title: "动效预演",
        workflowRole: "Image to Video",
        status: "draft",
        runMeta: idleMeta,
        summary:
          "只做前期预演：用关键帧验证动作、机位和氛围，不负责最终节奏精剪。",
        model: "Seedance 2.0",
        duration: "5s",
        inputs: [{ label: "关键画面" }, { label: "运动提示" }],
        outputs: [{ label: "预演片段", type: "video" }],
      },
      "video-sample-frames": {
        title: "视频抽帧",
        workflowRole: "Frame Extractor",
        status: "draft",
        runMeta: idleMeta,
        summary: "从上游视频均匀抽取关键帧，供下游分析或参考。",
        inputs: [{ label: "视频输入", type: "video" }],
        outputs: [{ label: "抽帧结果", type: "image" }],
        generationOutput: null,
      },
      "video-analyze": {
        title: "视频分析",
        workflowRole: "Video Analyzer",
        status: "draft",
        runMeta: idleMeta,
        summary: "分析上游帧画面，生成视频内容摘要。",
        inputs: [{ label: "帧画面输入", type: "image" }],
        outputs: [{ label: "分析结果", type: "text" }],
        generationOutput: null,
      },
      audio: {
        title: "声音意图",
        workflowRole: "Audio Brief",
        status: "draft",
        runMeta: idleMeta,
        summary: "记录旁白、环境声、音乐情绪和声音参考，供后期继续制作。",
        inputs: [{ label: "脚本/情绪" }],
        outputs: [{ label: "声音说明", type: "audio" }],
      },
      bgm: {
        title: "BGM 情绪设计",
        workflowRole: "BGM Brief",
        status: "draft",
        runMeta: idleMeta,
        summary: "参考 InspireMusic/Suno 类工作流，先沉淀音乐情绪、节拍、乐器与版权备注，再交给外部生成或后期制作。",
        model: "BGM Brief",
        inputs: [{ label: "分镜/情绪" }],
        outputs: [{ label: "音乐提示词", type: "audio" }],
      },
      upscale: {
        title: "高清放大",
        workflowRole: "Upscale Brief",
        status: "draft",
        runMeta: idleMeta,
        summary: "参考 Real-ESRGAN/视频超分流程，为图片或视频记录 2x/4x 放大、降噪、保细节要求。",
        model: "Real-ESRGAN Reference",
        inputs: [{ label: "图片/视频" }],
        outputs: [{ label: "高清版本", type: "image" }],
      },
      poster: {
        title: "AI 海报",
        workflowRole: "Poster Generator",
        status: "draft",
        runMeta: idleMeta,
        summary: "把角色、场景、片名、卖点和视觉风格合成为竖版/横版海报提示词，可接现有生图链路。",
        model: "GPT-Image-2 / Ideogram",
        inputs: [{ label: "角色/标题/风格" }],
        outputs: [{ label: "海报图", type: "image" }],
      },
      "talking-photo": {
        title: "照片说话 / 数字人",
        workflowRole: "Talking Photo Brief",
        status: "draft",
        runMeta: idleMeta,
        summary: "参考 LivePortrait/MuseTalk，记录头像、台词、声线和口型同步要求，形成后续数字人生成任务。",
        model: "LivePortrait / MuseTalk Reference",
        inputs: [{ label: "角色头像" }, { label: "台词/音频" }],
        outputs: [{ label: "口播视频", type: "video" }],
      },
      "remix-analysis": {
        title: "爆款拆解 / 复刻",
        workflowRole: "Remix Analyst",
        status: "draft",
        runMeta: idleMeta,
        summary: "拆解参考视频/文案的节奏、钩子、镜头结构、反转点和可复刻模板，不直接复制受版权保护内容。",
        model: "Creative Analyst",
        inputs: [{ label: "参考链接/脚本" }],
        outputs: [{ label: "复刻结构", type: "text" }],
      },
      "camera-control": {
        title: "摄影机控制",
        workflowRole: "Camera Control",
        status: "draft",
        runMeta: idleMeta,
        summary: "基于已有镜头语言类型，明确景别、机位、镜头运动、焦段、调度和一镜到底路径。",
        model: "Cinematography Planner",
        inputs: [{ label: "分镜/场景" }],
        outputs: [{ label: "摄影机指令", type: "text" }],
      },
      subtitle: {
        title: "对白/旁白草稿",
        workflowRole: "Dialogue Draft",
        status: "draft",
        runMeta: idleMeta,
        summary: "沉淀对白、旁白和字幕意图，后期再做时间轴校准。",
        inputs: [{ label: "前期文本" }],
        outputs: [{ label: "文案草稿", type: "subtitle" }],
      },
      composition: {
        title: "前期项目包",
        workflowRole: "Handoff JSON",
        status: "draft",
        runMeta: idleMeta,
        summary:
          "汇总创意、分镜、关键画面、参考素材和声音意图，整理为 startrails-project.json。",
        inputs: [
          { label: "镜头草稿" },
          { label: "关键画面" },
          { label: "声音说明" },
        ],
        outputs: [{ label: "startrails-project.json", type: "file" }],
      },
      "video-result": {
        title: "交给后期",
        workflowRole: "Post Handoff",
        status: "draft",
        runMeta: idleMeta,
        summary:
          "把前期项目包交给星轨画布（后期），继续做节奏、字幕、声音和成片精修。",
        inputs: [{ label: "前期项目包" }],
        outputs: [{ label: "后期任务", type: "video" }],
      },
    };

    return {
      title: "工作流节点",
      status: "draft",
      ...defaults[nodeKind],
      nodeKind,
      createdAt: Date.now(),
    };
  };

  const handleAddNode = useCallback(
    (
      type: "content" | "image" | "workflow" | "agent" | "sketch",
      positionOverride?: { x: number; y: number },
      nodeKind?: CanvasNodeKind,
    ) => {
      pushUndo({ nodes: nodesRef.current, edges: edgesRef.current }, "add");
      const defaultSize =
        type === "agent"
          ? NODE_DEFAULT_SIZE.agent
          : type === "workflow"
            ? NODE_DEFAULT_SIZE.workflow
            : type === "image"
              ? NODE_DEFAULT_SIZE.image
              : type === "sketch"
                ? NODE_DEFAULT_SIZE.sketch
                : NODE_DEFAULT_SIZE.content;
      const position = positionOverride || getCenteredFlowPosition(defaultSize);
      const resolvedNodeKind = nodeKind || getNodeKindFromType(type);

      const newNode: Node<CanvasNodeData> = {
        id: generateId(),
        type,
        position,
        width: defaultSize.width,
        height: defaultSize.height,
        measured: {
          width: defaultSize.width,
          height: defaultSize.height,
        },
        data:
          type === "agent"
            ? {
                title: "Director Agent",
                nodeKind: "agent" as CanvasNodeKind,
                content: "读取当前画布素材和剧本，像 TapNow / ArcReel 一样创建可编辑的视频创作流水线。",
                prompt: "请分析画布上下文，输出角色/场景/分镜/关键画面/视频/声音/项目包的下一步动作。",
                agentStatus: "idle",
                agentPhase: "orchestrator",
                runMeta: createIdleRunMeta(),
                displayWidth: defaultSize.width,
                displayHeight: defaultSize.height,
                createdAt: Date.now(),
              }
            : type === "sketch"
              ? {
                  title: "手绘分镜",
                  nodeKind: "sketch" as CanvasNodeKind,
                  summary: "用手绘快速确定构图、人物站位、镜头运动和动作节奏，可导出 PNG 作为后续 AI 生图参考。",
                  content: "手绘草图",
                  sketchStrokes: [],
                  displayWidth: defaultSize.width,
                  displayHeight: defaultSize.height,
                  createdAt: Date.now(),
                }
            : type === "workflow"
              ? getWorkflowDefaults(resolvedNodeKind)
              : type === "image"
                ? {
                    title: "Image",
                    nodeKind: "uploaded-image" as CanvasNodeKind,
                    displayWidth: defaultSize.width,
                    displayHeight: defaultSize.height,
                    createdAt: Date.now(),
                  }
                : {
                  title:
                    resolvedNodeKind === "storyboard"
                      ? "故事分镜"
                      : "写作文本",
                  prompt: "",
                  content: "",
                  nodeKind: resolvedNodeKind,
                  storyboardAssistantStage: resolvedNodeKind === "storyboard" ? "idea" : undefined,
                  autoSizeMode: resolvedNodeKind === "storyboard" ? "fixed-width-height-grows" : undefined,
                  displayWidth: defaultSize.width,
                  displayHeight: defaultSize.height,
                  createdAt: Date.now(),
                },
      };

      // 分配时间轴默认值
      const lastEndTime = Math.max(0, ...nodesRef.current.map((n) =>
        (n.data?.timelineStartTimeSeconds ?? 0) + (n.data?.timelineDurationSeconds ?? 5),
      ));
      newNode.data = {
        ...newNode.data,
        timelineStartTimeSeconds: lastEndTime,
        timelineDurationSeconds: 5,
        timelineTrackId: 0,
      };

      if (DEBUG_NODE) {
        console.debug("[DEBUG_NODE] Creating node:", newNode);
      }

      setNodes((nds) => [...nds, newNode]);
      dismissCanvasHint();
    },
    [getCenteredFlowPosition, setNodes, dismissCanvasHint],
  );

  const handleImportRemix = useCallback((payload: VideoRemixImportPayload) => {
    const { videoName, result } = payload;
    const template = result.template;
    const beats = template.structure;

    if (!beats || beats.length === 0) {
      alert("未检测到分镜结构，无法导入画布。");
      return;
    }

    const basePosition = getCenteredFlowPosition({ width: 280, height: 170 });
    const now = Date.now();

    // 为每个 beat 创建一个 ShotNode
    const shotNodes: Node<CanvasNodeData>[] = beats.map((beat, index) => ({
      id: `remix-shot-${generateId()}`,
      type: "shot",
      position: {
        x: basePosition.x + index * 320,
        y: basePosition.y,
      },
      width: 280,
      height: 170,
      measured: { width: 280, height: 170 },
      data: {
        title: `${beat.type === "hook" ? "钩子" : beat.type === "setup" ? "铺垫" : beat.type === "conflict" ? "冲突" : beat.type === "climax" ? "高潮" : beat.type === "twist" ? "反转" : beat.type === "resolution" ? "收尾" : "引导"} ${index + 1}`,
        nodeKind: "shot",
        content: `${beat.description}\n视觉: ${beat.visualNotes}\n音频: ${beat.audioNotes}`,
        prompt: beat.description,
        summary: `[${beat.timestamp}] ${beat.type}: ${beat.description}`,
        shot: {
          id: `remix-shot-data-${generateId()}`,
          order: index + 1,
          title: `${beat.type} ${index + 1}`,
          shotType: beat.visualNotes,
          description: beat.description,
          visualPrompt: beat.visualNotes,
          duration: beat.duration,
          characterIdentities: [],
          status: "draft",
        },
        displayWidth: 280,
        displayHeight: 170,
        createdAt: now,
      },
    }));

    // 创建 StoryboardGridNode 作为汇总节点
    const gridNodeId = `remix-grid-${generateId()}`;
    const gridNode: Node<CanvasNodeData> = {
      id: gridNodeId,
      type: "storyboard-grid",
      position: {
        x: basePosition.x + beats.length * 320 + 100,
        y: basePosition.y - 40,
      },
      width: 360,
      height: 250,
      measured: { width: 360, height: 250 },
      data: {
        title: `${videoName} - 拉片汇总`,
        nodeKind: "storyboard-grid",
        content: `来源: ${result.source}\n类别: ${template.category}\n总时长: ${template.totalDuration}\n钩子模式: ${template.hookPattern}\n\n关键技巧: ${template.keyTechniques.join("、")}\n\n改编建议: ${template.adaptationNotes}`,
        prompt: template.adaptationNotes,
        summary: `一键拉片: ${template.name}`,
        storyboardGrid: {
          id: gridNodeId,
          title: `${videoName} - 拉片汇总`,
          sourceStoryboardNodeId: undefined,
          shotNodeIds: shotNodes.map((n) => n.id),
          columns: 3,
          maxShots: beats.length,
          shotStates: beats.map((beat, i) => ({
            shotNodeId: shotNodes[i].id,
            order: i + 1,
            title: beat.type,
            status: "missing" as const,
          })),
          status: "draft",
        },
        displayWidth: 360,
        displayHeight: 250,
        createdAt: now,
      },
    };

    // 创建连接边
    const edges: Edge[] = [];
    for (let i = 0; i < shotNodes.length - 1; i++) {
      edges.push({
        id: `remix-edge-${i}-${i + 1}-${generateId()}`,
        source: shotNodes[i].id,
        target: shotNodes[i + 1].id,
        type: "smoothstep",
        animated: true,
        style: { stroke: DESIGN_TOKENS.nodeEdge, strokeWidth: 2 },
      });
    }
    // 连接最后一个 shot 到 grid
    if (shotNodes.length > 0) {
      edges.push({
        id: `remix-edge-grid-${generateId()}`,
        source: shotNodes[shotNodes.length - 1].id,
        target: gridNode.id,
        type: "smoothstep",
        animated: true,
        style: { stroke: DESIGN_TOKENS.nodeEdge, strokeWidth: 2 },
      });
    }

    pushUndo({ nodes: nodesRef.current, edges: edgesRef.current }, "import");
    setNodes((nds) => [...nds, ...shotNodes, gridNode]);
    setEdges((eds) => [...eds, ...edges]);
    dismissCanvasHint();
  }, [getCenteredFlowPosition, setNodes, setEdges, pushUndo, dismissCanvasHint]);

  const handleImportScript = useCallback((payload: ScriptImportPayload) => {
    const defaultSize = NODE_DEFAULT_SIZE.content;
    const basePosition = getCenteredFlowPosition(defaultSize);
    const nodeId = generateId();
    const now = Date.now();
    const scriptNode: Node<CanvasNodeData> = {
      id: nodeId,
      type: "content",
      position: basePosition,
      width: defaultSize.width,
      height: defaultSize.height,
      measured: defaultSize,
      data: {
        title: payload.title,
        nodeKind: "storyboard",
        content: payload.text,
        prompt: payload.text,
        summary: payload.source === "file"
          ? `导入剧本 · ${payload.fileName || "文本文件"}`
          : "粘贴导入剧本",
        fileName: payload.fileName,
        fileSize: payload.fileSize,
        mimeType: payload.mimeType,
        storyboardAssistantStage: "idea",
        autoSizeMode: "fixed-width-height-grows",
        displayWidth: defaultSize.width,
        displayHeight: defaultSize.height,
        source: payload.source === "file" ? "upload" : undefined,
        createdAt: now,
        projectVisualBible: {
          name: `${payload.title} 视觉风格`,
          aspectRatio: "16:9",
          stylePrompt: storyboardCompositeSettings.stylePrompt,
        },
      },
    };

    setNodes((nds) => {
      const updated = [...nds, scriptNode];
      nodesRef.current = updated;
      return updated;
    });
    setSelectedNodeId(nodeId);
    dismissCanvasHint();
    addWorkspaceHistoryEvent({
      id: generateId(),
      type: "document-uploaded",
      title: `导入剧本：${payload.title}`,
      summary: payload.splitToShots ? "已创建故事分镜源节点，并准备拆分 Shot。" : "已创建故事分镜源节点。",
      nodeId,
      createdAt: new Date().toISOString(),
    });

    window.setTimeout(() => {
      if (payload.splitToShots) {
        handleSplitStoryboardNode(nodeId, true, { processVisible: true });
      }
      if (payload.openBibleAfterImport) {
        setShowProjectBiblePanel(true);
      }
      fitViewToVisibleCanvas(650);
    }, 60);
  }, [addWorkspaceHistoryEvent, dismissCanvasHint, fitViewToVisibleCanvas, getCenteredFlowPosition, handleSplitStoryboardNode, setNodes, setSelectedNodeId, storyboardCompositeSettings.stylePrompt]);

  const handleCreateVideoWorkflow = useCallback(() => {
    const basePosition = getCenteredFlowPosition({ width: 1120, height: 540 });
    const { nodes: templateNodes, edges: templateEdges } = buildVideoWorkflowTemplate({
      basePosition,
      generateId,
      edgeStyle: { stroke: DESIGN_TOKENS.nodeEdge, strokeWidth: 2 },
    });
    const agentSize = NODE_DEFAULT_SIZE.agent;
    const agentId = generateId();
    const agentNode: Node<CanvasNodeData> = {
      id: agentId,
      type: "agent",
      position: { x: basePosition.x - agentSize.width - 120, y: basePosition.y + 20 },
      width: agentSize.width,
      height: agentSize.height,
      measured: agentSize,
      data: {
        title: "多智能体创作中控",
        nodeKind: "agent",
        content: "参考 ArcReel / FilmAgent：Director 统筹目标，Screenwriter 拆剧本，Storyboard Artist 拆镜头，Cinematographer 约束机位，Asset Router 维护角色/场景/道具一致性。",
        prompt: "读取当前画布和素材，编排角色、场景、分镜、关键画面、图生视频、声音字幕和项目包交付。",
        agentStatus: "idle",
        agentPhase: "orchestrator",
        runMeta: createIdleRunMeta(),
        displayWidth: agentSize.width,
        displayHeight: agentSize.height,
        createdAt: Date.now(),
      },
    };
    const orchestrationEdge: Edge = {
      id: generateId(),
      source: agentId,
      target: templateNodes[0]?.id,
      type: "creative",
      animated: true,
      style: { stroke: DESIGN_TOKENS.nodeEdge, strokeWidth: 2 },
      data: { relation: "agent-orchestrates-template" },
    };
    const newNodes = [agentNode, ...templateNodes];
    const newEdges = templateNodes[0] ? [orchestrationEdge, ...templateEdges] : templateEdges;

    setNodes((nds) => {
      const nextNodes = [...nds, ...newNodes];
      nodesRef.current = nextNodes;
      return nextNodes;
    });
    setEdges((eds) => {
      const nextEdges = [...eds, ...newEdges];
      edgesRef.current = nextEdges;
      return nextEdges;
    });
    dismissCanvasHint();
    setChatOpen(true);
    setTimeout(() => fitViewToVisibleCanvas(650), 80);
  }, [
    getCenteredFlowPosition,
    setNodes,
    setEdges,
    dismissCanvasHint,
    fitViewToVisibleCanvas,
  ]);

  const getNodeKindFromType = (type?: string): CanvasNodeKind => {
    if (type === "agent") return "agent";
    if (type === "image") return "uploaded-image";
    if (type === "sketch") return "sketch";
    if (type === "content") return "prompt";
    return "script";
  };

  // ========================================================================
  // NODE OPERATIONS
  // ========================================================================
  const deleteNode = useCallback(
    (nodeId: string) => {
      pushUndo({ nodes: nodesRef.current, edges: edgesRef.current }, "delete");
      setNodes((nds) => {
        const nextNodes = nds.filter((n) => n.id !== nodeId);
        nodesRef.current = nextNodes;
        return nextNodes;
      });
      setEdges((eds) => {
        const nextEdges = eds.filter(
          (e) => e.source !== nodeId && e.target !== nodeId,
        );
        edgesRef.current = nextEdges;
        return nextEdges;
      });
      setSelectedNodeId(null);
    },
    [setNodes, setEdges, setSelectedNodeId],
  );

  const deleteSelectedElements = useCallback(() => {
    pushUndo({ nodes: nodesRef.current, edges: edgesRef.current }, "delete");
    const selectedNodeIds = new Set(
      nodesRef.current.filter((node) => node.selected).map((node) => node.id),
    );
    const selectedEdgeIds = new Set(
      edgesRef.current.filter((edge) => edge.selected).map((edge) => edge.id),
    );

    if (
      selectedNodeIds.size === 0 &&
      selectedEdgeIds.size === 0 &&
      selectedNodeId
    ) {
      selectedNodeIds.add(selectedNodeId);
    }

    if (selectedNodeIds.size === 0 && selectedEdgeIds.size === 0) return;

    setNodes((nds) => {
      const nextNodes = nds.filter((node) => !selectedNodeIds.has(node.id));
      nodesRef.current = nextNodes;
      return nextNodes;
    });
    setEdges((eds) => {
      const nextEdges = eds.filter(
        (edge) =>
          !selectedEdgeIds.has(edge.id) &&
          !selectedNodeIds.has(edge.source) &&
          !selectedNodeIds.has(edge.target),
      );
      edgesRef.current = nextEdges;
      return nextEdges;
    });
    setSelectedNodeId(null);
  }, [selectedNodeId, setNodes, setEdges, setSelectedNodeId]);

  const deleteEdge = useCallback(
    (edgeId: string) => {
      pushUndo({ nodes: nodesRef.current, edges: edgesRef.current }, "delete");
      setEdges((eds) => eds.filter((e) => e.id !== edgeId));
    },
    [setEdges],
  );

  const duplicateNode = useCallback(
    (nodeId: string) => {
      pushUndo({ nodes: nodesRef.current, edges: edgesRef.current }, "duplicate");
      const node = nodesRef.current.find((n) => n.id === nodeId);
      if (!node) return;

      const newNode: Node<CanvasNodeData> = {
        ...node,
        id: generateId(),
        position: {
          x: node.position.x + 50,
          y: node.position.y + 50,
        },
        selected: false,
      };

      setNodes((nds) => [...nds, newNode]);
    },
    [nodes, setNodes],
  );

  const copyNode = useCallback(
    (nodeId: string) => {
      const node = nodesRef.current.find((n) => n.id === nodeId);
      if (!node) return;
      setClipboardNode(node);
    },
    [nodes, setClipboardNode],
  );

  const cutNode = useCallback(
    (nodeId: string) => {
      const node = nodesRef.current.find((n) => n.id === nodeId);
      if (!node) return;
      setClipboardNode(node);
      deleteNode(nodeId);
    },
    [nodes, setClipboardNode, deleteNode],
  );

  const pasteNode = useCallback(() => {
    if (!clipboardNode || !reactFlowInstance) return;

    pushUndo({ nodes: nodesRef.current, edges: edgesRef.current }, "paste");

    const position = reactFlowInstance.screenToFlowPosition({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    });

    const newNode: Node<CanvasNodeData> = {
      ...clipboardNode,
      id: generateId(),
      position: {
        x: position.x + Math.random() * 40 - 20,
        y: position.y + Math.random() * 40 - 20,
      },
      selected: false,
    };

    setNodes((nds) => [...nds, newNode]);
    setClipboardNode(null);
  }, [clipboardNode, reactFlowInstance, setNodes, setClipboardNode]);

  // ========================================================================
  // APPLY CHAT ACTIONS - AI 画布操作执行器（返回结构化报告）
  // ========================================================================
  const applyChatActions = useCallback(
    (actions: ChatCanvasAction[]): ApplyActionsReport => {
      const results: ApplyActionResult[] = [];
      const aliasMap: Record<string, string> = {};

      for (let i = 0; i < actions.length; i++) {
        const act = actions[i];

        if (DEBUG_NODE) {
          console.debug("[DEBUG_NODE] Applying chat action:", act);
        }

        try {
          switch (act.action) {
            case "create_node": {
              const requestedType = act.nodeType ?? "content";
              const type = (requestedType === "agent" ? "agent" : requestedType) as "content" | "image" | "workflow" | "agent";
              const kind = (act.nodeKind ??
                (type === "agent"
                  ? "agent"
                  : type === "workflow"
                    ? "script"
                    : type === "image"
                      ? "uploaded-image"
                      : "text")) as CanvasNodeKind;
              const defaultSize =
                type === "agent"
                  ? NODE_DEFAULT_SIZE.agent
                  : type === "workflow"
                    ? NODE_DEFAULT_SIZE.workflow
                    : type === "image"
                      ? NODE_DEFAULT_SIZE.image
                      : NODE_DEFAULT_SIZE.content;
              const position =
                act.position ?? getCenteredFlowPosition(defaultSize);
              const nodeId = generateId();
              const newNode: Node<CanvasNodeData> = {
                id: nodeId,
                type,
                position,
                width: defaultSize.width,
                height: defaultSize.height,
                measured: {
                  width: defaultSize.width,
                  height: defaultSize.height,
                },
                data:
                  type === "agent"
                    ? {
                        title: act.title ?? "Director Agent",
                        nodeKind: "agent",
                        content: act.content ?? act.prompt ?? "",
                        prompt: act.prompt ?? act.content ?? "",
                        agentStatus: "idle",
                        agentPhase: "planning",
                        runMeta: createIdleRunMeta(),
                        displayWidth: defaultSize.width,
                        displayHeight: defaultSize.height,
                        createdAt: Date.now(),
                        ...(act.data ?? {}),
                      }
                    : type === "workflow"
                      ? {
                          ...getWorkflowDefaults(kind),
                          ...(act.title ? { title: act.title } : {}),
                          ...(act.prompt ? { prompt: act.prompt } : {}),
                          ...(act.data ?? {}),
                        }
                      : type === "image"
                        ? {
                            title: act.title ?? "Image",
                            nodeKind: kind,
                            displayWidth: defaultSize.width,
                            displayHeight: defaultSize.height,
                            createdAt: Date.now(),
                            ...(act.data ?? {}),
                          }
                        : {
                          title:
                            act.title ??
                            (kind === "storyboard"
                              ? "AI 文字分镜"
                              : kind === "text"
                                ? "创意文本"
                                : "写作文本"),
                          prompt: act.prompt ?? "",
                          content: act.content ?? "",
                          nodeKind: kind,
                          displayWidth: defaultSize.width,
                          displayHeight: defaultSize.height,
                          createdAt: Date.now(),
                          ...(act.data ?? {}),
                        },
              };
              setNodes((nds) => [...nds, newNode]);
              dismissCanvasHint();
              if (act.title) aliasMap[act.title] = nodeId;
              results.push({
                index: i,
                action: "create_node",
                status: "applied",
                nodeId,
                reason: act.description,
              });
              break;
            }

            case "update_node": {
              if (!act.nodeId) {
                results.push({
                  index: i,
                  action: "update_node",
                  status: "skipped",
                  reason: "缺少 nodeId",
                });
                break;
              }
              const found = nodesRef.current.find((n) => n.id === act.nodeId);
              if (!found) {
                results.push({
                  index: i,
                  action: "update_node",
                  status: "skipped",
                  reason: `节点 ${act.nodeId} 不存在`,
                });
                break;
              }
              setNodes((nds) =>
                nds.map((n) =>
                  n.id === act.nodeId
                    ? { ...n, data: { ...n.data, ...(act.updates ?? {}) } }
                    : n,
                ),
              );
              results.push({
                index: i,
                action: "update_node",
                status: "applied",
                nodeId: act.nodeId,
                reason: act.description,
              });
              break;
            }

            case "connect_nodes": {
              if (!act.sourceId || !act.targetId) {
                results.push({
                  index: i,
                  action: "connect_nodes",
                  status: "skipped",
                  reason: "缺少 sourceId 或 targetId",
                });
                break;
              }
              const src = nodesRef.current.find((n) => n.id === act.sourceId);
              const tgt = nodesRef.current.find((n) => n.id === act.targetId);
              if (!src || !tgt) {
                results.push({
                  index: i,
                  action: "connect_nodes",
                  status: "skipped",
                  reason: `${!src ? "源节点" : "目标节点"}不存在`,
                });
                break;
              }
              const edgeId = generateId();
              setEdges((eds) => [
                ...eds,
                {
                  id: edgeId,
                  source: act.sourceId!,
                  target: act.targetId!,
                  type: "creative",
                  animated: false,
                  style: { stroke: DESIGN_TOKENS.nodeEdge, strokeWidth: 2 },
                },
              ]);
              results.push({
                index: i,
                action: "connect_nodes",
                status: "applied",
                edgeId,
                reason: act.description,
              });
              break;
            }

            case "delete_node": {
              const did = act.nodeId ?? act.id;
              if (!did) {
                results.push({
                  index: i,
                  action: "delete_node",
                  status: "skipped",
                  reason: "缺少 nodeId",
                });
                break;
              }
              const exists = nodesRef.current.find((n) => n.id === did);
              if (!exists) {
                results.push({
                  index: i,
                  action: "delete_node",
                  status: "skipped",
                  reason: `节点 ${did} 不存在`,
                });
                break;
              }
              setNodes((nds) => {
                const nextNodes = nds.filter((n) => n.id !== did);
                nodesRef.current = nextNodes;
                return nextNodes;
              });
              setEdges((eds) => {
                const nextEdges = eds.filter(
                  (e) => e.source !== did && e.target !== did,
                );
                edgesRef.current = nextEdges;
                return nextEdges;
              });
              if (selectedNodeId === did) setSelectedNodeId(null);
              results.push({
                index: i,
                action: "delete_node",
                status: "applied",
                nodeId: did,
                reason: act.description,
              });
              break;
            }

            case "select_node": {
              const sid = act.nodeId ?? act.id;
              if (sid) setSelectedNodeId(sid);
              results.push({
                index: i,
                action: "select_node",
                status: "applied",
                nodeId: sid,
                reason: act.description,
              });
              break;
            }

            case "focus_node": {
              const fid = act.nodeId ?? act.id;
              if (!fid) {
                results.push({
                  index: i,
                  action: "focus_node",
                  status: "skipped",
                  reason: "缺少 nodeId",
                });
                break;
              }
              const target = nodesRef.current.find((n) => n.id === fid);
              if (!target || !reactFlowInstance) {
                results.push({
                  index: i,
                  action: "focus_node",
                  status: "skipped",
                  reason: target ? "画布未就绪" : `节点 ${fid} 不存在`,
                });
                break;
              }
              reactFlowInstance.setCenter(
                target.position.x + (target.measured?.width ?? 280) / 2,
                target.position.y + (target.measured?.height ?? 200) / 2,
                { duration: 600, zoom: 1.1 },
              );
              setSelectedNodeId(fid);
              results.push({
                index: i,
                action: "focus_node",
                status: "applied",
                nodeId: fid,
                reason: act.description,
              });
              break;
            }

            case "create_workflow_template": {
              const basePosition = act.template === "arc_reel_agent"
                ? getCenteredFlowPosition({ width: 1460, height: 660 })
                : getCenteredFlowPosition({ width: 1120, height: 540 });
              const { nodes: templateNodes, edges: templateEdges } = buildVideoWorkflowTemplate({
                basePosition,
                generateId,
                edgeStyle: { stroke: DESIGN_TOKENS.nodeEdge, strokeWidth: 2 },
              });

              let nextNodesToAdd = templateNodes;
              let nextEdgesToAdd = templateEdges;

              if (act.template === "arc_reel_agent") {
                const agentId = generateId();
                const agentSize = NODE_DEFAULT_SIZE.agent;
                const agentNode: Node<CanvasNodeData> = {
                  id: agentId,
                  type: "agent",
                  position: { x: basePosition.x - agentSize.width - 120, y: basePosition.y + 20 },
                  width: agentSize.width,
                  height: agentSize.height,
                  measured: agentSize,
                  data: {
                    title: act.title ?? "ArcReel 式多智能体中控",
                    nodeKind: "agent",
                    content: "从小说/剧本出发，按 Director、Screenwriter、Storyboard Artist、Cinematographer、Asset Router 分工：先抽取角色/场景/线索，再生成分镜、关键画面、视频片段、旁白字幕与交付包。",
                    prompt: "读取当前画布素材与剧本，生成 ArcReel 式视频创作流水线：角色一致性、场景/道具线索、分镜宫格、图生视频、声音字幕、项目包交付。",
                    agentStatus: "idle",
                    agentPhase: "orchestrator",
                    runMeta: createIdleRunMeta(),
                    displayWidth: agentSize.width,
                    displayHeight: agentSize.height,
                    createdAt: Date.now(),
                  },
                };
                nextNodesToAdd = [agentNode, ...templateNodes];
                const firstTemplateNodeId = templateNodes[0]?.id;
                nextEdgesToAdd = firstTemplateNodeId
                  ? [{
                      id: generateId(),
                      source: agentId,
                      target: firstTemplateNodeId,
                      type: "creative",
                      animated: true,
                      style: { stroke: DESIGN_TOKENS.nodeEdge, strokeWidth: 2 },
                      data: { relation: "agent-orchestrates-template" },
                    } as Edge, ...templateEdges]
                  : templateEdges;
              }

              setNodes((nds) => {
                const nextNodes = [...nds, ...nextNodesToAdd];
                nodesRef.current = nextNodes;
                return nextNodes;
              });
              setEdges((eds) => {
                const nextEdges = [...eds, ...nextEdgesToAdd];
                edgesRef.current = nextEdges;
                return nextEdges;
              });
              dismissCanvasHint();
              setChatOpen(true);
              setTimeout(() => fitViewToVisibleCanvas(650), 80);
              results.push({
                index: i,
                action: "create_workflow_template",
                status: "applied",
                nodeId: nextNodesToAdd[0]?.id,
                reason: act.description ?? "已创建视频创作工作流模板",
              });
              break;
            }

            case "open_panel": {
              switch (act.panel) {
                case "chat":
                  setChatOpen(true);
                  break;
                case "add_node":
                  setShowAddNodePanel(true);
                  break;
                case "asset_library":
                  openAssetLibrary();
                  break;
                case "project_bible":
                  setShowProjectBiblePanel(true);
                  break;
                case "character_bible":
                  setShowCharacterBiblePanel(true);
                  break;
                case "scene_bible":
                  setShowSceneBiblePanel(true);
                  break;
                case "style_bible":
                  setShowStyleBiblePanel(true);
                  break;
                case "run_queue":
                  setShowRunPanel(true);
                  break;
                case "property":
                  setShowPropertyPanel(true);
                  break;
                default:
                  results.push({ index: i, action: "open_panel", status: "skipped", reason: "未知面板" });
                  break;
              }
              if (results[results.length - 1]?.index !== i) {
                results.push({ index: i, action: "open_panel", status: "applied", reason: act.description ?? `已打开 ${act.panel} 面板` });
              }
              break;
            }

            case "generate_storyboard": {
              const shots = Array.isArray(act.shots) ? act.shots.slice(0, 12) : [];
              if (shots.length === 0) {
                results.push({ index: i, action: "generate_storyboard", status: "skipped", reason: "缺少 shots" });
                break;
              }
              const sourceNode = act.sourceNodeId ? nodesRef.current.find((n) => n.id === act.sourceNodeId) : undefined;
              const base = sourceNode?.position ?? getCenteredFlowPosition({ width: 1040, height: 460 });
              const shotNodes: Node<CanvasNodeData>[] = shots.map((shot, shotIndex) => {
                const shotId = generateId();
                return {
                  id: shotId,
                  type: "shot",
                  position: { x: base.x + shotIndex * 320, y: base.y + (sourceNode ? 260 : 0) },
                  width: NODE_DEFAULT_SIZE.workflow.width,
                  height: NODE_DEFAULT_SIZE.workflow.height,
                  measured: NODE_DEFAULT_SIZE.workflow,
                  data: {
                    title: shot.title ?? `镜头 ${shotIndex + 1}`,
                    nodeKind: "shot",
                    content: shot.content ?? shot.prompt ?? "",
                    prompt: shot.prompt ?? shot.content ?? "",
                    summary: shot.content ?? shot.prompt ?? "AI Agent 生成的分镜镜头。",
                    shot: {
                      id: shotId,
                      order: shotIndex + 1,
                      title: shot.title ?? `镜头 ${shotIndex + 1}`,
                      shotType: shot.shotType,
                      cameraMovement: shot.cameraMovement,
                      duration: shot.duration,
                      description: shot.content ?? shot.prompt ?? "",
                      visualPrompt: shot.prompt ?? shot.content ?? "",
                      sourceStoryboardNodeId: sourceNode?.id,
                      generationStatus: "idle",
                    },
                    runMeta: createIdleRunMeta(),
                    createdAt: Date.now(),
                  },
                };
              });
              const storyboardEdges: Edge[] = shotNodes.slice(1).map((node, shotIndex) => ({
                id: generateId(),
                source: shotNodes[shotIndex].id,
                target: node.id,
                type: "creative",
                animated: true,
                style: { stroke: DESIGN_TOKENS.nodeEdge, strokeWidth: 1.5 },
                data: { relation: "storyboard-sequence" },
              }));
              if (sourceNode && shotNodes[0]) {
                storyboardEdges.unshift({
                  id: generateId(),
                  source: sourceNode.id,
                  target: shotNodes[0].id,
                  type: "creative",
                  animated: true,
                  style: { stroke: DESIGN_TOKENS.nodeEdge, strokeWidth: 1.5 },
                  data: { relation: "source-to-storyboard" },
                } as Edge);
              }
              setNodes((nds) => {
                const nextNodes = [...nds, ...shotNodes];
                nodesRef.current = nextNodes;
                return nextNodes;
              });
              setEdges((eds) => {
                const nextEdges = [...eds, ...storyboardEdges];
                edgesRef.current = nextEdges;
                return nextEdges;
              });
              dismissCanvasHint();
              setSelectedNodeId(shotNodes[0]?.id ?? null);
              setTimeout(() => fitViewToVisibleCanvas(650), 80);
              results.push({
                index: i,
                action: "generate_storyboard",
                status: "applied",
                nodeId: shotNodes[0]?.id,
                reason: act.description ?? `已生成 ${shotNodes.length} 个分镜镜头`,
              });
              break;
            }

            case "layout_canvas": {
              setNodes((nds) => {
                const columns = act.layout === "vertical" ? 1 : act.layout === "grid" ? 3 : Math.max(3, Math.ceil(Math.sqrt(nds.length || 1)));
                const layoutedNodes = quickLayout(nds, edgesRef.current, columns);
                nodesRef.current = layoutedNodes;
                return layoutedNodes;
              });
              setTimeout(() => fitViewToVisibleCanvas(650), 40);
              results.push({
                index: i,
                action: "layout_canvas",
                status: "applied",
                reason: act.description ?? "已整理画布布局",
              });
              break;
            }

            case "run_node": {
              const rid = act.nodeId ?? act.id;
              if (!rid) {
                results.push({
                  index: i,
                  action: "run_node",
                  status: "skipped",
                  reason: "缺少 nodeId",
                });
                break;
              }
              const runTarget = nodesRef.current.find((n) => n.id === rid);
              if (!runTarget) {
                results.push({
                  index: i,
                  action: "run_node",
                  status: "skipped",
                  reason: `节点 ${rid} 不存在`,
                });
                break;
              }
              // Safety: only auto-run if user explicitly allowed it
              if (!allowAIAutoRun) {
                // Mark node as pending confirmation via runMeta
                setNodes((nds) =>
                  nds.map((n) =>
                    n.id === rid
                      ? {
                          ...n,
                          data: {
                            ...n.data,
                            runMeta: createPendingRunMeta({
                              reason: "AI 请求运行此节点，需用户确认。",
                              source: "ai",
                            }),
                            pendingExecution: true, // 兼容旧字段
                          },
                        }
                      : n,
                  ),
                );
                setSelectedNodeId(rid);
                results.push({
                  index: i,
                  action: "run_node",
                  status: "pending_confirmation",
                  nodeId: rid,
                  reason: "AI 建议运行此节点，需用户确认",
                });
                break;
              }
              setSelectedNodeId(rid);
              setTimeout(() => {
                workflowRunner.runNode(rid);
              }, 150);
              results.push({
                index: i,
                action: "run_node",
                status: "applied",
                nodeId: rid,
                reason: act.description,
              });
              break;
            }

            default:
              results.push({
                index: i,
                action: (act as any).action ?? "unknown",
                status: "skipped",
                reason: "未知 action 类型",
              });
              console.warn("[applyChatActions] Unknown action:", act);
          }
        } catch (err: any) {
          results.push({
            index: i,
            action: act.action,
            status: "failed",
            error: err?.message ?? String(err),
            reason: `执行异常: ${err?.message ?? String(err)}`,
          });
        }
      }

      const report: ApplyActionsReport = {
        total: actions.length,
        applied: results.filter((r) => r.status === "applied").length,
        skipped: results.filter((r) => r.status === "skipped").length,
        failed: results.filter((r) => r.status === "failed").length,
        pendingConfirmation: results.filter(
          (r) => r.status === "pending_confirmation",
        ).length,
        results,
        aliasMap,
      };

      return report;
    },
    [
      getCenteredFlowPosition,
      setNodes,
      setEdges,
      setSelectedNodeId,
      reactFlowInstance,
      dismissCanvasHint,
      selectedNodeId,
      allowAIAutoRun,
      fitViewToVisibleCanvas,
      openAssetLibrary,
      workflowRunner,
    ],
  );

  // ========================================================================
  // ADD IMAGE FROM CHAT ATTACHMENT
  // ========================================================================
  const handleAddImageFromChat = useCallback(
    (attachment: ChatAttachment) => {
      const isImage = attachment.type === "image";
      const isAiGenerated = !attachment.file; // AI-generated images don't have a File object
      const nodeKind = isAiGenerated
        ? "ai-generated-image"
        : attachment.type === "video"
          ? "uploaded-video"
          : attachment.type === "audio"
            ? "uploaded-audio"
            : attachment.type === "file"
              ? "uploaded-file"
              : "uploaded-image";

      let width = attachment.width || 200;
      let height = attachment.height || 150;

      if (isImage) {
        const maxWidth = IMAGE_NODE_SIZE.maxWidth;
        const maxHeight = IMAGE_NODE_SIZE.maxHeight;

        if (width > maxWidth) {
          const ratio = maxWidth / width;
          width = maxWidth;
          height = height * ratio;
        }
        if (height > maxHeight) {
          const ratio = maxHeight / height;
          height = maxHeight;
          width = width * ratio;
        }

        width = Math.max(width, IMAGE_NODE_SIZE.minWidth);
        height = Math.max(height, IMAGE_NODE_SIZE.minHeight);
      }

      const position = getCenteredFlowPosition(
        isImage
          ? { width, height: height + IMAGE_NODE_TITLE_HEIGHT }
          : NODE_DEFAULT_SIZE.workflow,
      );

      // For images with a File object, persist to IndexedDB
      const assetIdPromise =
        isImage && attachment.file
          ? persistImageFile(attachment.file, {
              width: attachment.width,
              height: attachment.height,
            })
              .then((r) => r.assetId)
              .catch(() => undefined)
          : isAiGenerated && attachment.src?.startsWith("data:image")
            ? persistImageDataUrl(attachment.src, { fileName: attachment.name })
                .then((r) => r.assetId)
                .catch(() => undefined)
            : Promise.resolve(undefined);

      assetIdPromise.then((assetId) => {
        const newNode: Node<CanvasNodeData> = isImage
          ? {
              id: generateId(),
              type: "image",
              position,
              data: {
                title: attachment.name,
                imageUrl: attachment.src,
                assetId,
                fileName: attachment.name,
                fileSize: attachment.size,
                mimeType: attachment.mimeType,
                imageWidth: attachment.width,
                imageHeight: attachment.height,
                displayWidth: width,
                displayHeight: height,
                aspectRatio: (attachment.width || 1) / (attachment.height || 1),
                nodeKind,
                source: isAiGenerated ? "generated" : "upload",
                persistence: assetId ? "indexeddb" : undefined,
                createdAt: Date.now(),
              },
              measured: {
                width,
                height: height + IMAGE_NODE_TITLE_HEIGHT,
              },
            }
          : {
              id: generateId(),
              type: "workflow",
              position,
              data: {
                title: attachment.name,
                nodeKind,
                workflowRole:
                  attachment.type === "video"
                    ? "Video Asset"
                    : attachment.type === "audio"
                      ? "Audio Asset"
                      : "File Asset",
                status: "ready",
                summary:
                  "来自 Chat 附件，可连接到视频生成、音频、字幕或合成节点。",
                fileName: attachment.name,
                fileSize: attachment.size,
                mimeType: attachment.mimeType,
                assetUrl: attachment.src,
                outputs: [
                  {
                    label:
                      attachment.type === "video"
                        ? "视频素材"
                        : attachment.type === "audio"
                          ? "音频素材"
                          : "文件素材",
                    type: attachment.type,
                  },
                ],
                createdAt: Date.now(),
              },
            };

        setNodes((nds) => [...nds, newNode]);
        dismissCanvasHint();

        if (DEBUG_NODE) {
          console.debug("[DEBUG_NODE] Added attachment from chat:", newNode.id);
        }
      }); // end assetIdPromise.then
    },
    [getCenteredFlowPosition, setNodes, dismissCanvasHint],
  );

  // ========================================================================
  // SAVE TO ASSET LIBRARY
  // ========================================================================
  const handleSaveToAssetLibrary = useCallback(
    (nodeId: string) => {
      const node = nodesRef.current.find((n) => n.id === nodeId);
      if (!node) return;

      // Don't persist runtime-only URLs to localStorage, except sketchImageDataUrl:
      // sketches are intentionally used as lightweight image-to-image references.
      let src = node.data.sketchImageDataUrl || node.data.imageUrl || node.data.assetUrl;
      if (src && !node.data.sketchImageDataUrl && (src.startsWith("blob:") || src.startsWith("data:"))) {
        src = undefined;
      }

      const asset: AssetItem = {
        id: `asset_${generateId()}`,
        type: "image",
        name: node.data.fileName || node.data.title || "Untitled",
        src,
        folder: "Others",
        createdAt: Date.now(),
        metadata: {
          assetId: node.data.assetId,
          persistence: node.data.persistence,
          source: node.data.source,
        },
      };

      addAsset(asset);
    },
    [nodes, addAsset],
  );

  // ========================================================================
  // SHOT REGENERATE — 重绘本镜头
  // ========================================================================
  const handleRegenerateShot = useCallback(
    async (nodeId: string) => {
      const node = nodes.find((n) => n.id === nodeId);
      if (!node) return;
      const data = node.data as Record<string, unknown>;
      const prompt = (data.prompt as string) || (data.content as string) || "";
      if (!prompt) return;

      try {
        const res = await fetch("/api/ai/generate-image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt, size: "1024x1024" }),
        });

        if (!res.ok) throw new Error(`API error: ${res.status}`);
        const result = await res.json();
        const imageUrl = result.imageUrl || result.data?.[0]?.b64_json;

        if (imageUrl) {
          setNodes((nds) =>
            nds.map((n) =>
              n.id === nodeId
                ? {
                    ...n,
                    data: {
                      ...n.data,
                      imageUrl: imageUrl.startsWith("data:")
                        ? imageUrl
                        : `data:image/png;base64,${imageUrl}`,
                      regeneratedAt: Date.now(),
                    },
                  }
                : n,
            ),
          );
        }
      } catch (err) {
        console.error("[RegenerateShot] Failed:", err);
      }
    },
    [nodes, setNodes],
  );

  // ========================================================================
  // AI VARIANT FOR IMAGE / SKETCH NODE
  // ========================================================================
  const handleAIVariant = useCallback(
    async (nodeId: string) => {
      const node = nodesRef.current.find((n) => n.id === nodeId);
      if (!node) return;

      const title = node.data.title || node.data.fileName || "图片";
      const isSketchNode = node.data.nodeKind === "sketch" || node.type === "sketch";
      const promptText = isSketchNode
        ? `Use this storyboard sketch as composition and blocking reference. Turn it into a polished cinematic key frame while preserving the main layout, camera angle, character positions, action direction, and framing: ${title}`
        : `Generate a variation of this image: ${title}`;
      const model = await getDefaultImageModel() || "gpt-image-2";
      const size = "1792x1024";
      const requestId = crypto.randomUUID();
      const capability = getImageProviderCapability(model);

      try {
        assertImageToImageSupported(capability);
        let sourceImage: string;
        let sourceAssetId: string | undefined;
        let referenceImage: Record<string, unknown>;

        if (node.data.sketchImageDataUrl) {
          sourceImage = node.data.sketchImageDataUrl;
          referenceImage = {
            sourceNodeId: nodeId,
            sourceType: "sketch",
            mimeType: "image/png",
            strokeCount: node.data.sketchStrokes?.length ?? 0,
          };
        } else {
          if (!node.data.assetId) {
            throw new Error(
              isSketchNode
                ? "当前手绘节点还没有可用草图，请先绘制草图后再生成参考图。"
                : "当前图片没有可用的本地资源，请重新上传后再生成变体。",
            );
          }

          const asset = await getLocalImageAsset(node.data.assetId);
          if (!asset?.blob) {
            throw new Error("参考图资源不存在，请重新上传图片。");
          }

          const prepared = await prepareReferenceImageForGeneration(asset.blob, {
            maxBytes: capability.maxInputImageBytes,
            maxSide: capability.maxInputImageSide,
            mimeType: capability.acceptedInputMimeTypes.includes("image/jpeg")
              ? "image/jpeg"
              : "image/webp",
          });
          sourceImage = prepared.dataUrl;
          sourceAssetId = node.data.assetId;
          referenceImage = {
            assetId: node.data.assetId,
            sourceNodeId: nodeId,
            sourceType: "asset",
            mimeType: prepared.mimeType,
            width: prepared.width,
            height: prepared.height,
            originalByteSize: prepared.originalByteSize,
            sentByteSize: prepared.byteSize,
            compressed: prepared.compressed,
          };
        }

        const generation = createImageGenerationSnapshot({
          requestId,
          mode: "image-to-image",
          userPrompt: promptText,
          model,
          size,
          sourceNodeId: nodeId,
          sourceAssetId,
          referenceImage,
        });

        setNodes((nds) =>
          nds.map((item) =>
            item.id === nodeId
              ? { ...item, data: { ...item.data, generation } }
              : item,
          ),
        );

        const res = await fetch("/api/ai/generate-image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: promptText,
            model,
            size,
            requestId,
            sourceImage,
          }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          const normalized =
            errData.error && typeof errData.error === "object"
              ? errData.error
              : normalizeGenerationError({
                  status: res.status,
                  body: errData,
                  provider: capability.provider,
                });
          throw Object.assign(
            new Error(formatGenerationErrorForDisplay(normalized)),
            { generationError: normalized },
          );
        }

        const result = await res.json();
        if (!result.imageUrl) throw new Error("No image data returned");

        // Persist AI-generated image to IndexedDB
        let displayUrl = result.imageUrl;
        let assetId: string | undefined;

        if (result.imageUrl.startsWith("data:image")) {
          const persisted = await persistImageDataUrl(result.imageUrl, {
            fileName: `variant-${Date.now()}.png`,
          });
          displayUrl = persisted.objectUrl;
          assetId = persisted.assetId;
        }

        const newNode = {
          id: generateId(),
          type: "image" as const,
          position: { x: node.position.x + 320, y: node.position.y + 20 },
          data: {
            title: `变体: ${title}`,
            imageUrl: displayUrl,
            assetId,
            nodeKind: "ai-generated-image" as const,
            prompt: promptText,
            summary: result.prompt,
            generation: {
              ...generation,
              enhancedPrompt: result.prompt,
              model: result.model || model,
              status: "succeeded" as const,
              completedAt: new Date().toISOString(),
              endpoint: result.endpoint,
              referenceFormat: result.referenceFormat,
            },
            generationOutput: {
              prompt: promptText,
              finalPrompt: result.prompt,
              revisedPrompt: result.revisedPrompt,
              model: result.model || model,
              size,
              sourceImageAssetId: sourceAssetId,
              referenceImage,
              requestId,
              endpoint: result.endpoint,
              referenceFormat: result.referenceFormat,
            },
            sourcePromptId: nodeId,
            source: "generated" as const,
            persistence: assetId ? ("indexeddb" as const) : undefined,
            displayWidth: node.data.displayWidth || 280,
            displayHeight: node.data.displayHeight || 200,
            createdAt: Date.now(),
          },
        };

        setNodes((nds) => [...nds, newNode]);
        setEdges((eds) => [
          ...eds,
          {
            id: `edge-${nodeId}-${newNode.id}`,
            source: nodeId,
            target: newNode.id,
            type: "creative",
            animated: true,
            style: { stroke: DESIGN_TOKENS.nodeEdge, strokeWidth: 2 },
          },
        ]);

        setNodes((nds) =>
          nds.map((item) =>
            item.id === nodeId && item.data.generation?.requestId === requestId
              ? {
                  ...item,
                  data: {
                    ...item.data,
                    generation: {
                      ...item.data.generation,
                      enhancedPrompt: result.prompt,
                      status: "succeeded" as const,
                      completedAt: new Date().toISOString(),
                      endpoint: result.endpoint,
                      referenceFormat: result.referenceFormat,
                    },
                  },
                }
              : item,
          ),
        );
      } catch (err) {
        const normalized =
          (err as any)?.generationError ||
          normalizeGenerationError({
            error: err,
            provider: capability.provider,
          });
        console.debug("[StarCanvas] AI variant failed raw:", normalized.raw);
        setNodes((nds) =>
          nds.map((item) => {
            if (item.id !== nodeId) return item;
            const generation = item.data.generation;
            return {
              ...item,
              data: {
                ...item.data,
                generation: generation
                  ? {
                      ...generation,
                      status: "failed" as const,
                      error: {
                        code: normalized.code,
                        status: normalized.status,
                        provider: normalized.provider,
                        userMessage: normalized.userMessage,
                        detail: normalized.detail,
                        retryable: normalized.retryable,
                      },
                      completedAt: new Date().toISOString(),
                    }
                  : generation,
                errorMessage: formatGenerationErrorForDisplay(normalized),
              },
            };
          }),
        );
      }
    },
    [setNodes, setEdges],
  );

  // ========================================================================
  // KEYBOARD SHORTCUTS
  // ========================================================================
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      )
        return;

      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        deleteSelectedElements();
      }

      if ((e.metaKey || e.ctrlKey) && e.key === "c" && selectedNodeId) {
        copyNode(selectedNodeId);
      }

      if ((e.metaKey || e.ctrlKey) && e.key === "x" && selectedNodeId) {
        cutNode(selectedNodeId);
      }

      if ((e.metaKey || e.ctrlKey) && e.key === "v") {
        pasteNode();
      }

      if ((e.metaKey || e.ctrlKey) && e.key === "d" && selectedNodeId) {
        e.preventDefault();
        duplicateNode(selectedNodeId);
      }

      if ((e.metaKey || e.ctrlKey) && e.key === "r" && selectedNodeId) {
        e.preventDefault();
        const plan = buildExecutionPlan({
          mode: "single",
          rootNodeIds: [selectedNodeId],
          nodes: nodesRef.current,
          edges,
          canvasId: "current",
        });
        workflowRunner.runExecutionPlan(plan);
      }

      // Ctrl+Shift+P: open Prompt Preview for selected node
      if (
        (e.metaKey || e.ctrlKey) &&
        e.shiftKey &&
        e.key === "p" &&
        selectedNodeId
      ) {
        e.preventDefault();
        useCanvasStore.getState().openPromptPreview(selectedNodeId);
      }

      // Ctrl+Z: undo
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key === "z") {
        e.preventDefault();
        tryUndo();
      }

      // Ctrl+Shift+Z or Ctrl+Y: redo
      if (
        ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "z") ||
        ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key === "y")
      ) {
        e.preventDefault();
        tryRedo();
      }

      if (e.key === "Escape") {
        closeContextMenu();
        closeFloatingToolbar();
        setSelectedNodeId(null);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [
    selectedNodeId,
    deleteSelectedElements,
    copyNode,
    cutNode,
    pasteNode,
    duplicateNode,
    closeContextMenu,
    closeFloatingToolbar,
    setSelectedNodeId,
    edges,
    workflowRunner,
  ]);

  // ========================================================================
  // SUPPRESS NATIVE BROWSER CONTEXT MENU INSIDE THE CANVAS WRAPPER
  // ========================================================================
  // React 合成事件的 preventDefault 在某些浏览器(Safari/Chrome)上无法阻止
  // 原生右键菜单，必须在原生 DOM 事件层绑定才可靠。
  useEffect(() => {
    const el = reactFlowWrapper.current;
    if (!el) return;
    const suppress = (e: MouseEvent) => {
      e.preventDefault();
    };
    el.addEventListener("contextmenu", suppress);
    return () => el.removeEventListener("contextmenu", suppress);
  }, []);

  // Open property panel when a node is selected
  const handlePropertyUpdate = useCallback(
    (nodeId: string, patch: Partial<CanvasNodeData>) => {
      setNodes((nds) =>
        nds.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, ...patch } } : n)),
      );
    },
    [setNodes],
  );

  // ========================================================================
  // RENDER
  // ========================================================================
  return (
    <>
      <BatchProgressBar ref={batchProgressRef} />
      <StoryboardBatchProgressOverlay
        job={storyboardBatchJob}
        onDismiss={handleDismissStoryboardBatchJob}
      />
      <SelectionToolbar
        selectedCount={selectionCount}
        onBatchGenerate={() => {
          const ids = nodes.filter((n) => n.selected).map((n) => n.id);
          handleBatchGenerateShots(ids);
        }}
        onMergeText={() => {
          const selected = nodes.filter((n) => n.selected);
          const merged = selected.map((n) => n.data?.content ?? "").filter(Boolean).join("\n\n---\n\n");
          if (merged) {
            setSelectedNodeId(null);
            handleAddNode("content", { x: 400, y: 400 }, "text");
            setNodes((nds) =>
              nds.map((n) =>
                n.data?.content === undefined && n.type === "content"
                  ? { ...n, data: { ...n.data, content: merged } }
                  : n,
              ),
            );
          }
        }}
        onAutoLayout={() => {
          const selected = nodes.filter((n) => n.selected);
          if (selected.length > 0) {
            const layouted = quickLayout(selected, [], 3);
            setNodes((nds) =>
              nds.map((n) => {
                const laid = layouted.find((l: any) => l.id === n.id);
                return laid ? { ...n, position: laid.position } : n;
              }),
            );
          }
        }}
      />
      <style>{`
        .react-flow__node.selected {
          box-shadow: 0 0 0 2px rgba(168, 85, 247, 0.5), 0 0 20px rgba(168, 85, 247, 0.2);
          border-radius: 12px;
        }
        .react-flow__node.selected .nodrag {
          border-color: rgba(168, 85, 247, 0.5) !important;
        }
      `}</style>
      <PropertyPanel
        node={showPropertyPanel ? selectedNode : null}
        onClose={() => setShowPropertyPanel(false)}
        onUpdateData={handlePropertyUpdate}
      />
      <div className="relative h-screen w-screen overflow-hidden startrails-flow">
      <div
        className="fixed left-20 top-3 z-20 flex items-center overflow-x-auto scrollbar-none"
        style={{ right: chatOpen ? CHAT_PANEL_WIDTH : 0 }}
      >
        {/* ── Logo / Title ── */}
        <div
          className="pointer-events-none flex items-center gap-2 rounded-2xl border px-3.5 py-2 shadow-lg backdrop-blur-xl"
          style={{
            borderColor: DESIGN_TOKENS.border,
            backgroundColor: "rgba(18,18,24,0.7)",
          }}
        >
          <div
            className="flex h-6 w-6 items-center justify-center rounded-lg"
            style={{
              backgroundColor: DESIGN_TOKENS.card,
            }}
          >
            <Sparkles size={13} strokeWidth={1.8} style={{ color: DESIGN_TOKENS.accent }} />
          </div>
          <div>
            <div className="text-xs font-medium" style={{ color: DESIGN_TOKENS.text }}>
              星轨画布
            </div>
          </div>
        </div>

        {/* ── Separator ── */}
        <div className="mx-2 h-6 w-px" style={{ backgroundColor: DESIGN_TOKENS.border }} />
        <ExportDropdown
          onExportProjectPackage={handleExportProjectPackage}
          onExportStoryboardPdf={handleExportStoryboardPdf}
          onPrintStoryboardPdf={handlePrintStoryboardPdf}
          onExportScreenplay={handleExportScreenplay}
          onExportStoryboardCsv={handleExportStoryboardCsv}
          onExportCharacterCsv={handleExportCharacterCsv}
          onExportSubtitles={handleExportSubtitles}
          onExportCompositionScript={handleExportCompositionScript}
          onExportToJianyingDraft={handleExportToJianyingDraft}
          onExportJianyingCompatible={handleExportJianyingCompatible}
        />
        {/* ── Separator ── */}
        <div className="mx-2 h-6 w-px" style={{ backgroundColor: DESIGN_TOKENS.border }} />
        <BibleDropdown
          characterLibraryCount={characterLibraryItems.length}
          sceneCount={sceneBibleItems.length}
          onOpenProjectBible={() => setShowProjectBiblePanel((v) => !v)}
          onOpenCharacterBible={() => setShowCharacterBiblePanel(true)}
          onOpenSceneBible={() => setShowSceneBiblePanel(true)}
          onOpenStyleBible={() => setShowStyleBiblePanel(true)}
          onToggleEmotionCurve={() => setShowEmotionCurve((v) => !v)}
        />
        <button
          type="button"
          onClick={() => setShowShotList((v) => !v)}
          className="flex items-center gap-1.5 rounded-2xl border px-3 py-2 text-xs font-medium backdrop-blur-xl transition hover:bg-white/10"
          style={{
            borderColor: showShotList ? "rgba(59, 130, 246, 0.5)" : DESIGN_TOKENS.border,
            backgroundColor: showShotList ? "rgba(59, 130, 246, 0.18)" : "rgba(18,18,24,0.7)",
            color: DESIGN_TOKENS.textSecondary,
          }}
          title="分镜表格视图（Shot List）"
          data-testid="shot-list-toggle"
        >
          <Table2 size={14} strokeWidth={1.7} />
          <span>分镜</span>
        </button>
        <button
          type="button"
          onClick={() => setShowStyleLibrary((v) => !v)}
          className="flex items-center gap-1.5 rounded-2xl border px-3 py-2 text-xs font-medium backdrop-blur-xl transition hover:bg-white/10"
          style={{
            borderColor: showStyleLibrary ? "rgba(168, 85, 247, 0.5)" : DESIGN_TOKENS.border,
            backgroundColor: showStyleLibrary ? "rgba(168, 85, 247, 0.18)" : "rgba(18,18,24,0.7)",
            color: DESIGN_TOKENS.textSecondary,
          }}
          title="影视画风库（100+风格预设）"
          data-testid="style-library-toggle"
        >
          <Palette size={14} strokeWidth={1.7} />
          <span>画风</span>
        </button>
        <button
          type="button"
          onClick={() => setShowAngleControl((v) => !v)}
          className="flex items-center gap-1.5 rounded-2xl border px-3 py-2 text-xs font-medium backdrop-blur-xl transition hover:bg-white/10"
          style={{
            borderColor: showAngleControl ? "rgba(249, 115, 22, 0.5)" : DESIGN_TOKENS.border,
            backgroundColor: showAngleControl ? "rgba(249, 115, 22, 0.18)" : "rgba(18,18,24,0.7)",
            color: DESIGN_TOKENS.textSecondary,
          }}
          title="拖拽旋转角色角度"
          data-testid="angle-control-toggle"
        >
          <RotateCcw size={14} strokeWidth={1.7} />
          <span>角度</span>
        </button>
        <button
          type="button"
          onClick={() => setShowVersionCompare((v) => !v)}
          className="flex items-center gap-1.5 rounded-2xl border px-3 py-2 text-xs font-medium backdrop-blur-xl transition hover:bg-white/10"
          style={{
            borderColor: showVersionCompare ? "rgba(34, 211, 238, 0.5)" : DESIGN_TOKENS.border,
            backgroundColor: showVersionCompare ? "rgba(34, 211, 238, 0.18)" : "rgba(18,18,24,0.7)",
            color: DESIGN_TOKENS.textSecondary,
          }}
          title="版本对比"
          data-testid="version-compare-toggle"
        >
          <GitCompare size={14} strokeWidth={1.7} />
          <span>版本</span>
        </button>
        {productionRunQueue && (
          <button
            type="button"
            onClick={() => setShowProductionQueue((value) => !value)}
            className="flex items-center gap-1.5 rounded-2xl border px-3 py-2 text-xs font-medium backdrop-blur-xl transition hover:bg-white/10"
            style={{
              borderColor: showProductionQueue ? DESIGN_TOKENS.borderStrong : DESIGN_TOKENS.border,
              backgroundColor: showProductionQueue ? "rgba(255,255,255,0.08)" : "rgba(18,18,24,0.7)",
              color: DESIGN_TOKENS.textSecondary,
            }}
            title="查看当前画布的生产运行队列（视觉/配音/字幕）"
            data-testid="production-run-queue-toggle"
          >
            <ListChecks size={14} strokeWidth={1.7} />
            <span>生产队列 {productionRunQueue.totalTasks}</span>
          </button>
        )}
        <button
          type="button"
          onClick={() => setShowShotPlanning((value) => !value)}
          className="flex items-center gap-1.5 rounded-2xl border px-3 py-2 text-xs font-medium backdrop-blur-xl transition hover:bg-white/10"
          style={{
            borderColor: showShotPlanning ? DESIGN_TOKENS.borderStrong : DESIGN_TOKENS.border,
            backgroundColor: showShotPlanning ? "rgba(255,255,255,0.08)" : "rgba(18,18,24,0.7)",
            color: DESIGN_TOKENS.textSecondary,
          }}
          title="制片规划"
          data-testid="shot-planning-toggle"
        >
          <ClipboardList size={14} strokeWidth={1.7} />
          <span>制片规划</span>
        </button>
      </div>

      {selectedShotCount >= 2 && (
        <div
          className="fixed left-1/2 top-4 z-40 flex -translate-x-1/2 items-center gap-3 rounded-2xl border px-4 py-2.5 shadow-2xl backdrop-blur-xl"
          style={{
            backgroundColor: "rgba(12,12,16,0.96)",
            borderColor: "rgba(255,255,255,0.18)",
            color: DESIGN_TOKENS.text,
            boxShadow: "0 18px 50px rgba(0,0,0,0.45)",
          }}
        >
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-medium" style={{ color: DESIGN_TOKENS.text }}>
              已选 {selectedShotCount} 个镜头
            </span>
            <span className="text-[11px]" style={{ color: DESIGN_TOKENS.textMuted }}>
              {selectedShotMissingCount > 0
                ? `将用 ${selectedShotCount} 个镜头一次生成一张多格分镜图`
                : "已有单图时会直接合成一张多格分镜图"}
            </span>
          </div>
          <div className="h-7 w-px" style={{ backgroundColor: "rgba(255,255,255,0.12)" }} />
          <button
            onClick={handleGenerateSelectedShotImages}
            disabled={selectedShotMissingCount === 0}
            className="flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-medium transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
            style={{
              borderColor: "rgba(255,255,255,0.12)",
              color: DESIGN_TOKENS.textSecondary,
              backgroundColor: "rgba(255,255,255,0.04)",
            }}
            title="可选：给选中镜头分别生成单张图片。会消耗多次图片生成额度。"
          >
            <Wand2 size={15} strokeWidth={1.8} />
            <span>分别生成单图</span>
          </button>
          <button
            onClick={() => {
              setDraftStoryboardCompositeSettings(storyboardCompositeSettings);
              setShowStoryboardCompositeSettings((value) => !value);
            }}
            className="flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-medium transition-colors hover:bg-white/10"
            style={{
              borderColor: "rgba(255,255,255,0.12)",
              color: DESIGN_TOKENS.textSecondary,
              backgroundColor: showStoryboardCompositeSettings
                ? "rgba(255,255,255,0.12)"
                : "rgba(255,255,255,0.04)",
            }}
            title="设置编号、标题、统一风格和生成策略；单格固定影视横屏 16:9"
          >
            <Settings2 size={15} strokeWidth={1.8} />
            <span>设置</span>
          </button>
          <button
            onClick={handleComposeSelectedShots}
            disabled={isComposingSelectedShots}
            className="flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-semibold transition-transform hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-70"
            style={{
              color: "#fff",
              background: `linear-gradient(135deg, ${DESIGN_TOKENS.accent}, #7c3aed)`,
              boxShadow: "0 10px 28px rgba(124,58,237,0.28)",
            }}
            title="只生成/输出一张多格分镜图，并把选中的 Shot 都连接到这张图"
          >
            {isComposingSelectedShots ? (
              <Loader2 size={15} strokeWidth={1.8} className="animate-spin" />
            ) : (
              <ImageIcon size={15} strokeWidth={1.8} />
            )}
            <span>{isComposingSelectedShots ? "生成中" : "生成一张分镜图"}</span>
          </button>
          {showStoryboardCompositeSettings && (
            <div
              className="absolute left-1/2 top-full mt-3 w-[420px] -translate-x-1/2 rounded-2xl border p-4 shadow-2xl"
              style={{
                backgroundColor: "rgba(14,14,20,0.98)",
                borderColor: "rgba(255,255,255,0.16)",
                color: DESIGN_TOKENS.text,
              }}
              onMouseDown={(event) => event.stopPropagation()}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">分镜图设置</div>
                  <div className="mt-1 text-[11px]" style={{ color: DESIGN_TOKENS.textMuted }}>
                    每格固定影视横屏 16:9；这里只设置显示信息、风格和生成策略
                  </div>
                </div>
                <div className="rounded-full border px-2 py-1 text-[11px]" style={{ borderColor: "rgba(255,255,255,0.12)", color: DESIGN_TOKENS.textMuted }}>
                  {selectedShotCount} 镜头
                </div>
              </div>

              <div className="space-y-4 text-xs">
                <div className="rounded-xl border px-3 py-2.5" style={{ borderColor: "rgba(255,255,255,0.12)", backgroundColor: "rgba(255,255,255,0.03)" }}>
                  <div className="mb-1 font-medium">影视分镜格式</div>
                  <div className="text-[11px] leading-5" style={{ color: DESIGN_TOKENS.textMuted }}>
                    自动按镜头数量排布；每一格强制为横屏 16:9 电影画幅，不提供竖屏、方图或社媒比例选择。
                  </div>
                </div>

                <div>
                  <div className="mb-2 font-medium">显示信息</div>
                  <div className="flex flex-wrap gap-2">
                    <label className="flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2" style={{ borderColor: "rgba(255,255,255,0.12)" }}>
                      <input
                        type="checkbox"
                        checked={draftStoryboardCompositeSettings.showShotNumber}
                        onChange={(event) =>
                          setDraftStoryboardCompositeSettings((prev) => ({
                            ...prev,
                            showShotNumber: event.target.checked,
                          }))
                        }
                      />
                      <span>显示镜头编号</span>
                    </label>
                    <label className="flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2" style={{ borderColor: "rgba(255,255,255,0.12)" }}>
                      <input
                        type="checkbox"
                        checked={draftStoryboardCompositeSettings.showShotTitle}
                        onChange={(event) =>
                          setDraftStoryboardCompositeSettings((prev) => ({
                            ...prev,
                            showShotTitle: event.target.checked,
                          }))
                        }
                      />
                      <span>显示简短标题</span>
                    </label>
                  </div>
                </div>

                <label className="block">
                  <div className="mb-2 font-medium">统一风格 Prompt</div>
                  <textarea
                    value={draftStoryboardCompositeSettings.stylePrompt}
                    onChange={(event) =>
                      setDraftStoryboardCompositeSettings((prev) => ({
                        ...prev,
                        stylePrompt: event.target.value,
                      }))
                    }
                    rows={3}
                    className="w-full resize-none rounded-xl border bg-transparent px-3 py-2 text-xs outline-none placeholder:text-white/30 focus:border-white/35"
                    style={{ borderColor: "rgba(255,255,255,0.12)", color: DESIGN_TOKENS.text }}
                    placeholder="例如：cinematic storyboard, consistent character, same lighting"
                  />
                </label>

                <div>
                  <div className="mb-2 font-medium">生成策略</div>
                  <div className="space-y-2">
                    {[
                      [
                        "auto-compose-or-generate",
                        "自动：全部已有单图时本地合成，否则生成完整分镜图",
                      ],
                      [
                        "always-generate-composite",
                        "始终调用模型生成完整分镜图",
                      ],
                    ].map(([value, label]) => (
                      <label
                        key={value}
                        className="flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2"
                        style={{
                          borderColor:
                            draftStoryboardCompositeSettings.strategy === value
                              ? DESIGN_TOKENS.accent
                              : "rgba(255,255,255,0.12)",
                          backgroundColor:
                            draftStoryboardCompositeSettings.strategy === value
                              ? DESIGN_TOKENS.accentSoft
                              : "transparent",
                        }}
                      >
                        <input
                          type="radio"
                          name="storyboard-composite-strategy"
                          checked={draftStoryboardCompositeSettings.strategy === value}
                          onChange={() =>
                            setDraftStoryboardCompositeSettings((prev) => ({
                              ...prev,
                              strategy:
                                value as StoryboardCompositeSettings["strategy"],
                            }))
                          }
                        />
                        <span>{label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setDraftStoryboardCompositeSettings(storyboardCompositeSettings);
                    setShowStoryboardCompositeSettings(false);
                  }}
                  className="rounded-full border px-4 py-2 text-xs font-medium hover:bg-white/10"
                  style={{ borderColor: "rgba(255,255,255,0.12)", color: DESIGN_TOKENS.textSecondary }}
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setStoryboardCompositeSettings({
                      ...draftStoryboardCompositeSettings,
                      layout: "auto",
                    });
                    setShowStoryboardCompositeSettings(false);
                  }}
                  className="rounded-full px-4 py-2 text-xs font-semibold text-white"
                  style={{ background: `linear-gradient(135deg, ${DESIGN_TOKENS.accent}, #7c3aed)` }}
                >
                  应用
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Hidden file input */}
      <input
        type="file"
        accept="image/*"
        multiple
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
      />
      <input
        type="file"
        accept=".txt,.md,.markdown,text/plain,text/markdown,text/x-markdown"
        multiple
        ref={documentInputRef}
        onChange={handleDocumentFileChange}
        className="hidden"
      />

      {/* React Flow Canvas */}
      <div
        ref={reactFlowWrapper}
        className={`h-full w-full ${isDragging ? "workflow-dragging" : ""}`}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={combinedHandleDrop}
      >
        <ReactFlow
          nodes={visibleNodes}
          edges={visibleEdges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={(connection) => {
            setEdges((eds) =>
              addEdge(
                {
                  ...connection,
                  type: "creative",
                  animated: false,
                  style: { stroke: DESIGN_TOKENS.nodeEdge, strokeWidth: 2 },
                },
                eds,
              ),
            );
          }}
          onInit={setReactFlowInstance}
          onMoveEnd={onMoveEnd}
          onNodeDragStart={() => {
            setIsDragging(true);
            dragStartSnapshotRef.current = {
              nodes: nodesRef.current.map((n) => ({ ...n, position: { ...n.position } })),
              edges: edgesRef.current.map((e) => ({ ...e })),
            };
          }}
          onNodeDragStop={() => {
            setIsDragging(false);
            if (dragStartSnapshotRef.current) {
              const hasPositionChanged = dragStartSnapshotRef.current.nodes.some((startNode) => {
                const endNode = nodesRef.current.find((n) => n.id === startNode.id);
                if (!endNode) return false;
                return (
                  startNode.position.x !== endNode.position.x ||
                  startNode.position.y !== endNode.position.y
                );
              });
              if (hasPositionChanged) {
                pushUndo(dragStartSnapshotRef.current, "move");
              }
              dragStartSnapshotRef.current = null;
            }
          }}
          onSelectionChange={onSelectionChange}
          onPaneContextMenu={handlePaneContextMenu}
          onNodeContextMenu={handleNodeContextMenu}
          onEdgeContextMenu={handleEdgeContextMenu}
          onPaneClick={() => {
            setSelectedNodeId(null);
            setShowPropertyPanel(false);
            setSelectionCount(0);
            closeContextMenu();
            closeFloatingToolbar();
          }}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          minZoom={ZOOM_CONSTRAINTS.minZoom}
          maxZoom={ZOOM_CONSTRAINTS.maxZoom}
          fitView={nodes.length > 0}
          fitViewOptions={{ padding: 0.2, maxZoom: 1.1, duration: 500 }}
          deleteKeyCode={null}
          selectionKeyCode={null}
          multiSelectionKeyCode={null}
          panOnScroll
          selectionOnDrag
          panOnDrag={[1, 2]}
          defaultEdgeOptions={{
            type: "creative",
            animated: false,
            style: { stroke: DESIGN_TOKENS.nodeEdge, strokeWidth: 2 },
          }}
          proOptions={{ hideAttribution: true }}
          onlyRenderVisibleElements
          elevateEdgesOnSelect
          nodeDragThreshold={5}
        >
          {/* Background — TapNow-style dot grid */}
          {showGrid && (
            <Background
              variant={BackgroundVariant.Dots}
              gap={24}
              size={1.2}
              color="rgba(255,255,255,0.12)"
            />
          )}
          <MiniMap
            nodeStrokeColor="rgba(168, 85, 247, 0.3)"
            nodeColor="rgba(168, 85, 247, 0.1)"
            maskColor="rgba(0,0,0,0.5)"
            style={{ background: "rgba(18,18,24,0.85)" }}
            pannable
            zoomable
          />
        </ReactFlow>
      </div>

      {/* Drop Overlay */}
      <CanvasDropOverlay isVisible={isDragOver} error={dragError} />

      {hasHiddenOnlyCanvas && (
        <div className="pointer-events-none fixed inset-0 z-30 flex items-center justify-center px-6">
          <div
            className="pointer-events-auto max-w-sm rounded-3xl border p-5 text-center shadow-2xl backdrop-blur-xl"
            style={{
              borderColor: DESIGN_TOKENS.border,
              backgroundColor: "rgba(18, 18, 24, 0.86)",
              color: DESIGN_TOKENS.textSecondary,
            }}
          >
            <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-white/10">
              <Eye size={18} style={{ color: DESIGN_TOKENS.text }} />
            </div>
            <div className="text-sm font-semibold" style={{ color: DESIGN_TOKENS.text }}>
              画布节点被隐藏了
            </div>
            <div className="mt-2 text-xs leading-5" style={{ color: DESIGN_TOKENS.textMuted }}>
              Chat 能读到 {nodes.length} 个节点，但当前没有可见节点。点击恢复会显示可恢复节点并自动定位。
            </div>
            <button
              type="button"
              onClick={recoverCanvasVisibility}
              className="mt-4 rounded-full px-4 py-2 text-xs font-semibold transition hover:scale-[1.02]"
              style={{
                backgroundColor: DESIGN_TOKENS.text,
                color: DESIGN_TOKENS.bg,
              }}
            >
              恢复并定位节点
            </button>
          </div>
        </div>
      )}

      {/* Empty Canvas Guide */}
      {nodes.length === 0 && (
        <EmptyCanvasGuide
          onUploadImage={handleUploadClick}
          onCreateTextNode={() => handleAddNode("content", undefined, "storyboard")}
          onImportScript={() => setShowScriptImportPanel(true)}
          chatOpen={chatOpen}
          chatPanelWidth={CHAT_PANEL_WIDTH}
          leftToolbarWidth={LEFT_TOOLBAR_SAFE_WIDTH}
        />
      )}

      {/* Left Toolbar */}
      <LeftToolbar
        onOpenAssetLibrary={openAssetLibrary}
        onToggleAddNodePanel={() => setShowAddNodePanel((prev) => !prev)}
        isAddNodePanelOpen={showAddNodePanel}
        onToggleChat={() => setChatOpen((prev) => !prev)}
        isChatOpen={chatOpen}
        onOpenWorkspaceHistory={() => setShowWorkspaceHistory(true)}
        onOpenTemplates={() => setShowTemplatesDialog(true)}
        onOpenUserMenu={() => setShowUserMenu((prev) => !prev)}
        onOpenCharacterView={() => setShowCharacterView(true)}
        onOpenCinematicParams={() => setShowCinematicParams(true)}
        onOpenColorGrade={() => setShowColorGrade(true)}
        onToggleTimeline={() => setShowTimeline((prev) => !prev)}
        onOpenPanorama={() => setShowPanorama(true)}
        onOpenCrewAgent={() => setShowCrewAgentPanel(true)}
        onOpenReverseStoryboard={() => setShowReverseStoryboard(true)}
        onOpenShotLibrary={() => setShowShotLibrary(true)}
        onOpenAIScript={() => setShowAIScript(true)}
        onOpenOnboarding={onboarding.toggle}
        onOpenFileUpload={() => setShowFileUpload(true)}
      />

      {/* Workflow Templates Dialog */}
      <WorkflowTemplatesDialog
        isOpen={showTemplatesDialog}
        onClose={() => setShowTemplatesDialog(false)}
        templates={workflowTemplates.templates}
        onSave={handleSaveTemplate}
        onLoad={handleLoadTemplate}
        onDelete={workflowTemplates.deleteTemplate}
        onExport={workflowTemplates.exportAsJSON}
        onImport={(json) => {
          const template = workflowTemplates.importFromJSON(json);
          if (!template) {
            alert("导入失败：文件格式无效。请确保使用 StarCanvas 导出的模板文件。");
          }
        }}
      />

      {/* Add Node Panel (TapNow-style) */}
      <AddNodePanel
        isOpen={showAddNodePanel}
        onClose={() => setShowAddNodePanel(false)}
        onAddNode={(nodeType, nodeKind) =>
          handleAddNode(nodeType, undefined, nodeKind)
        }
        onUploadImage={handleUploadClick}
        onUploadDocument={handleDocumentUploadClick}
        onImportScript={() => setShowScriptImportPanel(true)}
        onImportVideoRemix={() => setShowVideoRemixPanel(true)}
        onOpenProjectBible={() => setShowProjectBiblePanel(true)}
        onCreateVideoWorkflow={handleCreateVideoWorkflow}
        onOpenAssetLibrary={openAssetLibrary}
      />

      {/* User Menu Portal */}
      {showUserMenu &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed right-3 top-14 z-50 w-48 rounded-xl border py-1"
            style={{
              backgroundColor: "rgba(30,30,36,0.95)",
              borderColor: DESIGN_TOKENS.border,
              backdropFilter: "blur(20px)",
            }}
          >
            <button
              onClick={() => {
                // TODO: 接入真实登录
                alert("登录功能：接入 Auth0 / Clerk / Supabase Auth");
                setShowUserMenu(false);
              }}
              className="flex w-full items-center gap-2 px-4 py-2 text-sm transition-colors hover:bg-white/5"
              style={{ color: DESIGN_TOKENS.text }}
            >
              <span>登录 / 注册</span>
            </button>
            <div
              className="mx-2 my-1 h-px"
              style={{ backgroundColor: DESIGN_TOKENS.border }}
            />
            <button
              onClick={() => {
                setShowSettings(true);
                setShowUserMenu(false);
              }}
              className="flex w-full items-center gap-2 px-4 py-2 text-sm transition-colors hover:bg-white/5"
              style={{ color: DESIGN_TOKENS.textSecondary }}
            >
              <span>设置</span>
            </button>
            <button
              onClick={() => {
                setShowUserMenu(false);
              }}
              className="flex w-full items-center gap-2 px-4 py-2 text-sm transition-colors hover:bg-white/5"
              style={{ color: DESIGN_TOKENS.textMuted }}
            >
              <span>退出</span>
            </button>
          </div>,
          document.body,
        )}

      {/* Help Panel */}
      {showHelp &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed right-3 top-14 z-50 w-80 rounded-xl border p-4"
            style={{
              backgroundColor: "rgba(30,30,36,0.95)",
              borderColor: DESIGN_TOKENS.border,
              backdropFilter: "blur(20px)",
            }}
          >
            <h3
              className="mb-3 text-sm font-medium"
              style={{ color: DESIGN_TOKENS.text }}
            >
              ⌨️ 快捷键
            </h3>
            <div
              className="mb-4 flex flex-col gap-1.5 text-xs"
              style={{ color: DESIGN_TOKENS.textSecondary }}
            >
              {[
                ["Delete", "删除选中节点"],
                ["Ctrl+C", "复制节点"],
                ["Ctrl+X", "剪切节点"],
                ["Ctrl+V", "粘贴节点"],
                ["Ctrl+D", "复制节点"],
                ["Escape", "取消选择"],
                ["Enter/Space", "选中节点"],
              ].map(([key, desc]) => (
                <div key={key} className="flex items-center justify-between">
                  <code
                    className="rounded px-1.5 py-0.5 text-[10px]"
                    style={{
                      backgroundColor: "rgba(255,255,255,0.1)",
                      color: DESIGN_TOKENS.accent,
                    }}
                  >
                    {key}
                  </code>
                  <span>{desc}</span>
                </div>
              ))}
            </div>

            <h3
              className="mb-3 text-sm font-medium"
              style={{ color: DESIGN_TOKENS.text }}
            >
              🖱️ 鼠标操作
            </h3>
            <div
              className="mb-4 flex flex-col gap-1.5 text-xs"
              style={{ color: DESIGN_TOKENS.textSecondary }}
            >
              {[
                ["左键单击", "选中节点"],
                ["左键双击", "编辑节点内容"],
                ["右键单击", "打开节点菜单"],
                ["右键画布", "打开画布菜单"],
                ["滚轮", "缩放画布"],
                ["拖拽空白", "移动画布视图"],
                ["框选", "多选节点"],
              ].map(([key, desc]) => (
                <div key={key} className="flex items-center justify-between">
                  <code
                    className="rounded px-1.5 py-0.5 text-[10px]"
                    style={{
                      backgroundColor: "rgba(255,255,255,0.1)",
                      color: DESIGN_TOKENS.accent,
                    }}
                  >
                    {key}
                  </code>
                  <span>{desc}</span>
                </div>
              ))}
            </div>

            <h3
              className="mb-3 text-sm font-medium"
              style={{ color: DESIGN_TOKENS.text }}
            >
              📝 画布操作
            </h3>
            <div
              className="flex flex-col gap-1.5 text-xs"
              style={{ color: DESIGN_TOKENS.textSecondary }}
            >
              {[
                ["底部工具栏", "缩放、自动布局"],
                ["左侧工具栏", "添加节点、打开聊天"],
                ["@引用", "在输入框输入@引用节点"],
              ].map(([key, desc]) => (
                <div key={key} className="flex items-center justify-between">
                  <code
                    className="rounded px-1.5 py-0.5 text-[10px]"
                    style={{
                      backgroundColor: "rgba(255,255,255,0.1)",
                      color: DESIGN_TOKENS.accent,
                    }}
                  >
                    {key}
                  </code>
                  <span>{desc}</span>
                </div>
              ))}
            </div>

            <button
              onClick={() => setShowHelp(false)}
              className="mt-4 w-full rounded-lg py-2 text-xs transition-colors hover:bg-white/5"
              style={{
                color: DESIGN_TOKENS.textMuted,
                backgroundColor: "rgba(255,255,255,0.05)",
              }}
            >
              关闭
            </button>
          </div>,
          document.body,
        )}
      <div
        className="fixed bottom-3 left-3 z-20 flex items-center gap-1 rounded-full border px-2 py-1.5"
        style={{
          backgroundColor: "rgba(20,20,24,0.85)",
          borderColor: DESIGN_TOKENS.border,
          backdropFilter: "blur(20px)",
        }}
      >
        {/* 布局视图 - 使用 dagre 算法 */}
        <button
          onClick={() => {
            setNodes((nds) => {
              const layoutedNodes = quickLayout(nds, edges, 3);
              // 布局后自动适应当前可见画布区域，避免被右侧聊天面板遮挡
              fitViewToVisibleCanvas();
              return layoutedNodes;
            });
          }}
          className="flex h-7 w-7 items-center justify-center rounded-full transition-colors hover:bg-white/10"
          style={{ color: DESIGN_TOKENS.textMuted }}
          title="自动布局"
        >
          <Layout size={14} strokeWidth={1.5} />
        </button>
        {/* 网格视图 */}
        <button
          onClick={() => setShowGrid((prev) => !prev)}
          className="flex h-7 w-7 items-center justify-center rounded-full transition-colors hover:bg-white/10"
          style={{
            color: showGrid ? DESIGN_TOKENS.accent : DESIGN_TOKENS.textMuted,
          }}
          title="显示/隐藏网格"
        >
          <Grid3X3 size={14} strokeWidth={1.5} />
        </button>
        <div
          className="mx-1 h-3 w-px"
          style={{ backgroundColor: DESIGN_TOKENS.border }}
        />
        <button
          onClick={() => reactFlowInstance?.zoomOut({ duration: 200 })}
          className="flex h-7 w-7 items-center justify-center rounded-full transition-colors hover:bg-white/10"
          style={{ color: DESIGN_TOKENS.textMuted }}
          title="缩小"
        >
          <ZoomOut size={14} strokeWidth={1.5} />
        </button>
        {/* 缩放滑块条 */}
        {/* 缩放滑块 - 真实可拖拽的 range input */}
        <input
          type="range"
          min={ZOOM_CONSTRAINTS.minZoom}
          max={ZOOM_CONSTRAINTS.maxZoom}
          step={0.01}
          value={viewport.zoom}
          onChange={(e) =>
            reactFlowInstance?.zoomTo(parseFloat(e.target.value), {
              duration: 100,
            })
          }
          className="mx-1 h-1 w-20 cursor-pointer rounded-full"
          style={{
            background: `linear-gradient(to right, ${DESIGN_TOKENS.textMuted} ${((viewport.zoom - ZOOM_CONSTRAINTS.minZoom) / (ZOOM_CONSTRAINTS.maxZoom - ZOOM_CONSTRAINTS.minZoom)) * 100}%, rgba(255,255,255,0.1) ${((viewport.zoom - ZOOM_CONSTRAINTS.minZoom) / (ZOOM_CONSTRAINTS.maxZoom - ZOOM_CONSTRAINTS.minZoom)) * 100}%)`,
            accentColor: DESIGN_TOKENS.textMuted,
          }}
        />
        <span
          className="min-w-[36px] text-center text-xs tabular-nums"
          style={{ color: DESIGN_TOKENS.textMuted }}
        >
          {Math.round(viewport.zoom * 100)}%
        </span>
        <button
          onClick={() => reactFlowInstance?.zoomIn({ duration: 200 })}
          className="flex h-7 w-7 items-center justify-center rounded-full transition-colors hover:bg-white/10"
          style={{ color: DESIGN_TOKENS.textMuted }}
          title="放大"
        >
          <ZoomIn size={14} strokeWidth={1.5} />
        </button>
        <div
          className="mx-1 h-3 w-px"
          style={{ backgroundColor: DESIGN_TOKENS.border }}
        />
        <button
          onClick={() => fitViewToVisibleCanvas(400)}
          className="flex h-7 w-7 items-center justify-center rounded-full transition-colors hover:bg-white/10"
          style={{ color: DESIGN_TOKENS.textMuted }}
          title="适应窗口"
        >
          <Minimize2 size={14} strokeWidth={1.5} />
        </button>
        <div
          className="mx-1 h-3 w-px"
          style={{ backgroundColor: DESIGN_TOKENS.border }}
        />
        <button
          onClick={() => _doUndo?.()}
          className="flex h-7 w-7 items-center justify-center rounded-full transition-colors hover:bg-white/10"
          style={{ color: DESIGN_TOKENS.textMuted }}
          title="撤销 (Ctrl+Z)"
        >
          <ArrowLeft size={14} strokeWidth={1.5} />
        </button>
        <button
          onClick={() => _doRedo?.()}
          className="flex h-7 w-7 items-center justify-center rounded-full transition-colors hover:bg-white/10"
          style={{ color: DESIGN_TOKENS.textMuted }}
          title="重做 (Ctrl+Shift+Z)"
        >
          <ArrowRight size={14} strokeWidth={1.5} />
        </button>
        <div
          className="mx-1 h-3 w-px"
          style={{ backgroundColor: DESIGN_TOKENS.border }}
        />
        {/* 帮助按钮 */}
        <button
          onClick={() => setShowHelp((prev) => !prev)}
          className="flex h-7 w-7 items-center justify-center rounded-full transition-colors hover:bg-white/10"
          style={{
            color: showHelp ? DESIGN_TOKENS.accent : DESIGN_TOKENS.textMuted,
          }}
          title="快捷键帮助"
        >
          <HelpCircle size={14} strokeWidth={1.5} />
        </button>
        {/* 执行工作流按钮 */}
        {hasWorkflowNodes && (
          <>
            <div
              className="mx-1 h-3 w-px"
              style={{ backgroundColor: DESIGN_TOKENS.border }}
            />
            <button
              onClick={() =>
                workflowRunner.state.isRunning
                  ? workflowRunner.stopWorkflow()
                  : workflowRunner.runWorkflow()
              }
              className="flex h-7 items-center gap-1 rounded-full px-2.5 text-xs transition-colors hover:bg-white/10"
              style={{
                color: workflowRunner.state.isRunning
                  ? "#f59e0b"
                  : DESIGN_TOKENS.textSecondary,
              }}
              title={
                workflowRunner.state.isRunning
                  ? `停止 (${workflowRunner.state.progress}%)`
                  : "执行工作流"
              }
            >
              {workflowRunner.state.isRunning ? (
                <>
                  <Loader2 size={12} className="animate-spin" />
                  <span className="tabular-nums">
                    {workflowRunner.state.progress}%
                  </span>
                </>
              ) : (
                <>
                  <Sparkles size={12} />
                  <span>执行</span>
                </>
              )}
            </button>
          </>
        )}
      </div>

      {/* Canvas Context Menu */}
      {typeof document !== "undefined" &&
        createPortal(
          <CanvasContextMenu
            state={contextMenu}
            onClose={closeContextMenu}
            onAddNode={(type, position, nodeKind) =>
              handleAddNode(type, position, nodeKind as CanvasNodeKind)
            }
            onUploadImage={handleUploadClick}
            onUploadDocument={handleDocumentUploadClick}
            onPaste={pasteNode}
            hasClipboard={!!clipboardNode}
          />,
          document.body,
        )}

      {/* Node Context Menu */}
      {typeof document !== "undefined" &&
        createPortal(
          <NodeContextMenu
            state={contextMenu}
            onClose={closeContextMenu}
            onDelete={() => {
              if (contextMenu?.type === "node") {
                deleteNode(contextMenu.nodeId);
              }
            }}
            onDuplicate={() => {
              if (contextMenu?.type === "node") {
                duplicateNode(contextMenu.nodeId);
              }
            }}
            onCopy={() => {
              if (contextMenu?.type === "node") {
                copyNode(contextMenu.nodeId);
              }
            }}
            onCut={() => {
              if (contextMenu?.type === "node") {
                cutNode(contextMenu.nodeId);
              }
            }}
            onPreviewImage={() => {
              if (contextMenu?.type === "node") {
                setPreviewImageNodeId(contextMenu.nodeId);
              }
            }}
            onCropImage={() => {
              if (contextMenu?.type === "node") {
                setCropImageNodeId(contextMenu.nodeId);
              }
            }}
            onSaveToAssetLibrary={() => {
              if (contextMenu?.type === "node") {
                handleSaveToAssetLibrary(contextMenu.nodeId);
              }
            }}
            onOpenPanorama={() => {
              if (contextMenu?.type === "node") {
                setSelectedNodeId(contextMenu.nodeId);
                setShowPanorama(true);
              }
            }}
            onRegenerateShot={() => {
              if (contextMenu?.type === "node") {
                handleRegenerateShot(contextMenu.nodeId);
              }
            }}
            onAIVariant={() => {
              if (contextMenu?.type === "node") {
                handleAIVariant(contextMenu.nodeId);
              }
            }}
            onEdit={() => {
              if (contextMenu?.type === "node") {
                setSelectedNodeId(contextMenu.nodeId);
              }
            }}
            onViewHistory={() => {
              if (contextMenu?.type === "node") {
                setHistoryNodeId(contextMenu.nodeId);
                setShowNodeHistory(true);
              }
            }}
            onRunCurrentNode={() => {
              if (contextMenu?.type === "node") {
                const plan = buildExecutionPlan({
                  mode: "single",
                  rootNodeIds: [contextMenu.nodeId],
                  nodes: nodesRef.current,
                  edges,
                  canvasId: "current",
                });
                workflowRunner.runExecutionPlan(plan);
              }
            }}
            onRunUpstreamAndCurrent={() => {
              if (contextMenu?.type === "node") {
                const plan = buildExecutionPlan({
                  mode: "upstream",
                  rootNodeIds: [contextMenu.nodeId],
                  nodes: nodesRef.current,
                  edges,
                  canvasId: "current",
                });
                workflowRunner.runExecutionPlan(plan);
              }
            }}
            onRunDownstreamChain={() => {
              if (contextMenu?.type === "node") {
                const plan = buildExecutionPlan({
                  mode: "downstream",
                  rootNodeIds: [contextMenu.nodeId],
                  nodes: nodesRef.current,
                  edges,
                  canvasId: "current",
                });
                workflowRunner.runExecutionPlan(plan);
              }
            }}
            onStopWorkflow={workflowRunner.stopWorkflow}
            onSplitStoryboard={() => {
              if (contextMenu?.type === "node")
                handleSplitStoryboardNode(contextMenu.nodeId, false);
            }}
            onSplitStoryboardWithGrid={() => {
              if (contextMenu?.type === "node")
                handleSplitStoryboardNode(contextMenu.nodeId, true);
            }}
            onGenerateShotImage={() => {
              if (contextMenu?.type === "node")
                handleGenerateShotImage(contextMenu.nodeId);
            }}
            onGenerateStoryboardGrid={() => {
              if (contextMenu?.type === "node")
                handleGenerateStoryboardGrid(contextMenu.nodeId);
            }}
            onGenerateStoryboardImage={() => {
              if (contextMenu?.type === "node")
                handleGenerateStoryboardImageFromSource(contextMenu.nodeId);
            }}
            onCreateStoryboardAssistant={() => {
              if (contextMenu?.type === "node")
                handleCreateStoryboardAssistantFromInspiration(contextMenu.nodeId);
            }}
            onCreateInspirationFromDocument={() => {
              if (contextMenu?.type === "node")
                createDocumentDerivedNode(contextMenu.nodeId, "inspiration");
            }}
            onCreateStoryboardFromDocument={() => {
              if (contextMenu?.type === "node")
                createDocumentDerivedNode(contextMenu.nodeId, "storyboard");
            }}
            onComposeSelectedShots={handleComposeSelectedShots}
            selectedShotCount={selectedShotCount}
            isWorkflowRunning={workflowRunner.state.isRunning}
            nodeKind={
              nodes.find(
                (n) =>
                  n.id ===
                  (contextMenu?.type === "node" ? contextMenu.nodeId : null),
              )?.data?.nodeKind
            }
          />,
          document.body,
        )}

      {/* Edge Context Menu */}
      {typeof document !== "undefined" &&
        createPortal(
          <EdgeContextMenu
            state={contextMenu}
            onClose={closeContextMenu}
            onDelete={() => {
              if (contextMenu?.type === "edge") {
                deleteEdge(contextMenu.edgeId);
              }
            }}
          />,
          document.body,
        )}

      {/* Image Hover Toolbar */}
      {typeof document !== "undefined" &&
        createPortal(
          <ImageHoverToolbar
            state={floatingToolbar}
            onClose={closeFloatingToolbar}
            onPreview={() => {
              if (floatingToolbar?.type === "image-hover") {
                setPreviewImageNodeId(floatingToolbar.nodeId);
                closeFloatingToolbar();
              }
            }}
            onCrop={() => {
              if (floatingToolbar?.type === "image-hover") {
                setCropImageNodeId(floatingToolbar.nodeId);
                closeFloatingToolbar();
              }
            }}
            onSaveToLibrary={() => {
              if (floatingToolbar?.type === "image-hover") {
                handleSaveToAssetLibrary(floatingToolbar.nodeId);
                closeFloatingToolbar();
              }
            }}
            onReplaceImage={() => {
              if (floatingToolbar?.type === "image-hover") {
                handleUploadClick();
                closeFloatingToolbar();
              }
            }}
            onDelete={() => {
              if (floatingToolbar?.type === "image-hover") {
                deleteNode(floatingToolbar.nodeId);
                closeFloatingToolbar();
              }
            }}
            onAIVariant={() => {
              if (floatingToolbar?.type === "image-hover") {
                handleAIVariant(floatingToolbar.nodeId);
                closeFloatingToolbar();
              }
            }}
          />,
          document.body,
        )}

      {/* Project Bible Panel */}
      <ProjectBiblePanel
        isOpen={showProjectBiblePanel}
        onClose={() => setShowProjectBiblePanel(false)}
        characterItems={characterLibraryItems}
        sceneItems={sceneBibleItems}
        visualBible={projectVisualBible}
        onApplyCharacterPatch={handleApplyCharacterAssetPatch}
        onApplyScenePatch={handleApplySceneBiblePatch}
        onApplyVisualPatch={handleApplyProjectVisualPatch}
      />

      {/* 详细角色圣经面板 */}
      {showCharacterBiblePanel && typeof document !== "undefined" &&
        createPortal(
          <CharacterBiblePanel
            isOpen={showCharacterBiblePanel}
            onClose={() => setShowCharacterBiblePanel(false)}
          />,
          document.body,
        )}

      {/* 详细场景圣经面板 */}
      {showSceneBiblePanel && typeof document !== "undefined" &&
        createPortal(
          <SceneBiblePanel
            isOpen={showSceneBiblePanel}
            onClose={() => setShowSceneBiblePanel(false)}
          />,
          document.body,
        )}

      {/* 视觉风格圣经面板 */}
      {showStyleBiblePanel && typeof document !== "undefined" &&
        createPortal(
          <VisualStyleBiblePanel
            isOpen={showStyleBiblePanel}
            onClose={() => setShowStyleBiblePanel(false)}
          />,
          document.body,
        )}

      {/* ================================================================ */}
      {/* 制片层面板：角色三视图、运镜参数、调色、时间轴                      */}
      {/* ================================================================ */}

      {/* 角色三视图生成面板 (CharacterViewPanel) */}
      {showCharacterView && (
        <CharacterViewPanel
          isOpen={showCharacterView}
          onClose={() => setShowCharacterView(false)}
        />
      )}

      {/* 影视参数化控制面板 (CinematicParamPanel — leva) */}
      {showCinematicParams && (
        <CinematicParamPanel
          isOpen={showCinematicParams}
          onClose={() => setShowCinematicParams(false)}
          selectedNodeId={selectedNodeId}
          onApplyToNode={(nodeId: string, prompt: string, params: CinematicParams) => {
            setNodes((nds) =>
              nds.map((n) => {
                if (n.id !== nodeId) return n;
                const previousPrompt = n.data.prompt || n.data.content || "";
                const nextPrompt = previousPrompt ? `${previousPrompt}\n\n${prompt}` : prompt;
                return { ...n, data: { ...n.data, prompt: nextPrompt, cinematicParams: params } };
              }),
            );
          }}
        />
      )}

      {/* 色彩分级面板 (ColorGradePanel — rgb-curve) */}
      {showColorGrade && (
        <ColorGradePanel
          isOpen={showColorGrade}
          onClose={() => setShowColorGrade(false)}
          selectedNodeId={selectedNodeId}
          onApplyToNode={(nodeId: string, promptSuffix: string) => {
            setNodes((nds) =>
              nds.map((n) => {
                if (n.id !== nodeId) return n;
                const previousPrompt = n.data.prompt || n.data.content || "";
                const nextPrompt = previousPrompt ? `${previousPrompt}\n\n${promptSuffix}` : promptSuffix;
                return { ...n, data: { ...n.data, prompt: nextPrompt, colorGradePrompt: promptSuffix } };
              }),
            );
          }}
        />
      )}

      {/* 参考视频逆向分镜面板 (P0-1: ReverseStoryboardPanel) */}
      {showReverseStoryboard && (
        <ReverseStoryboardPanel
          isOpen={showReverseStoryboard}
          onClose={() => setShowReverseStoryboard(false)}
          selectedNodeId={selectedNodeId}
          onImportShots={(shots, videoMeta) => {
            setNodes((nds) => {
              const nodes = importStoryboardDraftToCanvas(
                shots.map((s) => ({
                  id: s.id,
                  title: s.title,
                  description: s.description,
                  durationSec: s.durationSec,
                  visualPrompt: s.visualPrompt,
                  thumbnail: s.thumbnail,
                  sourceType: "reference-video",
                  sourceMeta: { videoName: videoMeta.fileName, timeSec: s.timeSec, frameId: s.sourceFrameId },
                })),
                { existingNodeCount: nds.length },
              )
              completeStep("import-script-to-canvas")
              return [...nds, ...nodes]
            })
          }}
        />
      )}

      {/* 新手引导面板 (Onboarding Checklist) */}
      {onboarding.showPanel && (
        <OnboardingPanel
          isOpen={onboarding.showPanel}
          steps={onboarding.state.steps}
          completedCount={onboarding.completedCount}
          totalCount={onboarding.totalCount}
          allComplete={onboarding.allComplete}
          onClose={onboarding.close}
          onDismiss={onboarding.dismiss}
          onReset={onboarding.reset}
          stepActions={onboardingStepActions}
        />
      )}

      {/* 镜头库面板 (P1-4: ShotLibraryPanel) */}
      {showShotLibrary && (
        <ShotLibraryPanel
          isOpen={showShotLibrary}
          onClose={() => setShowShotLibrary(false)}
          selectedNodeId={selectedNodeId}
          onApplyToNode={(nodeId: string, shotPrompt: string) => {
            setNodes((nds) =>
              nds.map((n) => {
                if (n.id !== nodeId) return n
                const previousPrompt = n.data.prompt || n.data.content || ""
                const nextPrompt = previousPrompt
                  ? `${previousPrompt}\n\nShot: ${shotPrompt}`
                  : `Shot: ${shotPrompt}`
                return { ...n, data: { ...n.data, prompt: nextPrompt } }
              }),
            )
          }}
        />
      )}

      {/* AI 剧本生成面板 (P1-1: AIScriptPanel) */}
      {showAIScript && (
        <AIScriptPanel
          isOpen={showAIScript}
          onClose={() => setShowAIScript(false)}
          selectedNodeId={selectedNodeId}
          onImportShots={(shots) => {
            setNodes((nds) => {
              const nodes = importStoryboardDraftToCanvas(
                shots.map((s) => ({
                  id: s.id,
                  title: s.title,
                  description: s.description,
                  durationSec: s.durationSec,
                  visualPrompt: s.visualPrompt,
                  sourceType: "ai-script",
                  sourceMeta: { scriptId: s.source.scriptId, sceneId: s.source.sceneId, shotPresetId: s.shotPresetId },
                })),
                { existingNodeCount: nds.length },
              )
              completeStep("import-script-to-canvas")
              return [...nds, ...nodes]
            })
          }}
        />
      )}

      {/* 时间轴面板 (TimelinePanel — react-timeline-editor) */}
      {/* 底部时间轴展开按钮 */}
      {!showTimeline && (
        <div
          className="fixed bottom-0 left-1/2 z-30 -translate-x-1/2"
          style={{ marginBottom: "8px" }}
        >
          <button
            onClick={() => setShowTimeline(true)}
            className="flex items-center gap-2 rounded-full border px-4 py-1.5 text-xs transition-all hover:scale-105"
            style={{
              backgroundColor: "rgba(20,20,24,0.85)",
              borderColor: "rgba(255,255,255,0.1)",
              color: "rgba(255,255,255,0.5)",
              backdropFilter: "blur(20px)",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9" />
            </svg>
            时间轴
          </button>
        </div>
      )}
      <TimelinePanel
        isOpen={showTimeline}
        onClose={() => setShowTimeline(false)}
        clips={timelineClips}
        currentNodeTime={timelineCurrentTime}
        onSeek={setTimelineCurrentTime}
        isPlaying={isTimelinePlaying}
        onTogglePlay={toggleTimelinePlay}
        onClipMove={(clipId, newStartTime) => {
          setNodes((nds) =>
            nds.map((n) =>
              `tl-clip-${n.id}` === clipId
                ? { ...n, data: { ...n.data, timelineStartTimeSeconds: newStartTime } }
                : n,
            ),
          );
        }}
      />

      {/* 全景预𪾢面板 (PanoramaPanel — react-pannellum) */}
      {showPanorama && (
        <PanoramaPanel
          isOpen={showPanorama}
          onClose={() => setShowPanorama(false)}
          selectedNodeId={selectedNodeId}
          initialImageUrl={
            selectedNode
              ? (selectedNode.data as Record<string, unknown>)?.imageUrl as string | undefined
                ?? (selectedNode.data as Record<string, unknown>)?.resultUrl as string | undefined
              : undefined
          }
          onApplyToNode={(nodeId: string, panoramaPrompt: string) => {
            setNodes((nds) =>
              nds.map((n) => {
                if (n.id !== nodeId) return n;
                const previousPrompt = n.data.prompt || n.data.content || "";
                const nextPrompt = previousPrompt ? `${previousPrompt}\n\n[Panorama] ${panoramaPrompt}` : `[Panorama] ${panoramaPrompt}`;
                return { ...n, data: { ...n.data, prompt: nextPrompt, panoramaPrompt } };
              }),
            );
          }}
        />
      )}

      {/* 情绪曲线面板 */}
      {showEmotionCurve && typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed bottom-20 right-4 z-50 w-[420px] rounded-xl border shadow-2xl"
            style={{
              backgroundColor: "rgba(15, 15, 30, 0.96)",
              borderColor: "rgba(168, 85, 247, 0.3)",
              backdropFilter: "blur(12px)",
            }}
          >
            <div className="flex items-center justify-between px-4 pt-3 pb-1">
              <span className="text-xs font-medium" style={{ color: "rgba(255,255,255,0.8)" }}>
                情绪曲线
              </span>
              <button
                onClick={() => setShowEmotionCurve(false)}
                className="rounded p-1 transition hover:bg-white/10"
                style={{ color: "rgba(255,255,255,0.5)" }}
              >
                <X size={14} />
              </button>
            </div>
            <div className="px-4 pb-4">
              <EmotionCurvePanel data={emotionCurveData} />
            </div>
          </div>,
          document.body,
        )}

      {/* 分镜列表面板 */}
      {showShotList && typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed bottom-20 right-4 z-50 flex max-h-[70vh] w-[720px] flex-col rounded-xl border shadow-2xl"
            style={{
              backgroundColor: "rgba(15, 15, 30, 0.96)",
              borderColor: "rgba(59, 130, 246, 0.3)",
              backdropFilter: "blur(12px)",
            }}
          >
            <div className="flex items-center justify-between px-3 pt-2 pb-1">
              <span className="text-xs font-medium" style={{ color: "rgba(255,255,255,0.8)" }}>
                Shot List
              </span>
              <button
                onClick={() => setShowShotList(false)}
                className="rounded p-1 transition hover:bg-white/10"
                style={{ color: "rgba(255,255,255,0.5)" }}
              >
                <X size={14} />
              </button>
            </div>
            <div className="flex-1 overflow-hidden px-3 pb-3">
              <ShotListTable
                nodes={nodes}
                selectedNodeId={selectedNodeId}
                onSelectShot={(nodeId: string) => { setSelectedNodeId(nodeId); setShowShotList(false) }}
                onRunShot={(nodeId: string) => { workflowRunner.runNode(nodeId) }}
                onExportJianying={() => { downloadJianyingDraft(nodes) }}
                onExportScript={handleExportCompositionScript}
              />
            </div>
          </div>,
          document.body,
        )}

      {/* 影视画风库 */}
      <StyleLibraryPanel
        isOpen={showStyleLibrary}
        onClose={() => setShowStyleLibrary(false)}
        currentPrompt={selectedNode?.data?.shot?.visualPrompt || selectedNode?.data?.prompt || ""}
        onApplyStyle={(enhancedPrompt) => {
          const targetId = selectedNodeId
          if (!targetId) return
          // Update the visual prompt of the selected shot/image node
          if (selectedNode?.data?.shot) {
            // Shot node
            const shotPatch = { visualPrompt: enhancedPrompt }
            setNodes((nds) =>
              nds.map((n) =>
                n.id === targetId ? { ...n, data: { ...n.data, shot: { ...n.data.shot!, ...shotPatch } } } : n,
              ),
            )
          } else {
            // Image/Content node
            setNodes((nds) =>
              nds.map((n) =>
                n.id === targetId ? { ...n, data: { ...n.data, prompt: enhancedPrompt, visualPrompt: enhancedPrompt } } : n,
              ),
            )
          }
        }}
      />

      {/* 拖拽角度控制 */}
      {showAngleControl && (
        <div
          className="fixed bottom-20 right-4 z-50 rounded-xl border p-4 shadow-2xl"
          style={{
            backgroundColor: "rgba(15, 15, 30, 0.96)",
            borderColor: "rgba(249, 115, 22, 0.3)",
            backdropFilter: "blur(12px)",
          }}
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium" style={{ color: "rgba(255,255,255,0.8)" }}>角度控制</span>
            <button onClick={() => setShowAngleControl(false)} className="rounded p-1 hover:bg-white/10" style={{ color: "rgba(255,255,255,0.5)" }}>
              <X size={14} />
            </button>
          </div>
          <DraggableAngleControl
            characterImageUrl={selectedNode?.data?.resultUrl || selectedNode?.data?.shot?.generatedImageUrl || undefined}
            onChange={(angle) => {
              if (selectedNode?.data?.shot) {
                // Update shot camera angle parameter
                setNodes((nds) => nds.map((n) =>
                  n.id === selectedNodeId ? { ...n, data: { ...n.data, shot: { ...n.data.shot!, cameraAngle: angle } } } : n
                ))
              }
            }}
          />
        </div>
      )}

      {/* 版本对比面板 */}
      <VersionComparePanel
        isOpen={showVersionCompare}
        onClose={() => setShowVersionCompare(false)}
        snapshots={snapshotStoreSnapshots}
        currentSnapshotId={latestSnapshotId}
        onRestore={(snapshotId: string) => {
          const snap = snapshotStoreSnapshots.find((s) => s.id === snapshotId)
          if (snap) {
            setNodes(snap.nodes)
            setEdges(snap.edges)
          }
        }}
      />

      {/* AI 影视创作剧组面𤋈 (CrewAgentPanel — 7 Agent) */}
      {showCrewAgentPanel && (
        <CrewAgentPanel
          isOpen={showCrewAgentPanel}
          onClose={() => setShowCrewAgentPanel(false)}
          selectedNodeId={selectedNodeId}
          currentScript={
            selectedNode
              ? (selectedNode.data as Record<string, unknown>)?.content as string | undefined
                ?? (selectedNode.data as Record<string, unknown>)?.text as string | undefined
                ?? (selectedNode.data as Record<string, unknown>)?.prompt as string | undefined
              : undefined
          }
          onApplyResults={(results) => {
            // 将 Agent 产出写入画布节点
            const roleNames: Record<string, string> = {
              writer: "writer",
              storyboardArtist: "storyboardArtist",
              cinematographer: "cinematographer",
              director: "director",
              promptEngineer: "promptEngineer",
              productionDesigner: "productionDesigner",
              router: "router",
            }
            Object.entries(results).forEach(([roleId, output]) => {
              if (!output) return
              setNodes((nds) => [
                ...nds,
                {
                  id: `crew-${roleId}-${Date.now()}`,
                  type: "agent",
                  position: {
                    x: 100 + Math.random() * 400,
                    y: 100 + Math.random() * 300,
                  },
                  data: {
                    label: roleNames[roleId] || roleId,
                    title: roleNames[roleId] || roleId,
                    content: output,
                    nodeKind: "agent",
                    agentOutput: output,
                  },
                } as import("@xyflow/react").Node,
              ])
            })
          }}
        />
      )}

      {/* 导出预检面板 (ExportPreflightPanel) */}
      {showExportPreflight && (
        <ExportPreflightPanel
          isOpen={showExportPreflight}
          onClose={() => setShowExportPreflight(false)}
          nodes={nodes}
          timelineOrder={timelineClips.map((c) => c.id.replace(/^tl-(video|audio|subtitle)-/, ""))}
          onPerformExport={performJianyingExport}
        />
      )}

      {/* 文件上传面板 (FileUploadPanel) */}
      {showFileUpload && (
        <FileUploadPanel
          isOpen={showFileUpload}
          onClose={() => setShowFileUpload(false)}
          onDocumentParsed={(result, position) => {
            const docNode = createDocumentNode({
              id: `doc-${Date.now()}`,
              document: {
                fileName: result.fileName,
                fileSize: result.fileSize,
                mimeType: result.type === "pdf" ? "application/pdf" : `text/${result.type}`,
                text: result.text,
                uploadedAt: new Date().toISOString(),
              },
              position,
            });
            setNodes((nds) => [...nds, docNode]);
          }}
        />
      )}

      {/* Legacy Character Asset Library Panel */}
      {showCharacterLibrary &&
        typeof document !== "undefined" &&
        createPortal(
          <CharacterAssetLibraryPanel
            items={characterLibraryItems}
            onApplyAssetPatch={handleApplyCharacterAssetPatch}
            onClose={() => setShowCharacterLibrary(false)}
          />,
          document.body,
        )}

        {/* === 恢复孤立组件 === */}
      {/* 镜头角度/景别 (AngleControlPanel) */}
      {showAngleControl && (
        <AngleControlPanel
          isOpen={showAngleControl}
          onClose={() => setShowAngleControl(false)}
          selectedNodeId={selectedNodeId}
        />
      )}

      {/* Canvas 诊断面板 */}
      {showDiagnostics && (
        <CanvasDiagnosticsPanel
          isOpen={showDiagnostics}
          onClose={() => setShowDiagnostics(false)}
          nodes={nodes as Node<CanvasNodeData>[]}
          edges={edges}
          isCanvasRestored={isCanvasRestored}
          scriptImportOpen={showScriptImportPanel}
          showRunPanel={showRunPanel}
          runEventCount={nodes.filter((n: any) => n.data?.runMeta?.runStatus).length}
        />
      )}

      {/* 影视实验室 (CinemaLabPanel) — 需要选中节点 */}
      {showCinemaLab && selectedNode && (
        <CinemaLabPanel
          nodeId={selectedNode.id}
          onChange={(cfg) => { /* 将通过 PropertyPanel 链路更新 */ }}
        />
      )}

      {/* 分镜转场选择器 (TransitionPicker) — 最后孤儿的复活 */}
      {showTransitionPicker && (
        <TransitionPicker
          transition={transitionState.effect as any}
          transitionDuration={transitionState.duration}
          onChange={(effect, duration) => setTransitionState({ effect, duration })}
        />
      )}

      {/* Production Run Queue Panel */}
      {showProductionQueue && productionRunQueue &&
        typeof document !== "undefined" &&
        createPortal(
          <ProductionRunQueuePanel
            queue={productionRunQueue}
            onClose={() => setShowProductionQueue(false)}
            isRunning={productionExecutor.isRunning}
            onStart={productionExecutor.start}
            execState={productionExecutor.execState}
            onRetryTask={productionExecutor.retryTask}
            onSkipTask={productionExecutor.skipTask}
          />,
          document.body,
        )}

      {/* Shot Planning Panel */}
      {showShotPlanning && typeof document !== "undefined" &&
        createPortal(
          <ShotPlanningPanel
            isOpen={showShotPlanning}
            onClose={() => setShowShotPlanning(false)}
            projectId={projectId ?? null}
            projectTitle={projectTitle}
            nodes={planningNodes}
          />,
          document.body,
        )}

      {/* Asset Library Panel */}
      {typeof document !== "undefined" &&
        createPortal(
          <AssetLibraryPanel
            isOpen={assetLibrary.isOpen}
            onClose={closeAssetLibrary}
            assets={assetLibrary.assets}
            selectedFolder={assetLibrary.selectedFolder}
            query={assetLibrary.query}
            onQueryChange={setAssetLibraryQuery}
            onFolderChange={setAssetLibraryFolder}
            onToggleFavorite={toggleAssetFavorite}
            onDeleteAsset={removeAsset}
            onSelectAsset={(asset) => {
              // Add asset to canvas
              let position = { x: 400, y: 300 };
              if (reactFlowInstance) {
                position = reactFlowInstance.screenToFlowPosition({
                  x: window.innerWidth / 2,
                  y: window.innerHeight / 2,
                });
              }

              const newNode: Node<CanvasNodeData> = {
                id: generateId(),
                type: asset.type === "image" ? "image" : "content",
                position,
                data: {
                  title: asset.name,
                  imageUrl: asset.src,
                  assetUrl: asset.src,
                  nodeKind: asset.type === "image" ? "uploaded-image" : "text",
                },
              };

              setNodes((nds) => [...nds, newNode]);
              closeAssetLibrary();
            }}
          />,
          document.body,
        )}

      {/* Script Import Panel */}
      <ScriptImportPanel
        isOpen={showScriptImportPanel}
        onClose={() => setShowScriptImportPanel(false)}
        onImportScript={handleImportScript}
      />

      {/* Video Remix Panel */}
      <VideoRemixPanel
        isOpen={showVideoRemixPanel}
        onClose={() => setShowVideoRemixPanel(false)}
        onImportRemix={handleImportRemix}
      />

      {/* Settings Panel */}
      {showSettings &&
        typeof document !== "undefined" &&
        createPortal(
          <SettingsPanel
            isOpen={showSettings}
            onClose={() => setShowSettings(false)}
          />,
          document.body,
        )}

      {/* Workspace History Panel */}
      {showWorkspaceHistory &&
        typeof document !== "undefined" &&
        createPortal(
          <WorkspaceHistoryPanel
            isOpen={showWorkspaceHistory}
            onClose={() => setShowWorkspaceHistory(false)}
            onSelectNode={(nodeId) => {
              focusCanvasNode(nodeId);
              setShowWorkspaceHistory(false);
            }}
            onCreateSnapshot={handleCreateCanvasSnapshot}
            onRestoreSnapshot={handleRestoreCanvasSnapshot}
          />,
          document.body,
        )}

      {/* Node History Panel */}
      {showNodeHistory &&
        typeof document !== "undefined" &&
        createPortal(
          <NodeHistoryPanel
            isOpen={showNodeHistory}
            onClose={() => {
              setShowNodeHistory(false);
              setHistoryNodeId(null);
            }}
            nodeId={historyNodeId}
            nodeTitle={
              historyNodeId
                ? (nodes.find((n) => n.id === historyNodeId)?.data?.title ??
                  (nodes.find((n) => n.id === historyNodeId)?.data
                    ?.label as string) ??
                  historyNodeId.slice(0, 8))
                : undefined
            }
            currentHistoryId={
              historyNodeId
                ? nodes.find((n) => n.id === historyNodeId)?.data?.runMeta
                    ?.currentHistoryId
                : undefined
            }
            onRestorePrompt={(nId, hId) => {
              workflowRunner.restorePromptFromHistory(nId, hId);
            }}
            onRetry={(nId, hId) => {
              workflowRunner.retryFromHistory(nId, hId);
            }}
            onViewTrace={(hId, nId, nTitle) => {
              setShowSourceTrace(true);
              setTraceHistoryId(hId);
              setTraceNodeInfo({ nodeId: nId, nodeTitle: nTitle });
            }}
          />,
          document.body,
        )}

      {/* P2-3A: Workflow Run Panel */}
      <WorkflowRunPanel
        isOpen={showRunPanel}
        onClose={() => {
          setShowRunPanel(false);
          // 面板关闭时保留最后一个 run 的 events 供下次查看
          // 新 run 开始时 events 会被清空重建
        }}
        events={runEvents}
        isRunning={workflowRunner.state.isRunning}
      />

      {/* Prompt Preview Panel (Phase 1-c Step 2) */}
      <PromptPreviewPanel
        isOpen={showPromptPreview}
        onClose={closePromptPreview}
        nodeId={promptPreviewNodeId}
      />

      {/* Source Trace Panel (Phase 1-d) */}
      {showSourceTrace &&
        traceHistoryId &&
        traceNodeInfo &&
        typeof document !== "undefined" && (
          <SourceTracePanel
            isOpen={showSourceTrace}
            onClose={() => {
              setShowSourceTrace(false);
              setTraceHistoryId(null);
              setTraceNodeInfo(null);
            }}
            historyId={traceHistoryId}
            nodeId={traceNodeInfo.nodeId}
            nodeTitle={traceNodeInfo.nodeTitle}
            onNavigate={setTraceHistoryId}
          />
        )}

      {/* Floating Chat Reopen Button */}
      {!chatOpen && (
        <button
          onClick={() => setChatOpen(true)}
          className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full border px-4 py-3 text-sm font-medium shadow-2xl transition-all hover:-translate-y-0.5 hover:bg-white/10"
          style={{
            backgroundColor: "rgba(20,20,24,0.92)",
            borderColor: DESIGN_TOKENS.border,
            color: DESIGN_TOKENS.text,
            backdropFilter: "blur(20px)",
            boxShadow: "0 18px 50px rgba(0,0,0,0.35)",
          }}
          title="打开星轨Ai"
        >
          <MessageCircle
            size={16}
            strokeWidth={1.7}
            style={{ color: DESIGN_TOKENS.accent }}
          />
          <span>打开星轨Ai</span>
        </button>
      )}


      {/* 多节点批量操作面板 */}
      <BatchActionPanel
        isVisible={selectionCount > 1}
        selectedCount={selectionCount}
        selectedKinds={[]}
        nodeIds={[]}
        onAction={(action) => {
          const selectedIds = nodes.filter(n => n.selected).map(n => n.id)
          if (selectedIds.length < 2) return
          switch (action) {
            case "delete-selected":
              setNodes((nds) => nds.filter((n) => !n.selected))
              setEdges((eds) => eds.filter((e) => {
                const ns = nodes.filter(n => n.selected)
                return !ns.some(n => n.id === e.source || n.id === e.target)
              }))
              break
            case "duplicate-selected": {
              const offset = { x: 60, y: 60 }
              const selNodes = nodes.filter(n => n.selected)
              const idMap = new Map(selNodes.map(n => [n.id, `${n.id}_dup_${Date.now()}_${Math.random().toString(36).slice(2,6)}`]))
              const newNodes = selNodes.map(n => ({
                ...structuredClone(n),
                id: idMap.get(n.id)!,
                selected: false,
                position: { x: n.position.x + offset.x, y: n.position.y + offset.y }
              }))
              setNodes((nds) => nds.map(n => ({ ...n, selected: false })).concat(newNodes))
              break
            }
            case "generate-all-images":
            case "generate-all-videos":
              selectedIds.forEach((id) => workflowRunner.runNode(id))
              break
          }
        }}
        onClear={() => {
          // Deselect all nodes
          (document.querySelector('.react-flow__pane') as HTMLElement)?.click()
        }}
      />

      {/* Chat Panel */}
      <ChatPanel
        isOpen={chatOpen}
        onClose={() => setChatOpen(false)}
        selectedNodeId={selectedNodeId}
        selectedNode={selectedNode}
        canvasNodes={nodes}
        assets={assetLibrary.assets}
        onAddImageToCanvas={handleAddImageFromChat}
        onApplyChatActions={applyChatActions}
        showHistoryFromOutside={showHistory}
        onHistoryPanelClosed={() => setShowHistory(false)}
        agentMode={agentMode}
        onAgentModeChange={setAgentMode}
      />
    </div>
    </>
  );
}
// StarCanvasInner closes here
// StarCanvas (outer) closes via ReactFlowProvider wrapping
