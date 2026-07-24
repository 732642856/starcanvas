import { BadRequestException, NotFoundException } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { AssetKind, GenerationStatus, ProductionRunStatus, ProductionTaskStatus, ProviderType } from "@prisma/client"
import { randomUUID } from "node:crypto"
import type { AssetsService } from "../assets/assets.service.ts"
import type { PrismaService } from "../../prisma/prisma.service.ts"
import type { ViduClient } from "./vidu/vidu-client"

const NON_TERMINAL_TASK_STATUSES = new Set<ProductionTaskStatus>([
  ProductionTaskStatus.QUEUED,
  ProductionTaskStatus.SUBMITTING,
  ProductionTaskStatus.POLLING,
])

export type CreateVideoProductionRunInput = {
  projectId: string
  shotId: string
  sourceAssetId: string
  prompt: string
  durationSeconds: number
  referenceAssetIds?: string[]
  idempotencyKey: string
}

type ProductionRunWithTasks = {
  id: string
  projectId: string
  shotId: string
  status: ProductionRunStatus
  tasks?: Array<{
    id: string
    action: string
    status: ProductionTaskStatus
    attempts?: Array<{
      id: string
      providerJobId?: string | null
      status: ProductionTaskStatus
      outputAssetId?: string | null
    }>
  }>
}

export class ProductionRunsService {
  private readonly prisma: PrismaService
  private readonly config: ConfigService
  private readonly assetsService: AssetsService
  private readonly viduClient: ViduClient

  constructor(
    prisma: PrismaService,
    config: ConfigService,
    assetsService: AssetsService,
    viduClient: ViduClient,
  ) {
    this.prisma = prisma
    this.config = config
    this.assetsService = assetsService
    this.viduClient = viduClient
  }

  async createVideoRun(input: CreateVideoProductionRunInput) {
    const normalized = this.normalizeCreateInput(input)
    const existingAttempt = await this.prisma.productionAttempt.findUnique({
      where: { idempotencyKey: normalized.idempotencyKey },
      include: { task: { include: { run: true } } },
    })
    if (existingAttempt?.task?.run && NON_TERMINAL_TASK_STATUSES.has(existingAttempt.status)) {
      return { run: existingAttempt.task.run, task: existingAttempt.task, attempt: existingAttempt }
    }

    const project = await this.prisma.project.findFirst({
      where: { id: normalized.projectId },
      select: { id: true, organizationId: true },
    })
    if (!project) {
      throw new NotFoundException("Project not found")
    }
    const sourceAsset = await this.prisma.asset.findFirst({
      where: { id: normalized.sourceAssetId, OR: [{ projectId: normalized.projectId }, { projectId: null }] },
      select: { id: true, kind: true, url: true },
    })
    if (!sourceAsset) {
      throw new NotFoundException("Source asset not found")
    }
    if (sourceAsset.kind !== AssetKind.IMAGE) {
      throw new BadRequestException("Source asset must be an image")
    }
    const apiKey = this.config.get<string>("DASHSCOPE_API_KEY")?.trim()
    if (!apiKey) {
      throw new BadRequestException("DASHSCOPE_API_KEY is not configured")
    }
    const model = this.config.get<string>("VIDU_MODEL") || "vidu/viduq3-turbo_img2video"

    const created = await this.prisma.$transaction(async (tx) => {
      const generationJob = await tx.generationJob.create({
        data: {
          organizationId: project.organizationId,
          projectId: normalized.projectId,
          userId: "dev-user",
          providerType: ProviderType.OPENAI_COMPATIBLE,
          model,
          status: GenerationStatus.RUNNING,
          input: normalized,
        },
      })
      return tx.productionRun.create({
        data: {
          projectId: normalized.projectId,
          shotId: normalized.shotId,
          status: ProductionRunStatus.SUBMITTING,
          tasks: {
            create: {
              action: "generate-video-clip",
              status: ProductionTaskStatus.SUBMITTING,
              input: normalized,
              attempts: {
                create: {
                  generationJobId: generationJob.id,
                  idempotencyKey: normalized.idempotencyKey,
                  status: ProductionTaskStatus.SUBMITTING,
                  request: normalized,
                  sourceAssetId: sourceAsset.id,
                },
              },
            },
          },
        },
        include: { tasks: { include: { attempts: true } } },
      })
    }) as ProductionRunWithTasks
    const task = created.tasks?.[0]
    const attempt = task?.attempts?.[0]
    if (!task || !attempt) {
      throw new Error("Production run was created without a task attempt")
    }

    try {
      const submission = await this.viduClient.submit({
        apiKey,
        model,
        imageUrl: sourceAsset.url,
        prompt: normalized.prompt,
        duration: normalized.durationSeconds,
        referenceImageUrls: [],
      })
      const updatedAttempt = await this.prisma.productionAttempt.update({
        where: { id: attempt.id },
        data: { providerJobId: submission.providerJobId, status: ProductionTaskStatus.POLLING },
      })
      await this.prisma.productionTask.update({
        where: { id: task.id },
        data: { status: ProductionTaskStatus.POLLING },
      })
      const updatedRun = await this.prisma.productionRun.update({
        where: { id: created.id },
        data: { status: ProductionRunStatus.POLLING },
      })
      return { run: updatedRun, task: { ...task, status: ProductionTaskStatus.POLLING }, attempt: updatedAttempt }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const failedAttempt = await this.prisma.productionAttempt.update({
        where: { id: attempt.id },
        data: { status: ProductionTaskStatus.FAILED, errorMessage: message },
      })
      await this.prisma.productionTask.update({ where: { id: task.id }, data: { status: ProductionTaskStatus.FAILED } })
      const failedRun = await this.prisma.productionRun.update({ where: { id: created.id }, data: { status: ProductionRunStatus.FAILED } })
      return { run: failedRun, task: { ...task, status: ProductionTaskStatus.FAILED }, attempt: failedAttempt }
    }
  }

