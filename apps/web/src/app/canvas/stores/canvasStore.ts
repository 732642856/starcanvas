// ============================================================================
// Canvas Store - Zustand state management for the canvas
// ============================================================================
import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { getItem, setItem } from '../utils/canvasIndexedDB'
import type { Node, Viewport } from '@xyflow/react'
import type { ApplyActionsReport, ChatCanvasAction } from '../features/canvas/actions/chatActions'
import type {
  CanvasNodeKind,
  ChatMode,
  RightPanelMode,
  ContextMenuState,
  FloatingToolbarState,
  AssetFolder,
  AssetType,
  AssetItem,
  AssetLibraryState,
  CharacterBibleData,
  SceneBibleData,
  VisualStyleBibleData,
} from '../components/canvas/types'
import {
  getPersistedFlag,
  setPersistedFlag,
  persistStorageWrapper,
  clearPersistedState,
} from '../../../lib/localStoragePersist.ts'

// Re-export types for backward compatibility
export type { CanvasNodeKind, ChatMode, RightPanelMode, ContextMenuState, FloatingToolbarState, AssetFolder, AssetType, AssetItem, AssetLibraryState }

// Default viewport settings
export const DEFAULT_VIEWPORT: Viewport = {
  x: 0,
  y: 0,
  zoom: 0.55,
}

export const VIEWPORT_CONSTRAINTS = {
  minZoom: 0.25,
  maxZoom: 2,
  fitViewPadding: 0.3,
}

const ASSETS_STORAGE_KEY = 'startrails_assets'
const AI_AUTO_RUN_KEY = 'startrails_ai_auto_run'
const CANVAS_STORAGE_KEY = 'startrails_canvas'

export type PreviewDraftNodeState = 'pending' | 'confirmed' | 'discarded'
export type PreviewTransactionPhase = 'preview' | 'deferred_applied' | 'cancelled'

export type PreviewTransaction = {
  id: string
  conversationId?: string
  expectedDraftCount?: number
  draftNodes: Record<string, PreviewDraftNodeState>
  deferredActions: ChatCanvasAction[]
  previewReport?: ApplyActionsReport
  commitReport?: ApplyActionsReport
  phase: PreviewTransactionPhase
  createdAt: number
}

interface CanvasStore {
  // Viewport
  viewport: Viewport
  setViewport: (viewport: Viewport) => void
  fitViewOnce: boolean
  setFitViewOnce: (value: boolean) => void

  // Selection
  selectedNodeId: string | null
  setSelectedNodeId: (id: string | null) => void

  // Context Menu
  contextMenu: ContextMenuState
  setContextMenu: (state: ContextMenuState) => void
  closeContextMenu: () => void

  // Floating Toolbar
  floatingToolbar: FloatingToolbarState
  setFloatingToolbar: (state: FloatingToolbarState) => void
  closeFloatingToolbar: () => void

  // Asset Library
  assetLibrary: AssetLibraryState
  openAssetLibrary: () => void
  closeAssetLibrary: () => void
  setAssetLibraryQuery: (query: string) => void
  setAssetLibraryFolder: (folder: AssetFolder | undefined) => void
  addAsset: (asset: AssetItem) => void
  removeAsset: (id: string) => void
  toggleAssetFavorite: (id: string) => void

  // Clipboard
  clipboardNode: Node | null
  setClipboardNode: (node: Node | null) => void

  // Image Preview
  previewImageNodeId: string | null
  setPreviewImageNodeId: (id: string | null) => void

  // Crop Dialog
  cropImageNodeId: string | null
  setCropImageNodeId: (id: string | null) => void

  // Empty state hint
  showCanvasHint: boolean
  dismissCanvasHint: () => void

  // Canvas persistence
  isCanvasRestored: boolean
  setIsCanvasRestored: (value: boolean) => void
  clearPersistedCanvas: () => void

  // Prompt Preview panel
  showPromptPreview: boolean
  promptPreviewNodeId: string | null
  openPromptPreview: (nodeId: string) => void
  closePromptPreview: () => void

  // AI auto-run safety
  allowAIAutoRun: boolean
  setAllowAIAutoRun: (value: boolean) => void

  previewTransactions: Record<string, PreviewTransaction>
  stagePreviewTransaction: (params: {
    txId: string
    conversationId?: string
    expectedDraftCount?: number
    deferredActions: ChatCanvasAction[]
  }) => void
  recordPreviewPass: (params: {
    txId: string
    previewReport?: ApplyActionsReport
  }) => void
  settlePreviewDraftNode: (params: {
    txId: string
    nodeId: string
    disposition: 'confirm' | 'discard'
  }) => void
  commitPreviewTransaction: (params: {
    txId: string
    report: ApplyActionsReport
  }) => void
  cancelPreviewTransaction: (txId: string) => void
  clearPreviewTransaction: (txId: string) => void

