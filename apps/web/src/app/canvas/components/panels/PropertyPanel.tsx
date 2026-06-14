// ============================================================================
// PropertyPanel — 节点属性面板
// 选中任意节点时在右侧显示可编辑属性
// ============================================================================
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import type { Node } from "@xyflow/react";
import type { CanvasNodeData } from "../canvas/types";
import { getModelOptions } from "@/lib/ai/imageProviderCapabilities";

interface PropertyPanelProps {
  node: Node<CanvasNodeData> | null;
  onClose: () => void;
  onUpdateData: (nodeId: string, patch: Partial<CanvasNodeData>) => void;
}

/** 节点类型 → 中文标签 */
const TYPE_LABELS: Record<string, string> = {
  content: "文本",
  agent: "Agent",
  image: "图片",
  shot: "分镜",
  workflow: "工作流",
  storyboardGrid: "分镜网格",
};

/** 模型选项列表（缓存） */
const MODEL_OPTIONS = getModelOptions();

export default function PropertyPanel({ node, onClose, onUpdateData }: PropertyPanelProps) {
  const [editContent, setEditContent] = useState("");
  const [editPrompt, setEditPrompt] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const contentTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Sync state when node changes
  useEffect(() => {
    if (!node) return;
    setEditContent(node.data?.content ?? "");
    setEditPrompt(node.data?.prompt ?? "");
    setEditTitle(node.data?.title ?? "");
  }, [node?.id]);

  const debouncedUpdate = useCallback(
    (field: string, value: string) => {
      if (contentTimer.current) clearTimeout(contentTimer.current);
      contentTimer.current = setTimeout(() => {
        if (node) onUpdateData(node.id, { [field]: value });
      }, 400);
    },
    [node, onUpdateData],
  );

  if (!node) return null;

  const nodeData = node.data ?? {};
  const nodeKind = nodeData.nodeKind ?? node.type ?? "unknown";
  const typeLabel = TYPE_LABELS[node.type ?? ""] ?? nodeKind;
  const isImageNode = node.type === "image";
  const hasStatus = "status" in nodeData || "agentStatus" in nodeData;
  const status = (nodeData as any).status ?? (nodeData as any).agentStatus ?? "idle";

  return (
    <div
      className="absolute right-4 top-20 z-30 w-72 rounded-xl border shadow-xl
                 backdrop-blur-xl transition-all duration-300"
      style={{
        backgroundColor: "rgba(18, 18, 24, 0.92)",
        borderColor: "rgba(168, 85, 247, 0.25)",
      }}
    >
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: "rgba(168, 85, 247, 0.1)" }}>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold" style={{ color: "#e2e8f0" }}>
            属性面板
          </span>
          <span
            className="text-[10px] px-1.5 py-0.5 rounded-full"
            style={{ backgroundColor: "rgba(168, 85, 247, 0.15)", color: "#a78bfa" }}
          >
            {typeLabel}
          </span>
        </div>
        <button onClick={onClose} className="text-white/40 hover:text-white/70 transition-colors">
          <X size={14} />
        </button>
      </div>

      {/* ── Body ── */}
      <div className="px-4 py-3 space-y-3 max-h-[60vh] overflow-y-auto">

        {/* Title */}
        <div>
          <label className="text-[10px] font-medium uppercase tracking-wider block mb-1"
                 style={{ color: "#94a3b8" }}>标题</label>
          <input
            value={editTitle}
            onChange={(e) => { setEditTitle(e.target.value); debouncedUpdate("title", e.target.value); }}
            className="w-full rounded-lg px-3 py-1.5 text-xs border-none outline-none"
            style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "#e2e8f0" }}
          />
        </div>

        {/* Status indicator */}
        {hasStatus && (
          <div>
            <label className="text-[10px] font-medium uppercase tracking-wider block mb-1"
                   style={{ color: "#94a3b8" }}>状态</label>
            <span
              className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full"
              style={{
                backgroundColor:
                  status === "done" ? "rgba(34, 197, 94, 0.15)" :
                  status === "running" ? "rgba(59, 130, 246, 0.15)" :
                  status === "error" ? "rgba(239, 68, 68, 0.15)" :
                  "rgba(148, 163, 184, 0.15)",
                color:
                  status === "done" ? "#22c55e" :
                  status === "running" ? "#3b82f6" :
                  status === "error" ? "#ef4444" :
                  "#94a3b8",
              }}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${
                status === "running" ? "bg-blue-500 animate-pulse" :
                status === "done" ? "bg-green-500" :
                status === "error" ? "bg-red-500" :
                "bg-gray-400"
              }`} />
              {status === "done" ? "完成" :
               status === "running" ? "运行中" :
               status === "error" ? "错误" : "就绪"}
            </span>
          </div>
        )}

        {/* Model selector (image/agent nodes) */}
        {(isImageNode || node.type === "agent") && (
          <div>
            <label className="text-[10px] font-medium uppercase tracking-wider block mb-1"
                   style={{ color: "#94a3b8" }}>模型</label>
            <select
              value={nodeData.model ?? MODEL_OPTIONS[0]?.value ?? "gpt-image-2"}
              onChange={(e) => onUpdateData(node.id, { model: e.target.value })}
              className="w-full rounded-lg px-3 py-1.5 text-xs border-none outline-none appearance-none cursor-pointer"
              style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "#e2e8f0" }}
            >
              {MODEL_OPTIONS.map((m) => (
                <option key={m.value} value={m.value} className="bg-gray-900">
                  {m.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Content / Prompt */}
        {editPrompt && (
          <div>
            <label className="text-[10px] font-medium uppercase tracking-wider block mb-1"
                   style={{ color: "#94a3b8" }}>Prompt</label>
            <textarea
              value={editPrompt}
              onChange={(e) => { setEditPrompt(e.target.value); debouncedUpdate("prompt", e.target.value); }}
              rows={3}
              className="w-full rounded-lg px-3 py-1.5 text-xs border-none outline-none resize-none"
              style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "#e2e8f0" }}
            />
          </div>
        )}

        {/* Content for text-heavy nodes */}
        {editContent && (
          <div>
            <label className="text-[10px] font-medium uppercase tracking-wider block mb-1"
                   style={{ color: "#94a3b8" }}>内容</label>
            <textarea
              value={editContent}
              onChange={(e) => { setEditContent(e.target.value); debouncedUpdate("content", e.target.value); }}
              rows={5}
              className="w-full rounded-lg px-3 py-1.5 text-xs border-none outline-none resize-none"
              style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "#e2e8f0" }}
            />
          </div>
        )}

        {/* 时间轴属性 */}
        <div>
          <label className="text-[10px] font-medium uppercase tracking-wider block mb-1"
                 style={{ color: "#94a3b8" }}>时间轴</label>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-[9px] text-white/40 block mb-0.5">开始 (s)</label>
              <input
                type="number"
                min={0}
                step={0.1}
                value={nodeData.timelineStartTimeSeconds ?? 0}
                onChange={(e) =>
                  onUpdateData(node.id, {
                    timelineStartTimeSeconds: parseFloat(e.target.value) || 0,
                  })
                }
                className="w-full rounded-lg px-2 py-1 text-xs border-none outline-none"
                style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "#e2e8f0" }}
              />
            </div>
            <div className="flex-1">
              <label className="text-[9px] text-white/40 block mb-0.5">持续 (s)</label>
              <input
                type="number"
                min={0.1}
                step={0.1}
                value={nodeData.timelineDurationSeconds ?? 5}
                onChange={(e) =>
                  onUpdateData(node.id, {
                    timelineDurationSeconds: Math.max(0.1, parseFloat(e.target.value) || 0.1),
                  })
                }
                className="w-full rounded-lg px-2 py-1 text-xs border-none outline-none"
                style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "#e2e8f0" }}
              />
            </div>
          </div>
        </div>

        {/* Node ID (read-only, for debugging) */}
        <div>
          <label className="text-[10px] font-medium uppercase tracking-wider block mb-1"
                 style={{ color: "#94a3b8" }}>ID</label>
          <code className="text-[10px] block truncate" style={{ color: "#64748b" }}>
            {node.id}
          </code>
        </div>
      </div>
    </div>
  );
}
