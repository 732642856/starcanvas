// ============================================================================
// useCanvasPersistence — supermemory + IndexedDB canvas persistence
// Node structure (no image data) → supermemory IndexedDB adapter
// Legacy localStorage payloads are migrated on first restore
// Image blobs → IndexedDB (via localImageStore)
// ============================================================================
"use client";

import supermemory from "@/lib/memory/supermemory";
import { useCallback, useEffect, useMemo, useRef } from "react";
import type { Node, Edge, Viewport } from "@xyflow/react";
import type { CanvasNodeData } from "../components/canvas/types";
import {
  hydrateImageAsset,
  persistImageDataUrl,
} from "@/lib/assets/localImageStore";
import {
  findRuntimeUrlLeaks,
  sanitizeNodesForPersistence,
} from "@/lib/storage/sanitizePersistedCanvas";

const DEFAULT_STORAGE_KEY = "startrails_canvas";

/**
 * Get the storage key for a given projectId.
 * rc.2b: project-level canvas isolation.
 *
 * Behavioral contract:
 * - undefined / "" / whitespace-only → DEFAULT_STORAGE_KEY (backward-compatible)
 * - "proj_abc"                    → "startrails_canvas_p:proj_abc"
 * - "proj a/b"                    → encoded to "startrails_canvas_p:proj%20a%2Fb"
 *
 * Never generates a random key — every call with the same projectId returns the same key.
 */
export function getCanvasStorageKey(projectId?: string): string {
  const normalized = projectId?.trim();
  if (!normalized) return DEFAULT_STORAGE_KEY;
  return `startrails_canvas_p:${encodeURIComponent(normalized)}`;
}
const MAX_SIZE_BYTES = 50 * 1024 * 1024; // 50MB — IndexedDB 原生大容量
const DEBOUNCE_MS = 400;
const EMPTY_CANVAS_SAVE_GRACE_MS = 1_500;

// Sanitization is centralized in src/lib/storage/sanitizePersistedCanvas.ts so
// nested fields like shot.generatedImageUrl and generation.referenceImage.dataUrl
// cannot leak runtime object URLs or base64 payloads into localStorage.

// ---------------------------------------------------------------------------
// Hydrate image nodes on restore
// Load image blobs from IndexedDB and create objectURLs.
// Migrate old base64 data URLs to IndexedDB.
// ---------------------------------------------------------------------------

