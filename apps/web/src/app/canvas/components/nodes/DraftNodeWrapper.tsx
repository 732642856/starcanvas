import React, { memo, useCallback } from "react"
import type { NodeProps } from "@xyflow/react"
import { NodeToolbar, Position, useReactFlow } from "@xyflow/react"
import { Check, X } from "lucide-react"
import { DESIGN_TOKENS } from "../../styles/designSystem"
import { createIdleRunMeta } from "../../utils/nodeRunMeta"
import { useCanvasStore } from "../../stores/canvasStore"

export const DraftNodeWrapper = memo(function DraftNodeWrapper({
  children,
  props,
}: {
  children: React.ReactNode
  props: NodeProps
}) {
  const isDraft = props.data?.isDraft === true
  const draftSourceChatId =
    typeof props.data?.draftSourceChatId === "string"
      ? props.data.draftSourceChatId
      : undefined
  const runMeta = (props.data?.runMeta ?? {}) as { pendingReason?: string }
  const { setNodes, setEdges } = useReactFlow()
  const settlePreviewDraftNode = useCanvasStore((state) => state.settlePreviewDraftNode)

  const handleConfirm = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setNodes((nds) => 
      nds.map((node) =>
        node.id === props.id
          ? {
              ...node,
              data: {
                ...node.data,
                isDraft: false,
                pendingExecution: false,
                runMeta:
                  runMeta.pendingReason === "chat-preview"
                    ? createIdleRunMeta()
                    : node.data?.runMeta,
              },
            }
          : node,
      )
    )
    if (draftSourceChatId) {
      settlePreviewDraftNode({
        txId: draftSourceChatId,
        nodeId: props.id,
        disposition: "confirm",
      })
    }
  }, [draftSourceChatId, props.id, runMeta.pendingReason, setNodes, settlePreviewDraftNode])

  const handleDiscard = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setEdges((edges) =>
      edges.filter((edge) => edge.source !== props.id && edge.target !== props.id),
    )
    setNodes((nds) => nds.filter(n => n.id !== props.id))
    if (draftSourceChatId) {
      settlePreviewDraftNode({
        txId: draftSourceChatId,
        nodeId: props.id,
        disposition: "discard",
      })
    }
  }, [draftSourceChatId, props.id, setEdges, setNodes, settlePreviewDraftNode])
  
  if (!isDraft) return <>{children}</>

  return (
    <div className="relative isolate">
      {/* Draft Style Overlay directly applying to the wrapper */}
      <div 
        className="absolute inset-0 z-10 pointer-events-none rounded-xl"
        style={{
          border: `2px dashed ${DESIGN_TOKENS.accent}`,
          opacity: 0.6,
          boxShadow: `0 0 0 4px ${DESIGN_TOKENS.accent}33`
        }}
      />
      
      {/* Opacity for the actual node content */}
      <div className="opacity-80 transition-opacity hover:opacity-100">
        {children}
      </div>

      <NodeToolbar
        isVisible
        position={Position.Top}
        offset={-42}
      >
        <div
          className="flex items-center gap-1 rounded-full p-1 shadow-lg backdrop-blur-md"
        style={{
          backgroundColor: DESIGN_TOKENS.surfaceAlt,
          border: `1px solid ${DESIGN_TOKENS.border}`
        }}
      >
        <button
          onClick={handleConfirm}
          data-testid="draft-confirm"
          aria-label="落地草稿"
          title="落地草稿"
          className="flex h-7 w-7 items-center justify-center rounded-full transition-colors"
          style={{
            backgroundColor: DESIGN_TOKENS.accent,
            color: "#fff"
          }}
        >
          <Check size={12} strokeWidth={2.5} />
          <span className="sr-only">落地</span>
        </button>
        <button
          onClick={handleDiscard}
          data-testid="draft-discard"
          aria-label="丢弃草稿"
          title="丢弃草稿"
          className="flex h-7 w-7 items-center justify-center rounded-full transition-colors hover:bg-white/10"
          style={{ color: DESIGN_TOKENS.textMuted }}
        >
          <X size={14} strokeWidth={2} />
        </button>
        </div>
      </NodeToolbar>
    </div>
  )
})
