import assert from "node:assert/strict"
import test from "node:test"
import { createScriptPipelineCharacters } from "./scriptPipelineCharacters.ts"

test("maps CharacterIdentityAsset three-view assets into script pipeline characters", () => {
  const characters = createScriptPipelineCharacters([
    {
      id: "char-zhaoheng",
      name: "赵珩",
      role: "太子",
      visualSignature: "young crown prince, calm eyes",
      costume: "ivory and gold robe",
      props: ["black wok"],
      referenceAssetId: "asset-main",
      frontViewAssetId: "asset-front",
      sideViewAssetId: "asset-side",
      backViewAssetId: "asset-back",
    },
  ])

  assert.equal(characters.length, 1)
  assert.equal(characters[0].viewSetId, "char-zhaoheng-three-view")
  assert.deepEqual(characters[0].referenceAssetIds, ["asset-main", "asset-front", "asset-side", "asset-back"])
  assert.equal(characters[0].consistencyLock, true)
  assert.equal(characters[0].faceLock, true)
  assert.equal(characters[0].costumeLock, true)
  assert.match(characters[0].description || "", /black wok/)
})

test("filters unnamed characters and de-duplicates reference assets", () => {
  const characters = createScriptPipelineCharacters([
    { id: "empty", name: "  " },
    { id: "char-jingchai", name: "荆钗", referenceAssetId: "asset-a", frontViewAssetId: "asset-a" },
  ])

  assert.equal(characters.length, 1)
  assert.deepEqual(characters[0].referenceAssetIds, ["asset-a"])
})

test("maps CharacterBibleData referenceAssetIds into script pipeline characters", () => {
  const characters = createScriptPipelineCharacters([
    {
      id: "char-jingchai",
      name: "荆钗",
      role: "宫女",
      visualSignature: "sharp eyes",
      costume: "pale blue robe",
      referenceAssetIds: ["jingchai-reference.png"],
      createdAt: 1,
    },
  ])

  assert.equal(characters[0].role, "宫女")
  assert.deepEqual(characters[0].referenceAssetIds, ["jingchai-reference.png"])
  assert.equal(characters[0].faceLock, true)
  assert.equal(characters[0].costumeLock, true)
})
