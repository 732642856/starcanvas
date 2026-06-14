import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { GenerationStatus, Prisma, ProviderType } from "@prisma/client"
import { createDecipheriv, createHash } from "node:crypto"
import { PrismaService } from "../../prisma/prisma.service"
import { ProjectsService } from "../projects/projects.service"

interface CreateGenerationJobInput {
  projectId?: string
  providerCredentialId?: string
  providerType?: ProviderType
  model?: string
  input: Record<string, unknown>
}

interface CreateImageGenerationInput {
  projectId?: string
  providerCredentialId: string
  prompt: string
  negativePrompt?: string
  model?: string
  size?: string
  quality?: string
  input?: Record<string, unknown>
}

interface OpenAIImageResponse {
  created?: number
  data?: Array<{
    url?: string
    b64_json?: string
    revised_prompt?: string
  }>
  usage?: {
    input_tokens?: number
    output_tokens?: number
    total_tokens?: number
  }
}

type CanvasAgentMode = "ASK" | "EXECUTE" | "STORYBOARD" | "ORGANIZE" | "IMAGE_PROMPT"

interface PlanCanvasActionsInput {
  projectId?: string
  providerCredentialId?: string
  model?: string
  mode?: CanvasAgentMode
  message: string
  canvas?: Record<string, unknown>
  references?: Array<Record<string, unknown>>
}

type AgentNodeType = "text" | "prompt" | "image" | "storyboard" | "reference" | "group"
type CanvasActionType = "create_node" | "update_node" | "delete_node" | "connect_nodes" | "create_group" | "layout_canvas" | "generate_prompt" | "split_storyboard" | "generate_image_prompt" | "generate_storyboard" | "ask_clarification" | "no_action" | "select_node" | "open_panel" | "generate_image" | "sync_storyboard" | "focus_canvas"
type AgentStepStatus = "done" | "running" | "pending" | "warning"

interface CanvasAgentStatusStep {
  id?: string
  label: string
  status?: AgentStepStatus
  detail?: string
}

interface CanvasAgentSuggestion {
  label: string
  prompt: string
  mode?: CanvasAgentMode
}

interface PlannedCanvasAction {
  type: CanvasActionType
  params: {
    node_type?: AgentNodeType
    title?: string
    content?: string
    prompt?: string
    node_id?: string
    source_node_id?: string
    target_node_id?: string
    node_ids?: string[]
    layout?: "horizontal" | "vertical" | "grid"
    group_id?: string
    question?: string
    panel?: string
    shots?: Array<{ title?: string; content?: string; prompt?: string }>
    position?: { x: number; y: number }
  }
}

interface RawPlannerResponse {
  assistantMessage?: unknown
  reply?: unknown
  message?: unknown
  statusSteps?: unknown
  actions?: unknown
  suggestions?: unknown
  needsUserConfirmation?: unknown
  confidence?: unknown
}

interface OpenAIChatResponse {
  choices?: Array<{
    message?: {
      content?: string
    }
  }>
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
  }
}

type ChatCompletionMessage = {
  role: "system" | "user" | "assistant"
  content: string | Array<Record<string, unknown>>
}

interface CreateChatCompletionInput {
  projectId?: string
  providerCredentialId?: string
  model?: string
  messages: ChatCompletionMessage[]
  canvas?: Record<string, unknown>
}

const DEFAULT_PROVIDER_TYPE = ProviderType.OPENAI_COMPATIBLE
const DEFAULT_MODEL = "gpt-4o-mini"
const DEFAULT_CHAT_MODEL = "gpt-5.5"
const DEFAULT_IMAGE_MODEL = "gpt-image-2"
const DEFAULT_IMAGE_SIZE = "1024x1024"
const IMAGE_MODEL_PATTERN = /(^|[-_])image([-_]|$)|dall-e|imagen|flux|midjourney|stable-diffusion/i
const AUDIO_MODEL_PATTERN = /audio|tts|whisper|music|voice/i
const REALTIME_MODEL_PATTERN = /realtime/i
const VIDEO_MODEL_PATTERN = /vidu|video|sora|veo|kling|runway|pika|luma/i

