// ============================================================================
// Image Node Component - TapNow-inspired Design
// Upload button + image preview + bottom AI generation input bar
// ============================================================================
"use client";

import { memo, useState, useEffect, useCallback, useRef } from "react";
import {
  AlertTriangle,
  Upload,
  Image as ImageIcon,
  ChevronDown,
  ArrowUp,
  Loader2,
  X,
  Sparkles,
  Maximize2,
  Wand2,
} from "lucide-react";
import { Handle, Position, type NodeProps, useReactFlow } from "@xyflow/react";
import { pushUndo } from "../../StarCanvas";
import { DESIGN_TOKENS } from "../../styles/designSystem";
import type { CanvasNodeData, CanvasNodeKind } from "../canvas/types";
import { NodeRunStatusIndicator } from "./NodeRunStatusIndicator";
import {
  persistImageFile,
  persistImageDataUrl,
  getLocalImageAsset,
} from "@/lib/assets/localImageStore";
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
import { getCachedDefaultImageModel } from "@/lib/ai/client";
import { getModelOptions } from "@/lib/ai/imageProviderCapabilities";
import { runReversePromptNodeAction } from "../../utils/reversePromptNodeAction";
import { useCanvasStore } from "../../stores/canvasStore";

// Global registry for hover events
const imageHoverRegistry: Record<
  string,
  {
    onMouseEnter: (nodeId: string, event: MouseEvent) => void;
    onMouseLeave: () => void;
  }
> = {};

export function registerImageHoverHandlers(
  nodeId: string,
  handlers: {
    onMouseEnter: (nodeId: string, event: MouseEvent) => void;
    onMouseLeave: () => void;
  },
) {
  imageHoverRegistry[nodeId] = handlers;
}

export function unregisterImageHoverHandlers(nodeId: string) {
  delete imageHoverRegistry[nodeId];
}

interface ImageNodeProps extends NodeProps {
  data: CanvasNodeData & {
    imageUrl?: string;
    assetUrl?: string;
    fileName?: string;
    fileSize?: number;
    title?: string;
  };
}

// Model options for image generation (dynamically from capabilities)
const IMAGE_MODELS = getModelOptions();

// Aspect ratio options
const ASPECT_RATIOS = [
  // gpt-image-2 via current provider accepts OpenAI-style fixed sizes.
  // 1024x576 / 576x1024 / 1024x768 / 768x1024 currently return upstream 502.
  { value: "16:9", label: "16:9", size: "1792x1024", displaySize: "1792×1024" },
  { value: "1:1", label: "1:1", size: "1024x1024", displaySize: "1024×1024" },
  { value: "9:16", label: "9:16", size: "1024x1792", displaySize: "1024×1792" },
];

