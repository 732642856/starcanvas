// ============================================================================
// POST /api/ai/camera-control — 摄影机控制方案生成
// ============================================================================
// 根据场景描述生成摄影机运动参数：推拉摇移、变焦、轨道、手持抖动等。
// 支持预设模式快速返回，或调用 LLM 生成定制化方案。
// ============================================================================

import { NextRequest, NextResponse } from "next/server"
import { mergeProviderConfig } from "@/lib/ai/provider-config"
import { normalizeUpstreamError, normalizeClientError } from "@/lib/ai/errors"
import { fetchWithTimeout } from "@/lib/ai/server-fetch"

// ── 预设摄影机运动库 ─────────────────────────────────────────────────────────

interface CameraMovement {
  name: string
  type: "push" | "pull" | "pan" | "tilt" | "track" | "crane" | "zoom" | "handheld" | "static"
  description: string
  duration: string
  intensity: "subtle" | "moderate" | "dramatic"
  params: Record<string, number | string>
}

interface CameraControlPlan {
  sceneMood: string
  movements: CameraMovement[]
  notes: string
}

const PRESET_PLANS: Record<string, CameraControlPlan> = {
  "对话-紧张": {
    sceneMood: "紧张对峙",
    movements: [
      {
        name: "缓慢推近",
        type: "push",
        description: "从过肩镜头缓慢推近到特写，压迫感递增",
        duration: "4s",
        intensity: "subtle",
        params: { startDistance: 1.5, endDistance: 0.4, speed: 0.3 },
      },
      {
        name: "轻微手持抖动",
        type: "handheld",
        description: "模拟呼吸感的轻微抖动，增强真实感",
        duration: "全程",
        intensity: "subtle",
        params: { amplitude: 0.02, frequency: 2 },
      },
    ],
    notes: "保持眼神接触，利用推近制造心理压迫。避免过度抖动导致眩晕。",
  },
  "对话-温馨": {
    sceneMood: "温馨交流",
    movements: [
      {
        name: "柔和轨道",
        type: "track",
        description: "180度柔和环绕，展现人物关系",
        duration: "6s",
        intensity: "subtle",
        params: { arc: 180, radius: 2, speed: 0.5 },
      },
      {
        name: "静态切镜",
        type: "static",
        description: "正反打静态镜头，保持稳定构图",
        duration: "3s",
        intensity: "subtle",
        params: { angle: 30, height: 1.6 },
      },
    ],
    notes: "使用柔和光线，轨道速度要慢，给人安心感。",
  },
  "动作-追逐": {
    sceneMood: "激烈追逐",
    movements: [
      {
        name: "快速跟拍",
        type: "track",
        description: "低角度快速跟随主体移动",
        duration: "5s",
        intensity: "dramatic",
        params: { speed: 8, height: 0.8, shake: 0.15 },
      },
      {
        name: "急速摇镜",
        type: "pan",
        description: "快速水平摇镜跟随目标",
        duration: "2s",
        intensity: "dramatic",
        params: { angle: 120, speed: 60 },
      },
    ],
    notes: "使用广角镜头增强速度感，注意运动方向的一致性。",
  },
  "揭示-悬念": {
    sceneMood: "悬念揭示",
    movements: [
      {
        name: "缓慢后拉",
        type: "pull",
        description: "从特写缓慢后拉，揭示环境全貌",
        duration: "5s",
        intensity: "moderate",
        params: { startDistance: 0.3, endDistance: 3, speed: 0.2 },
      },
      {
        name: "升起俯拍",
        type: "crane",
        description: "从平视缓慢升起到俯视",
        duration: "4s",
        intensity: "moderate",
        params: { startHeight: 1.6, endHeight: 4, speed: 0.4 },
      },
    ],
    notes: "后拉速度要极慢，制造'发现'感。配合音效增强冲击力。",
  },
  "风景-史诗": {
    sceneMood: "史诗风景",
    movements: [
      {
        name: "宏大横摇",
        type: "pan",
        description: "180度缓慢水平横摇展现壮丽景色",
        duration: "8s",
        intensity: "moderate",
        params: { angle: 180, speed: 0.5 },
      },
      {
        name: "缓慢变焦",
        type: "zoom",
        description: "从广角缓慢变焦到中景",
        duration: "6s",
        intensity: "subtle",
        params: { startFocal: 24, endFocal: 50, speed: 0.3 },
      },
    ],
    notes: "使用三脚架或稳定器，确保绝对平稳。黄金时刻光线最佳。",
  },
}

