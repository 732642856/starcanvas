import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { createUndoHistoryController } from "./undoHistoryController.ts"

function snapshot(id: string) {
  return {
    nodes: [{ id, type: "content", position: { x: 0, y: 0 }, data: { nodeKind: "text" } }],
    edges: [],
  }
}

describe("createUndoHistoryController", () => {
  it("keeps undo stacks isolated per controller instance", () => {
    const first = createUndoHistoryController()
    const second = createUndoHistoryController()

    first.push(snapshot("first"), "add")
    second.push(snapshot("second"), "add")

    assert.equal(first.undo()?.nodes[0]?.id, "first")
    assert.equal(second.undo()?.nodes[0]?.id, "second")
  })

  it("clears pending debounce timer on dispose", () => {
    const controller = createUndoHistoryController({
      setTimeout: () => 123,
      clearTimeout: (timer) => {
        assert.equal(timer, 123)
      },
    })

    controller.push(snapshot("a"), "add")
    controller.dispose()
  })

  it("coalesces rapid same action types but never coalesces move actions", () => {
    const controller = createUndoHistoryController({
      setTimeout: () => 1,
      clearTimeout: () => {},
    })

    controller.push(snapshot("add-1"), "add")
    controller.push(snapshot("add-2"), "add")
    controller.push(snapshot("move-1"), "move")
    controller.push(snapshot("move-2"), "move")

    assert.equal(controller.undo()?.nodes[0]?.id, "move-2")
    assert.equal(controller.undo()?.nodes[0]?.id, "move-1")
    assert.equal(controller.undo()?.nodes[0]?.id, "add-1")
    assert.equal(controller.undo(), undefined)
  })

  it("moves the current snapshot between undo and redo stacks", () => {
    const controller = createUndoHistoryController()

    controller.push(snapshot("before"), "add")

    assert.equal(controller.undo(snapshot("current"))?.nodes[0]?.id, "before")
    assert.equal(controller.redo(snapshot("before"))?.nodes[0]?.id, "current")
  })
})
