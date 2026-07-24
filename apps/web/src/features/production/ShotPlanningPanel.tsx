"use client";

import type { Node } from "@xyflow/react";
import React, { useState, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { X, ClipboardList, Download, Plus, Loader2, Play } from "lucide-react";
import type { CanvasNodeData } from "@/app/canvas/components/canvas/types";
import { useShotPlanningStore } from "./useShotPlanningStore.ts";
import { useShotPlanningRunQueueStore } from "./useShotPlanningRunQueueStore.ts";
import { exportShotPlanningBoardToMarkdown } from "./shotPlanningExport.ts";
import type {
  ShotPlanningStatus,
  ShotPlanningSummary,
  CreateShotPlanningBoardInput,
} from "./shotPlanningTypes.ts";

// ============================================================================
// Constants
// ============================================================================

const STATUS_OPTIONS: { value: ShotPlanningStatus; label: string; bg: string }[] = [
  { value: "todo", label: "📋 Todo", bg: "bg-slate-700/30" },
  { value: "ready", label: "✅ Ready", bg: "bg-emerald-700/30" },
  { value: "shooting", label: "🎬 Shooting", bg: "bg-amber-700/30" },
  { value: "done", label: "✔️ Done", bg: "bg-blue-700/30" },
  { value: "blocked", label: "🚫 Blocked", bg: "bg-red-700/30" },
];

const STATUS_BG_MAP: Record<ShotPlanningStatus, string> = Object.fromEntries(
  STATUS_OPTIONS.map((o) => [o.value, o.bg]),
) as Record<ShotPlanningStatus, string>;

function formatSourceTag(sourceType: string, sourceTimeSec?: number): string {
  const time = typeof sourceTimeSec === "number" && Number.isFinite(sourceTimeSec)
    ? ` ${Math.round(sourceTimeSec * 10) / 10}s`
    : "";
  return `${sourceType}${time}`;
}

// ============================================================================
// Props
// ============================================================================

interface ShotPlanningPanelProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string | null;
  projectTitle?: string;
  /** Canvas nodes to generate planning from */
  nodes: CreateShotPlanningBoardInput["nodes"];
  /** Raw canvas nodes used when bridging to production queue */
  sourceNodes?: Array<Pick<Node<CanvasNodeData>, "id" | "data">>;
}

// ============================================================================
// Summary Bar
// ============================================================================

function SummaryBar({ summary }: { summary: ShotPlanningSummary }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2 text-xs text-white/60 border-b border-white/10">
      <span>
        Shots: <strong className="text-white/90">{summary.total}</strong>
      </span>
      <span>
        Done:{" "}
        <strong className="text-emerald-400">{summary.done}</strong>
      </span>
      <span>
        Ready:{" "}
        <strong className="text-amber-400">{summary.ready}</strong>
      </span>
      <span>
        Shooting:{" "}
        <strong className="text-amber-300">{summary.shooting}</strong>
      </span>
      <span>
        Todo:{" "}
        <strong className="text-slate-300">{summary.todo}</strong>
      </span>
      {summary.blocked > 0 && (
        <span>
          Blocked:{" "}
          <strong className="text-red-400">{summary.blocked}</strong>
        </span>
      )}
      <span className="ml-auto">
        Duration:{" "}
        <strong className="text-white/80">{summary.totalDurationSec}s</strong>
      </span>
      <span className="flex items-center gap-1">
        Progress:{" "}
        <span className="inline-block w-16 h-2 bg-white/10 rounded-full overflow-hidden">
          <span
            className="inline-block h-full bg-emerald-500 rounded-full transition-all"
            style={{ width: `${summary.progress}%` }}
          />
        </span>
        <strong className="text-emerald-400">{summary.progress}%</strong>
      </span>
    </div>
  );
}

// ============================================================================
// Shot Item Row
// ============================================================================

