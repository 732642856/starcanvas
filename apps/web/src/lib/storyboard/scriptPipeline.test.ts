import assert from "node:assert/strict"
import test from "node:test"
import {
  buildScriptPipelineUserPrompt,
  createDryRunScriptPipeline,
  normalizeScriptPipelineResult,
} from "./scriptPipeline.ts"

test("builds strict script pipeline prompt with required stages", () => {
  const prompt = buildScriptPipelineUserPrompt({
    projectTitle: "太子替我背黑锅",
    script: "荆钗发现黑锅。赵珩背锅救场。",
    targetShotCount: 2,
    characters: [{ id: "char-zhaoheng", name: "赵珩", referenceAssetIds: ["asset-zhaoheng"], viewSetId: "view-zhaoheng" }],
  })

  assert.match(prompt, /script_to_complete_storyboard_pipeline/)
  assert.match(prompt, /nineGridPrompt/)
  assert.match(prompt, /videoPrompt/)
  assert.match(prompt, /referenceAssetIds/)
})

test("normalizes character bindings and final prompts", () => {
  const pipeline = normalizeScriptPipelineResult(
    {
      projectTitle: "太子替我背黑锅",
      shots: [
        {
          order: 1,
          textStoryboard: "赵珩背起黑锅。",
          characters: ["赵珩"],
          visualPrompt: "cinematic prince with black wok",
        },
      ],
    },
    {
      script: "赵珩背起黑锅。",
      characters: [{ id: "char-zhaoheng", name: "赵珩", referenceAssetIds: ["asset-zhaoheng"], viewSetId: "view-zhaoheng" }],
    },
  )

  assert.equal(pipeline.shots.length, 1)
  assert.equal(pipeline.shots[0].characterBindings[0].characterId, "char-zhaoheng")
  assert.equal(pipeline.shots[0].characterBindings[0].viewSetId, "view-zhaoheng")
  assert.match(pipeline.shots[0].imagePrompt, /consistent/i)
  assert.match(pipeline.nineGridPrompt, /3x3 storyboard grid/)
})

test("dry run creates up to nine executable shots", () => {
  const pipeline = createDryRunScriptPipeline({
    projectTitle: "太子替我背黑锅",
    script: "荆钗发现黑锅。赵珩背锅救场。御膳房众人惊住。",
    targetShotCount: 9,
    characters: [{ name: "赵珩" }, { name: "荆钗" }],
  })

  assert.equal(pipeline.shots.length, 3)
  assert.match(pipeline.shots[0].storyboardPrompt, /润色/)
  assert.match(pipeline.shots[0].videoPrompt, /3-second shot/)
  assert.equal(pipeline.shots[0].characterBindings.length, 2)
})