async function hydrateImageNodes(
  nodes: Node<CanvasNodeData>[],
): Promise<Node<CanvasNodeData>[]> {
  const hydrated = await Promise.all(
    nodes.map(async (node) => {
      const data = node.data;
      if (!data) return node;

      const clean: CanvasNodeData = { ...data };

      // Remove deprecated marker
      delete clean._imageStripped;

      // --- Case 1: Modern IDB asset (has assetId + persistence = "indexeddb") ---
      if (clean.assetId && clean.persistence === "indexeddb") {
        const objectUrl = await hydrateImageAsset(clean.assetId);
        if (objectUrl) {
          clean.imageUrl = objectUrl;
          clean.persistence = "indexeddb";
          delete clean.loadError;
        } else {
          // Asset not found in IDB (manually deleted or corrupted)
          clean.imageUrl = undefined;
          clean.persistence = "missing";
          clean.loadError = "asset-not-found";
        }
        return { ...node, data: clean };
      }

      // --- Case 2: Remote URL (persistence = "remote" or imageUrl is http/https) ---
      if (
        clean.persistence === "remote" ||
        (clean.imageUrl && clean.imageUrl.startsWith("http"))
      ) {
        clean.persistence = "remote";
        return { ...node, data: clean };
      }

      // --- Case 3: Old base64 data URL (migration) ---
      // If imageUrl still contains base64, it's pre-IDB data that was somehow
      // persisted (rare, but handle gracefully)
      const imageUrl = clean.imageUrl;
      if (
        imageUrl &&
        typeof imageUrl === "string" &&
        imageUrl.startsWith("data:image")
      ) {
        try {
          const { assetId, objectUrl } = await persistImageDataUrl(imageUrl, {
            fileName: clean.fileName,
            width: clean.imageWidth,
            height: clean.imageHeight,
          });
          clean.assetId = assetId;
          clean.imageUrl = objectUrl;
          clean.persistence = "indexeddb";
          clean.source = clean.source ?? "upload";
          console.log(
            `[CanvasPersistence] Migrated base64 image to IndexedDB: ${assetId.slice(0, 8)}`,
          );
        } catch (err) {
          console.error(
            "[CanvasPersistence] Failed to migrate base64 image:",
            err,
          );
          clean.imageUrl = undefined;
          clean.persistence = "missing";
          clean.loadError = "migration-failed";
        }
        return { ...node, data: clean };
      }

      // --- Case 4: No imageUrl or empty — check if it was stripped (old flow) ---
      // Old data may have no imageUrl but had _imageStripped or is an image node type
      if (!clean.imageUrl && !clean.assetId) {
        const nodeType = node.type;
        const nodeKind = clean.nodeKind;
        const isImageNode =
          nodeType === "image" ||
          nodeKind === "uploaded-image" ||
          nodeKind === "ai-generated-image";

        if (isImageNode) {
          clean.persistence = "missing";
          clean.loadError = "asset-not-found";
        }
        return { ...node, data: clean };
      }

      return { ...node, data: clean };
    }),
  );

  return hydrated;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PersistedCanvas {
  version: 2;
  savedAt: number;
  nodes: Node<CanvasNodeData>[];
  edges: Edge[];
  viewport: Viewport | null;
}

interface UseCanvasPersistenceOptions {
  /** rc.2b: isolate canvas data per project. undefined / "" = default canvas */
  projectId?: string;
  /** Whether canvas restore has been attempted (prevents overwrite by initial mount) */
  isRestored: boolean;
  onRestored: () => void;
  nodes: Node<CanvasNodeData>[];
  edges: Edge[];
  setNodes: (
    nodes:
      | Node<CanvasNodeData>[]
      | ((nds: Node<CanvasNodeData>[]) => Node<CanvasNodeData>[]),
  ) => void;
  setEdges: (edges: Edge[] | ((eds: Edge[]) => Edge[])) => void;
  /** Current viewport (for save) */
  viewport?: Viewport;
  /** Used to set the initial viewport after restore */
  setViewport?: (viewport: Viewport) => void;
  setFitViewOnce: (value: boolean) => void;
}

function isStoryboardProcessNode(node: Node<CanvasNodeData>) {
  const data = node.data;
  return Boolean(
    data.role === "storyboard-process" ||
      data.role === "shot-image" ||
      data.isStoryboardProcessNode === true ||
      data.hiddenByStoryboardProcessMode === true ||
      node.type === "shot" ||
      node.type === "storyboardGrid",
  );
}

function recoverHiddenCanvasNodes(nodes: Node<CanvasNodeData>[]) {
  const hasVisibleNode = nodes.some((node) => node.hidden !== true);
  if (hasVisibleNode) return nodes;

  const primaryRecoverableIds = nodes
    .filter((node) => node.hidden === true && !isStoryboardProcessNode(node))
    .map((node) => node.id);
  const fallbackRecoverableIds = nodes
    .filter((node) => node.hidden === true)
    .map((node) => node.id);
  const recoverableIds = new Set(
    primaryRecoverableIds.length > 0 ? primaryRecoverableIds : fallbackRecoverableIds,
  );

  if (recoverableIds.size === 0) return nodes;

  return nodes.map((node) =>
    recoverableIds.has(node.id)
      ? {
          ...node,
          hidden: false,
          data: {
            ...node.data,
            hiddenByStoryboardProcessMode: false,
          },
        }
      : node,
  );
}

function recoverInvalidCanvasPositions(nodes: Node<CanvasNodeData>[]) {
  return nodes.map((node, index) => {
    const hasValidPosition =
      node.position &&
      Number.isFinite(node.position.x) &&
      Number.isFinite(node.position.y);

    if (hasValidPosition) return node;

    return {
      ...node,
      position: {
        x: 120 + (index % 3) * 460,
        y: 120 + Math.floor(index / 3) * 360,
      },
    };
  });
}

function recoverCanvasVisibilityAndLayout(nodes: Node<CanvasNodeData>[]) {
  return recoverInvalidCanvasPositions(recoverHiddenCanvasNodes(nodes));
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Hook that auto-persists nodes+edges to localStorage on change,
 * and restores them (including image hydration from IndexedDB) on mount.
 */
export function useCanvasPersistence({
  projectId,
  isRestored,
  onRestored,
  nodes,
  edges,
  setNodes,
  setEdges,
  viewport: currentViewport,
  setViewport,
  setFitViewOnce,
}: UseCanvasPersistenceOptions) {
  // rc.2b: dynamic storage key for per-project canvas isolation
  const storageKey = useMemo(() => getCanvasStorageKey(projectId), [projectId]);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restoredAtRef = useRef<number | null>(null);
  const hasRestoredRef = useRef(false);

  // ==========================================================================
  // RESTORE on mount (async because IndexedDB hydration)
  // ==========================================================================
  useEffect(() => {
    if (isRestored || hasRestoredRef.current || typeof window === "undefined")
      return;

    let cancelled = false;

    (async () => {
      try {
        const saved = await supermemory.get<PersistedCanvas>(storageKey);
        const legacyRaw = window.localStorage.getItem(storageKey);
        const data: PersistedCanvas | null = saved ?? (legacyRaw ? JSON.parse(legacyRaw) : null);
        if (!data) {
          if (!cancelled) onRestored();
          restoredAtRef.current = Date.now();
          hasRestoredRef.current = true;
          return;
        }

        if (
          !data ||
          !data.version ||
          typeof data.version !== "number" ||
          !Array.isArray(data.nodes) ||
          !Array.isArray(data.edges)
        ) {
          console.warn("[CanvasPersistence] Invalid stored data, clearing");
          await supermemory.delete(storageKey);
          if (!cancelled) onRestored();
          restoredAtRef.current = Date.now();
          hasRestoredRef.current = true;
          return;
        }

        // v1 → v2 migration: add viewport field
        const migratedData: PersistedCanvas = {
          version: 2,
          savedAt: data.savedAt,
          nodes: data.nodes,
          edges: data.edges,
          viewport: (data as any).viewport ?? null,
        };

        // Hydrate image nodes from IndexedDB
        const hydratedNodes = recoverCanvasVisibilityAndLayout(
          await hydrateImageNodes(migratedData.nodes),
        );

        if (cancelled) return;

        if (hydratedNodes.length > 0) {
          setNodes(hydratedNodes);
          setEdges(migratedData.edges);
          // Restore viewport if available
          if (migratedData.viewport && setViewport) {
            setViewport(migratedData.viewport);
          } else {
            setFitViewOnce(true);
          }
        }

        if (legacyRaw && !saved) {
          await supermemory.set(storageKey, migratedData, {
            type: "canvas_state",
            title: "Canvas autosave",
          });
          window.localStorage.removeItem(storageKey);
        }

        console.log(
          `[CanvasPersistence] Restored ${hydratedNodes.length} nodes, ${migratedData.edges.length} edges${migratedData.viewport ? ", viewport" : ""} (saved ${new Date(migratedData.savedAt).toLocaleString()})`,
        );
      } catch (err) {
        console.error("[CanvasPersistence] Restore failed:", err);
        // If JSON is corrupted, clear it to prevent repeated failures
        await supermemory.delete(storageKey);
      }

      if (!cancelled) {
        onRestored();
        restoredAtRef.current = Date.now();
        hasRestoredRef.current = true;
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: run only on mount
  }, []);

  // ==========================================================================
  // SAVE on change (debounced)
  // ==========================================================================
  useEffect(() => {
    if (!hasRestoredRef.current) return;

    if (nodes.length === 0 && edges.length === 0) {
      const restoredAt = restoredAtRef.current;
      if (!restoredAt || Date.now() - restoredAt < EMPTY_CANVAS_SAVE_GRACE_MS) {
        return;
      }
    }

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(async () => {
      try {
        const sanitizedNodes = sanitizeNodesForPersistence(nodes);

        // Dev-only health check: warn if any runtime URL survived sanitization.
        if (process.env.NODE_ENV === "development") {
          for (const node of sanitizedNodes) {
            const leaks = findRuntimeUrlLeaks(
              node.data,
              `node:${node.id}.data`,
            );
            if (leaks.length > 0) {
              console.warn(
                `[CanvasPersistence] Runtime URL leak after sanitize: ${leaks.join(", ")}`,
              );
            }
          }
        }

        const payload: PersistedCanvas = {
          version: 2,
          savedAt: Date.now(),
          nodes: sanitizedNodes,
          edges,
          viewport: currentViewport ?? null,
        };

        const json = JSON.stringify(payload);

        if (json.length > MAX_SIZE_BYTES) {
          console.warn(
            `[CanvasPersistence] Canvas data too large (${(json.length / 1024 / 1024).toFixed(2)}MB), skipping save`,
          );
          return;
        }

        await supermemory.set(storageKey, payload, {
          type: "canvas_state",
          title: "Canvas autosave",
        });
      } catch (err) {
        console.error("[CanvasPersistence] Save failed:", err);
      }
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [nodes, edges, storageKey]);

  // ==========================================================================
  // CLEAR persisted canvas
  // ==========================================================================
  const clearPersistedCanvas = useCallback(async () => {
    try {
      await supermemory.delete(storageKey);
    } catch {
      // ignore
    }
  }, [storageKey]);

  return { clearPersistedCanvas };
}

export default useCanvasPersistence;