export const ImageNode = memo(function ImageNode({
  id,
  data,
  selected,
}: ImageNodeProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [aiInput, setAiInput] = useState(
    typeof data.prompt === "string" ? data.prompt : "",
  );
  const [selectedModel, setSelectedModel] = useState(
    typeof data.model === "string" ? data.model : getCachedDefaultImageModel(),
  );
  const [selectedRatio, setSelectedRatio] = useState("16:9");
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [showRatioDropdown, setShowRatioDropdown] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isReversingPrompt, setIsReversingPrompt] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const aiInputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { setNodes, getNodes, setEdges } = useReactFlow();
  const addAsset = useCanvasStore((state) => state.addAsset);

  const imageUrl = data.imageUrl || data.assetUrl || "";
  const fileName = data.fileName || data.title || "图片";
  const isStoryboardFinalOutput = data.role === "storyboard-final-output" || data.isStoryboardFinalOutput === true;
  const isShotProcessImage = data.role === "shot-image" || data.sourceType === "shot" || data.isStoryboardProcessNode === true;
  const nodeLabel = isStoryboardFinalOutput ? "最终分镜图" : isShotProcessImage ? "镜头过程图" : "Image";
  const headerTitle = isStoryboardFinalOutput ? data.title || "最终分镜图" : isShotProcessImage ? data.title || "镜头过程图" : fileName;
  const canUploadReplacement = !isStoryboardFinalOutput && !isShotProcessImage;
  const displayWidth = data.displayWidth ?? 280;
  const displayHeight = data.displayHeight ?? 200;

  // Cleanup registry on unmount
  useEffect(() => {
    return () => {
      unregisterImageHoverHandlers(id);
    };
  }, [id]);

  const handleImageLoad = () => setIsLoading(false);
  const handleImageError = () => {
    setIsLoading(false);
    setHasError(true);
  };

  const hoverHandlers = imageHoverRegistry[id];
  const handleMouseEnter = useCallback(
    (event: React.MouseEvent) => {
      if (hoverHandlers) hoverHandlers.onMouseEnter(id, event.nativeEvent);
    },
    [hoverHandlers, id],
  );
  const handleMouseLeave = useCallback(
    (event: React.MouseEvent) => {
      if (hoverHandlers) hoverHandlers.onMouseLeave();
    },
    [hoverHandlers],
  );

  // Keep the prompt editable after node reload / generation.
  useEffect(() => {
    if (typeof data.prompt === "string" && data.prompt !== aiInput) {
      setAiInput(data.prompt);
    }
  }, [data.prompt]);

  // Auto-resize textarea
  const autoResize = useCallback((el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }, []);

  useEffect(() => {
    autoResize(aiInputRef.current);
  }, [aiInput, autoResize]);

  // Handle file upload — persist to IndexedDB, use objectURL for display
  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      pushUndo({ nodes: getNodes(), edges: [] }, "image-upload");
      (async () => {
        try {
          const { assetId, objectUrl } = await persistImageFile(file);

          // Read dimensions for metadata
          const dimensions = await new Promise<{
            width: number;
            height: number;
          }>((resolve, reject) => {
            const img = new Image();
            img.onload = () =>
              resolve({ width: img.naturalWidth, height: img.naturalHeight });
            img.onerror = () => reject(new Error("Failed to load image"));
            img.src = objectUrl;
          }).catch(() => ({ width: undefined, height: undefined }));

          setNodes((nds) =>
            nds.map((node) => {
              if (node.id !== id) return node;
              return {
                ...node,
                data: {
                  ...node.data,
                  imageUrl: objectUrl,
                  assetUrl: objectUrl,
                  assetId,
                  fileName: file.name,
                  fileSize: file.size,
                  mimeType: file.type,
                  imageWidth: dimensions.width,
                  imageHeight: dimensions.height,
                  source: "upload" as const,
                  persistence: "indexeddb" as const,
                  loadError: undefined,
                },
              };
            }),
          );
          setIsLoading(true);
          setHasError(false);
        } catch (err) {
          console.error("[ImageNode] Failed to persist uploaded image:", err);
          setAiError("图片上传失败");
        }
      })();
    },
    [id, setNodes],
  );

  // AI Generate Image
  const handleAiGenerate = useCallback(async () => {
    if (!aiInput.trim()) return;

    setIsGenerating(true);
    setAiError(null);

    try {
      const ratio = ASPECT_RATIOS.find((r) => r.value === selectedRatio);
      const size = ratio?.size || "1792x1024";

      const userPrompt = aiInput.trim();
      const requestId = crypto.randomUUID();
      const capability = getImageProviderCapability(selectedModel);
      let referenceImage: Record<string, unknown> | undefined;

      // Build request body — support image-to-image only when a persisted local asset exists.
      // Blob URLs are runtime-only and must never be sent to the server.
      const bodyObj: Record<string, any> = {
        prompt: userPrompt,
        model: selectedModel,
        size,
        requestId,
      };

      if (data.assetId) {
        assertImageToImageSupported(capability);
        const asset = await getLocalImageAsset(data.assetId);
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

        referenceImage = {
          assetId: data.assetId,
          sourceNodeId: id,
          mimeType: prepared.mimeType,
          width: prepared.width,
          height: prepared.height,
          originalByteSize: prepared.originalByteSize,
          sentByteSize: prepared.byteSize,
          compressed: prepared.compressed,
        };
        bodyObj.sourceImage = prepared.dataUrl;
      }

      const generation = createImageGenerationSnapshot({
        requestId,
        mode: bodyObj.sourceImage ? "image-to-image" : "text-to-image",
        userPrompt,
        model: selectedModel,
        size,
        sourceNodeId: id,
        sourceAssetId: data.assetId,
        referenceImage,
      });

      setNodes((nds) =>
        nds.map((node) =>
          node.id === id
            ? {
                ...node,
                data: { ...node.data, prompt: userPrompt, generation },
              }
            : node,
        ),
      );

      const res = await fetch("/api/ai/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyObj),
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

      // Persist AI-generated image (base64 data URL) to IndexedDB
      let displayUrl = result.imageUrl;
      let assetId: string | undefined;

      if (result.imageUrl.startsWith("data:image")) {
        const persisted = await persistImageDataUrl(result.imageUrl, {
          fileName: `generated-${Date.now()}.png`,
        });
        displayUrl = persisted.objectUrl;
        assetId = persisted.assetId;
      }

      const currentNode = getNodes().find((n) => n.id === id);
      if (!currentNode) throw new Error("Node not found");

      const newNode = {
        id: `node-${Date.now()}`,
        type: "image" as const,
        position: {
          x: currentNode.position.x + 380,
          y: currentNode.position.y,
        },
        data: {
          title: `生成: ${userPrompt.slice(0, 20)}${userPrompt.length > 20 ? "..." : ""}`,
          imageUrl: displayUrl,
          assetId,
          nodeKind: "ai-generated-image" as CanvasNodeKind,
          prompt: userPrompt,
          summary: result.prompt,
          generation: {
            ...generation,
            enhancedPrompt: result.prompt,
            model: result.model || selectedModel,
            status: "succeeded" as const,
            completedAt: new Date().toISOString(),
            endpoint: result.endpoint,
            referenceFormat: result.referenceFormat,
          },
          generationOutput: {
            prompt: userPrompt,
            finalPrompt: result.prompt,
            revisedPrompt: result.revisedPrompt,
            model: result.model || selectedModel,
            size,
            sourceImageAssetId: data.assetId,
            referenceImage,
            requestId,
            endpoint: result.endpoint,
            referenceFormat: result.referenceFormat,
          },
          model: result.model || selectedModel,
          sourcePromptId: id,
          source: "generated" as const,
          persistence: assetId ? ("indexeddb" as const) : undefined,
          displayWidth: ratio?.value === "9:16" ? 280 : 320,
          displayHeight:
            ratio?.value === "16:9" ? 180 : ratio?.value === "9:16" ? 498 : 280,
          createdAt: Date.now(),
        },
      };

      setNodes((nds) => [...nds, newNode]);
      setEdges((eds) => [
        ...eds,
        {
          id: `edge-${id}-${newNode.id}`,
          source: id,
          target: newNode.id,
          type: "creative",
          animated: true,
          style: { stroke: DESIGN_TOKENS.nodeEdge, strokeWidth: 1.5 },
        },
      ]);

      setNodes((nds) =>
        nds.map((node) =>
          node.id === id &&
          (node.data.generation as any)?.requestId === requestId
            ? {
                ...node,
                data: {
                  ...node.data,
                  generation: {
                    ...(node.data.generation as Record<string, unknown>),
                    enhancedPrompt: result.prompt,
                    status: "succeeded" as const,
                    completedAt: new Date().toISOString(),
                    endpoint: result.endpoint,
                    referenceFormat: result.referenceFormat,
                  },
                },
              }
            : node,
        ),
      );

      // NOTE: intentionally NOT clearing aiInput so user can tweak & retry
    } catch (err: any) {
      const normalized =
        err?.generationError ||
        normalizeGenerationError({
          error: err,
          provider: getImageProviderCapability(selectedModel).provider,
        });
      console.debug("[ImageNode] generation failed raw:", normalized.raw);
      setNodes((nds) =>
        nds.map((node) => {
          if (node.id !== id) return node;
          const currentGeneration = node.data.generation;
          return {
            ...node,
            data: {
              ...node.data,
              prompt: aiInput.trim() || node.data.prompt,
              generation: currentGeneration
                ? {
                    ...currentGeneration,
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
                : currentGeneration,
            },
          };
        }),
      );
      setAiError(formatGenerationErrorForDisplay(normalized));
    } finally {
      setIsGenerating(false);
    }
  }, [
    aiInput,
    selectedModel,
    selectedRatio,
    id,
    getNodes,
    setNodes,
    setEdges,
    imageUrl,
    data.assetId,
  ]);

  const handleReversePrompt = useCallback(async () => {
    if (!imageUrl) {
      setAiError("请先上传或生成一张图片。");
      return;
    }

    setIsReversingPrompt(true);
    setAiError(null);

    try {
      const result = await runReversePromptNodeAction({
        nodeId: id,
        getNodes,
        setNodes,
        setEdges,
        addAsset,
      });
      setAiInput(result.prompt);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "反推提示词失败");
    } finally {
      setIsReversingPrompt(false);
    }
  }, [addAsset, getNodes, id, imageUrl, setEdges, setNodes]);

  const handleAiInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleAiGenerate();
    }
  };

  const currentModel = IMAGE_MODELS[0];
  const currentRatio =
    ASPECT_RATIOS.find((r) => r.value === selectedRatio) || ASPECT_RATIOS[0];

  return (
    <>
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Connection Handles */}
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-slate-400 !h-2.5 !w-2.5 !rounded-sm !border !border-white/30"
      />
      <Handle
        type="target"
        position={Position.Left}
        className="!bg-slate-400 !h-2.5 !w-2.5 !rounded-sm !border !border-white/30"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!bg-slate-500 !h-2.5 !w-2.5 !rounded-sm !border !border-white/30"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-slate-500 !h-2.5 !w-2.5 !rounded-sm !border !border-white/30"
      />

      {/* Node Content */}
      <div
        className="relative rounded-2xl border transition-all"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        style={{
          width: isStoryboardFinalOutput ? 380 : 340,
          backgroundColor: isStoryboardFinalOutput ? "#f8fafc" : DESIGN_TOKENS.panelSolid,
          borderColor: isStoryboardFinalOutput
            ? selected
              ? "rgba(15, 23, 42, 0.22)"
              : "rgba(15, 23, 42, 0.1)"
            : selected
              ? "rgba(148, 163, 184, 0.4)"
              : "rgba(255, 255, 255, 0.08)",
          boxShadow: selected || isStoryboardFinalOutput ? DESIGN_TOKENS.shadowNode : "none",
        }}
      >
        {/* ===== UPLOAD BUTTON ===== */}
        <div
          className="flex items-center justify-between border-b px-3 py-2"
          style={{
            borderColor: isStoryboardFinalOutput ? "rgba(15, 23, 42, 0.08)" : DESIGN_TOKENS.border,
            backgroundColor: isStoryboardFinalOutput ? "#ffffff" : undefined,
          }}
        >
          {canUploadReplacement ? (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition-all hover:bg-white/5"
              style={{
                borderColor: DESIGN_TOKENS.border,
                color: DESIGN_TOKENS.textSecondary,
              }}
            >
              <Upload size={13} strokeWidth={1.5} />
              <span>上传</span>
            </button>
          ) : (
            <div className="min-w-0">
              <div
                className="truncate text-xs font-medium"
                style={{ color: isStoryboardFinalOutput ? "#0f172a" : DESIGN_TOKENS.textSecondary }}
              >
                {headerTitle}
              </div>
              <div
                className="mt-0.5 text-[10px]"
                style={{ color: isStoryboardFinalOutput ? "#64748b" : DESIGN_TOKENS.textMuted }}
              >
                {isStoryboardFinalOutput ? "一键分镜的最终结果" : "默认隐藏的分镜过程图"}
              </div>
            </div>
          )}
          <div className="flex items-center gap-2">
            <NodeRunStatusIndicator data={data} variant="dot" />
            <div
              className="flex items-center gap-1"
              style={{ color: isStoryboardFinalOutput ? "#64748b" : DESIGN_TOKENS.textMuted }}
            >
              <ImageIcon size={13} strokeWidth={1.5} />
              <span className="text-[11px]">{nodeLabel}</span>
            </div>
          </div>
        </div>

        {/* ===== IMAGE PREVIEW ===== */}
        <div className="p-3">
          <div
            className="relative flex items-center justify-center overflow-hidden rounded-xl bg-black/20"
            style={{
              width: "100%",
              height: isStoryboardFinalOutput ? 214 : 220,
              backgroundColor: isStoryboardFinalOutput ? "#e2e8f0" : "rgba(0,0,0,0.2)",
            }}
          >
            {isLoading && imageUrl && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/20 border-t-white/60" />
              </div>
            )}

            {hasError || data.persistence === "missing" ? (
              <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-white/40">
                <AlertTriangle size={28} strokeWidth={1.5} />
                <span className="text-xs">
                  {data.loadError === "asset-not-found"
                    ? "图片资源丢失"
                    : "图片加载失败"}
                </span>
              </div>
            ) : imageUrl ? (
              <img
                src={imageUrl}
                alt={fileName}
                className={`h-full w-full object-contain transition-opacity ${isLoading ? "opacity-0" : "opacity-100"}`}
                draggable={false}
                onLoad={handleImageLoad}
                onError={handleImageError}
              />
            ) : (
              <div className="flex flex-col items-center justify-center gap-2 text-white/25">
                <ImageIcon size={32} strokeWidth={1} />
                <span className="text-xs">点击上传或输入描述生成</span>
              </div>
            )}
          </div>
        </div>

        {/* ===== AI GENERATION INPUT BAR ===== */}
        <div
          className="border-t px-3 py-2.5"
          style={{ borderColor: DESIGN_TOKENS.border }}
        >
          {/* Input area */}
          <div className="relative">
            <textarea
              ref={aiInputRef}
              value={aiInput}
              onChange={(e) => {
                const nextPrompt = e.target.value;
                setAiInput(nextPrompt);
                setNodes((nds) =>
                  nds.map((node) =>
                    node.id === id
                      ? { ...node, data: { ...node.data, prompt: nextPrompt } }
                      : node,
                  ),
                );
              }}
              onKeyDown={handleAiInputKeyDown}
              onPointerDownCapture={(e) => e.stopPropagation()}
              onMouseDownCapture={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              onDoubleClick={(e) => e.stopPropagation()}
              placeholder={isStoryboardFinalOutput ? "描述你想如何调整这张分镜图..." : "描述任何你想要生成的内容"}
              className="nodrag nopan nowheel w-full resize-none rounded-xl border bg-transparent px-3 py-2.5 pr-10 text-sm focus:outline-none"
              style={{
                borderColor: isStoryboardFinalOutput ? "rgba(15, 23, 42, 0.12)" : DESIGN_TOKENS.border,
                color: isStoryboardFinalOutput ? "#0f172a" : "rgba(255,255,255,0.8)",
                minHeight: "44px",
                maxHeight: "120px",
              }}
              rows={1}
            />
            <button
              className="nodrag nopan absolute right-2 top-2"
              style={{ color: DESIGN_TOKENS.textMuted }}
              onPointerDownCapture={(e) => e.stopPropagation()}
              onMouseDownCapture={(e) => e.stopPropagation()}
            >
              <Maximize2 size={14} strokeWidth={1.5} />
            </button>
          </div>

          {/* Bottom bar: Model + Ratio + Send */}
          <div className="mt-2 flex items-center justify-between" style={{ justifyContent: isStoryboardFinalOutput ? "flex-end" : undefined }}>
            {/* Left: Model + Ratio */}
            <div className="flex items-center gap-2" style={{ display: isStoryboardFinalOutput ? "none" : undefined }}>
              {/* Model selector */}
              <div className="relative">
                <button
                  onClick={() => {
                    setShowModelDropdown(!showModelDropdown);
                    setShowRatioDropdown(false);
                  }}
                  className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs transition-colors hover:bg-white/5"
                  style={{ color: DESIGN_TOKENS.textSecondary }}
                >
                  <Sparkles size={12} strokeWidth={1.5} />
                  <span>{currentModel.label}</span>
                  <ChevronDown size={12} strokeWidth={1.5} />
                </button>
                {showModelDropdown && (
                  <div
                    className="absolute bottom-full left-0 mb-1 w-44 rounded-xl border py-1"
                    style={{
                      backgroundColor: DESIGN_TOKENS.panelSolid,
                      borderColor: DESIGN_TOKENS.border,
                      boxShadow: DESIGN_TOKENS.shadowMenu,
                    }}
                  >
                    {IMAGE_MODELS.map((model) => (
                      <button
                        key={model.value}
                        onClick={() => {
                          setSelectedModel(model.value);
                          setShowModelDropdown(false);
                        }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-white/5"
                        style={{
                          color:
                            selectedModel === model.value
                              ? DESIGN_TOKENS.accentHover
                              : DESIGN_TOKENS.textSecondary,
                        }}
                      >
                        <Sparkles size={12} strokeWidth={1.5} />
                        <div>
                          <div className="font-medium">{model.label}</div>
                          <div
                            className="text-[10px]"
                            style={{ color: DESIGN_TOKENS.textMuted }}
                          >
                            {model.desc}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Ratio selector */}
              <div className="relative">
                <button
                  onClick={() => {
                    setShowRatioDropdown(!showRatioDropdown);
                    setShowModelDropdown(false);
                  }}
                  className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs transition-colors hover:bg-white/5"
                  style={{ color: DESIGN_TOKENS.textSecondary }}
                >
                  <span className="text-[10px]">{currentRatio.label}</span>
                  <span
                    className="text-[10px]"
                    style={{ color: DESIGN_TOKENS.textMuted }}
                  >
                    · {currentRatio.displaySize}
                  </span>
                  <ChevronDown size={12} strokeWidth={1.5} />
                </button>
                {showRatioDropdown && (
                  <div
                    className="absolute bottom-full left-0 mb-1 rounded-xl border py-1"
                    style={{
                      backgroundColor: DESIGN_TOKENS.panelSolid,
                      borderColor: DESIGN_TOKENS.border,
                      boxShadow: DESIGN_TOKENS.shadowMenu,
                    }}
                  >
                    {ASPECT_RATIOS.map((ratio) => (
                      <button
                        key={ratio.value}
                        onClick={() => {
                          setSelectedRatio(ratio.value);
                          setShowRatioDropdown(false);
                        }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-white/5"
                        style={{
                          color:
                            selectedRatio === ratio.value
                              ? DESIGN_TOKENS.accentHover
                              : DESIGN_TOKENS.textSecondary,
                        }}
                      >
                        <span className="font-medium">{ratio.label}</span>
                        <span
                          className="text-[10px]"
                          style={{ color: DESIGN_TOKENS.textMuted }}
                        >
                          {ratio.displaySize}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Right: Send */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                title="反推提示词"
                aria-label="反推提示词"
                data-testid="image-node-reverse-prompt"
                onClick={handleReversePrompt}
                disabled={isReversingPrompt || !imageUrl}
                className="nodrag nopan flex h-7 w-7 items-center justify-center rounded-full transition-all disabled:cursor-not-allowed disabled:opacity-30"
                style={{
                  backgroundColor: imageUrl
                    ? "rgba(148, 163, 184, 0.16)"
                    : "rgba(255,255,255,0.08)",
                  color: DESIGN_TOKENS.textSecondary,
                }}
              >
                {isReversingPrompt ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Wand2 size={14} strokeWidth={1.7} />
                )}
              </button>
              <button
                onClick={handleAiGenerate}
                disabled={isGenerating || !aiInput.trim()}
                className="ml-1 flex h-7 w-7 items-center justify-center rounded-full transition-all disabled:opacity-30"
                style={{
                  backgroundColor: aiInput.trim()
                    ? DESIGN_TOKENS.accent
                    : isStoryboardFinalOutput
                      ? "rgba(15, 23, 42, 0.12)"
                      : "rgba(255,255,255,0.1)",
                }}
              >
                {isGenerating ? (
                  <Loader2 size={14} className="animate-spin text-white/70" />
                ) : (
                  <ArrowUp
                    size={14}
                    strokeWidth={2}
                    className="text-white/80"
                  />
                )}
              </button>
            </div>
          </div>

          {/* Error */}
          {aiError && (
            <div
              className="mt-2 flex items-center justify-between rounded-lg px-2 py-1.5"
              style={{ backgroundColor: "rgba(239,68,68,0.1)" }}
            >
              <div className="flex-1 min-w-0 mr-2">
                <span className="text-[11px] text-red-300/70 block truncate">{aiError}</span>
                {/* Retry count display */}
                {(data._retryCount ?? 0) > 0 && (
                  <span className="text-[10px] text-red-400/50 block mt-0.5">
                    已重试 {data._retryCount} 次
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => handleAiGenerate()}
                  className="text-[10px] px-2 py-0.5 rounded bg-red-500/20 text-red-300 hover:bg-red-500/40 transition-colors"
                >
                  🔄 重试
                </button>
                <button
                  onClick={() => setAiError(null)}
                  className="text-[11px] text-white/40 hover:text-white/60"
                >
                  <X size={12} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
});

export default ImageNode;
