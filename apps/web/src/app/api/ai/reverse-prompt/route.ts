import { NextRequest } from "next/server"
import { fetchWithTimeout } from "@/lib/ai/server-fetch"
import { getProvider } from "@/lib/ai/provider-registry"

const MODEL = "gpt-5.5"

function getConfig() {
  const provider = getProvider()
  return {
    baseUrl: provider.baseUrl,
    apiKey: provider.apiKey,
  }
}

export async function POST(req: NextRequest) {
  const config = getConfig()

  try {
    const { imageUrl } = await req.json()
    if (!imageUrl) {
      return Response.json({ error: "imageUrl required" }, { status: 400 })
    }

    const res = await fetchWithTimeout(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: "system",
            content: "你是一个图片提示词分析器。根据用户提供的图片URL，分析图片内容并返回一个适合AI图片生成的英文提示词。只返回提示词本身，不要有其他文字。",
          },
          {
            role: "user",
            content: [
              { type: "text", text: "分析这张图片，给出生成提示词：" },
              { type: "image_url", image_url: { url: imageUrl } },
            ],
          },
        ],
        max_tokens: 300,
      }),
    }, 120000)

    if (!res.ok) {
      const err = await res.text().catch(() => "unknown")
      return Response.json({ error: `API error: ${err}` }, { status: 502 })
    }

    const data = await res.json()
    const prompt = data.choices?.[0]?.message?.content || ""
    return Response.json({ prompt })
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