@Injectable()
export class GenerationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectsService: ProjectsService,
    private readonly config: ConfigService,
  ) {}

  async createStoryboardGenerationJob(input: CreateGenerationJobInput) {
    const { user, organization } = await this.projectsService.ensureDevContext()
    const providerType = input.providerType ?? DEFAULT_PROVIDER_TYPE
    const model = input.model ?? DEFAULT_MODEL

    if (input.projectId) {
      const project = await this.prisma.project.findFirst({
        where: {
          id: input.projectId,
          organizationId: organization.id,
        },
        select: { id: true },
      })

      if (!project) {
        throw new NotFoundException("Project not found")
      }
    }

    const credential = input.providerCredentialId
      ? await this.prisma.providerCredential.findFirst({
          where: {
            id: input.providerCredentialId,
            isEnabled: true,
            OR: [{ userId: user.id }, { organizationId: organization.id }],
          },
          select: { id: true, type: true, defaultModel: true },
        })
      : null

    if (input.providerCredentialId && !credential) {
      throw new NotFoundException("Provider credential not found")
    }

    const normalizedInput = input.input ?? {}
    const prompt = this.extractPrompt(normalizedInput)
    if (!prompt) {
      throw new BadRequestException("input.prompt or input.analysis.prompt is required")
    }

    const inputTokens = this.estimateTokens(JSON.stringify(normalizedInput))
    const outputText = this.composeDevOutput(normalizedInput, prompt)
    const outputTokens = this.estimateTokens(outputText)

    const job = await this.prisma.generationJob.create({
      data: {
        organizationId: organization.id,
        projectId: input.projectId,
        userId: user.id,
        providerCredentialId: credential?.id,
        providerType: credential?.type ?? providerType,
        model: credential?.defaultModel ?? model,
        status: GenerationStatus.PENDING,
        input: normalizedInput as Prisma.InputJsonValue,
        inputTokens,
        outputTokens,
      },
    })

    const output = {
      type: "STORYBOARD_PROMPT_RESULT",
      content: outputText,
      prompt,
      negativePrompt: this.extractNegativePrompt(normalizedInput),
      shotDescription: this.extractShotDescription(normalizedInput),
      queuedAt: job.createdAt.toISOString(),
      completedAt: new Date().toISOString(),
      note: "当前为开发环境同步完成；数据库中已创建 GenerationJob 和 UsageRecord，后续可替换为 Redis/BullMQ 异步 worker。",
    }

    const completedJob = await this.prisma.generationJob.update({
      where: { id: job.id },
      data: {
        status: GenerationStatus.SUCCEEDED,
        output: output as Prisma.InputJsonValue,
      },
    })

    const usageRecord = await this.prisma.usageRecord.create({
      data: {
        organizationId: organization.id,
        projectId: input.projectId,
        userId: user.id,
        generationJobId: completedJob.id,
        providerType: completedJob.providerType,
        model: completedJob.model,
        inputTokens,
        outputTokens,
      },
    })

    return {
      id: completedJob.id,
      status: completedJob.status,
      organizationId: completedJob.organizationId,
      projectId: completedJob.projectId,
      providerType: completedJob.providerType,
      model: completedJob.model,
      input: completedJob.input,
      output,
      usage: {
        id: usageRecord.id,
        inputTokens: usageRecord.inputTokens,
        outputTokens: usageRecord.outputTokens,
      },
      createdAt: completedJob.createdAt,
      updatedAt: completedJob.updatedAt,
    }
  }

  async createImageGenerationJob(input: CreateImageGenerationInput) {
    const { user, organization } = await this.projectsService.ensureDevContext()

    if (!input.prompt?.trim()) {
      throw new BadRequestException("prompt is required")
    }

    if (input.projectId) {
      const project = await this.prisma.project.findFirst({
        where: {
          id: input.projectId,
          organizationId: organization.id,
        },
        select: { id: true },
      })

      if (!project) {
        throw new NotFoundException("Project not found")
      }
    }

    const credential = await this.prisma.providerCredential.findFirst({
      where: {
        id: input.providerCredentialId,
        isEnabled: true,
        OR: [{ userId: user.id }, { organizationId: organization.id }],
      },
    })

    if (!credential) {
      throw new NotFoundException("Provider credential not found")
    }

    const model = this.resolveImageModel(input.model, credential.defaultModel)
    const size = input.size ?? DEFAULT_IMAGE_SIZE
    const quality = input.quality ?? "standard"
    const normalizedInput = {
      ...(input.input ?? {}),
      modality: "image",
      prompt: input.prompt,
      negativePrompt: input.negativePrompt ?? "",
      size,
      quality,
    }
    const inputTokens = this.estimateTokens(JSON.stringify(normalizedInput))

    const job = await this.prisma.generationJob.create({
      data: {
        organizationId: organization.id,
        projectId: input.projectId,
        userId: user.id,
        providerCredentialId: credential.id,
        providerType: credential.type,
        model,
        status: GenerationStatus.RUNNING,
        input: normalizedInput as Prisma.InputJsonValue,
        inputTokens,
      },
    })

    try {
      const imageResult = await this.callOpenAICompatibleImageGeneration({
        baseUrl: credential.baseUrl ?? "https://api.openai.com",
        apiKey: this.decrypt(credential.encryptedKey),
        model,
        prompt: input.prompt,
        negativePrompt: input.negativePrompt,
        size,
        quality,
      })
      const outputText = imageResult.revisedPrompt ?? input.prompt
          const outputTokens = imageResult.outputTokens ?? this.estimateTokens(outputText)
          const output = {
        type: "IMAGE_GENERATION_RESULT",
        imageUrl: imageResult.imageUrl,
        b64Json: imageResult.b64Json,
        prompt: input.prompt,
        negativePrompt: input.negativePrompt ?? "",
        revisedPrompt: imageResult.revisedPrompt,
        provider: credential.type,
        model,
        size,
        quality,
        completedAt: new Date().toISOString(),
      }

      const completedJob = await this.prisma.generationJob.update({
        where: { id: job.id },
        data: {
          status: GenerationStatus.SUCCEEDED,
          output: output as Prisma.InputJsonValue,
          outputTokens,
        },
      })

      const usageRecord = await this.prisma.usageRecord.create({
        data: {
          organizationId: organization.id,
          projectId: input.projectId,
          userId: user.id,
          generationJobId: completedJob.id,
          providerType: completedJob.providerType,
          model: completedJob.model,
          inputTokens,
          outputTokens,
        },
      })

      return this.serializeGenerationJob(completedJob, output, usageRecord)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Image generation failed"
      const failedJob = await this.prisma.generationJob.update({
        where: { id: job.id },
        data: {
          status: GenerationStatus.FAILED,
          errorMessage: message,
          output: {
            type: "IMAGE_GENERATION_ERROR",
            prompt: input.prompt,
            message,
            failedAt: new Date().toISOString(),
          } as Prisma.InputJsonValue,
        },
      })

      return this.serializeGenerationJob(failedJob, failedJob.output, null)
    }
  }

  async planCanvasActions(input: PlanCanvasActionsInput) {
    const { user, organization } = await this.projectsService.ensureDevContext()
    const message = input.message.trim()

    if (!message) {
      throw new BadRequestException("message is required")
    }

    if (input.projectId) {
      const project = await this.prisma.project.findFirst({
        where: {
          id: input.projectId,
          organizationId: organization.id,
        },
        select: { id: true },
      })

      if (!project) {
        throw new NotFoundException("Project not found")
      }
    }

    const credential = input.providerCredentialId
      ? await this.prisma.providerCredential.findFirst({
          where: {
            id: input.providerCredentialId,
            isEnabled: true,
            OR: [{ userId: user.id }, { organizationId: organization.id }],
          },
        })
      : await this.prisma.providerCredential.findFirst({
          where: {
            isEnabled: true,
            OR: [{ userId: user.id }, { organizationId: organization.id }],
          },
          orderBy: { updatedAt: "desc" },
        })

    const mode = input.mode ?? "EXECUTE"
    const isCasualChat = this.isCasualChatMessage(message)
    const fallbackPlan = isCasualChat ? [{ type: "no_action" as const, params: { content: message } }] : this.planCanvasActionsLocally(message)
    const fallbackStatusSteps: CanvasAgentStatusStep[] = [
      { label: "已读取用户意图", status: "done" },
      { label: isCasualChat ? "识别为普通对话" : "已生成本地画布计划", status: "done" },
    ]

    if (isCasualChat) {
      const assistantMessage = "我在。你可以直接问创作问题，或切到执行模式让我改动画布。"
      return {
        source: "local-rules",
        assistantMessage,
        reply: assistantMessage,
        statusSteps: fallbackStatusSteps,
        actions: fallbackPlan,
        suggestions: this.defaultCanvasAgentSuggestions("ASK", message),
        needsUserConfirmation: false,
        confidence: 0.96,
      }
    }

    if (!credential) {
      const assistantMessage = "没有可用的模型 Key，已用本地规则规划画布动作。"
      return {
        source: "local-rules",
        assistantMessage,
        reply: assistantMessage,
        statusSteps: fallbackStatusSteps,
        actions: fallbackPlan,
        suggestions: this.defaultCanvasAgentSuggestions(mode, message),
        needsUserConfirmation: this.shouldConfirmCanvasActions(fallbackPlan),
        confidence: 0.55,
      }
    }

    const model = this.resolveChatModel(input.model, credential.defaultModel, DEFAULT_MODEL)
    const compactCanvas = this.compactCanvasForPlanner({ ...(input.canvas ?? {}), references: input.references ?? input.canvas?.references })
    const plannerPrompt = this.buildCanvasPlannerPrompt(message, compactCanvas, mode)

    try {
      const result = await this.callOpenAICompatibleChatCompletion({
        baseUrl: credential.baseUrl ?? "https://api.openai.com",
        apiKey: this.decrypt(credential.encryptedKey),
        model,
        prompt: plannerPrompt,
      })
      const parsed = this.parsePlannerJson(result.content)
      const actions = this.sanitizeCanvasActions(parsed.actions, message)
      const finalActions = actions.length ? actions : fallbackPlan
      const assistantMessage = this.sanitizePlannerText(parsed.assistantMessage) ?? this.sanitizePlannerText(parsed.reply) ?? this.sanitizePlannerText(parsed.message) ?? "我已根据当前画布和你的要求规划动作。"

      return {
        source: "llm-planner",
        model,
        assistantMessage,
        reply: assistantMessage,
        statusSteps: this.sanitizeStatusSteps(parsed.statusSteps, compactCanvas),
        actions: finalActions,
        suggestions: this.sanitizeSuggestions(parsed.suggestions, mode),
        needsUserConfirmation: typeof parsed.needsUserConfirmation === "boolean" ? parsed.needsUserConfirmation || this.shouldConfirmCanvasActions(finalActions) : this.shouldConfirmCanvasActions(finalActions),
        confidence: this.sanitizeConfidence(parsed.confidence) ?? (actions.length ? 0.82 : 0.62),
        usage: result.usage,
      }
    } catch (error) {
      const assistantMessage = `模型规划暂时不可用，已用本地规则继续执行：${error instanceof Error ? error.message : "未知错误"}`
      return {
        source: "local-rules-fallback",
        model,
        assistantMessage,
        reply: assistantMessage,
        statusSteps: fallbackStatusSteps,
        actions: fallbackPlan,
        suggestions: this.defaultCanvasAgentSuggestions(mode, message),
        needsUserConfirmation: this.shouldConfirmCanvasActions(fallbackPlan),
        confidence: 0.5,
      }
    }
  }

  async createChatCompletion(input: CreateChatCompletionInput) {
    const { user, organization } = await this.projectsService.ensureDevContext()
    const messages = this.sanitizeChatMessages(input.messages)

    if (!messages.length || !messages.some((message) => message.role === "user" && message.content.trim())) {
      throw new BadRequestException("messages with at least one user message are required")
    }

    if (input.projectId) {
      const project = await this.prisma.project.findFirst({
        where: {
          id: input.projectId,
          organizationId: organization.id,
        },
        select: { id: true },
      })

      if (!project) {
        throw new NotFoundException("Project not found")
      }
    }

    const credential = input.providerCredentialId
      ? await this.prisma.providerCredential.findFirst({
          where: {
            id: input.providerCredentialId,
            isEnabled: true,
            OR: [{ userId: user.id }, { organizationId: organization.id }],
          },
        })
      : await this.prisma.providerCredential.findFirst({
          where: {
            isEnabled: true,
            OR: [{ userId: user.id }, { organizationId: organization.id }],
          },
          orderBy: { updatedAt: "desc" },
        })

    if (!credential) {
      throw new NotFoundException("请先在模型面板配置可用的 GPT 中转站 Key")
    }

    // Trust frontend's context decision: if canvas.nodes is empty, frontend already decided no context is needed
    // Only use server-side casual chat check as fallback (for messages sent without canvas context)
    const latestUserMessageContent = [...messages].reverse().find((message) => message.role === "user")?.content ?? ""
    const latestUserMessage = typeof latestUserMessageContent === "string" ? latestUserMessageContent : ""
    const isCasualChat = this.isCasualChatMessage(latestUserMessage)
    const hasCanvasContext = input.canvas && Array.isArray(input.canvas.nodes) && input.canvas.nodes.length > 0
    const model = this.resolveChatModel(input.model, credential.defaultModel, DEFAULT_CHAT_MODEL)
    // If frontend sent empty nodes → user wants casual chat (trust frontend decision)
    // If frontend sent canvas data → user wants context-aware chat
    const compactCanvas = hasCanvasContext ? this.compactCanvasForPlanner(input.canvas) : this.compactCanvasForPlanner({})
    const systemPrompt = this.buildDirectorChatSystemPrompt(compactCanvas, { includeCanvasContext: hasCanvasContext })
    const requestMessages: ChatCompletionMessage[] = [systemPrompt, ...messages]
    const normalizedInput = {
      modality: "chat",
      messages,
      canvas: compactCanvas,
    }
    const inputTokens = this.estimateTokens(JSON.stringify(normalizedInput))

    const job = await this.prisma.generationJob.create({
      data: {
        organizationId: organization.id,
        projectId: input.projectId,
        userId: user.id,
        providerCredentialId: credential.id,
        providerType: credential.type,
        model,
        status: GenerationStatus.RUNNING,
        input: normalizedInput as Prisma.InputJsonValue,
        inputTokens,
      },
    })

    try {
      const result = await this.callOpenAICompatibleChat({
        baseUrl: credential.baseUrl ?? "https://api.openai.com",
        apiKey: this.decrypt(credential.encryptedKey),
        model,
        messages: requestMessages,
        temperature: 0.7,
      })
      const outputTokens = result.usage.outputTokens ?? this.estimateTokens(result.content)
      const output = {
        type: "CHAT_COMPLETION_RESULT",
        message: result.content,
        model,
        completedAt: new Date().toISOString(),
      }

      const completedJob = await this.prisma.generationJob.update({
        where: { id: job.id },
        data: {
          status: GenerationStatus.SUCCEEDED,
          output: output as Prisma.InputJsonValue,
          inputTokens: result.usage.inputTokens ?? inputTokens,
          outputTokens,
        },
      })

      const usageRecord = await this.prisma.usageRecord.create({
        data: {
          organizationId: organization.id,
          projectId: input.projectId,
          userId: user.id,
          generationJobId: completedJob.id,
          providerType: completedJob.providerType,
          model: completedJob.model,
          inputTokens: result.usage.inputTokens ?? inputTokens,
          outputTokens,
        },
      })

      return {
        ...this.serializeGenerationJob(completedJob, output, usageRecord),
        message: result.content,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Chat completion failed"
      const failedJob = await this.prisma.generationJob.update({
        where: { id: job.id },
        data: {
          status: GenerationStatus.FAILED,
          errorMessage: message,
          output: {
            type: "CHAT_COMPLETION_ERROR",
            message,
            failedAt: new Date().toISOString(),
          } as Prisma.InputJsonValue,
        },
      })

      return {
        ...this.serializeGenerationJob(failedJob, failedJob.output, null),
        message: "",
      }
    }
  }

  async getGenerationJob(id: string) {
    const { user, organization } = await this.projectsService.ensureDevContext()
    const job = await this.prisma.generationJob.findFirst({
      where: {
        id,
        organizationId: organization.id,
        userId: user.id,
      },
      include: {
        usageRecords: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    })

    if (!job) {
      throw new NotFoundException("Generation job not found")
    }

    const usageRecord = job.usageRecords[0]

    return {
      id: job.id,
      status: job.status,
      organizationId: job.organizationId,
      projectId: job.projectId,
      providerType: job.providerType,
      model: job.model,
      input: job.input,
      output: job.output,
      errorMessage: job.errorMessage,
      usage: usageRecord
        ? {
            id: usageRecord.id,
            inputTokens: usageRecord.inputTokens,
            outputTokens: usageRecord.outputTokens,
          }
        : null,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    }
  }

  private async callOpenAICompatibleChatCompletion(input: {
    baseUrl: string
    apiKey: string
    model: string
    prompt: string
  }) {
    const endpoint = `${this.normalizeBaseUrl(input.baseUrl)}/v1/chat/completions`
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: input.model,
        messages: [
          {
            role: "system",
            content: "You are StarTrails Canvas Agent Planner. Return only strict JSON. Never use markdown fences.",
          },
          {
            role: "user",
            content: input.prompt,
          },
        ],
        temperature: 0.2,
      }),
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`规划接口调用失败：${response.status} ${response.statusText} ${text.slice(0, 500)}`)
    }

    const payload = (await response.json()) as OpenAIChatResponse
    const content = payload.choices?.[0]?.message?.content

    if (!content?.trim()) {
      throw new Error("规划接口没有返回可解析内容")
    }

    return {
      content,
      usage: {
        inputTokens: payload.usage?.prompt_tokens ?? this.estimateTokens(input.prompt),
        outputTokens: payload.usage?.completion_tokens ?? this.estimateTokens(content),
        totalTokens: payload.usage?.total_tokens,
      },
    }
  }

  private async callOpenAICompatibleChat(input: {
    baseUrl: string
    apiKey: string
    model: string
    messages: ChatCompletionMessage[]
    temperature?: number
  }) {
    const endpoint = `${this.normalizeBaseUrl(input.baseUrl)}/v1/chat/completions`
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: input.model,
        messages: input.messages,
        temperature: input.temperature ?? 0.7,
      }),
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Chat 接口调用失败：${response.status} ${response.statusText} ${text.slice(0, 500)}`)
    }

    const payload = (await response.json()) as OpenAIChatResponse
    const content = payload.choices?.[0]?.message?.content

    if (!content?.trim()) {
      throw new Error("Chat 接口没有返回可用内容")
    }

    return {
      content,
      usage: {
        inputTokens: payload.usage?.prompt_tokens,
        outputTokens: payload.usage?.completion_tokens,
        totalTokens: payload.usage?.total_tokens,
      },
    }
  }

  private async callOpenAICompatibleImageGeneration(input: {
    baseUrl: string
    apiKey: string
    model: string
    prompt: string
    negativePrompt?: string
    size: string
    quality: string
  }) {
    const endpoint = `${this.normalizeBaseUrl(input.baseUrl)}/v1/images/generations`
    const prompt = input.negativePrompt?.trim()
      ? `${input.prompt}\n\nNegative prompt: ${input.negativePrompt}`
      : input.prompt
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: input.model,
        prompt,
        size: input.size,
        quality: input.quality,
        n: 1,
      }),
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`生图接口调用失败：${response.status} ${response.statusText} ${text.slice(0, 500)}`)
    }

    const payload = (await response.json()) as OpenAIImageResponse
    const firstImage = payload.data?.[0]

    if (!firstImage?.url && !firstImage?.b64_json) {
      throw new Error("生图接口没有返回 image url 或 b64_json")
    }

    return {
      imageUrl: firstImage.url,
      b64Json: firstImage.b64_json,
      revisedPrompt: firstImage.revised_prompt,
      outputTokens: payload.usage?.output_tokens,
    }
  }

  private compactCanvasForPlanner(canvas?: Record<string, unknown>) {
    const rawNodes = Array.isArray(canvas?.nodes) ? canvas.nodes : []
    const rawEdges = Array.isArray(canvas?.edges) ? canvas.edges : []
    const sanitizeValue = (value: unknown, max = 1200) => typeof value === "string" && value.trim() ? value.trim().slice(0, max) : value ?? null
    const compactNodes = rawNodes.slice(-40).map((node) => {
      if (!node || typeof node !== "object") return null
      const record = node as Record<string, unknown>
      const data = record.data && typeof record.data === "object" ? (record.data as Record<string, unknown>) : record
      return {
        id: record.id,
        type: record.type,
        position: record.position,
        title: sanitizeValue(data.title, 120),
        nodeKind: sanitizeValue(data.nodeKind, 80),
        prompt: sanitizeValue(data.prompt),
        summary: sanitizeValue(data.summary),
        nextAction: sanitizeValue(data.nextAction, 400),
        assetKind: sanitizeValue(data.assetKind, 80),
        assetPurpose: sanitizeValue(data.assetPurpose, 80),
        url: sanitizeValue(data.url, 500),
        mimeType: sanitizeValue(data.mimeType, 120),
        originalName: sanitizeValue(data.originalName, 200),
      }
    }).filter(Boolean)
    const selectedNodeId = typeof canvas?.selectedNodeId === "string" ? canvas.selectedNodeId : null
    const selectedNode = canvas?.selectedNode ?? compactNodes.find((node) => node && typeof node === "object" && (node as Record<string, unknown>).id === selectedNodeId) ?? null
    const mediaAssets = Array.isArray(canvas?.mediaAssets)
      ? canvas.mediaAssets
      : compactNodes.filter((node) => {
          if (!node || typeof node !== "object") return false
          const record = node as Record<string, unknown>
          const nodeKind = typeof record.nodeKind === "string" ? record.nodeKind : ""
          return Boolean(record.assetKind || record.assetPurpose || nodeKind.includes("uploaded") || nodeKind.includes("result"))
        })

    return {
      projectId: typeof canvas?.projectId === "string" ? canvas.projectId : null,
      projectName: typeof canvas?.projectName === "string" ? canvas.projectName : null,
      selectedNodeId,
      selectedNode,
      storyboard: canvas?.storyboard ?? null,
      previs3d: canvas?.previs3d ?? null,
      nodes: compactNodes,
      edges: rawEdges.slice(-60).map((edge) => {
        if (!edge || typeof edge !== "object") return null
        const record = edge as Record<string, unknown>
        return {
          id: record.id,
          source: record.source,
          target: record.target,
        }
      }).filter(Boolean),
      mediaAssets,
      projectMemory: canvas?.projectMemory ?? null,
      chatMemory: canvas?.chatMemory ?? null,
      references: canvas?.references ?? null,
    }
  }

  private buildCanvasPlannerPrompt(message: string, canvas: Record<string, unknown>, mode: CanvasAgentMode = "EXECUTE") {
    return [
      "你是 StarTrails 星轨画布的 TapNow-like Canvas Agent。外部表现为一个聪明的 Chat Agent，内部像导演工作台一样读取画布、节点、媒体素材和项目记忆后再规划动作。",
      "你的目标不是闲聊，而是用最少、最准的结构化动作帮助导演/编剧/剪辑/制片把创意落到画布上。",
      "内部专家分工：1) Director 理解创作目标和下一步；2) Canvas Operator 决定节点、连接、选中和视图；3) Storyboard Artist 拆镜头/首帧/镜头意图；4) Visual Prompt Expert 写可生成的图像/视频/音频提示；5) Asset Router 判断上传素材用途。",
      "最终不要暴露专家讨论，只输出 JSON，不要 Markdown，不要解释文字。",
      "JSON 格式必须严格为：{\"assistantMessage\":\"给用户看的中文回复\",\"statusSteps\":[{\"label\":\"已读取节点\",\"status\":\"done\",\"detail\":\"读取了 3 个节点\"}],\"actions\":[{\"type\":\"操作类型\",\"params\":{}}],\"suggestions\":[{\"label\":\"继续拆分镜\",\"prompt\":\"把当前故事拆成 6 个镜头\",\"mode\":\"STORYBOARD\"}],\"needsUserConfirmation\":false,\"confidence\":0.82}。",
      "只能使用这些 action type：create_node, update_node, delete_node, connect_nodes, create_group, layout_canvas, generate_image_prompt, generate_storyboard, ask_clarification, no_action, select_node, open_panel, generate_image, sync_storyboard, focus_canvas。不要主动输出 generate_prompt 或 split_storyboard，旧名字仅用于兼容。",
      "只能使用这 6 个 node_type：text, prompt, image, storyboard, reference, group。不要输出 previs、uploaded-image、image-result 等旧类型。",
      "create_node params：node_type、title、content、prompt、position。prompt 必须是可直接交给生成模型的具体创作提示，不要只写'生成图片'。",
      "update_node/delete_node params：node_id，以及要更新的 title/content/prompt。connect_nodes params：source_node_id、target_node_id。如果刚创建连续节点不知道真实 id，可以省略 id，前端会按最近节点连接。",
      "create_group params：title、node_ids、position。layout_canvas params：layout，可选 horizontal、vertical、grid。open_panel params.panel 可为 chat/storyboard/previs/models/queue/asset/profile。",
      "generate_image_prompt params：node_id 可选、prompt/content 必填；用于把用户模糊意图整理为可生图/首帧/视频首帧提示词并写入画布节点。",
      "generate_storyboard params：shots 数组，每项包含 title、content、prompt；用于把故事拆成多个 storyboard/prompt 节点。",
      "statusSteps 要体现真实读取过程，例如：已读取节点、已读取选中节点、已分析媒体、已生成动作计划。suggestions 给 2-4 个下一步按钮。confidence 为 0-1 数字。",
      "模式规则：ASK 只分析和建议，优先 no_action，不改画布；EXECUTE 可创建/更新/连接/打开面板；STORYBOARD 优先 generate_storyboard；ORGANIZE 优先 layout_canvas/connect_nodes/create_group/update_node；IMAGE_PROMPT 优先 generate_image_prompt，只有用户明确要真实出图才 generate_image。",
      "删除节点、清空画布、大批量修改、真实生成扣费任务，必须 needsUserConfirmation=true。普通新增节点、整理、写 Prompt 可以 false。",
      "ask_clarification 只在真的无法行动时使用，params.question 写需要用户补充的问题。no_action 用于纯说明且不需要改动画布。",
      "TapNow 式体验规则：用户说得模糊时，也要先生成一个可编辑的最小工作流；不要反复追问。只有缺少文件本体或关键信息无法替代时才 ask_clarification。",
      "如果当前已有 selectedNodeId、selectedNode 或 references，请优先围绕现有节点 update_node / connect_nodes / generate_image_prompt，不要每次都新建重复节点。读取 canvas.nodes/canvas.edges/mediaAssets/projectMemory/chatMemory 后规划。",
      "动作数量控制在 1-6 个；创建节点位置要横向展开，避免重叠；assistantMessage 要短，像产品反馈，不要写长解释。",
      `当前模式：${mode}`,
      `用户输入：${message}`,
      `当前画布 JSON：${JSON.stringify(canvas).slice(0, 16000)}`,
    ].join("\n")
  }

  private parsePlannerJson(content: string) {
    const trimmed = content.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim()
    const firstBrace = trimmed.indexOf("{")
    const lastBrace = trimmed.lastIndexOf("}")
    const jsonText = firstBrace >= 0 && lastBrace > firstBrace ? trimmed.slice(firstBrace, lastBrace + 1) : trimmed
    return JSON.parse(jsonText) as RawPlannerResponse
  }

  private sanitizePlannerText(value: unknown, max = 1200) {
    return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : undefined
  }

  private sanitizeStatusSteps(value: unknown, canvas: Record<string, unknown>): CanvasAgentStatusStep[] {
    const fallback: CanvasAgentStatusStep[] = [
      { label: "已读取节点", status: "done", detail: Array.isArray(canvas.nodes) ? `读取了 ${canvas.nodes.length} 个节点` : undefined },
      { label: "已生成动作计划", status: "done" },
    ]
    if (!Array.isArray(value)) return fallback
    const allowedStatuses = new Set<AgentStepStatus>(["done", "running", "pending", "warning"])
    const steps = value.slice(0, 6).flatMap((step): CanvasAgentStatusStep[] => {
      if (!step || typeof step !== "object") return []
      const record = step as Record<string, unknown>
      const label = this.sanitizePlannerText(record.label, 80)
      if (!label) return []
      const status = typeof record.status === "string" && allowedStatuses.has(record.status as AgentStepStatus) ? record.status as AgentStepStatus : "done"
      return [{ id: this.sanitizePlannerText(record.id, 80), label, status, detail: this.sanitizePlannerText(record.detail, 160) }]
    })
    return steps.length ? steps : fallback
  }

  private sanitizeSuggestions(value: unknown, mode: CanvasAgentMode): CanvasAgentSuggestion[] {
    if (!Array.isArray(value)) return this.defaultCanvasAgentSuggestions(mode)
    const allowedModes = new Set<CanvasAgentMode>(["ASK", "EXECUTE", "STORYBOARD", "ORGANIZE", "IMAGE_PROMPT"])
    const suggestions = value.slice(0, 4).flatMap((suggestion): CanvasAgentSuggestion[] => {
      if (!suggestion || typeof suggestion !== "object") return []
      const record = suggestion as Record<string, unknown>
      const label = this.sanitizePlannerText(record.label, 40)
      const prompt = this.sanitizePlannerText(record.prompt, 400)
      if (!label || !prompt) return []
      const suggestionMode = typeof record.mode === "string" && allowedModes.has(record.mode as CanvasAgentMode) ? record.mode as CanvasAgentMode : mode
      return [{ label, prompt, mode: suggestionMode }]
    })
    return suggestions.length ? suggestions : this.defaultCanvasAgentSuggestions(mode)
  }

  private sanitizeConfidence(value: unknown) {
    return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : undefined
  }

  private defaultCanvasAgentSuggestions(mode: CanvasAgentMode, seed = ""): CanvasAgentSuggestion[] {
    const basePrompt = seed.trim() || "当前画布"
    if (mode === "STORYBOARD") return [{ label: "扩成 6 镜", prompt: `把${basePrompt}拆成 6 个电影分镜`, mode: "STORYBOARD" }, { label: "整理镜头顺序", prompt: "把当前分镜整理成起承转合的镜头顺序", mode: "ORGANIZE" }]
    if (mode === "IMAGE_PROMPT") return [{ label: "写首帧 Prompt", prompt: `根据${basePrompt}写一个可直接生图的首帧 Prompt`, mode: "IMAGE_PROMPT" }, { label: "生成参考图节点", prompt: "创建一个参考图 Prompt 节点并连接到当前镜头", mode: "EXECUTE" }]
    if (mode === "ORGANIZE") return [{ label: "横向整理", prompt: "把当前画布整理成横向工作流", mode: "ORGANIZE" }, { label: "连接最近节点", prompt: "把最近两个相关节点连起来", mode: "EXECUTE" }]
    if (mode === "ASK") return [{ label: "下一步建议", prompt: "分析当前画布，告诉我最值得做的三件事", mode: "ASK" }, { label: "转成执行", prompt: "把刚才建议转成可执行画布动作", mode: "EXECUTE" }]
    return [{ label: "拆成分镜", prompt: `把${basePrompt}拆成 3 个分镜节点`, mode: "STORYBOARD" }, { label: "生成 Prompt", prompt: `把${basePrompt}整理成可生图 Prompt`, mode: "IMAGE_PROMPT" }]
  }

  private normalizeCanvasActionType(type: string): CanvasActionType | null {
    const aliases: Record<string, CanvasActionType> = {
      generate_prompt: "generate_image_prompt",
      split_storyboard: "generate_storyboard",
    }
    const normalized = aliases[type] ?? type
    const allowedTypes = new Set<CanvasActionType>(["create_node", "update_node", "delete_node", "connect_nodes", "create_group", "layout_canvas", "generate_prompt", "split_storyboard", "generate_image_prompt", "generate_storyboard", "ask_clarification", "no_action", "select_node", "open_panel", "generate_image", "sync_storyboard", "focus_canvas"])
    return allowedTypes.has(normalized as CanvasActionType) ? normalized as CanvasActionType : null
  }

  private shouldConfirmCanvasActions(actions: PlannedCanvasAction[]) {
    return actions.some((action) => ["delete_node", "generate_image"].includes(action.type) || (action.type === "no_action" && action.params?.content?.includes("清空")))
  }

  private sanitizeCanvasActions(actions: unknown, fallbackPrompt: string): PlannedCanvasAction[] {
    if (!Array.isArray(actions)) {
      return []
    }

    const allowedNodeTypes = new Set<AgentNodeType>(["text", "prompt", "image", "storyboard", "reference", "group"])
    const allowedLayouts = new Set(["horizontal", "vertical", "grid"])

    const sanitizePosition = (value: unknown) => {
      if (!value || typeof value !== "object") return undefined
      const record = value as Record<string, unknown>
      const x = typeof record.x === "number" && Number.isFinite(record.x) ? Math.max(-5000, Math.min(5000, record.x)) : undefined
      const y = typeof record.y === "number" && Number.isFinite(record.y) ? Math.max(-5000, Math.min(5000, record.y)) : undefined
      return typeof x === "number" && typeof y === "number" ? { x, y } : undefined
    }

    const sanitizeString = (value: unknown, max = 4000) => typeof value === "string" && value.trim() ? value.trim().slice(0, max) : undefined

    return actions.slice(0, 8).flatMap((action): PlannedCanvasAction[] => {
      if (!action || typeof action !== "object") return []
      const record = action as Record<string, unknown>
      const rawType = typeof record.type === "string" ? record.type : ""
      const type = this.normalizeCanvasActionType(rawType)
      if (!type) return []
      const rawParams = record.params && typeof record.params === "object" ? record.params as Record<string, unknown> : record
      const rawNodeType = rawParams.node_type ?? rawParams.nodeKind
      const nodeType = typeof rawNodeType === "string" && allowedNodeTypes.has(rawNodeType as AgentNodeType) ? rawNodeType as AgentNodeType : undefined
      const params: PlannedCanvasAction["params"] = {
        node_type: nodeType,
        title: sanitizeString(rawParams.title, 80),
        content: sanitizeString(rawParams.content),
        prompt: sanitizeString(rawParams.prompt) ?? (type === "create_node" || type === "generate_image_prompt" || type === "generate_prompt" ? fallbackPrompt : undefined),
        node_id: sanitizeString(rawParams.node_id ?? rawParams.nodeId, 120),
        source_node_id: sanitizeString(rawParams.source_node_id ?? rawParams.sourceNodeId, 120),
        target_node_id: sanitizeString(rawParams.target_node_id ?? rawParams.targetNodeId, 120),
        group_id: sanitizeString(rawParams.group_id ?? rawParams.groupId, 120),
        question: sanitizeString(rawParams.question, 500),
        panel: sanitizeString(rawParams.panel, 40),
        position: sanitizePosition(rawParams.position),
      }

      if (Array.isArray(rawParams.node_ids)) {
        params.node_ids = rawParams.node_ids.filter((id): id is string => typeof id === "string" && Boolean(id.trim())).slice(0, 20)
      }

      if (typeof rawParams.layout === "string" && allowedLayouts.has(rawParams.layout)) {
        params.layout = rawParams.layout as "horizontal" | "vertical" | "grid"
      }

      if (Array.isArray(rawParams.shots)) {
        params.shots = rawParams.shots.slice(0, 12).flatMap((shot) => {
          if (!shot || typeof shot !== "object") return []
          const shotRecord = shot as Record<string, unknown>
          return [{
            title: sanitizeString(shotRecord.title, 80),
            content: sanitizeString(shotRecord.content),
            prompt: sanitizeString(shotRecord.prompt) ?? fallbackPrompt,
          }]
        })
      }

      if (type === "create_node" && !params.node_type) params.node_type = "prompt"
      if (type === "create_group") params.node_type = "group"
      if (type === "ask_clarification" && !params.question) params.question = "你希望我补充哪一类画布内容？"

      return [{ type: type as CanvasActionType, params }]
    })
  }

  private sanitizeChatMessages(messages: ChatCompletionMessage[]) {
    if (!Array.isArray(messages)) {
      return []
    }

    return messages
      .filter((message) => {
        if (!message || !["system", "user", "assistant"].includes(message.role)) return false
        // Support both string content and multimodal array content (OpenAI vision)
        if (typeof message.content === "string") return message.content.trim().length > 0
        if (Array.isArray(message.content)) return message.content.length > 0
        return false
      })
      .slice(-18)
      .map((message) => ({
        role: message.role,
        content: typeof message.content === "string" ? message.content.trim().slice(0, 8000) : message.content,
      }))
  }

  private buildDirectorChatSystemPrompt(canvas: Record<string, unknown>, options?: { includeCanvasContext?: boolean }): ChatCompletionMessage {
    const includeCanvasContext = options?.includeCanvasContext ?? true
    return {
      role: "system",
      content: [
        "你是 StarTrails 星轨画布里的导演 Chat 助手，产品体验参考 TapNow：用户可以像和创作搭档聊天一样推进影视、动画、广告、短片、分镜和视频生成工作流。",
        "你的职责：1) 回答影视/动画/编剧/策划问题；2) 帮用户拆故事、人物、场景、分镜、镜头语言、节奏、构图、声音和生成 Prompt；3) 结合当前画布上下文给出下一步建议；4) 当用户想改动画布时，告诉他可以切到“执行”模式让 Agent 创建节点、连接流程或触发生成。",
        "回答风格：中文为主，直接、专业、可执行。避免空泛鼓励。需要时用项目符号、镜头表、步骤清单。",
        "重要边界：不要假装已经真实生成图片/视频/音频；如果只是建议，要明确这是建议。如果缺少模型 Key、素材文件、首帧、Vidu 配置等关键信息，要指出需要补齐。",
        "如果用户只是寒暄、确认、道谢或说“你好/在吗/Hi”，只做简短自然回应，不要主动续写画布里的旧故事、旧分镜或示例内容。",
        includeCanvasContext ? `当前画布上下文 JSON：${JSON.stringify(canvas).slice(0, 10000)}` : "当前消息是普通对话，本轮不要引用画布上下文。",
      ].join("\n"),
    }
  }

  private isCasualChatMessage(message: string) {
    const normalized = message.trim().replace(/[。！!？?~～,.，\s]/g, "").toLowerCase()
    return /^(你好|您好|嗨|哈喽|hello|hi|hey|在吗|早上好|下午好|晚上好|谢谢|感谢|辛苦了|ok|好的|收到|嗯|啊|哈)$/.test(normalized)
  }

  private planCanvasActionsLocally(message: string): PlannedCanvasAction[] {
    const text = message.trim()
    const lowerText = text.toLowerCase()
    const hasAny = (keywords: string[]) => keywords.some((keyword) => lowerText.includes(keyword.toLowerCase()) || text.includes(keyword))
    const actions: PlannedCanvasAction[] = []
    const wantsImage = hasAny(["生成图片", "真实生图", "出图", "生图", "做图", "画一张", "出一张", "首帧", "image", "generate image", "text to image"])
    const wantsVideo = hasAny(["生成视频", "做视频", "图生视频", "文生视频", "转视频", "动起来", "video", "generate video"])
    const wantsAudio = hasAny(["生成音频", "做音频", "配乐", "旁白", "声音", "音效", "audio", "music", "voiceover"])
    const wantsStoryboard = hasAny(["分镜", "storyboard", "拆镜头", "拆成镜头", "拆成分镜", "镜头列表", "shot list"])
    const wantsUpload = hasAny(["上传", "导入", "文件", "素材", "参考图", "参考视频", "参考音频"])
    const wantsConnection = hasAny(["连接", "连起来", "串起来", "流程", "pipeline"])
    const wantsTextNode = hasAny(["文本", "文字", "text", "文案", "说明"])
    const wantsGroup = hasAny(["分组", "组", "group"])
    const wantsLayout = hasAny(["整理", "排版", "布局", "居中", "看全", "layout", "grid", "horizontal", "vertical"])

    if (wantsStoryboard) {
      actions.push({
        type: "split_storyboard",
        params: {
          shots: [
            { title: "镜头 1", content: text, prompt: text },
            { title: "镜头 2", content: "承接上一个镜头，强化动作和情绪变化。", prompt: text },
            { title: "镜头 3", content: "给出结尾画面或转场钩子。", prompt: text },
          ],
        },
      })
    }

    if (wantsUpload) actions.push({ type: "create_node", params: { node_type: "reference", title: "参考素材", content: text, prompt: text } })
    if (wantsImage) actions.push({ type: "create_node", params: { node_type: "image", title: "Image Prompt", content: text, prompt: text } }, { type: "generate_prompt", params: { prompt: text } })
    if (wantsVideo) actions.push({ type: "create_node", params: { node_type: "storyboard", title: "视频镜头", content: text, prompt: text } }, { type: "create_node", params: { node_type: "prompt", title: "Video Prompt", content: text, prompt: text } }, { type: "connect_nodes", params: {} })
    if (wantsAudio) actions.push({ type: "create_node", params: { node_type: "prompt", title: "Audio Prompt", content: text, prompt: text } })
    if (wantsTextNode) actions.push({ type: "create_node", params: { node_type: "text", title: "文本节点", content: text, prompt: text } })
    if (wantsConnection) actions.push({ type: "connect_nodes", params: {} })
    if (wantsGroup) actions.push({ type: "create_group", params: { title: "Agent 分组" } })
    if (wantsLayout) actions.push({ type: "layout_canvas", params: { layout: hasAny(["grid", "网格"]) ? "grid" : hasAny(["vertical", "纵向"]) ? "vertical" : "horizontal" } })

    return actions.length ? actions : [{ type: "create_node", params: { node_type: "prompt", title: "Agent Prompt", content: text, prompt: text } }]
  }

  private serializeGenerationJob(
    job: {
      id: string
      status: GenerationStatus
      organizationId: string
      projectId: string | null
      providerType: ProviderType
      model: string
      input: Prisma.JsonValue
      output: Prisma.JsonValue | null
      errorMessage: string | null
      createdAt: Date
      updatedAt: Date
    },
    output: unknown,
    usageRecord: { id: string; inputTokens: number; outputTokens: number } | null,
  ) {
    return {
      id: job.id,
      status: job.status,
      organizationId: job.organizationId,
      projectId: job.projectId,
      providerType: job.providerType,
      model: job.model,
      input: job.input,
      output,
      errorMessage: job.errorMessage,
      usage: usageRecord
        ? {
            id: usageRecord.id,
            inputTokens: usageRecord.inputTokens,
            outputTokens: usageRecord.outputTokens,
          }
        : null,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    }
  }

  private normalizeBaseUrl(baseUrl: string) {
    return baseUrl.replace(/\/v1\/?$/i, "").replace(/\/+$/, "")
  }

  private isImageModel(model?: string | null) {
    return Boolean(model?.trim() && IMAGE_MODEL_PATTERN.test(model.trim()))
  }

  private isAudioModel(model?: string | null) {
    return Boolean(model?.trim() && AUDIO_MODEL_PATTERN.test(model.trim()))
  }

  private isRealtimeModel(model?: string | null) {
    return Boolean(model?.trim() && REALTIME_MODEL_PATTERN.test(model.trim()))
  }

  private isVideoModel(model?: string | null) {
    return Boolean(model?.trim() && VIDEO_MODEL_PATTERN.test(model.trim()))
  }

  private isChatModel(model?: string | null) {
    return Boolean(model?.trim() && !this.isImageModel(model) && !this.isAudioModel(model) && !this.isRealtimeModel(model) && !this.isVideoModel(model))
  }

  private resolveChatModel(inputModel?: string | null, credentialModel?: string | null, fallback = DEFAULT_MODEL) {
    const candidate = inputModel?.trim() || credentialModel?.trim() || ""
    return candidate && this.isChatModel(candidate) ? candidate : fallback
  }

  private resolveImageModel(inputModel?: string | null, credentialModel?: string | null) {
    const candidate = inputModel?.trim() || credentialModel?.trim() || ""
    return candidate && this.isImageModel(candidate) ? candidate : DEFAULT_IMAGE_MODEL
  }

  private decrypt(payload: string) {
    const [ivText, authTagText, encryptedText] = payload.split(":")

    if (!ivText || !authTagText || !encryptedText) {
      return ""
    }

    const decipher = createDecipheriv("aes-256-gcm", this.getEncryptionKey(), Buffer.from(ivText, "base64"))
    decipher.setAuthTag(Buffer.from(authTagText, "base64"))

    return Buffer.concat([decipher.update(Buffer.from(encryptedText, "base64")), decipher.final()]).toString("utf8")
  }

  private getEncryptionKey() {
    const rawKey = this.config.get<string>("ENCRYPTION_KEY") ?? "creative-canvas-local-dev-key"
    return createHash("sha256").update(rawKey).digest()
  }

  private extractPrompt(input: Record<string, unknown>) {
    const directPrompt = input.prompt
    if (typeof directPrompt === "string") {
      return directPrompt
    }

    const analysis = input.analysis
    if (analysis && typeof analysis === "object" && "prompt" in analysis) {
      const prompt = (analysis as { prompt?: unknown }).prompt
      return typeof prompt === "string" ? prompt : ""
    }

    return ""
  }

  private extractNegativePrompt(input: Record<string, unknown>) {
    const analysis = input.analysis
    if (analysis && typeof analysis === "object" && "negativePrompt" in analysis) {
      const negativePrompt = (analysis as { negativePrompt?: unknown }).negativePrompt
      return typeof negativePrompt === "string" ? negativePrompt : ""
    }

    return ""
  }

  private extractShotDescription(input: Record<string, unknown>) {
    const analysis = input.analysis
    if (analysis && typeof analysis === "object" && "shotDescription" in analysis) {
      const shotDescription = (analysis as { shotDescription?: unknown }).shotDescription
      return typeof shotDescription === "string" ? shotDescription : ""
    }

    return ""
  }

  private composeDevOutput(input: Record<string, unknown>, prompt: string) {
    const shotDescription = this.extractShotDescription(input)
    const title =
      input.analysis && typeof input.analysis === "object" && "title" in input.analysis
        ? (input.analysis as { title?: unknown }).title
        : "Storyboard Generation"

    return [
      `任务已进入 StarTrails Generation Queue，并完成开发环境同步回写。`,
      `标题：${typeof title === "string" ? title : "Storyboard Generation"}`,
      shotDescription ? `镜头说明：${shotDescription}` : null,
      `可发送给图像/视频模型的 Prompt：${prompt}`,
    ]
      .filter(Boolean)
      .join("\n\n")
  }

  private estimateTokens(text: string) {
    return Math.max(1, Math.ceil(text.length / 4))
  }
}