function ShotItemRow({
  item,
  index,
  onStatusChange,
  onNotesChange,
}: {
  item: {
    id: string;
    title: string;
    description?: string;
    durationSec?: number;
    shotPresetId?: string;
    stylePresetId?: string;
    sourceType?: string;
    sourceTimeSec?: number;
    referenceImageUrl?: string;
    status: ShotPlanningStatus;
    notes?: string;
  };
  index: number;
  onStatusChange: (itemId: string, status: ShotPlanningStatus) => void;
  onNotesChange: (itemId: string, notes: string) => void;
}) {
  const [localNotes, setLocalNotes] = useState(item.notes ?? "");
  const [notesOpen, setNotesOpen] = useState(!!item.notes);

  const handleNotesBlur = useCallback(() => {
    onNotesChange(item.id, localNotes);
  }, [item.id, localNotes, onNotesChange]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        onNotesChange(item.id, localNotes);
      }
    },
    [item.id, localNotes, onNotesChange],
  );

  return (
    <div
      className="flex items-start gap-3 px-3 py-2 border-b border-white/5 hover:bg-white/[0.02] transition"
      data-planning-item={item.id}
    >
      {/* Order number */}
      <span className="text-xs text-white/30 w-5 text-right pt-1 shrink-0">
        {index + 1}
      </span>

      {/* Main content */}
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-white/90 truncate">
            {item.title}
          </span>
          {item.durationSec != null && (
            <span className="text-[11px] text-white/40 shrink-0">
              {item.durationSec}s
            </span>
          )}
        </div>
        {item.description && (
          <p className="text-[11px] text-white/50 truncate">
            {item.description}
          </p>
        )}
        {/* Tags */}
        <div className="flex gap-1 flex-wrap">
          {item.shotPresetId && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-white/40">
              {item.shotPresetId}
            </span>
          )}
          {item.stylePresetId && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-white/40">
              {item.stylePresetId}
            </span>
          )}
          {item.sourceType && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-200/70">
              {formatSourceTag(item.sourceType, item.sourceTimeSec)}
            </span>
          )}
          {item.referenceImageUrl && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-200/70">
              reference frame
            </span>
          )}
        </div>

        {/* Notes toggle */}
        <div>
          <button
            type="button"
            onClick={() => setNotesOpen(!notesOpen)}
            className="text-[11px] text-white/30 hover:text-white/50 transition"
          >
            {notesOpen ? "Hide notes" : item.notes ? `Notes: ${item.notes.slice(0, 30)}...` : "+ Add notes"}
          </button>
          {notesOpen && (
            <textarea
              className="w-full mt-1 p-1.5 text-xs bg-white/5 border border-white/10 rounded text-white/80 placeholder-white/20 resize-none"
              rows={2}
              value={localNotes}
              onChange={(e) => setLocalNotes(e.target.value)}
              onBlur={handleNotesBlur}
              onKeyDown={handleKeyDown}
              placeholder="Add notes..."
            />
          )}
        </div>
      </div>

      {/* Status select */}
      <select
        className={`shrink-0 text-[11px] px-2 py-1 rounded border border-white/10 ${STATUS_BG_MAP[item.status]} text-white/80 appearance-none cursor-pointer`}
        value={item.status}
        onChange={(e) =>
          onStatusChange(item.id, e.target.value as ShotPlanningStatus)
        }
        style={{ backgroundImage: "none" }}
        data-planning-status={item.id}
      >
        {STATUS_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value} className="bg-slate-800">
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

// ============================================================================
// Main Panel
// ============================================================================

