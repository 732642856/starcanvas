import assert from "node:assert/strict"
import test from "node:test"
import type { Node } from "@xyflow/react"
import type { CanvasNodeData } from "@/app/canvas/components/canvas/types"
import { createDryRunScriptPipeline } from "./scriptPipeline.ts"
import { createScriptPipelineCanvasNodes } from "./scriptPipelineCanvas.ts"

test("creates shot nodes and one nine-grid node from script pipeline", () => {
  const sourceNode: Node<CanvasNodeData> = {
    id: "source-1",
    type: "storyboard",
    position: { x: 100, y: 200 },
    data: { nodeKind: "storyboard", title: "太子替我背黑锅", content: "剧本" },
  }
  const pipeline = createDryRunScriptPipeline({
    projectTitle: "太子替我背黑锅",
    script: "荆钗发现黑锅。赵珩背锅救场。",
    characters: [{ id: "char-zhaoheng", name: "赵珩" }],
  })

  const result = createScriptPipelineCanvasNodes({ pipeline, sourceNode, generatedAt: "2026-07-19T00:00:00.000Z" })

  assert.equal(result.shotNodes.length, 2)
  assert.equal(result.gridNode.type, "storyboardGrid")
  assert.equal(result.edges.length, 3)
  assert.equal(result.shotNodes[0].data.nodeKind, "shot")
  assert.match(result.shotNodes[0].data.shot?.visualPrompt || "", /consistent characters/)
  assert.match(String(result.shotNodes[0].data.shot?.sourceMeta?.videoPrompt), /3-second shot/)
  assert.equal(result.shotNodes[0].data.shot?.characterIdentities?.[0]?.name, "赵珩")
  assert.match(result.shotNodes[0].data.shot?.characterIdentities?.[0]?.notes || "", /脸部锁定/)
  assert.deepEqual(result.gridNode.data.generatedShotNodeIds, result.shotNodes.map((node) => node.id))
})