  // === Bible System ===
  bibleCharacters: CharacterBibleData[]
  selectedBibleCharacterId: string | null
  biblePanelOpen: boolean
  openBiblePanel: () => void
  closeBiblePanel: () => void
  addBibleCharacter: (character: CharacterBibleData) => void
  updateBibleCharacter: (id: string, data: Partial<CharacterBibleData>) => void
  removeBibleCharacter: (id: string) => void
  selectBibleCharacter: (id: string | null) => void

  bibleScenes: SceneBibleData[]
  sceneBiblePanelOpen: boolean
  openSceneBiblePanel: () => void
  closeSceneBiblePanel: () => void
  addBibleScene: (scene: SceneBibleData) => void
  updateBibleScene: (id: string, data: Partial<SceneBibleData>) => void
  removeBibleScene: (id: string) => void

  bibleStyles: VisualStyleBibleData[]
  styleBiblePanelOpen: boolean
  openStyleBiblePanel: () => void
  closeStyleBiblePanel: () => void
  addBibleStyle: (style: VisualStyleBibleData) => void
  updateBibleStyle: (id: string, data: Partial<VisualStyleBibleData>) => void
  removeBibleStyle: (id: string) => void
}

// Shared helper for persisting asset library
function persistAssets(assets: AssetItem[]): void {
  persistStorageWrapper({ key: ASSETS_STORAGE_KEY, version: 1 }, { assets })
}

function loadAssets(): AssetItem[] {
  try {
    if (typeof window === 'undefined') return []
    const raw = localStorage.getItem(ASSETS_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)

    // Backward compatibility: older builds wrote the raw array directly.
    if (Array.isArray(parsed)) return parsed

    if (parsed?.version === 1 && Array.isArray(parsed.assets)) {
      return parsed.assets
    }

    return []
  } catch {
    return []
  }
}

// Initial asset state — load once at module level
const initialAllowAIAutoRun = getPersistedFlag(AI_AUTO_RUN_KEY, 'false') === 'true'

