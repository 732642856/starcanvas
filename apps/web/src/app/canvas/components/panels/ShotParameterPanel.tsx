// ============================================================================
// ShotParameterPanel — 镜头参数面板
// 选中 shot 类型节点时在右侧显示可编辑的镜头参数
// ============================================================================
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import type { Node } from "@xyflow/react";
import type { CanvasNodeData } from "../canvas/types";
import {
  shotTypeLabelMap,
  cameraMovementLabelMap,
} from "@/types/cinematic";
import type { StoryboardShotType, StoryboardCameraMovement } from "@/types/cinematic";

interface ShotParameterPanelProps {
  node: Node<CanvasNodeData> | null;
  onClose: () => void;
  onUpdateShot: (patch: Partial<NonNullable<CanvasNodeData["shot"]>>) => void;
}

const SHOT_TYPE_OPTIONS = (Object.keys(shotTypeLabelMap) as StoryboardShotType[]).map(
  (key) => ({ value: key, label: shotTypeLabelMap[key] }),
);

const CAMERA_OPTIONS = (Object.keys(cameraMovementLabelMap) as StoryboardCameraMovement[]).map(
  (key) => ({ value: key, label: cameraMovementLabelMap[key] }),
);

export default function ShotParameterPanel({
  node,
  onClose,
  onUpdateShot,
}: ShotParameterPanelProps) {
  const [title, setTitle] = useState("");
  const [shotType, setShotType] = useState("");
  const [camera, setCamera] = useState("");
  const [duration, setDuration] = useState("");
  const [description, setDescription] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Sync state when node changes
  useEffect(() => {
    if (!node?.data?.shot) return;
    const s = node.data.shot;
    setTitle(s.title ?? "");
    setShotType(s.shotType ?? "");
    setCamera(s.cameraMovement ?? "");
    setDuration(s.duration ?? "");
    setDescription(s.description ?? "");
  }, [node?.id]);

  const debouncedUpdate = useCallback(
    (patch: Partial<NonNullable<CanvasNodeData["shot"]>>) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        onUpdateShot(patch);
      }, 400);
    },
    [onUpdateShot],
  );

  const shot = node?.data?.shot;
  if (!node || !shot) return null;

  return (
    <div
      className="absolute right-4 top-20 z-30 w-80 overflow-y-auto rounded-2xl border shadow-2xl backdrop-blur-xl"
      style={{
        maxHeight: "calc(100vh - 6rem)",
        borderColor: "rgba(168, 85, 247, 0.3)",
        backgroundColor: "rgba(18, 18, 24, 0.95)",
      }}
      data-testid="shot-parameter-panel"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: "rgba(168, 85, 247, 0.15)" }}>
        <div className="flex items-center gap-2">
          <div
            className="flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold"
            style={{ backgroundColor: "rgba(168, 85, 247, 0.2)", color: "#a855f7" }}
          >
            S
          </div>
          <span className="text-sm font-semibold" style={{ color: "#e4e4e7" }}>
            镜头参数
          </span>
        </div>
        <button
          onClick={onClose}
          className="rounded-lg p-1 transition-colors hover:bg-white/5"
          aria-label="关闭参数面板"
        >
          <X size={16} style={{ color: "#71717a" }} />
        </button>
      </div>

      {/* Body */}
      <div className="flex flex-col gap-3 px-4 py-3">
        {/* Shot ID (read-only) */}
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "#71717a" }}>
            Shot ID
          </label>
          <div
            className="rounded-lg px-3 py-1.5 text-xs font-mono"
            style={{
              backgroundColor: "rgba(255, 255, 255, 0.03)",
              color: "#52525b",
              border: "1px solid rgba(255, 255, 255, 0.04)",
            }}
            data-testid="shot-parameter-shot-id"
          >
            {shot.id}
          </div>
        </div>

        {/* Title */}
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "#71717a" }}>
            标题
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              debouncedUpdate({ title: e.target.value });
            }}
            className="rounded-lg px-3 py-1.5 text-sm outline-none transition-colors"
            style={{
              backgroundColor: "rgba(255, 255, 255, 0.04)",
              color: "#e4e4e7",
              border: "1px solid rgba(255, 255, 255, 0.06)",
            }}
            placeholder="镜头标题"
            data-testid="shot-parameter-title"
          />
        </div>

        {/* Shot Type */}
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "#71717a" }}>
            景别
          </label>
          <select
            value={shotType}
            onChange={(e) => {
              setShotType(e.target.value);
              onUpdateShot({ shotType: e.target.value });
            }}
            className="rounded-lg px-3 py-1.5 text-sm outline-none transition-colors appearance-none cursor-pointer"
            style={{
              backgroundColor: "rgba(255, 255, 255, 0.04)",
              color: "#e4e4e7",
              border: "1px solid rgba(255, 255, 255, 0.06)",
            }}
            data-testid="shot-parameter-shot-type"
          >
            <option value="" style={{ backgroundColor: "#18181b" }}>未设置</option>
            {SHOT_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value} style={{ backgroundColor: "#18181b" }}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Camera */}
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "#71717a" }}>
            运镜
          </label>
          <select
            value={camera}
            onChange={(e) => {
              setCamera(e.target.value);
              onUpdateShot({ cameraMovement: e.target.value });
            }}
            className="rounded-lg px-3 py-1.5 text-sm outline-none transition-colors appearance-none cursor-pointer"
            style={{
              backgroundColor: "rgba(255, 255, 255, 0.04)",
              color: "#e4e4e7",
              border: "1px solid rgba(255, 255, 255, 0.06)",
            }}
            data-testid="shot-parameter-camera"
          >
            <option value="" style={{ backgroundColor: "#18181b" }}>未设置</option>
            {CAMERA_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value} style={{ backgroundColor: "#18181b" }}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Duration */}
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "#71717a" }}>
            时长
          </label>
          <input
            type="text"
            value={duration}
            onChange={(e) => {
              setDuration(e.target.value);
              debouncedUpdate({ duration: e.target.value });
            }}
            className="rounded-lg px-3 py-1.5 text-sm outline-none transition-colors"
            style={{
              backgroundColor: "rgba(255, 255, 255, 0.04)",
              color: "#e4e4e7",
              border: "1px solid rgba(255, 255, 255, 0.06)",
            }}
            placeholder="例: 3s / 00:05 / 1500ms"
            data-testid="shot-parameter-duration"
          />
        </div>

        {/* Description */}
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "#71717a" }}>
            描述
          </label>
          <textarea
            value={description}
            onChange={(e) => {
              setDescription(e.target.value);
              debouncedUpdate({ description: e.target.value });
            }}
            rows={3}
            className="resize-none rounded-lg px-3 py-1.5 text-sm outline-none transition-colors"
            style={{
              backgroundColor: "rgba(255, 255, 255, 0.04)",
              color: "#e4e4e7",
              border: "1px solid rgba(255, 255, 255, 0.06)",
            }}
            placeholder="镜头描述、动作、对话摘要..."
            data-testid="shot-parameter-description"
          />
        </div>
      </div>
    </div>
  );
}
