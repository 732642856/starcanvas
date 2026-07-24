"use client";

import { memo } from "react";
import {
  Clock,
  FileText,
  Image,
  Layers,
  RotateCcw,
  Save,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { DESIGN_TOKENS } from "../../styles/designSystem";
import { useCanvasSnapshotStore } from "../../stores/useCanvasSnapshotStore";
import { useWorkspaceHistoryStore } from "../../stores/useWorkspaceHistoryStore";
import type { CanvasSnapshot } from "../../types/canvas-snapshot";
import type { WorkspaceHistoryEventType } from "../../types/workspace-history";

interface WorkspaceHistoryPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectNode?: (nodeId: string) => void;
  onCreateSnapshot?: () => void;
  onRestoreSnapshot?: (snapshot: CanvasSnapshot) => void;
}

const eventLabels: Record<WorkspaceHistoryEventType, string> = {
  "document-uploaded": "文档上传",
  "node-created": "节点创建",
  "story-generated": "故事生成",
  "storyboard-generated": "文字分镜",
  "shots-split": "拆分 Shot",
  "image-generated": "图片生成",
  "video-workflow-created": "视频链路",
  "snapshot-created": "保存快照",
  "snapshot-restored": "恢复快照",
};

function getEventIcon(type: WorkspaceHistoryEventType) {
  if (type === "document-uploaded") return FileText;
  if (type === "image-generated") return Image;
  if (type === "video-workflow-created") return Layers;
  if (type === "shots-split") return Layers;
  if (type === "story-generated" || type === "storyboard-generated") return Sparkles;
  if (type === "snapshot-created") return Save;
  if (type === "snapshot-restored") return RotateCcw;
  return Clock;
}

function formatEventTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${month}-${day} ${hour}:${minute}`;
}

export const WorkspaceHistoryPanel = memo(function WorkspaceHistoryPanel({
  isOpen,
  onClose,
  onSelectNode,
  onCreateSnapshot,
  onRestoreSnapshot,
}: WorkspaceHistoryPanelProps) {
  const events = useWorkspaceHistoryStore((state) => state.events);
  const clear = useWorkspaceHistoryStore((state) => state.clear);
  const snapshots = useCanvasSnapshotStore((state) => state.snapshots);
  const removeSnapshot = useCanvasSnapshotStore((state) => state.removeSnapshot);

  if (!isOpen) return null;

  return (
    <div className="fixed right-5 top-20 z-50 flex max-h-[72vh] w-[360px] flex-col overflow-hidden rounded-2xl border shadow-2xl"
      style={{
        backgroundColor: DESIGN_TOKENS.panelSolid,
        borderColor: DESIGN_TOKENS.border,
        boxShadow: DESIGN_TOKENS.shadowPanel,
      }}
    >
      <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: DESIGN_TOKENS.border }}>
        <div className="flex items-center gap-2">
          <Clock size={16} style={{ color: DESIGN_TOKENS.accent }} />
          <div>
            <h3 className="text-sm font-medium" style={{ color: DESIGN_TOKENS.text }}>工作记录</h3>
            <p className="text-[11px]" style={{ color: DESIGN_TOKENS.textMuted }}>文档、分镜、快照和生成过程时间线</p>
          </div>
        </div>
        <button onClick={onClose} className="rounded-lg p-1 transition-colors hover:bg-white/10" style={{ color: DESIGN_TOKENS.textMuted }}>
          <X size={16} />
        </button>
      </div>

      <div className="border-b px-3 py-3" style={{ borderColor: DESIGN_TOKENS.border }}>
        <button
          type="button"
          onClick={onCreateSnapshot}
          className="flex w-full items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs transition-colors hover:bg-white/5"
          style={{ borderColor: DESIGN_TOKENS.border, color: DESIGN_TOKENS.text }}
        >
          <Save size={13} style={{ color: DESIGN_TOKENS.accent }} />
          保存当前画布版本
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3">
        <div className="mb-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] font-medium" style={{ color: DESIGN_TOKENS.textMuted }}>关键版本</span>
            <span className="text-[10px]" style={{ color: DESIGN_TOKENS.textMuted }}>{snapshots.length}/30</span>
          </div>
          {snapshots.length === 0 ? (
            <div className="rounded-xl border border-dashed px-3 py-4 text-center" style={{ borderColor: DESIGN_TOKENS.border }}>
              <p className="text-xs" style={{ color: DESIGN_TOKENS.textMuted }}>还没有保存过关键版本。</p>
            </div>
          ) : (
            <div className="space-y-2">
              {snapshots.map((snapshot) => (
                <div key={snapshot.id} className="rounded-xl border px-3 py-2.5" style={{ borderColor: DESIGN_TOKENS.border, backgroundColor: "rgba(255,255,255,0.025)" }}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-1 text-sm" style={{ color: DESIGN_TOKENS.text }}>{snapshot.title}</p>
                      <p className="mt-1 text-[11px]" style={{ color: DESIGN_TOKENS.textMuted }}>
                        {formatEventTime(snapshot.createdAt)} · {snapshot.nodeCount} 节点 · {snapshot.edgeCount} 连线
                      </p>
                      {snapshot.summary && (
                        <p className="mt-1 line-clamp-2 text-xs" style={{ color: DESIGN_TOKENS.textSecondary }}>{snapshot.summary}</p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        title="恢复此版本"
                        onClick={() => onRestoreSnapshot?.(snapshot)}
                        className="rounded-lg p-1.5 transition-colors hover:bg-white/10"
                        style={{ color: DESIGN_TOKENS.textMuted }}
                      >
                        <RotateCcw size={13} />
                      </button>
                      <button
                        type="button"
                        title="删除此版本"
                        onClick={() => removeSnapshot(snapshot.id)}
                        className="rounded-lg p-1.5 transition-colors hover:bg-white/10"
                        style={{ color: DESIGN_TOKENS.textMuted }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mb-2 flex items-center justify-between">
          <span className="text-[11px] font-medium" style={{ color: DESIGN_TOKENS.textMuted }}>时间线</span>
        </div>
        {events.length === 0 ? (
          <div className="rounded-xl border border-dashed px-4 py-8 text-center" style={{ borderColor: DESIGN_TOKENS.border }}>
            <p className="text-sm" style={{ color: DESIGN_TOKENS.textSecondary }}>还没有工作记录</p>
            <p className="mt-1 text-xs" style={{ color: DESIGN_TOKENS.textMuted }}>上传文档、拆分分镜或生成图片后会自动记录。</p>
          </div>
        ) : (
          <div className="space-y-2">
            {events.map((event) => {
              const Icon = getEventIcon(event.type);
              return (
                <button
                  key={event.id}
                  type="button"
                  onClick={() => event.nodeId && onSelectNode?.(event.nodeId)}
                  disabled={!event.nodeId}
                  className="w-full rounded-xl border px-3 py-2.5 text-left transition-colors hover:bg-white/5 disabled:cursor-default disabled:hover:bg-transparent"
                  style={{ borderColor: DESIGN_TOKENS.border, backgroundColor: "rgba(255,255,255,0.025)" }}
                >
                  <div className="flex items-start gap-2.5">
                    <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: DESIGN_TOKENS.accentSoft }}>
                      <Icon size={13} style={{ color: DESIGN_TOKENS.accent }} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px]" style={{ color: DESIGN_TOKENS.textMuted }}>{eventLabels[event.type]}</span>
                        <span className="shrink-0 text-[10px]" style={{ color: DESIGN_TOKENS.textMuted }}>{formatEventTime(event.createdAt)}</span>
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-sm" style={{ color: DESIGN_TOKENS.text }}>{event.title}</p>
                      {event.summary && (
                        <p className="mt-1 line-clamp-2 text-xs leading-relaxed" style={{ color: DESIGN_TOKENS.textSecondary }}>{event.summary}</p>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {(events.length > 0 || snapshots.length > 0) && (
        <div className="border-t px-3 py-2" style={{ borderColor: DESIGN_TOKENS.border }}>
          <button
            onClick={clear}
            className="w-full rounded-lg px-3 py-2 text-xs transition-colors hover:bg-white/5"
            style={{ color: DESIGN_TOKENS.textMuted }}
          >
            清空时间线记录
          </button>
        </div>
      )}
    </div>
  );
});

export default WorkspaceHistoryPanel;
