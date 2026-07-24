// ============================================================================
// POST /api/ai/remix-analysis — 爆款视频拆解与复刻
// ============================================================================
// 分析爆款视频的结构、节奏、情绪曲线，生成可复用的创作模板。
// 支持预设模板快速返回，或调用 LLM 根据描述生成定制化拆解。
// ============================================================================

import { NextRequest, NextResponse } from "next/server"
import { mergeProviderConfig } from "@/lib/ai/provider-config"
import { normalizeUpstreamError, normalizeClientError } from "@/lib/ai/errors"
import { fetchWithTimeout } from "@/lib/ai/server-fetch"

// ── 类型定义 ────────────────────────────────────────────────────────────────

interface RemixBeat {
  timestamp: string
  duration: string
  type: "hook" | "setup" | "conflict" | "climax" | "twist" | "resolution" | "cta"
  description: string
  visualNotes: string
  audioNotes: string
  emotionalValence: number // -1 (负向) to 1 (正向)
}

interface RemixTemplate {
  id: string
  name: string
  category: string
  totalDuration: string
  hookPattern: string
  structure: RemixBeat[]
  keyTechniques: string[]
  reusableElements: string[]
  adaptationNotes: string
}

interface RemixAnalysisResult {
  sourceDescription: string
  template: RemixTemplate
  emotionalCurve: { phase: string; valence: number; intensity: number }[]
  keyMetrics: {
    hookTime: string
    conflictDensity: string
    twistCount: number
    pacing: "fast" | "medium" | "slow"
  }
}

// ── 预设爆款模板库 ──────────────────────────────────────────────────────────

