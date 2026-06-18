// ============================================================================
// QuickAddNodeSearch — ComfyUI 风格快速节点搜索面板
//
// 双击画布空白区域打开，输入关键词过滤节点类型，Enter 创建，Esc 关闭。
// ============================================================================
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DESIGN_TOKENS } from "../../styles/designSystem";
import type { QuickAddNodeOption } from "./quickAddNodeOptions";

// ============================================================================
// Props
// ============================================================================
export type QuickAddNodeSearchProps = {
  open: boolean;
  /** 屏幕坐标，定位浮层 */
  position: { x: number; y: number };
  options: QuickAddNodeOption[];
  onSelect: (option: QuickAddNodeOption) => void;
  onClose: () => void;
};

// ============================================================================
// Component
// ============================================================================
export function QuickAddNodeSearch({
  open,
  position,
  options,
  onSelect,
  onClose,
}: QuickAddNodeSearchProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // 过滤选项
  const filteredOptions = query.trim()
    ? options.filter((opt) => {
        const q = query.trim().toLowerCase();
        return (
          opt.label.toLowerCase().includes(q) ||
          opt.description.toLowerCase().includes(q) ||
          opt.keywords.some((kw) => kw.toLowerCase().includes(q))
        );
      })
    : options;

  // 打开时自动聚焦输入框
  // 注意：状态重置由父组件通过 key prop 重挂载实现，避免 effect 中 setState 警告
  useEffect(() => {
    if (open) {
      // 需要等一帧让 input 渲染出来再聚焦
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }
  }, [open]);

  // 点击外部关闭
  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // 延迟绑定以避免打开时的 click 事件也被捕获
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [open, onClose]);

  // 键盘导航
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((prev) =>
            prev < filteredOptions.length - 1 ? prev + 1 : 0,
          );
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((prev) =>
            prev > 0 ? prev - 1 : filteredOptions.length - 1,
          );
          break;
        case "Enter":
          e.preventDefault();
          if (filteredOptions[selectedIndex]) {
            onSelect(filteredOptions[selectedIndex]);
            onClose();
          }
          break;
        case "Escape":
          e.preventDefault();
          onClose();
          break;
      }
    },
    [filteredOptions, selectedIndex, onSelect, onClose],
  );

  // 保持选中项在可视范围内
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const selectedEl = panel.querySelector(`[data-option-index="${selectedIndex}"]`);
    if (selectedEl) {
      selectedEl.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  if (!open) return null;

  return (
    <div
      ref={panelRef}
      data-testid="quick-add-node-search"
      className="fixed z-50 rounded-xl border shadow-2xl backdrop-blur-md"
      style={{
        left: position.x,
        top: position.y,
        width: 320,
        maxHeight: 360,
        borderColor: DESIGN_TOKENS.border,
        backgroundColor: "rgba(18, 18, 24, 0.95)",
        color: DESIGN_TOKENS.textPrimary,
        overflow: "hidden",
      }}
    >
      {/* 搜索输入框 */}
      <div
        className="flex items-center gap-2 border-b px-3 py-2.5"
        style={{ borderColor: DESIGN_TOKENS.border }}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ color: DESIGN_TOKENS.textSecondary, flexShrink: 0 }}
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          ref={inputRef}
          data-testid="quick-add-node-search-input"
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelectedIndex(0);
          }}
          onKeyDown={handleKeyDown}
          placeholder="搜索节点类型..."
          className="flex-1 bg-transparent text-sm outline-none placeholder:opacity-40"
          style={{ color: DESIGN_TOKENS.textPrimary }}
          autoComplete="off"
          spellCheck={false}
        />
        <kbd
          className="rounded px-1.5 py-0.5 text-[10px]"
          style={{
            color: DESIGN_TOKENS.textSecondary,
            border: `1px solid ${DESIGN_TOKENS.border}`,
          }}
        >
          Esc
        </kbd>
      </div>

      {/* 选项列表 */}
      <div className="max-h-[280px] overflow-y-auto py-1">
        {filteredOptions.length === 0 ? (
          <div
            className="px-4 py-6 text-center text-xs"
            style={{ color: DESIGN_TOKENS.textSecondary }}
          >
            无匹配节点
          </div>
        ) : (
          filteredOptions.map((option, index) => {
            const isSelected = index === selectedIndex;

            // 高亮匹配文字（仅第一个匹配关键词）
            const q = query.trim().toLowerCase();
            const matchIndex = q ? option.label.toLowerCase().indexOf(q) : -1;

            return (
              <button
                key={option.id}
                data-testid={`quick-add-node-option-${option.id}`}
                data-option-index={index}
                className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors"
                style={{
                  backgroundColor: isSelected
                    ? "rgba(168, 85, 247, 0.15)"
                    : "transparent",
                  color: isSelected
                    ? DESIGN_TOKENS.textPrimary
                    : DESIGN_TOKENS.textSecondary,
                }}
                onMouseEnter={() => setSelectedIndex(index)}
                onClick={() => {
                  onSelect(option);
                  onClose();
                }}
              >
                {/* 节点类型图标 */}
                <span
                  className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded text-xs"
                  style={{
                    backgroundColor: "rgba(168, 85, 247, 0.1)",
                    color: "rgba(168, 85, 247, 0.8)",
                  }}
                >
                  {getNodeTypeIcon(option)}
                </span>

                {/* 标签和描述 */}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">
                    {q && matchIndex >= 0 ? (
                      <>
                        {option.label.slice(0, matchIndex)}
                        <mark
                          style={{
                            backgroundColor: "rgba(168, 85, 247, 0.25)",
                            color: DESIGN_TOKENS.textPrimary,
                            borderRadius: 2,
                          }}
                        >
                          {option.label.slice(matchIndex, matchIndex + q.length)}
                        </mark>
                        {option.label.slice(matchIndex + q.length)}
                      </>
                    ) : (
                      option.label
                    )}
                  </div>
                  <div
                    className="truncate text-[11px]"
                    style={{ color: DESIGN_TOKENS.textSecondary }}
                  >
                    {option.description}
                  </div>
                </div>

                {/* Enter 提示 */}
                {isSelected && (
                  <kbd
                    className="rounded px-1.5 py-0.5 text-[10px]"
                    style={{
                      color: "rgba(168, 85, 247, 0.8)",
                      border: "1px solid rgba(168, 85, 247, 0.2)",
                    }}
                  >
                    ⏎
                  </kbd>
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Helpers
// ============================================================================
function getNodeTypeIcon(option: QuickAddNodeOption): string {
  switch (option.nodeType) {
    case "content":
      return option.nodeKind === "storyboard" ? "🎬" : "T";
    case "image":
      return "🖼";
    case "sketch":
      return "✏️";
    case "agent":
      return "🤖";
    case "workflow":
      return "⚙";
    default:
      return "●";
  }
}
