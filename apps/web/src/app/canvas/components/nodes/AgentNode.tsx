// ============================================================================
// Agent Node v2 — 7 角色 Film Crew 多 Agent 执行节点
// 连接真实的 Mastra 风格 Agent 编排引擎
// ============================================================================
"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  Clapperboard,
  Film,
  Palette,
  PenLine,
  Route,
  Wand2,
  Layout,
  Loader2,
  CheckCircle2,
  XCircle,
  Play,
  Settings2,
  Eye,
  Zap,
  MessageSquare,
} from "lucide-react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { CanvasNodeData } from "../canvas/types";
import {
  FILM_CREW_ROLES,
  OPERATION_MODE_LABELS,
  type AgentOperationMode,
  type CrewAgentStatus,
  type FilmCrewRoleId,
} from "@/lib/agents";

// ---------------------------------------------------------------------------
// Design Tokens — grayscale per project standard
// ---------------------------------------------------------------------------

const T = {
  accent: "#64748b",
  accentHover: "#94a3b8",
  accentSoft: "rgba(100, 116, 139, 0.12)",
  accentSoftHover: "rgba(100, 116, 139, 0.22)",
  card: "rgba(255, 255, 255, 0.04)",
  cardHover: "rgba(255, 255, 255, 0.07)",
  border: "rgba(255, 255, 255, 0.08)",
  borderStrong: "rgba(148, 163, 184, 0.25)",
  text: "rgba(255, 255, 255, 0.92)",
  textSecondary: "rgba(255, 255, 255, 0.62)",
  textMuted: "rgba(255, 255, 255, 0.38)",
  bg: "#05060a",
  panel: "rgba(18, 18, 24, 0.92)",
  panelSolid: "#15151b",
  nodeHandle: "#94a3b8",
} as const;

// ---------------------------------------------------------------------------
// Icons for each agent role
// ---------------------------------------------------------------------------

const ROLE_ICONS: Record<FilmCrewRoleId, typeof Clapperboard> = {
  director: Clapperboard,
  storyboardArtist: Layout,
  cinematographer: Film,
  productionDesigner: Palette,
  promptEngineer: Wand2,
  writer: PenLine,
  router: Route,
};

// ---------------------------------------------------------------------------
// Status UI
// ---------------------------------------------------------------------------

