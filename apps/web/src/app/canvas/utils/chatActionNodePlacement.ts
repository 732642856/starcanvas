import type { Node } from "@xyflow/react"

import type { CanvasNodeData } from "../components/canvas/types"
import { quickLayout } from "./dagre-layout.ts"

type NodeSize = {
  width: number
  height: number
}

type XYPosition = {
  x: number
  y: number
}

export function layoutBatchNodePositions(
  nodeSizes: NodeSize[],
  anchor: XYPosition,
  cols = 3,
): XYPosition[] {
  if (nodeSizes.length === 0) return []

  const layouted = quickLayout(
    nodeSizes.map(
      (size, index) =>
        ({
          id: `chat-action-node-${index}`,
          type: "content",
          position: { x: 0, y: 0 },
          measured: size,
          data: { nodeKind: "text" },
        }) satisfies Node<CanvasNodeData>,
    ),
    [],
    cols,
  )

  const firstPosition = layouted[0]?.position ?? { x: 0, y: 0 }

  return layouted.map((node) => ({
    x: anchor.x + (node.position.x - firstPosition.x),
    y: anchor.y + (node.position.y - firstPosition.y),
  }))
}