export const useCanvasStore = create<CanvasStore>()(
  devtools(
    (set) => ({
      // Viewport
      viewport: DEFAULT_VIEWPORT,
      setViewport: (viewport) => set({ viewport }, false, 'setViewport'),
      fitViewOnce: true,
      setFitViewOnce: (value) => set({ fitViewOnce: value }, false, 'setFitViewOnce'),

      // Selection
      selectedNodeId: null,
      setSelectedNodeId: (id) => set({ selectedNodeId: id }, false, 'setSelectedNodeId'),

      // Context Menu
      contextMenu: null,
      setContextMenu: (state) => set({ contextMenu: state }, false, 'setContextMenu'),
      closeContextMenu: () => set({ contextMenu: null }, false, 'closeContextMenu'),

      // Floating Toolbar
      floatingToolbar: null,
      setFloatingToolbar: (state) => set({ floatingToolbar: state }, false, 'setFloatingToolbar'),
      closeFloatingToolbar: () => set({ floatingToolbar: null }, false, 'closeFloatingToolbar'),

      // Asset Library
      assetLibrary: {
        isOpen: false,
        scope: 'personal',
        query: '',
        assets: loadAssets(),
      },
      openAssetLibrary: () => set((state) => ({
        assetLibrary: { ...state.assetLibrary, isOpen: true }
      }), false, 'openAssetLibrary'),
      closeAssetLibrary: () => set((state) => ({
        assetLibrary: { ...state.assetLibrary, isOpen: false }
      }), false, 'closeAssetLibrary'),
      setAssetLibraryQuery: (query) => set((state) => ({
        assetLibrary: { ...state.assetLibrary, query }
      }), false, 'setAssetLibraryQuery'),
      setAssetLibraryFolder: (folder) => set((state) => ({
        assetLibrary: { ...state.assetLibrary, selectedFolder: folder }
      }), false, 'setAssetLibraryFolder'),
      addAsset: (asset) => set((state) => {
        const newAssets = [...state.assetLibrary.assets, asset]
        persistAssets(newAssets)
        return { assetLibrary: { ...state.assetLibrary, assets: newAssets } }
      }, false, 'addAsset'),
      removeAsset: (id) => set((state) => {
        const newAssets = state.assetLibrary.assets.filter((a) => a.id !== id)
        persistAssets(newAssets)
        return { assetLibrary: { ...state.assetLibrary, assets: newAssets } }
      }, false, 'removeAsset'),
      toggleAssetFavorite: (id) => set((state) => {
        const newAssets = state.assetLibrary.assets.map((a) =>
          a.id === id ? { ...a, favorite: !a.favorite } : a
        )
        persistAssets(newAssets)
        return { assetLibrary: { ...state.assetLibrary, assets: newAssets } }
      }, false, 'toggleAssetFavorite'),

      // Clipboard
      clipboardNode: null,
      setClipboardNode: (node) => set({ clipboardNode: node }, false, 'setClipboardNode'),

      // Image Preview
      previewImageNodeId: null,
      setPreviewImageNodeId: (id) => set({ previewImageNodeId: id }, false, 'setPreviewImageNodeId'),

      // Crop Dialog
      cropImageNodeId: null,
      setCropImageNodeId: (id) => set({ cropImageNodeId: id }, false, 'setCropImageNodeId'),

      // Empty state hint
      showCanvasHint: true,
      dismissCanvasHint: () => set({ showCanvasHint: false }, false, 'dismissCanvasHint'),

      // Canvas persistence
      isCanvasRestored: false,
      setIsCanvasRestored: (value) => set({ isCanvasRestored: value }, false, 'setIsCanvasRestored'),
      clearPersistedCanvas: () => {
        clearPersistedState(CANVAS_STORAGE_KEY)
      },

      // Prompt Preview panel
      showPromptPreview: false,
      promptPreviewNodeId: null,
      openPromptPreview: (nodeId) => set(
        { showPromptPreview: true, promptPreviewNodeId: nodeId },
        false,
        'openPromptPreview',
      ),
      closePromptPreview: () => set(
        { showPromptPreview: false, promptPreviewNodeId: null },
        false,
        'closePromptPreview',
      ),

      // AI auto-run safety (default: require manual confirmation)
      allowAIAutoRun: initialAllowAIAutoRun,
      setAllowAIAutoRun: (value) => {
        setPersistedFlag(AI_AUTO_RUN_KEY, String(value))
        set({ allowAIAutoRun: value }, false, 'setAllowAIAutoRun')
      },

      previewTransactions: {},
      stagePreviewTransaction: ({ txId, conversationId, expectedDraftCount, deferredActions }) =>
        set((state) => ({
          previewTransactions: {
            ...state.previewTransactions,
            [txId]: {
              id: txId,
              conversationId,
              expectedDraftCount:
                expectedDraftCount ?? state.previewTransactions[txId]?.expectedDraftCount,
              draftNodes: state.previewTransactions[txId]?.draftNodes ?? {},
              deferredActions,
              previewReport: state.previewTransactions[txId]?.previewReport,
              commitReport: state.previewTransactions[txId]?.commitReport,
              phase: state.previewTransactions[txId]?.phase ?? 'preview',
              createdAt: state.previewTransactions[txId]?.createdAt ?? Date.now(),
            },
          },
        }), false, 'stagePreviewTransaction'),
      recordPreviewPass: ({ txId, previewReport }) =>
        set((state) => {
          const existing = state.previewTransactions[txId]
          const draftNodeIds = previewReport?.results
            .filter((result) => result.action === 'create_node' && result.status === 'applied' && result.nodeId)
            .map((result) => result.nodeId as string) ?? []
          const draftNodes = { ...(existing?.draftNodes ?? {}) }
          for (const nodeId of draftNodeIds) {
            draftNodes[nodeId] = draftNodes[nodeId] ?? 'pending'
          }
          return {
            previewTransactions: {
              ...state.previewTransactions,
              [txId]: {
                id: txId,
                conversationId: existing?.conversationId,
                draftNodes,
                deferredActions: existing?.deferredActions ?? [],
                previewReport,
                commitReport: existing?.commitReport,
                phase: existing?.phase ?? 'preview',
                createdAt: existing?.createdAt ?? Date.now(),
              },
            },
          }
        }, false, 'recordPreviewPass'),
      settlePreviewDraftNode: ({ txId, nodeId, disposition }) =>
        set((state) => {
          const existing = state.previewTransactions[txId]
          if (!existing) return state
          return {
            previewTransactions: {
              ...state.previewTransactions,
              [txId]: {
                ...existing,
                draftNodes: {
                  ...existing.draftNodes,
                  [nodeId]: disposition === 'confirm' ? 'confirmed' : 'discarded',
                },
              },
            },
          }
        }, false, 'settlePreviewDraftNode'),
      commitPreviewTransaction: ({ txId, report }) =>
        set((state) => {
          const existing = state.previewTransactions[txId]
          if (!existing) return state
          return {
            previewTransactions: {
              ...state.previewTransactions,
              [txId]: {
                ...existing,
                commitReport: report,
                phase: 'deferred_applied',
              },
            },
          }
        }, false, 'commitPreviewTransaction'),
      cancelPreviewTransaction: (txId) =>
        set((state) => {
          const existing = state.previewTransactions[txId]
          if (!existing) return state
          return {
            previewTransactions: {
              ...state.previewTransactions,
              [txId]: {
                ...existing,
                phase: 'cancelled',
              },
            },
          }
        }, false, 'cancelPreviewTransaction'),
      clearPreviewTransaction: (txId) =>
        set((state) => {
          const nextTransactions = { ...state.previewTransactions }
          delete nextTransactions[txId]
          return { previewTransactions: nextTransactions }
        }, false, 'clearPreviewTransaction'),

      // === Bible System ===
      bibleCharacters: [],
      selectedBibleCharacterId: null,
      biblePanelOpen: false,
      openBiblePanel: () => set({ biblePanelOpen: true }),
      closeBiblePanel: () => set({ biblePanelOpen: false, selectedBibleCharacterId: null }),
      addBibleCharacter: (character) => set((state) => ({
        bibleCharacters: [...state.bibleCharacters, character],
        selectedBibleCharacterId: character.id,
      })),
      updateBibleCharacter: (id, data) => set((state) => ({
        bibleCharacters: state.bibleCharacters.map((c) => (c.id === id ? { ...c, ...data } : c)),
      })),
      removeBibleCharacter: (id) => set((state) => ({
        bibleCharacters: state.bibleCharacters.filter((c) => c.id !== id),
        selectedBibleCharacterId: state.selectedBibleCharacterId === id ? null : state.selectedBibleCharacterId,
      })),
      selectBibleCharacter: (id) => set({ selectedBibleCharacterId: id }),

      bibleScenes: [],
      sceneBiblePanelOpen: false,
      openSceneBiblePanel: () => set({ sceneBiblePanelOpen: true }),
      closeSceneBiblePanel: () => set({ sceneBiblePanelOpen: false }),
      addBibleScene: (scene) => set((state) => ({ bibleScenes: [...state.bibleScenes, scene] })),
      updateBibleScene: (id, data) => set((state) => ({
        bibleScenes: state.bibleScenes.map((s) => (s.id === id ? { ...s, ...data } : s)),
      })),
      removeBibleScene: (id) => set((state) => ({
        bibleScenes: state.bibleScenes.filter((s) => s.id !== id),
      })),

      bibleStyles: [],
      styleBiblePanelOpen: false,
      openStyleBiblePanel: () => set({ styleBiblePanelOpen: true }),
      closeStyleBiblePanel: () => set({ styleBiblePanelOpen: false }),
      addBibleStyle: (style) => set((state) => ({ bibleStyles: [...state.bibleStyles, style] })),
      updateBibleStyle: (id, data) => set((state) => ({
        bibleStyles: state.bibleStyles.map((s) => (s.id === id ? { ...s, ...data } : s)),
      })),
      removeBibleStyle: (id) => set((state) => ({
        bibleStyles: state.bibleStyles.filter((s) => s.id !== id),
      })),
    }),
    { name: 'canvas' },
  ),
)