// ── LLM 生成定制化方案 ──────────────────────────────────────────────────────

async function generateWithLLM(sceneDescription: string): Promise<CameraControlPlan> {
  const config = mergeProviderConfig()

  try {
    const upstream = await fetchWithTimeout(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.defaultModel,
        messages: [
          {
            role: "system",
            content: `你是一位资深摄影指导（DP），擅长为影视场景设计摄影机运动方案。
请根据场景描述，生成详细的摄影机控制方案，包含：
1. 场景情绪定位
2. 2-4 个摄影机运动（名称、类型、描述、时长、强度、参数）
3. 执行注意事项

运动类型仅限：push(推)、pull(拉)、pan(摇)、tilt(俯仰)、track(轨道)、crane(升降)、zoom(变焦)、handheld(手持)、static(固定)
强度级别：subtle(微妙)、moderate(适中)、dramatic(强烈)

请以 JSON 格式返回：
{
  "sceneMood": "场景情绪",
  "movements": [
    {
      "name": "运动名称",
      "type": "push",
      "description": "详细描述",
      "duration": "4s",
      "intensity": "subtle",
      "params": { "key": value }
    }
  ],
  "notes": "执行注意事项"
}`,
          },
          {
            role: "user",
            content: `请为以下场景设计摄影机控制方案：\n\n${sceneDescription}`,
          },
        ],
        temperature: 0.7,
        response_format: { type: "json_object" },
      }),
    }, config.timeoutMs)

    if (!upstream.ok) {
      const text = await upstream.text()
      const error = normalizeUpstreamError(upstream.status, text, config.type)
      throw new Error(error.message)
    }

    const data = await upstream.json()
    const content = data.choices?.[0]?.message?.content

    if (!content) {
      throw new Error("LLM 返回空内容")
    }

    const plan = JSON.parse(content) as CameraControlPlan
    return plan
  } catch (error) {
    throw error
  }
}

// ── API Handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>

  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { error: { code: "invalid_request", message: "Invalid JSON body" } },
      { status: 400 },
    )
  }

  const sceneDescription = typeof body.sceneDescription === "string" ? body.sceneDescription : ""
  const presetKey = typeof body.preset === "string" ? body.preset : ""
  const useLLM = body.useLLM === true

  if (!sceneDescription && !presetKey) {
    return NextResponse.json(
      { error: { code: "invalid_request", message: "sceneDescription or preset is required" } },
      { status: 400 },
    )
  }

  // 优先使用预设
  if (presetKey && PRESET_PLANS[presetKey]) {
    return NextResponse.json({ plan: PRESET_PLANS[presetKey], source: "preset" })
  }

  // 尝试关键词匹配预设
  const moodKeywords: Record<string, string> = {
    "紧张": "对话-紧张",
    "对峙": "对话-紧张",
    "压迫": "对话-紧张",
    "温馨": "对话-温馨",
    "交流": "对话-温馨",
    "亲密": "对话-温馨",
    "追逐": "动作-追逐",
    "打斗": "动作-追逐",
    "奔跑": "动作-追逐",
    "揭示": "揭示-悬念",
    "悬念": "揭示-悬念",
    "发现": "揭示-悬念",
    "风景": "风景-史诗",
    "史诗": "风景-史诗",
    "宏大": "风景-史诗",
  }

  for (const [keyword, planKey] of Object.entries(moodKeywords)) {
    if (sceneDescription.includes(keyword)) {
      return NextResponse.json({ plan: PRESET_PLANS[planKey], source: "keyword-match" })
    }
  }

  // 使用 LLM 生成
  if (useLLM) {
    try {
      const plan = await generateWithLLM(sceneDescription)
      return NextResponse.json({ plan, source: "llm" })
    } catch (error) {
      const normalized = normalizeClientError(error, "openai-compatible")
      return NextResponse.json(
        { error: normalized },
        { status: normalized.status ?? 500 },
      )
    }
  }

  // 默认返回通用方案
  return NextResponse.json({
    plan: {
      sceneMood: "通用场景",
      movements: [
        {
          name: "标准固定镜头",
          type: "static",
          description: "稳定构图，确保主体清晰",
          duration: "3s",
          intensity: "subtle",
          params: { angle: 0, height: 1.6 },
        },
      ],
      notes: "根据实际场景选择合适的运动方式。建议先静态拍摄，再根据情绪添加运动。",
    },
    source: "default",
  })
}
