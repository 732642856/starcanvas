// ============================================================================
// Character View Generation API Route - SSE streaming
// Generates front/side/back views of a character via gpt-image-2
// ============================================================================
import { NextRequest } from "next/server"
import { fetchWithTimeout } from "@/lib/ai/server-fetch"
import { getProvider } from "@/lib/ai/provider-registry"

// ── Config ──────────────────────────────────────────────────────────────────
function getConfig() {
  const provider = getProvider()
  return {
    baseUrl: provider.baseUrl,
    apiKey: provider.apiKey,
  }
}
const IMAGE_MODEL = "gpt-image-2"
const TIMEOUT_MS = 120_000

// ── Types ────────────────────────────────────────────────────────────────────
type ViewType = "front" | "side" | "back" | "all"

interface GenerateCharacterViewRequest {
  referenceImageUrl?: string
  characterDescription: string
  viewType: ViewType
}

// ── SSE helper ───────────────────────────────────────────────────────────────
function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

function sseStream(readable: ReadableStream<Uint8Array>): Response {
  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  })
}

// ── Prompt templates per view type ───────────────────────────────────────────
const VIEW_PROMPTS: Record<string, (desc: string) => string> = {
  front: (desc) =>
    `Character design sheet, front view, full body, standing straight, looking at camera, ${desc}, uniform lighting, plain background, high quality, detailed`,
  side: (desc) =>
    `Character design sheet, side view profile, full body, standing straight, facing left, ${desc}, uniform lighting, plain background, high quality, detailed`,
  back: (desc) =>
    `Character design sheet, back view, full body, standing straight, ${desc}, uniform lighting, plain background, high quality, detailed`,
}

// ── Single view image generation ────────────────────────────────────────────
async function generateViewImage(
  prompt: string,
  config: { baseUrl: string; apiKey: string },
  referenceImageUrl?: string,
): Promise<string> {
  const payload: Record<string, unknown> = {
    model: IMAGE_MODEL,
    prompt,
    n: 1,
    size: "1024x1024",
    response_format: "b64_json",
  }

  if (referenceImageUrl) {
    payload.image = [referenceImageUrl]
  }

  const res = await fetchWithTimeout(
    `${config.baseUrl}/images/generations`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(payload),
    },
    TIMEOUT_MS,
  )

  if (!res.ok) {
    const errorText = await res.text().catch(() => "unknown error")
    throw new Error(`Image generation failed (${res.status}): ${errorText}`)
  }

  const data = await res.json()
  const b64Json = data.data?.[0]?.b64_json
  const url = data.data?.[0]?.url

  if (b64Json) return `data:image/png;base64,${b64Json}`
  if (url) return url

  throw new Error("No image data returned from upstream")
}

// ── Define the order for "all" views ────────────────────────────────────────
const ALL_VIEWS: Array<{ key: "front" | "side" | "back"; stage: string; percent: number; message: string }> = [
  { key: "front", stage: "generating-front", percent: 25, message: "生成正面视图..." },
  { key: "side", stage: "generating-side", percent: 50, message: "生成侧面视图..." },
  { key: "back", stage: "generating-back", percent: 75, message: "生成背面视图..." },
]

// ── Main handler ────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  const config = getConfig()

  try {
    // ── Parse request ────────────────────────────────────────────────────
    const body: GenerateCharacterViewRequest = await request.json()
    const { referenceImageUrl, characterDescription, viewType } = body

    if (!characterDescription || typeof characterDescription !== "string") {
      return sseStream(
        new ReadableStream({
          start(controller) {
            controller.enqueue(
              new TextEncoder().encode(
                sseEvent("error", {
                  message: "characterDescription is required",
                  code: "INVALID_PARAMETER",
                }),
              ),
            )
            controller.close()
          },
        }),
      )
    }

    if (!config.apiKey) {
      return sseStream(
        new ReadableStream({
          start(controller) {
            controller.enqueue(
              new TextEncoder().encode(
                sseEvent("error", { message: "AI_API_KEY is not configured", code: "CONFIG_ERROR" }),
              ),
            )
            controller.close()
          },
        }),
      )
    }

    const validViewTypes: ViewType[] = ["front", "side", "back", "all"]
    if (!validViewTypes.includes(viewType)) {
      return sseStream(
        new ReadableStream({
          start(controller) {
            controller.enqueue(
              new TextEncoder().encode(
                sseEvent("error", { message: `Invalid viewType: ${viewType}`, code: "INVALID_PARAMETER" }),
              ),
            )
            controller.close()
          },
        }),
      )
    }

    // ── SSE stream ───────────────────────────────────────────────────────
    const stream = new ReadableStream({
      async start(controller) {
        const enc = new TextEncoder()
        const send = (event: string, data: unknown) => {
          controller.enqueue(enc.encode(sseEvent(event, data)))
        }

        try {
          const viewsToGenerate =
            viewType === "all"
              ? ALL_VIEWS
              : [{ key: viewType, stage: `generating-${viewType}`, percent: 50, message: `生成${viewType === "front" ? "正面" : viewType === "side" ? "侧面" : "背面"}视图...` }]

          const result: Record<string, string> = {}

          for (const view of viewsToGenerate) {
            send("progress", {
              stage: view.stage,
              percent: view.percent,
              message: view.message,
            })

            const prompt = VIEW_PROMPTS[view.key](characterDescription)
            const imageUrl = await generateViewImage(prompt, config, referenceImageUrl)
            result[`${view.key}ViewUrl`] = imageUrl
          }

          send("result", result)
        } catch (error: any) {
          send("error", { message: error.message || "Unknown error", code: "GENERATION_FAILED" })
        } finally {
          controller.close()
        }
      },
    })

    return sseStream(stream)
  } catch (error: any) {
    return sseStream(
      new ReadableStream({
        start(controller) {
          controller.enqueue(
            new TextEncoder().encode(
              sseEvent("error", { message: error.message || "Invalid request", code: "REQUEST_ERROR" }),
            ),
          )
          controller.close()
        },
      }),
    )
  }
}
