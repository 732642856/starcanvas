"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Plus, FolderOpen, Trash2, FileText, Film, Image, Loader2, ArrowRight } from "lucide-react"
import { useProjectStore, type ProjectMeta } from "../canvas/stores/useProjectStore"

// ── 设计 Token ─────────────────────────────────────────
const T = {
  bg: "#0a0a0f",
  card: "rgba(255,255,255,0.04)",
  cardHover: "rgba(255,255,255,0.07)",
  border: "rgba(255,255,255,0.08)",
  borderAccent: "rgba(99,102,241,0.3)",
  accent: "rgb(99,102,241)",
  accentSoft: "rgba(99,102,241,0.1)",
  text: "rgba(255,255,255,0.92)",
  textSecondary: "rgba(255,255,255,0.6)",
  textMuted: "rgba(255,255,255,0.35)",
} as const

const inputClass = "w-full rounded-lg border bg-transparent px-4 py-2.5 text-sm outline-none transition-colors focus:border-indigo-400"
const btnPrimary = "flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all"
const TASKS = [
  { icon: FileText, label: "剧本创作", desc: "导入或撰写剧本，AI 自动拆分分镜" },
  { icon: Film, label: "视频制作", desc: "从分镜到画面到视频的全流程" },
  { icon: Image, label: "自由画布", desc: "随心所欲，从任意节点开始" },
]

export default function DashboardPage() {
  const router = useRouter()
  const { projects, isLoaded, loadProjects, createProject, deleteProject } = useProjectStore()
  const [newName, setNewName] = useState("")
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  useEffect(() => { loadProjects() }, [loadProjects])

  const handleCreate = useCallback(async () => {
    const name = newName.trim() || "未命名项目"
    setCreateError(null)
    setCreating(true)
    setShowCreate(false)
    setNewName("")

    const projectId = `proj_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`

    try {
      // 传入预生成 ID，确保 URL 和持久化 id 一致
      const project = await createProject({ id: projectId, name, template: "blank" })
      router.push(`/canvas?projectId=${project.id}`)
    } catch (err: any) {
      console.error("[Dashboard] 创建项目失败:", err)
      setCreateError(err?.message || "创建失败，请重试")
      // 降级：即使持久化失败也尝试进入画布
      router.push(`/canvas?projectId=${projectId}`)
    } finally {
      setCreating(false)
    }
  }, [newName, createProject, router])

  const handleOpen = useCallback((project: ProjectMeta) => {
    router.push(`/canvas?projectId=${project.id}`)
  }, [router])

  const handleDelete = useCallback(async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    if (confirm("确定要删除这个项目吗？画布数据也将被清除。")) {
      await deleteProject(id)
    }
  }, [deleteProject])

  return (
    <div className="min-h-screen" style={{ backgroundColor: T.bg, color: T.text }}>
      {/* Header */}
      <header className="border-b px-8 py-5" style={{ borderColor: T.border }}>
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">星轨画布</h1>
            <p className="mt-0.5 text-sm" style={{ color: T.textMuted }}>AI 视频创作画布 — 自带算力，自由创作</p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            disabled={creating}
            className={btnPrimary}
            style={{ backgroundColor: T.accent, color: "#fff" }}
            data-testid="dashboard-new-project-button"
          >
            {creating ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            新建项目
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-5xl px-8 py-10">
        {/* Create Panel */}
        {showCreate && (
          <div
            className="mb-10 rounded-2xl border p-8"
            style={{ borderColor: T.borderAccent, backgroundColor: T.accentSoft }}
          >
            <h2 className="mb-6 text-base font-medium">创建新项目</h2>

            {/* Name input */}
            <div className="mb-6">
              <label className="mb-1.5 block text-xs" style={{ color: T.textSecondary }}>项目名称</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                placeholder="例如：赛博朋克短剧·第一集"
                className={inputClass}
                style={{ borderColor: T.border, color: T.text }}
                autoFocus
                data-testid="new-project-name-input"
              />
            </div>

            {/* Task type cards */}
            <div className="mb-6 grid grid-cols-3 gap-3">
              {TASKS.map((t) => (
                <div
                  key={t.label}
                  className="rounded-xl border px-4 py-3 transition-colors hover:bg-white/5"
                  style={{ borderColor: T.border, cursor: "pointer" }}
                >
                  <t.icon size={18} strokeWidth={1.5} style={{ color: T.accent }} />
                  <p className="mt-2 text-xs font-medium">{t.label}</p>
                  <p className="mt-0.5 text-[11px] leading-relaxed" style={{ color: T.textMuted }}>{t.desc}</p>
                </div>
              ))}
            </div>

            {/* Error message */}
            {createError && (
              <p className="mb-4 text-xs text-red-400">{createError}</p>
            )}

            {/* Actions */}
            <div className="flex items-center gap-3">
              <button
                onClick={handleCreate}
                disabled={creating}
                className={btnPrimary}
                style={{ backgroundColor: T.accent, color: "#fff" }}
                data-testid="new-project-confirm-button"
              >
                {creating ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
                开始创作
              </button>
              <button onClick={() => setShowCreate(false)} className={btnPrimary} style={{ color: T.textMuted }}>
                取消
              </button>
            </div>
          </div>
        )}

        {/* Project List */}
        <div>
          <h2 className="mb-4 text-sm font-medium" style={{ color: T.textSecondary }}>
            {projects.length > 0 ? `我的项目（${projects.length}）` : "我的项目"}
          </h2>

          {!isLoaded ? (
            <div className="flex items-center gap-2 py-8 text-sm" style={{ color: T.textMuted }}>
              <Loader2 size={14} className="animate-spin" />
              加载中...
            </div>
          ) : projects.length === 0 ? (
            <div className="rounded-2xl border py-16 text-center" style={{ borderColor: T.border }}>
              <FolderOpen size={32} strokeWidth={1} style={{ color: T.textMuted }} className="mx-auto mb-3" />
              <p className="text-sm" style={{ color: T.textMuted }}>还没有项目</p>
              <p className="mt-1 text-xs" style={{ color: T.textMuted, opacity: 0.6 }}>
                点击右上角「新建项目」开始
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {projects.map((project) => (
                <div
                  key={project.id}
                  onClick={() => handleOpen(project)}
                  className="group cursor-pointer rounded-xl border p-5 transition-all hover:-translate-y-0.5"
                  style={{ borderColor: T.border, backgroundColor: T.card }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = T.cardHover }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = T.card }}
                >
                  <div className="flex items-start justify-between">
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-sm font-medium">{project.name}</h3>
                      <p className="mt-1 text-xs" style={{ color: T.textMuted }}>
                        {new Date(project.lastModifiedAt).toLocaleDateString("zh-CN", {
                          year: "numeric", month: "short", day: "numeric",
                        })}
                        {project.nodeCount ? ` · ${project.nodeCount} 个节点` : ""}
                      </p>
                    </div>
                    <button
                      onClick={(e) => handleDelete(e, project.id)}
                      className="rounded-lg p-1.5 opacity-0 transition-all group-hover:opacity-100 hover:bg-white/10"
                      style={{ color: T.textMuted }}
                      title="删除项目"
                    >
                      <Trash2 size={14} strokeWidth={1.5} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