const PRESET_TEMPLATES: Record<string, RemixTemplate> = {
  "悬疑反转-短剧": {
    id: "suspense-twist-short",
    name: "悬疑反转短剧",
    category: "短剧",
    totalDuration: "60-90s",
    hookPattern: "反常现象/冲突开场，3秒内抓住注意力",
    structure: [
      {
        timestamp: "0:00",
        duration: "3s",
        type: "hook",
        description: "反常现象或冲突画面，制造疑问",
        visualNotes: "特写+快速剪辑",
        audioNotes: "突然静音或刺耳音效",
        emotionalValence: -0.3,
      },
      {
        timestamp: "0:03",
        duration: "15s",
        type: "setup",
        description: "快速建立人物关系和背景",
        visualNotes: "中景+环境交代",
        audioNotes: "紧张背景音乐渐入",
        emotionalValence: 0,
      },
      {
        timestamp: "0:18",
        duration: "20s",
        type: "conflict",
        description: "核心冲突升级，制造悬念",
        visualNotes: "快速剪辑+特写",
        audioNotes: "音乐节奏加快",
        emotionalValence: -0.7,
      },
      {
        timestamp: "0:38",
        duration: "10s",
        type: "twist",
        description: "第一次反转，打破预期",
        visualNotes: "视角突变+慢动作",
        audioNotes: "音效骤停后爆音",
        emotionalValence: 0.5,
      },
      {
        timestamp: "0:48",
        duration: "15s",
        type: "climax",
        description: "真相揭露或最终对决",
        visualNotes: "大景别+快速剪辑",
        audioNotes: "音乐高潮",
        emotionalValence: 0.8,
      },
      {
        timestamp: "1:03",
        duration: "7s",
        type: "resolution",
        description: "收尾+情绪回落",
        visualNotes: "静态画面+淡出",
        audioNotes: "音乐渐弱",
        emotionalValence: 0.3,
      },
      {
        timestamp: "1:10",
        duration: "5s",
        type: "cta",
        description: "引导互动",
        visualNotes: "文字+头像",
        audioNotes: "提示音效",
        emotionalValence: 0,
      },
    ],
    keyTechniques: ["反常开场", "信息差", "双重反转", "情绪过山车", "留白悬念"],
    reusableElements: ["冲突画面", "悬念音效", "反转瞬间", "情绪特写"],
    adaptationNotes: "可将任何行业内容包装成悬疑结构：先制造问题→展示冲突→给出意外解决方案。",
  },
  "情感共鸣-生活": {
    id: "emotional-life",
    name: "情感共鸣生活类",
    category: "生活",
    totalDuration: "30-60s",
    hookPattern: "日常场景+微小反常，引发好奇",
    structure: [
      {
        timestamp: "0:00",
        duration: "3s",
        type: "hook",
        description: "熟悉的日常场景中出现微小反常",
        visualNotes: "生活化中景",
        audioNotes: "日常环境音",
        emotionalValence: 0.1,
      },
      {
        timestamp: "0:03",
        duration: "12s",
        type: "setup",
        description: "展开日常情境，建立共鸣",
        visualNotes: "细节特写+环境",
        audioNotes: "温暖背景音乐",
        emotionalValence: 0.3,
      },
      {
        timestamp: "0:15",
        duration: "10s",
        type: "conflict",
        description: "遇到小挫折或意外",
        visualNotes: "表情特写",
        audioNotes: "音乐转调",
        emotionalValence: -0.4,
      },
      {
        timestamp: "0:25",
        duration: "15s",
        type: "climax",
        description: "情感释放或温暖解决",
        visualNotes: "互动画面+光线变化",
        audioNotes: "音乐高潮",
        emotionalValence: 0.9,
      },
      {
        timestamp: "0:40",
        duration: "8s",
        type: "resolution",
        description: "温馨收尾",
        visualNotes: "远景+暖色调",
        audioNotes: "音乐渐弱",
        emotionalValence: 0.7,
      },
      {
        timestamp: "0:48",
        duration: "5s",
        type: "cta",
        description: "互动引导",
        visualNotes: "文字浮现",
        audioNotes: "轻快节奏",
        emotionalValence: 0.2,
      },
    ],
    keyTechniques: ["日常共鸣", "细节放大", "情绪转折", "温暖收尾", "真实感"],
    reusableElements: ["生活场景", "表情特写", "光线变化", "温暖音乐"],
    adaptationNotes: "核心是'真实感'和'细节'。不需要大制作，重点是让观众觉得'这就是我'。",
  },
  "知识干货-科普": {
    id: "knowledge-science",
    name: "知识干货科普",
    category: "知识",
    totalDuration: "45-90s",
    hookPattern: "反直觉观点/惊人数据开场",
    structure: [
      {
        timestamp: "0:00",
        duration: "3s",
        type: "hook",
        description: "反直觉观点或惊人数据",
        visualNotes: "大字+数据可视化",
        audioNotes: "强调音效",
        emotionalValence: 0.2,
      },
      {
        timestamp: "0:03",
        duration: "15s",
        type: "setup",
        description: "问题背景和重要性",
        visualNotes: "场景+动画",
        audioNotes: "清晰旁白",
        emotionalValence: 0,
      },
      {
        timestamp: "0:18",
        duration: "20s",
        type: "conflict",
        description: "常见误解或困难点",
        visualNotes: "对比画面",
        audioNotes: "节奏变化",
        emotionalValence: -0.2,
      },
      {
        timestamp: "0:38",
        duration: "25s",
        type: "climax",
        description: "核心知识讲解+演示",
        visualNotes: "步骤动画+演示",
        audioNotes: "清晰+节奏感",
        emotionalValence: 0.5,
      },
      {
        timestamp: "1:03",
        duration: "10s",
        type: "resolution",
        description: "总结+应用建议",
        visualNotes: "总结卡片",
        audioNotes: "音乐渐弱",
        emotionalValence: 0.7,
      },
      {
        timestamp: "1:13",
        duration: "7s",
        type: "cta",
        description: "收藏/关注引导",
        visualNotes: "按钮动画",
        audioNotes: "提示音",
        emotionalValence: 0.3,
      },
    ],
    keyTechniques: ["反直觉开场", "数据可视化", "步骤拆解", "对比展示", "实用总结"],
    reusableElements: ["数据卡片", "步骤动画", "对比画面", "总结模板"],
    adaptationNotes: "知识类核心是'信息密度'和'可视化'。每15秒要有一个记忆点。",
  },
}

// ── LLM 生成定制化拆解 ──────────────────────────────────────────────────────

