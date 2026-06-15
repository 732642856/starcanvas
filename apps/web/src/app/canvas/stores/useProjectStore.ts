// ============================================================================
// Project Store — 本地项目管理 (IndexedDB 持久化)
// ============================================================================
"use client"

import { create } from "zustand"
import { getItem, setItem, removeItem } from "../utils/canvasIndexedDB"
import supermemory from "@/lib/memory/supermemory"

// ============================================================================
// Types
// ============================================================================

export interface ProjectMeta {
  id: string
  name: string
  description?: string
  /** 项目模板类型 */
  template?: "blank" | "storyboard" | "video-production"
  /** 画布节点数量 */
  nodeCount?: number
  /** 最后修改时间 */
  lastModifiedAt: string
  createdAt: string
}

interface ProjectStoreState {
  projects: ProjectMeta[]
  currentProjectId: string | null
  isLoaded: boolean

  // Actions
  loadProjects: () => Promise<void>
  createProject: (params: string | { id?: string; name: string; template?: ProjectMeta["template"] }) => Promise<ProjectMeta>
  openProject: (id: string) => void
  deleteProject: (id: string) => Promise<void>
  updateProjectMeta: (id: string, updates: Partial<Pick<ProjectMeta, "name" | "description" | "nodeCount">>) => Promise<void>
  getProject: (id: string) => ProjectMeta | undefined
}

// ============================================================================
// Helpers
// ============================================================================

const PROJECTS_KEY = "projects_list"

function generateId(): string {
  return `proj_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

// ============================================================================
// Store
// ============================================================================

export const useProjectStore = create<ProjectStoreState>((set, get) => ({
  projects: [],
  currentProjectId: null,
  isLoaded: false,

  loadProjects: async () => {
    try {
      const stored = await getItem<ProjectMeta[]>(PROJECTS_KEY)
      set({ projects: stored ?? [], isLoaded: true })
    } catch {
      set({ projects: [], isLoaded: true })
    }
  },

  createProject: async (params: string | { id?: string; name: string; template?: ProjectMeta["template"] }) => {
    // 兼容旧调用：createProject(name, template)
    const opts = typeof params === "string"
      ? { name: params }
      : params
    const { id: externalId, name, template } = opts

    const now = new Date().toISOString()
    const project: ProjectMeta = {
      id: externalId || generateId(),
      name: name || "未命名项目",
      template,
      nodeCount: 0,
      lastModifiedAt: now,
      createdAt: now,
    }

    const { projects } = get()
    const updated = [project, ...projects]
    await setItem(PROJECTS_KEY, updated)
    set({ projects: updated })
    return project
  },

  openProject: (id: string) => {
    set({ currentProjectId: id })
  },

  deleteProject: async (id: string) => {
    const { projects } = get()
    const updated = projects.filter((p) => p.id !== id)
    await setItem(PROJECTS_KEY, updated)
    // Also clean up canvas data for this project (rc.2b: aligned with getCanvasStorageKey)
    const projectCanvasKey = `startrails_canvas_p:${encodeURIComponent(id)}`
    await supermemory.delete(projectCanvasKey)
    await removeItem(`canvas_${id}`)
    await removeItem(`assets_${id}`)
    set({ projects: updated, currentProjectId: get().currentProjectId === id ? null : get().currentProjectId })
  },

  updateProjectMeta: async (id: string, updates) => {
    const { projects } = get()
    const updated = projects.map((p) =>
      p.id === id ? { ...p, ...updates, lastModifiedAt: new Date().toISOString() } : p
    )
    await setItem(PROJECTS_KEY, updated)
    set({ projects: updated })
  },

  getProject: (id: string) => {
    return get().projects.find((p) => p.id === id)
  },
}))