// ============================================================================
// Bible Persistence — IndexedDB 自动持久化角色圣经数据
// ============================================================================

const BIBLE_IDB_KEY = "bibleCharacters"

/** 静默保存到 IndexedDB（后台执行，不影响UI） */
async function _persistBible() {
  try {
    const chars = useCanvasStore.getState().bibleCharacters
    await setItem(BIBLE_IDB_KEY, chars)
  } catch { /* best effort */ }
}

/** 从 IndexedDB 加载角色圣经 */
export async function loadBibleFromIDB(): Promise<CharacterBibleData[]> {
  try {
    const stored = await getItem<CharacterBibleData[]>(BIBLE_IDB_KEY)
    return stored ?? []
  } catch {
    return []
  }
}

// 在 bible 操作后调用此函数持久化
function _persistBibleFromState(state: { bibleCharacters: CharacterBibleData[] }) {
  try { setItem(BIBLE_IDB_KEY, state.bibleCharacters) } catch { /* best effort */ }
}

// 订阅整个 store，bibleCharacters 变化时自动持久化
let _prevBibleJson = ""
useCanvasStore.subscribe((state) => {
  const currentJson = JSON.stringify(state.bibleCharacters)
  if (currentJson !== _prevBibleJson) {
    _prevBibleJson = currentJson
    _persistBibleFromState(state)
  }
})