async function generateWithLLM(videoDescription: string): Promise<RemixAnalysisResult> {
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
            content: `你是一位短视频内容策略专家，擅长分析爆款视频并提取可复用的创作模板。
请根据视频描述，生成详细的拆解报告，包含：
1. 内容结构（hook→setup→conflict→climax→resolution→cta）
2. 情绪曲线
3. 关键技术指标
4. 可复用元素
5. 改编建议

请以 JSON 格式返回：
{
  "template": {
    "id": "模板ID",
    "name": "模板名称",
    "category": "分类",
    "totalDuration": "时长范围",
    "hookPattern": "钩子模式",
    "structure": [
      {
        "timestamp": "0:00",
        "duration": "3s",
        "type": "hook",
        "description": "描述",
        "visualNotes": "视觉笔记",
        "audioNotes": "音频笔记",
        "emotionalValence": 0.5
      }
    ],
    "keyTechniques": ["技巧1"],
    "reusableElements": ["元素1"],
    "adaptationNotes": "改编建议"
  },
  "emotionalCurve": [
    { "phase": "开场", "valence": 0.5, "intensity": 0.8 }
  ],
  "keyMetrics": {
    "hookTime": "3s",
    "conflictDensity": "高",
    "twistCount": 2,
    "pacing": "fast"
  }
}`,
          },
          {
            role: "user",
            content: `请分析以下爆款视频并生成拆解模板：\n\n${videoDescription}`,
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

    const parsed = JSON.parse(content) as Omit<RemixAnalysisResult, "sourceDescription">
    return {
      sourceDescription: videoDescription,
      ...parsed,
    }
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

  const videoDescription = typeof body.videoDescription === "string" ? body.videoDescription : ""
  const templateId = typeof body.templateId === "string" ? body.templateId : ""
  const useLLM = body.useLLM === true
  const category = typeof body.category === "string" ? body.category : ""

  if (!videoDescription && !templateId && !category) {
    return NextResponse.json(
      { error: { code: "invalid_request", message: "videoDescription, templateId, or category is required" } },
      { status: 400 },
    )
  }

  // 优先返回指定模板
  if (templateId && PRESET_TEMPLATES[templateId]) {
    const template = PRESET_TEMPLATES[templateId]
    return NextResponse.json({
      sourceDescription: videoDescription || template.name,
      template,
      emotionalCurve: template.structure.map((beat) => ({
        phase: beat.type,
        valence: beat.emotionalValence,
        intensity: beat.type === "climax" || beat.type === "twist" ? 0.9 : 0.5,
      })),
      keyMetrics: {
        hookTime: template.structure[0]?.duration || "3s",
        conflictDensity: template.structure.filter((b) => b.type === "conflict").length > 1 ? "高" : "中",
        twistCount: template.structure.filter((b) => b.type === "twist").length,
        pacing: template.totalDuration.includes("30") ? "fast" : template.totalDuration.includes("60") ? "medium" : "slow",
      },
      source: "preset",
    })
  }

  // 按分类匹配
  if (category) {
    const matched = Object.values(PRESET_TEMPLATES).find((t) => t.category === category)
    if (matched) {
      return NextResponse.json({
        sourceDescription: videoDescription || matched.name,
        template: matched,
        emotionalCurve: matched.structure.map((beat) => ({
          phase: beat.type,
          valence: beat.emotionalValence,
          intensity: beat.type === "climax" || beat.type === "twist" ? 0.9 : 0.5,
        })),
        keyMetrics: {
          hookTime: matched.structure[0]?.duration || "3s",
          conflictDensity: matched.structure.filter((b) => b.type === "conflict").length > 1 ? "高" : "中",
          twistCount: matched.structure.filter((b) => b.type === "twist").length,
          pacing: matched.totalDuration.includes("30") ? "fast" : matched.totalDuration.includes("60") ? "medium" : "slow",
        },
        source: "category-match",
      })
    }
  }

  // 使用 LLM 生成
  if (useLLM && videoDescription) {
    try {
      const result = await generateWithLLM(videoDescription)
      return NextResponse.json({ ...result, source: "llm" })
    } catch (error) {
      const normalized = normalizeClientError(error, "openai-compatible")
      return NextResponse.json(
        { error: normalized },
        { status: normalized.status ?? 500 },
      )
    }
  }

  // 默认返回通用模板
  return NextResponse.json({
    sourceDescription: videoDescription || "通用模板",
    template: PRESET_TEMPLATES["情感共鸣-生活"],
    emotionalCurve: [
      { phase: "hook", valence: 0.2, intensity: 0.6 },
      { phase: "setup", valence: 0.3, intensity: 0.4 },
      { phase: "conflict", valence: -0.4, intensity: 0.7 },
      { phase: "climax", valence: 0.9, intensity: 0.9 },
      { phase: "resolution", valence: 0.7, intensity: 0.3 },
    ],
    keyMetrics: {
      hookTime: "3s",
      conflictDensity: "中",
      twistCount: 0,
      pacing: "medium",
    },
    source: "default",
  })
}
