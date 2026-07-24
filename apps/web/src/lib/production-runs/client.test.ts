import test from "node:test"
import assert from "node:assert/strict"

import { pollProductionRun } from "./client.ts"

test("pollProductionRun returns a completed asset only after the API reports completed", async () => {
  const result = await pollProductionRun("run-1", {
    fetchImpl: async () => new Response(JSON.stringify({
      data: {
        id: "run-1",
        status: "COMPLETED",
        outputAsset: { id: "asset-video", url: "https://api/video.mp4" },
      },
    }), { status: 200 }),
  })
  assert.equal(result.outputAsset?.id, "asset-video")
})
