import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { Node } from "@xyflow/react"
import type { CanvasNodeData } from "../components/canvas/types"
import { createRemixAnalysisArtifacts } from "./remixAnalysisArtifacts.ts"
import type { RemixAnalysisResult } from "./newWorkflowServices"

describe("createRemixAnalysisArtifacts", () => {
  it("derives prompt, storyboard nodes, and production queue from remix-analysis result", () => {
    const sourceNode: Node<CanvasNodeData> = {
      id: "remix-1",
      type: "workflow",
      position: { x: 120, y: 180 },
      data: {
        title: "结构拆解：雨夜重逢",
        nodeKind: "remix-analysis",
      },
    }

    const result: RemixAnalysisResult = {
      sourceDescription: "雨夜旧影院短片",
      template: {
        id: "tpl-1",
        category: "剧情",
        totalDuration: "18s",
        hookPattern: "前 2 秒先给重逢钩子",
        structure: [
          {
            timestamp: "0",
            duration: "2",
            type: "hook",
            description: "雨夜旧影院门口，两人隔街对望",
            visualNotes: "霓虹反光，长焦压缩",
            audioNotes: "雨声 + 低频氛围",
            emotionalValence: 0.6,
          },
          {
            timestamp: "2",
            duration: "4",
            type: "payoff",
            description: "推门进入大厅，停在旧海报前",
            visualNotes: "跟拍推进",
            audioNotes: "脚步回响",
            emotionalValence: 0.8,
          },
        ],
        keyTechniques: ["重逢钩子"],
        reusableElements: ["雨夜", "旧影院", "重逢停顿"],
        adaptationNotes: "题材可替换，但保留重逢情绪推进",
      },
      emotionalCurve: [
        { phase: "hook", valence: 0.6, intensity: 0.7 },
        { phase: "payoff", valence: 0.8, intensity: 0.9 },
      ],
      keyMetrics: {
        hookTime: "2s",
        conflictDensity: "medium",
        twistCount: 1,
        pacing: "fast",
      },
      source: "mock",
    }

    let counter = 0
    const artifacts = createRemixAnalysisArtifacts({
      sourceNode,
      videoName: "rainy-reunion.mp4",
      result,
      idFactory: () => `derived-${++counter}`,
    })

    assert.equal(artifacts.promptNode.data.nodeKind, "prompt")
    assert.match(String(artifacts.promptNode.data.prompt), /参考视频：rainy-reunion\.mp4/)
    assert.match(String(artifacts.promptNode.data.prompt), /前 2 秒先给重逢钩子/)

    assert.equal(artifacts.storyboardNodes.length, 2)
    assert.equal(artifacts.storyboardNodes[0]?.data.nodeKind, "shot")
    assert.match(String(artifacts.storyboardNodes[0]?.data.prompt), /hook/)
    assert.equal(artifacts.storyboardEdges.length, 2)

    assert.equal(artifacts.productionQueue?.tasks.length, 2)
    assert.equal(artifacts.productionQueue?.tasks[0]?.action, "generate-storyboard-image")
    assert.equal(artifacts.productionQueue?.tasks[1]?.title, "参考分镜 2")
  })
})
