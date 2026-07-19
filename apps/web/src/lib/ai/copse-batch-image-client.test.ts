import assert from "node:assert/strict"
import test from "node:test"

import { fetchCopseBatchImageModels } from "./copse-batch-image-client.ts"

test("reads the Copse asynchronous image model catalog with the configured server credential", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = []
  const models = await fetchCopseBatchImageModels({
    baseUrl: "https://copse.top/v1",
    apiKey: "test-secret",
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), init })
      return new Response(JSON.stringify({ data: [{ id: "gpt-image-2" }, { id: "other-model" }] }), { status: 200 })
    },
  })

  assert.deepEqual(models, ["gpt-image-2", "other-model"])
  assert.equal(calls[0]?.url, "https://copse.top/v1/images/batches/models")
  assert.equal(calls[0]?.init?.method, "GET")
  assert.equal((calls[0]?.init?.headers as Record<string, string>).Authorization, "Bearer test-secret")
  assert.equal(calls[0]?.init?.body, undefined)
})

test("rejects a non-Copse provider before any network request", async () => {
  await assert.rejects(
    () => fetchCopseBatchImageModels({
      baseUrl: "https://example.test/v1",
      apiKey: "test-secret",
      fetchImpl: async () => { throw new Error("must not fetch") },
    }),
    /only available through copse\.top/i,
  )
})

test("returns a status-bearing error when the upstream catalog fails", async () => {
  await assert.rejects(
    () => fetchCopseBatchImageModels({
      baseUrl: "https://copse.top/v1",
      apiKey: "test-secret",
      fetchImpl: async () => new Response("overloaded", { status: 503 }),
    }),
    (error: unknown) => error instanceof Error && error.message.includes("503"),
  )
})
