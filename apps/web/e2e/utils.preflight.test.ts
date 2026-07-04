import assert from "node:assert/strict"
import test from "node:test"

import { buildE2EHealthProbeUrl, probeE2EBaseReadiness } from "./utils.ts"

test("buildE2EHealthProbeUrl prefers the base root endpoint", () => {
  assert.equal(
    buildE2EHealthProbeUrl("http://127.0.0.1:3100/canvas?projectId=e2e"),
    "http://127.0.0.1:3100/",
  )
  assert.equal(
    buildE2EHealthProbeUrl("http://127.0.0.1:3100"),
    "http://127.0.0.1:3100/",
  )
})

test("probeE2EBaseReadiness reports ready when the base root endpoint responds ok", async () => {
  const calls: string[] = []
  const result = await probeE2EBaseReadiness({
    baseURL: "http://127.0.0.1:3100/canvas?projectId=e2e",
    fetchImpl: async (url) => {
      calls.push(String(url))
      return new Response(JSON.stringify({ ok: true }), { status: 200 })
    },
  })

  assert.equal(result.ok, true)
  assert.equal(result.url, "http://127.0.0.1:3100/")
  assert.deepEqual(calls, ["http://127.0.0.1:3100/"])
})

test("probeE2EBaseReadiness returns a fast explicit failure for unhealthy reused servers", async () => {
  const result = await probeE2EBaseReadiness({
    baseURL: "http://127.0.0.1:3100",
    fetchImpl: async () => new Response("busy", { status: 503 }),
  })

  assert.equal(result.ok, false)
  assert.equal(result.status, 503)
  assert.match(result.message ?? "", /503/)
  assert.match(result.message ?? "", /http:\/\/127\.0\.0\.1:3100\//)
})

test("probeE2EBaseReadiness tolerates a cold-start timeout if a retry succeeds", async () => {
  let attempts = 0
  const result = await probeE2EBaseReadiness({
    baseURL: "http://127.0.0.1:3100",
    fetchImpl: async () => {
      attempts += 1
      if (attempts === 1) {
        throw new Error("The operation was aborted due to timeout")
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 })
    },
  })

  assert.equal(result.ok, true)
  assert.equal(attempts, 2)
})
