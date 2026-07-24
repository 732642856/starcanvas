import assert from "node:assert/strict"
import test from "node:test"

const BASE_URL = process.env.STARCANVAS_E2E_BASE_URL || "http://localhost:3000"

async function postJson(path: string, body: unknown): Promise<{ response: Response; data: any }> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  const data = await response.json()
  return { response, data }
}

export async function requireServer(fetchImpl: typeof fetch = fetch) {
  try {
    const response = await fetchImpl(`${BASE_URL}/canvas`, { method: "GET" })
    assert.ok(response.status < 500)
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(`STARCANVAS_E2E_BASE_URL is unavailable (${BASE_URL}): ${reason}`)
  }
}

test("requireServer fails when the contract server is unavailable", async () => {
  await assert.rejects(
    () => requireServer(async () => { throw new Error("connection refused") }),
    /STARCANVAS_E2E_BASE_URL/,
  )
})

test("POST /api/ai/upscale validates required image", async () => {
  await requireServer()
  const { response, data } = await postJson("/api/ai/upscale", { scale: 4 })

  assert.equal(response.status, 400)
  assert.equal(data.error.code, "invalid_request")
  assert.match(data.error.message, /image/)
})

test("POST /api/ai/upscale returns explicit not_ready contract when service is not deployed", async () => {
  await requireServer()
  const { response, data } = await postJson("/api/ai/upscale", { image: "data:image/png;base64,abc", scale: 8 })

  assert.equal(response.status, 200)
  assert.equal(data.status, "not_ready")
  assert.equal(data.options.scale, 8)
  assert.equal(data.clientFallback.available, true)
  assert.ok(Array.isArray(data.recommendedNextSteps))
})

test("POST /api/ai/talking-photo validates required image", async () => {
  await requireServer()
  const { response, data } = await postJson("/api/ai/talking-photo", {
    text: "你好",
    audioSource: "text-to-speech",
  })

  assert.equal(response.status, 400)
  assert.equal(data.error.code, "invalid_request")
  assert.match(data.error.message, /image/)
})

test("POST /api/ai/talking-photo validates required audio or text", async () => {
  await requireServer()
  const { response, data } = await postJson("/api/ai/talking-photo", {
    image: "data:image/png;base64,abc",
    audioSource: "text-to-speech",
  })

  assert.equal(response.status, 400)
  assert.equal(data.error.code, "invalid_request")
  assert.match(data.error.message, /audio or text/)
})

test("POST /api/ai/talking-photo returns explicit not_ready contract when backend is not configured", async () => {
  await requireServer()
  const { response, data } = await postJson("/api/ai/talking-photo", {
    image: "data:image/png;base64,abc",
    text: "你好，欢迎来到星轨画布。",
    audioSource: "text-to-speech",
    mode: "lip-sync",
  })

  assert.equal(response.status, 200)
  assert.equal(data.status, "not_ready")
  assert.match(data.message, /数字人服务未部署/)
  assert.ok(Array.isArray(data.recommendedNextSteps))
})

test("POST /api/ai/generate-with-pose validates prompt before external API calls", async () => {
  await requireServer()
  const { response, data } = await postJson("/api/ai/generate-with-pose", { requestId: "contract-test" })

  assert.equal(response.status, 400)
  assert.equal(data.ok, false)
  assert.equal(data.error, "Prompt is required")
  assert.equal(data.requestId, "contract-test")
})

test("POST /api/ai/reverse-prompt validates imageUrl", async () => {
  await requireServer()
  const { response, data } = await postJson("/api/ai/reverse-prompt", {})

  assert.equal(response.status, 400)
  assert.equal(data.error, "imageUrl required")
})