const STATUS_UI: Record<string, { dot: string; label: string }> = {
  idle: { dot: "bg-slate-500", label: "待命" },
  running: { dot: "bg-slate-400 animate-pulse", label: "执行中" },
  done: { dot: "bg-emerald-500/70", label: "完成" },
  error: { dot: "bg-red-500/70", label: "失败" },
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface AgentNodeProps extends NodeProps {
  data: CanvasNodeData;
  onRunAgent?: (nodeId: string) => void;
  onBatchGenerate?: (nodeIds: string[]) => void;
  onUpdateAgentContent?: (nodeId: string, content: string) => void;
}

// ---------------------------------------------------------------------------
// AgentNode Component
// ---------------------------------------------------------------------------

const AgentNode = memo(function AgentNode({
  id,
  data,
  selected,
  onRunAgent,
  onBatchGenerate,
  onUpdateAgentContent,
}: AgentNodeProps) {
  const content = data.content ?? "";
  const [draftContent, setDraftContent] = useState(content);

  // State from node data
  const agentStatus = data.agentStatus;
  const agentOutput = data.agentOutput;
  const childNodeIds = data._childNodeIds;
  const batchProgress = data._batchProgress;
  const crewStatuses: CrewAgentStatus[] | undefined = data.crewStatuses;
  const executionTrace = data.executionTrace;

  // Operation mode
  const [mode, setMode] = useState<AgentOperationMode>("max");

  const isRunning = agentStatus === "running";
  const status = STATUS_UI[agentStatus ?? "idle"] ?? STATUS_UI.idle;

  // All 7 crew roles in display order
  const crewRoles = useMemo(
    () =>
      Object.entries(FILM_CREW_ROLES).map(([id, role]) => ({
        id: id as FilmCrewRoleId,
        name: role.name,
        detail: role.detail,
        icon: ROLE_ICONS[id as FilmCrewRoleId],
        status: crewStatuses?.find((s) => s.roleId === id)?.status ?? "idle",
      })),
    [crewStatuses],
  );

  useEffect(() => {
    setDraftContent(content);
  }, [content]);

  const handleContentChange = useCallback(
    (value: string) => {
      setDraftContent(value);
      onUpdateAgentContent?.(id, value);
    },
    [id, onUpdateAgentContent],
  );

  const handleRun = useCallback(() => {
    onRunAgent?.(id);
  }, [id, onRunAgent]);

  return (
    <div
      className="min-w-[360px] max-w-[480px] rounded-2xl border shadow-2xl"
      style={{
        background: T.panelSolid,
        borderColor: selected ? T.borderStrong : T.border,
        boxShadow: selected
          ? `0 0 0 1px ${T.accent}, 0 8px 32px rgba(0,0,0,0.4)`
          : "0 4px 24px rgba(0,0,0,0.3)",
      }}
    >
      {/* ── Header ── */}
      <div
        className="flex items-center justify-between px-4 py-3 rounded-t-2xl"
        style={{ background: T.accentSoft, borderBottom: `1px solid ${T.border}` }}
      >
        <div className="flex items-center gap-2.5">
          <Bot size={18} style={{ color: T.accent }} />
          <span className="font-semibold text-sm" style={{ color: T.text }}>
            {data.title || "Film Crew Agent"}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {/* Mode selector */}
          <div className="flex rounded-lg overflow-hidden" style={{ background: T.card }}>
            {(["max", "ask", "preview"] as AgentOperationMode[]).map((m) => {
              const icons: Record<AgentOperationMode, typeof Zap> = {
                max: Zap,
                ask: MessageSquare,
                preview: Eye,
              };
              const Icon = icons[m];
              const isActive = mode === m;
              return (
                <button
                  key={m}
                  onClick={(e) => { e.stopPropagation(); setMode(m); }}
                  className="px-2 py-1 transition-colors"
                  style={{
                    background: isActive ? T.accentSoft : "transparent",
                    color: isActive ? T.accent : T.textMuted,
                  }}
                  title={OPERATION_MODE_LABELS[m]}
                >
                  <Icon size={14} />
                </button>
              );
            })}
          </div>

          {/* Status indicator */}
          <div className="flex items-center gap-1.5">
            <div className={`w-2 h-2 rounded-full ${status.dot}`} />
            <span className="text-xs" style={{ color: T.textSecondary }}>
              {status.label}
            </span>
          </div>
        </div>
      </div>

      {/* ── 7-Role Crew Grid ── */}
      <div className="px-4 pt-3">
        <div
          className="grid grid-cols-4 gap-1 rounded-xl p-2"
          style={{ background: T.card, border: `1px solid ${T.border}` }}
        >
          {crewRoles.map((role) => {
            const Icon = role.icon;
            const roleStatus = role.status;
            const isRoleRunning = roleStatus === "running";
            const isRoleDone = roleStatus === "done";
            const isRoleError = roleStatus === "error";
            return (
              <div
                key={role.id}
                className="flex flex-col items-center gap-0.5 rounded-lg px-1 py-2 text-center transition-colors"
                style={{
                  background: isRoleRunning
                    ? T.accentSoft
                    : isRoleDone
                      ? "rgba(16, 185, 129, 0.08)"
                      : isRoleError
                        ? "rgba(239, 68, 68, 0.08)"
                        : "transparent",
                }}
              >
                {isRoleRunning ? (
                  <Loader2 size={16} className="animate-spin" style={{ color: T.accent }} />
                ) : isRoleDone ? (
                  <CheckCircle2 size={16} style={{ color: "rgba(16, 185, 129, 0.7)" }} />
                ) : isRoleError ? (
                  <XCircle size={16} style={{ color: "rgba(239, 68, 68, 0.7)" }} />
                ) : (
                  <Icon size={16} style={{ color: T.textMuted }} />
                )}
                <span
                  className="text-[10px] font-semibold leading-tight"
                  style={{
                    color: isRoleDone ? "rgba(16, 185, 129, 0.8)" : isRoleError ? "rgba(239, 68, 68, 0.8)" : T.textSecondary,
                  }}
                >
                  {role.name.split(" ")[0]}
                </span>
                <span className="text-[8px] leading-tight" style={{ color: T.textMuted }}>
                  {role.detail}
                </span>
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-[10px] leading-relaxed" style={{ color: T.textMuted }}>
          7 Agent 协作文本创作系统：剧本→分镜→摄影→美术→提示词→路由，按 PLAN.md 设计顺序执行
        </p>
      </div>

      {/* ── Input ── */}
      <div className="px-4 py-3">
        <label className="text-xs font-medium mb-1.5 block" style={{ color: T.textSecondary }}>
          剧本 / 故事文本 / Agent 指令
        </label>
        <textarea
          className="w-full h-24 text-sm p-3 rounded-xl resize-none outline-none transition-colors"
          style={{
            background: T.card,
            border: `1px solid ${T.border}`,
            color: T.text,
            caretColor: T.accent,
          }}
          placeholder="粘贴剧本或故事想法..."
          value={draftContent}
          onChange={(event) => handleContentChange(event.target.value)}
          disabled={isRunning}
        />
      </div>

      {/* ── Action Bar ── */}
      <div className="px-4 pb-3 flex gap-2">
        <button
          onClick={handleRun}
          disabled={isRunning || !draftContent.trim()}
          className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-medium transition-all"
          style={{
            background: isRunning
              ? T.accentSoft
              : !draftContent.trim()
                ? T.card
                : T.accent,
            color: isRunning
              ? T.textSecondary
              : !draftContent.trim()
                ? T.textMuted
                : "#fff",
            cursor: isRunning || !draftContent.trim() ? "not-allowed" : "pointer",
            opacity: isRunning ? 0.7 : 1,
          }}
        >
          {isRunning ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              执行中...
            </>
          ) : (
            <>
              <Play size={16} />
              运行 Crew
            </>
          )}
        </button>
      </div>

      {/* ── Execution Trace ── */}
      {executionTrace && executionTrace.length > 0 && (
        <div
          className="mx-4 mb-3 p-2.5 rounded-xl overflow-auto max-h-32"
          style={{ background: T.card, border: `1px solid ${T.border}` }}
        >
          {executionTrace.slice(-8).map((line, i) => (
            <div
              key={i}
              className="text-[11px] leading-relaxed font-mono"
              style={{ color: line.startsWith("✅") ? "rgba(16, 185, 129, 0.65)" : line.startsWith("❌") ? "rgba(239, 68, 68, 0.65)" : line.startsWith("🎬") || line.startsWith("🎉") ? T.textSecondary : T.textMuted }}
            >
              {line}
            </div>
          ))}
        </div>
      )}

      {/* ── Agent Output ── */}
      {agentOutput && (
        <div
          className="mx-4 mb-3 border-t"
          style={{ borderColor: T.border }}
        >
          <div className="pt-3">
            <label className="text-xs font-medium mb-1.5 block" style={{ color: T.textSecondary }}>
              Crew 输出
            </label>
            <pre
              className="text-xs p-2.5 rounded-xl overflow-auto max-h-72 whitespace-pre-wrap break-words"
              style={{ background: T.card, color: T.textSecondary, border: `1px solid ${T.border}` }}
            >
              {agentOutput.slice(0, 5000)}
              {agentOutput.length > 5000 && "\n\n... (截断，完整内容请查看画布)"}
            </pre>
          </div>
        </div>
      )}

      {/* ── Batch Generate ── */}
      {agentStatus === "done" && childNodeIds && childNodeIds.length > 0 && (
        <div className="px-4 pb-3">
          {batchProgress && (
            <div className="mb-2 rounded-xl p-2.5" style={{ background: T.card }}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs" style={{ color: T.textMuted }}>
                  {batchProgress}
                </span>
              </div>
              <div className="h-1 rounded-full overflow-hidden" style={{ background: T.border }}>
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${Math.min(
                      (parseInt(batchProgress.split("/")[0] || "0") /
                        parseInt(batchProgress.split("/")[1] || "1")) * 100,
                      100,
                    )}%`,
                    background: T.accent,
                  }}
                />
              </div>
            </div>
          )}
          <button
            onClick={() => onBatchGenerate?.(childNodeIds)}
            disabled={!!batchProgress}
            className="w-full rounded-xl px-3 py-2 text-xs font-medium transition-all"
            style={{
              background: batchProgress ? T.card : T.accentSoft,
              color: batchProgress ? T.textMuted : T.accentHover,
              cursor: batchProgress ? "not-allowed" : "pointer",
            }}
          >
            {batchProgress
              ? `生成中... ${batchProgress}`
              : `批量生图 (${childNodeIds.length} 个分镜)`}
          </button>
        </div>
      )}

      {/* ── Handles ── */}
      <Handle type="target" position={Position.Top} style={{ background: T.nodeHandle, width: 10, height: 10 }} />
      <Handle type="source" position={Position.Bottom} style={{ background: T.nodeHandle, width: 10, height: 10 }} />
    </div>
  );
});

export default AgentNode;
