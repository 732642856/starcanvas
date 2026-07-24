/**
 * Tests for importStoryboardDraftToCanvas
 */
import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { importStoryboardDraftToCanvas } from "../importDraftToCanvas.ts"
import type { StoryboardDraftShot } from "../importDraftToCanvas.ts"

// ── Helpers ────────────────────────────────────────────

function makeShot(overrides: Partial<StoryboardDraftShot> = {}): StoryboardDraftShot {
  return {
    id: `shot_${Date.now()}`,
    title: "分镜 1",
    description: "测试分镜描述",
    durationSec: 5,
    visualPrompt: "test prompt",
    ...overrides,
  }
}

// ── Tests ──────────────────────────────────────────────

describe("importStoryboardDraftToCanvas", () => {
  it("returns correct number of nodes", () => {
    const shots = [makeShot(), makeShot(), makeShot()]
    const nodes = importStoryboardDraftToCanvas(shots)
    assert.equal(nodes.length, 3)
  })

  it("returns empty array for empty shots", () => {
    const nodes = importStoryboardDraftToCanvas([])
    assert.equal(nodes.length, 0)
  })

  it("every node has type 'shot' and nodeKind 'shot'", () => {
    const nodes = importStoryboardDraftToCanvas([makeShot()])
    assert.equal(nodes[0].type, "shot")
    assert.equal(nodes[0].data.nodeKind, "shot")
  })

  it("preserves title, description, prompt, duration", () => {
    const shot = makeShot({
      title: "My Shot",
      description: "A test shot",
      visualPrompt: "close-up, dramatic",
      durationSec: 3.5,
    })
    const nodes = importStoryboardDraftToCanvas([shot])

    assert.equal(nodes[0].data.title, "My Shot")
    assert.equal(nodes[0].data.content, "A test shot")
    assert.equal(nodes[0].data.prompt, "close-up, dramatic")
    assert.equal(nodes[0].data.timelineDurationSeconds, 3.5)
    assert.equal(nodes[0].data.shot?.title, "My Shot")
    assert.equal(nodes[0].data.shot?.description, "A test shot")
    assert.equal(nodes[0].data.shot?.visualPrompt, "close-up, dramatic")
    assert.equal(nodes[0].data.shot?.duration, "3.5s")
  })

  it("preserves draft source metadata for traceability", () => {
    const shot = makeShot({
      id: "draft-shot-1",
      sourceType: "reference-video",
      sourceMeta: {
        videoAnalysisNodeId: "analyze-1",
        sourceVideoId: "video-1",
        timestampMs: 1200,
      },
    })
    const nodes = importStoryboardDraftToCanvas([shot])

    assert.equal(nodes[0].data.sourceType, "reference-video")
    assert.equal(nodes[0].data.sourceShotId, "draft-shot-1")
    assert.equal(nodes[0].data.sourceMeta?.videoAnalysisNodeId, "analyze-1")
    assert.equal(nodes[0].data.sourceMeta?.sourceVideoId, "video-1")
    assert.equal(nodes[0].data.sourceMeta?.timestampMs, 1200)
  })

  it("includes imageUrl when thumbnail provided", () => {
    const shot = makeShot({ thumbnail: "data:image/png;base64,abc" })
    const nodes = importStoryboardDraftToCanvas([shot])
    assert.equal(nodes[0].data.imageUrl, "data:image/png;base64,abc")
    assert.equal(nodes[0].data.thumbnailUrl, "data:image/png;base64,abc")
    assert.equal(nodes[0].data.shot?.generatedImageUrl, undefined)
    assert.equal(nodes[0].data.shot?.referenceImageUrl, "data:image/png;base64,abc")
    assert.equal(nodes[0].data.shot?.generationStatus, "idle")
    assert.equal(nodes[0].data.shot?.status, "ready")
    assert.match(nodes[0].data.shot?.notes ?? "", /参考视频关键帧/)
  })

  it("imageUrl is undefined when no thumbnail", () => {
    const shot = makeShot({ thumbnail: undefined })
    const nodes = importStoryboardDraftToCanvas([shot])
    assert.equal(nodes[0].data.imageUrl, undefined)
  })

  it("generates unique node ids", () => {
    const nodes = importStoryboardDraftToCanvas([makeShot(), makeShot()])
    assert.notEqual(nodes[0].id, nodes[1].id)
  })

  it("positions nodes in a grid", () => {
    const nodes = importStoryboardDraftToCanvas(
      Array.from({ length: 8 }, () => makeShot()),
      { columns: 4, baseX: 100, baseY: 200, nodeWidth: 320, nodeHeight: 240 },
    )

    // First column should all have x=100
    assert.equal(nodes[0].position.x, 100)
    assert.equal(nodes[4].position.x, 100) // row 2, col 1

    // Second column x = 100 + 320 + 40 = 460
    assert.equal(nodes[1].position.x, 460)

    // First row y = 200
    assert.equal(nodes[0].position.y, 200)

    // Second row y = 200 + 240 + 80 = 520
    assert.equal(nodes[4].position.y, 520)
  })

  it("uses source time metadata for timeline start when available", () => {
    const nodes = importStoryboardDraftToCanvas([
      makeShot({
        durationSec: 1.5,
        sourceMeta: { timeSec: 12.5 },
      }),
      makeShot({ durationSec: 2 }),
    ])

    assert.equal(nodes[0].data.timelineStartTimeSeconds, 12.5)
    assert.equal(nodes[0].data.timelineDurationSeconds, 1.5)
    assert.equal(nodes[1].data.timelineStartTimeSeconds, 14)
    assert.equal(nodes[1].data.timelineDurationSeconds, 2)
  })

  it("stacks rows with existingNodeCount offset", () => {
    const nodes = importStoryboardDraftToCanvas([makeShot()], {
      existingNodeCount: 5,
      baseY: 100,
      baseX: 100,
    })

    assert.equal(nodes[0].position.y, 100 + 5 * 10) // 150
    assert.equal(nodes[0].position.x, 100)
  })

  it("every node has createdAt timestamp", () => {
    const nodes = importStoryboardDraftToCanvas([makeShot()])
    assert.ok(nodes[0].data.createdAt! > 0)
  })

  it("uses shot node default dimensions", () => {
    const nodes = importStoryboardDraftToCanvas([makeShot()])
    assert.equal(nodes[0].width, 340)
    assert.equal(nodes[0].height, 360)
    assert.equal(nodes[0].data.displayWidth, 340)
    assert.equal(nodes[0].data.displayHeight, 360)
  })
})
