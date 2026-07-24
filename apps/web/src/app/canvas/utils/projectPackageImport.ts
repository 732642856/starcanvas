import type { Edge, Node, Viewport } from "@xyflow/react";
import type { CanvasNodeData } from "../components/canvas/types";
import { sanitizeNodesForPersistence } from "../../../lib/storage/sanitizePersistedCanvas.ts";

export const PROJECT_PACKAGE_SCHEMA = "startrails-project-package/v1";

export type ProjectPackageCanvasImport = {
  projectName?: string;
  nodes: Node<CanvasNodeData>[];
  edges: Edge[];
  viewport: Viewport | null;
  warnings: string[];
  assets: Array<{ id: string; dataUrl: string }>;
};

type UnknownRecord = Record<string, unknown>;

function collectPackageAssets(payload: UnknownRecord): Array<{ id: string; dataUrl: string }> {
  const assets = Array.isArray(payload.assets) ? payload.assets : [];
  const collected: Array<{ id: string; dataUrl: string }> = [];
  for (const asset of assets) {
    if (!isRecord(asset)) continue;
    if (typeof asset.id !== "string" || typeof asset.dataUrl !== "string") continue;
    if (!/^data:(image|video|audio)\//.test(asset.dataUrl)) continue;
    collected.push({ id: asset.id, dataUrl: asset.dataUrl });
  }
  return collected;
}

function restoreNodeAssetUrls(node: Node<CanvasNodeData>, assets: Map<string, string>): Node<CanvasNodeData> {
  if (assets.size === 0) return node;
  const data = { ...(node.data || {}) } as CanvasNodeData & {
    audioUrl?: string;
    audioAssetId?: string;
    generatedImageUrl?: string;
  };
  const assetUrl = typeof data.assetId === "string" ? assets.get(data.assetId) : undefined;
  if (assetUrl) {
    data.imageUrl = assetUrl;
    data.assetUrl = assetUrl;
    data.resultUrl = assetUrl;
    data.generatedImageUrl = assetUrl;
    data.persistence = "indexeddb";
    delete data.loadError;
  }
  if (data.audioAssetId) {
    const audioUrl = assets.get(data.audioAssetId);
    if (audioUrl) data.audioUrl = audioUrl;
  }
  if (data.shot?.generatedImageAssetId) {
    const generatedImageUrl = assets.get(data.shot.generatedImageAssetId);
    if (generatedImageUrl) {
      data.shot = { ...data.shot, generatedImageUrl };
    }
  }
  if (data.shot?.voiceAudioAssetId) {
    const voiceAudioUrl = assets.get(data.shot.voiceAudioAssetId);
    if (voiceAudioUrl) {
      data.shot = { ...data.shot, voiceAudioUrl };
    }
  }
  return { ...node, data };
}

export function isProjectPackageJsonFile(file: Pick<File, "name" | "type">): boolean {
  const name = file.name.trim().toLowerCase();
  return name.endsWith(".json") || file.type === "application/json";
}

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isFinitePosition(value: unknown): value is { x: number; y: number } {
  return (
    isRecord(value) &&
    typeof value.x === "number" &&
    Number.isFinite(value.x) &&
    typeof value.y === "number" &&
    Number.isFinite(value.y)
  );
}

function coerceViewport(value: unknown): Viewport | null {
  if (
    isRecord(value) &&
    typeof value.x === "number" &&
    Number.isFinite(value.x) &&
    typeof value.y === "number" &&
    Number.isFinite(value.y) &&
    typeof value.zoom === "number" &&
    Number.isFinite(value.zoom) &&
    value.zoom > 0
  ) {
    return { x: value.x, y: value.y, zoom: value.zoom };
  }
  return null;
}

function recoverNodePosition(index: number): { x: number; y: number } {
  return {
    x: 120 + (index % 3) * 460,
    y: 120 + Math.floor(index / 3) * 360,
  };
}

function coerceNode(rawNode: unknown, index: number, warnings: string[]): Node<CanvasNodeData> | null {
  if (!isRecord(rawNode)) {
    warnings.push(`第 ${index + 1} 个节点不是对象，已跳过。`);
    return null;
  }

  const id = typeof rawNode.id === "string" && rawNode.id.trim() ? rawNode.id : "";
  if (!id) {
    warnings.push(`第 ${index + 1} 个节点缺少 id，已跳过。`);
    return null;
  }

  const data = isRecord(rawNode.data) ? (rawNode.data as CanvasNodeData) : ({} as CanvasNodeData);
  const rawPosition = rawNode.position;
  const hasValidPosition = isFinitePosition(rawPosition);
  const position = hasValidPosition ? rawPosition : recoverNodePosition(index);
  if (!hasValidPosition) {
    warnings.push(`节点 ${id} 位置无效，已恢复到可见画布区域。`);
  }

  return {
    id,
    type: typeof rawNode.type === "string" && rawNode.type.trim() ? rawNode.type : "workflow",
    position,
    data,
    hidden: rawNode.hidden === true ? false : undefined,
  };
}

function coerceEdges(rawEdges: unknown, validNodeIds: Set<string>, warnings: string[]): Edge[] {
  if (!Array.isArray(rawEdges)) return [];

  const edges: Edge[] = [];
  rawEdges.forEach((rawEdge, index) => {
    if (!isRecord(rawEdge)) {
      warnings.push(`第 ${index + 1} 条连线不是对象，已跳过。`);
      return;
    }

    const source = typeof rawEdge.source === "string" ? rawEdge.source : "";
    const target = typeof rawEdge.target === "string" ? rawEdge.target : "";
    if (!validNodeIds.has(source) || !validNodeIds.has(target)) {
      warnings.push(`连线 ${String(rawEdge.id || index + 1)} 指向不存在的节点，已跳过。`);
      return;
    }

    edges.push({
      id:
        typeof rawEdge.id === "string" && rawEdge.id.trim()
          ? rawEdge.id
          : `imported-edge-${source}-${target}-${index}`,
      source,
      target,
      sourceHandle: typeof rawEdge.sourceHandle === "string" ? rawEdge.sourceHandle : null,
      targetHandle: typeof rawEdge.targetHandle === "string" ? rawEdge.targetHandle : null,
      type: typeof rawEdge.type === "string" ? rawEdge.type : undefined,
      animated: rawEdge.animated === true,
    });
  });

  return edges;
}

export function importProjectPackageToCanvas(payload: unknown): ProjectPackageCanvasImport {
  if (!isRecord(payload) || payload.schema !== PROJECT_PACKAGE_SCHEMA || !isRecord(payload.canvas)) {
    throw new Error("不是有效的星轨项目包。");
  }

  const warnings: string[] = [];
  const assets = collectPackageAssets(payload);
  const assetMap = new Map(assets.map((asset) => [asset.id, asset.dataUrl]));
  const rawNodes = Array.isArray(payload.canvas.nodes) ? payload.canvas.nodes : [];
  const nodes = rawNodes
    .map((rawNode, index) => coerceNode(rawNode, index, warnings))
    .filter((node): node is Node<CanvasNodeData> => Boolean(node));

  const sanitizedNodes = sanitizeNodesForPersistence(nodes).map((node) => restoreNodeAssetUrls(node, assetMap));
  const validNodeIds = new Set(sanitizedNodes.map((node) => node.id));
  const edges = coerceEdges(payload.canvas.edges, validNodeIds, warnings);

  return {
    projectName: typeof payload.projectName === "string" ? payload.projectName : undefined,
    nodes: sanitizedNodes,
    edges,
    viewport: coerceViewport(payload.canvas.viewport),
    warnings,
    assets,
  };
}