export function ShotPlanningPanel({
  isOpen,
  onClose,
  projectId,
  projectTitle,
  nodes,
  sourceNodes,
}: ShotPlanningPanelProps) {
  const board = useShotPlanningStore((s) => s.board);
  const isLoaded = useShotPlanningStore((s) => s.isLoaded);
  const loadBoard = useShotPlanningStore((s) => s.loadBoard);
  const buildFromStoryboard = useShotPlanningStore((s) => s.buildFromStoryboard);
  const updateStatus = useShotPlanningStore((s) => s.updateStatus);
  const updateNotes = useShotPlanningStore((s) => s.updateNotes);
  const getSummary = useShotPlanningStore((s) => s.getSummary);

  // Run queue bridge
  const runQueue = useShotPlanningRunQueueStore((s) => s.queue);
  const buildRunQueue = useShotPlanningRunQueueStore((s) => s.buildFromBoard);
  const lastMessage = useShotPlanningRunQueueStore((s) => s.lastMessage);
  const dismissMessage = useShotPlanningRunQueueStore((s) => s.dismissMessage);

  const [generating, setGenerating] = useState(false);

  // Load board when project changes
  React.useEffect(() => {
    if (projectId && isOpen) {
      loadBoard(projectId);
    }
  }, [projectId, isOpen, loadBoard]);

  const summary = useMemo(() => getSummary(), [getSummary]);

  const sortedItems = useMemo(
    () => (board ? [...board.items].sort((a, b) => a.order - b.order) : []),
    [board],
  );

  // Generate from storyboard
  const handleGenerate = useCallback(() => {
    if (!projectId || nodes.length === 0) return;
    setGenerating(true);
    // Small delay for UX feedback
    setTimeout(() => {
      buildFromStoryboard({ projectId, projectTitle, nodes });
      setGenerating(false);
    }, 150);
  }, [projectId, projectTitle, nodes, buildFromStoryboard]);

  // Export Markdown
  const handleExport = useCallback(() => {
    if (!board) return;
    const md = exportShotPlanningBoardToMarkdown(board);
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${board.title.replace(/\s+/g, "-").toLowerCase()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, [board]);

  // Create run queue from ready shots
  const readyCount = useMemo(
    () => board?.items.filter((item) => item.status === "ready").length ?? 0,
    [board],
  );

  const handleCreateRunQueue = useCallback(() => {
    if (!board || !projectId) return;
    buildRunQueue(board, projectId, sourceNodes);
  }, [board, projectId, sourceNodes, buildRunQueue]);

  // Handle status change
  const handleStatusChange = useCallback(
    (itemId: string, status: ShotPlanningStatus) => {
      updateStatus(itemId, status);
    },
    [updateStatus],
  );

  // Handle notes change
  const handleNotesChange = useCallback(
    (itemId: string, notes: string) => {
      updateNotes(itemId, notes);
    },
    [updateNotes],
  );

  if (!isOpen) return null;

  const hasItems = sortedItems.length > 0;

  return createPortal(
    <div
      className="fixed top-16 right-4 z-[91] w-[400px] max-h-[calc(100vh-6rem)] bg-[#121218]/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
      data-testid="shot-planning-panel"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-2">
          <ClipboardList size={16} strokeWidth={1.7} className="text-white/60" />
          <h2 className="text-sm font-semibold text-white/90">制片规划</h2>
          {summary && (
            <span className="text-[11px] text-white/40">
              {summary.done}/{summary.total}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded hover:bg-white/10 text-white/40 hover:text-white/70 transition"
          data-testid="shot-planning-close"
        >
          <X size={16} strokeWidth={1.5} />
        </button>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-white/5 shrink-0">
        <button
          type="button"
          onClick={handleGenerate}
          disabled={generating || !projectId || nodes.length === 0}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-white/80 disabled:opacity-30 disabled:cursor-not-allowed transition"
          data-testid="shot-planning-generate"
        >
          {generating ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <Plus size={13} />
          )}
          {hasItems ? "重新生成" : "从分镜生成"}
        </button>
        <button
          type="button"
          onClick={handleExport}
          disabled={!hasItems}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-white/80 disabled:opacity-30 disabled:cursor-not-allowed transition"
          data-testid="shot-planning-export"
        >
          <Download size={13} />
          导出 Markdown
        </button>
        <button
          type="button"
          onClick={handleCreateRunQueue}
          disabled={readyCount === 0}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 disabled:opacity-30 disabled:cursor-not-allowed transition"
          data-testid="shot-planning-create-queue"
        >
          <Play size={13} />
          创建执行队列
        </button>
        {!projectId && (
          <span className="text-[11px] text-amber-400/60 ml-auto">
            请先打开项目
          </span>
        )}
        {projectId && nodes.length === 0 && !hasItems && (
          <span className="text-[11px] text-white/30 ml-auto">
            画布中暂无分镜节点
          </span>
        )}
      </div>

      {/* Summary */}
      {summary && hasItems && <SummaryBar summary={summary} />}

      {/* Bridge message */}
      {lastMessage && (
        <div className="flex items-center justify-between px-4 py-2 text-xs bg-emerald-900/20 border-b border-emerald-800/20">
          <span className="text-emerald-300">{lastMessage}</span>
          <button
            type="button"
            onClick={dismissMessage}
            className="text-emerald-400/50 hover:text-emerald-400"
          >
            <X size={12} />
          </button>
        </div>
      )}

      {/* Empty state */}
      {!hasItems && (
        <div className="flex-1 flex items-center justify-center p-8 text-center">
          <div className="space-y-2">
            <ClipboardList
              size={32}
              strokeWidth={1.5}
              className="mx-auto text-white/15"
            />
            <p className="text-sm text-white/30">尚无制片规划</p>
            <p className="text-xs text-white/15">
              点击「从分镜生成」从当前画布创建规划板
            </p>
          </div>
        </div>
      )}

      {/* Shot list */}
      {hasItems && (
        <div className="flex-1 overflow-y-auto">
          {sortedItems.map((item, i) => (
            <ShotItemRow
              key={item.id}
              item={item}
              index={i}
              onStatusChange={handleStatusChange}
              onNotesChange={handleNotesChange}
            />
          ))}
        </div>
      )}
    </div>,
    document.body,
  );
}