  async getRun(runId: string) {
    const run = await this.prisma.productionRun.findUnique({
      where: { id: runId },
      include: { tasks: { include: { attempts: { include: { outputAsset: true, sourceAsset: true } } } } },
    })
    if (!run) {
      throw new NotFoundException("Production run not found")
    }
    return run
  }

  async pollRun(runId: string) {
    const run = await this.getRun(runId)
    const task = run.tasks?.[0]
    const attempt = task?.attempts?.[0]
    if (!task || !attempt || task.status !== ProductionTaskStatus.POLLING || !attempt.providerJobId) {
      return run
    }
    const apiKey = this.config.get<string>("DASHSCOPE_API_KEY")?.trim()
    if (!apiKey) {
      throw new BadRequestException("DASHSCOPE_API_KEY is not configured")
    }
    const result = await this.viduClient.poll({ apiKey, providerJobId: attempt.providerJobId })
    if (result.status === "POLLING") {
      return run
    }
    if (result.status === "FAILED") {
      await this.prisma.productionAttempt.update({
        where: { id: attempt.id },
        data: { status: ProductionTaskStatus.FAILED, providerResult: result.raw as object, errorMessage: result.errorMessage },
      })
      await this.prisma.productionTask.update({ where: { id: task.id }, data: { status: ProductionTaskStatus.FAILED } })
      await this.prisma.productionRun.update({ where: { id: run.id }, data: { status: ProductionRunStatus.FAILED } })
      return this.getRun(run.id)
    }
    const outputAsset = await this.assetsService.registerRemoteAsset({
      projectId: run.projectId,
      kind: "video",
      originalName: `${run.shotId}.mp4`,
      mimeType: "video/mp4",
      url: result.videoUrl || "",
      storagePath: result.videoUrl,
    })
    await this.prisma.productionAttempt.update({
      where: { id: attempt.id },
      data: {
        status: ProductionTaskStatus.COMPLETED,
        providerResult: result.raw as object,
        outputAssetId: outputAsset.id,
      },
    })
    await this.prisma.productionTask.update({ where: { id: task.id }, data: { status: ProductionTaskStatus.COMPLETED } })
    await this.prisma.productionRun.update({ where: { id: run.id }, data: { status: ProductionRunStatus.COMPLETED } })
    return this.getRun(run.id)
  }

  async retryRun(runId: string) {
    const run = await this.getRun(runId)
    const task = run.tasks?.[0]
    const attempt = task?.attempts?.[0]
    if (!task || !attempt) throw new BadRequestException("Production run has no retryable task")
    return this.createVideoRun({
      ...(task.input as CreateVideoProductionRunInput),
      idempotencyKey: `${attempt.idempotencyKey}:retry:${randomUUID()}`,
    })
  }

  async cancelRun(runId: string) {
    const run = await this.getRun(runId)
    const task = run.tasks?.[0]
    const attempt = task?.attempts?.[0]
    const apiKey = this.config.get<string>("DASHSCOPE_API_KEY")?.trim()
    if (apiKey && attempt?.providerJobId) {
      await this.viduClient.cancel({ apiKey, providerJobId: attempt.providerJobId }).catch(() => undefined)
    }
    if (attempt) await this.prisma.productionAttempt.update({ where: { id: attempt.id }, data: { status: ProductionTaskStatus.CANCELED } })
    if (task) await this.prisma.productionTask.update({ where: { id: task.id }, data: { status: ProductionTaskStatus.CANCELED } })
    return this.prisma.productionRun.update({ where: { id: run.id }, data: { status: ProductionRunStatus.CANCELED } })
  }

  private normalizeCreateInput(input: CreateVideoProductionRunInput): CreateVideoProductionRunInput {
    const prompt = input.prompt?.trim()
    if (!input.projectId?.trim()) throw new BadRequestException("projectId is required")
    if (!input.shotId?.trim()) throw new BadRequestException("shotId is required")
    if (!input.sourceAssetId?.trim()) throw new BadRequestException("sourceAssetId is required")
    if (!prompt) throw new BadRequestException("prompt is required")
    if (!input.idempotencyKey?.trim()) throw new BadRequestException("idempotencyKey is required")
    return {
      ...input,
      projectId: input.projectId.trim(),
      shotId: input.shotId.trim(),
      sourceAssetId: input.sourceAssetId.trim(),
      prompt,
      durationSeconds: Math.max(1, Math.min(10, Math.round(input.durationSeconds || 5))),
      referenceAssetIds: input.referenceAssetIds || [],
      idempotencyKey: input.idempotencyKey.trim(),
    }
  }
}
