import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { layoutBatchNodePositions } from "./chatActionNodePlacement.ts"

describe("layoutBatchNodePositions", () => {
  it("keeps the first node at the anchor position and offsets later nodes to avoid overlap", () => {
    const anchor = { x: 400, y: 300 }
    const positions = layoutBatchNodePositions(
      [
        { width: 280, height: 200 },
        { width: 280, height: 200 },
      ],
      anchor,
    )

    assert.deepEqual(positions[0], anchor)
    assert.ok(positions[1].x > positions[0].x)
    assert.equal(positions[1].y, positions[0].y)
  })

  it("wraps additional nodes onto the next row", () => {
    const anchor = { x: 400, y: 300 }
    const positions = layoutBatchNodePositions(
      [
        { width: 280, height: 200 },
        { width: 280, height: 200 },
        { width: 280, height: 200 },
        { width: 280, height: 200 },
      ],
      anchor,
      3,
    )

    assert.equal(positions[3]?.x, positions[0]?.x)
    assert.ok((positions[3]?.y ?? 0) > (positions[0]?.y ?? 0))
  })
})
