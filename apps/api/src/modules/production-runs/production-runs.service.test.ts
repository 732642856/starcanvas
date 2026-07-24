import test from "node:test"
import assert from "node:assert/strict"

import { ProductionRunsService } from "./production-runs.service.ts"

const videoInput = {
  projectId: "project-1",
  shotId: "shot-1",
  sourceAssetId: "asset-image-1",
  prompt: "太子赵珩举起黑锅挡刀",
  durationSeconds: 5,
  referenceAssetIds: [],
  idempotencyKey: "idem-1",
}

function fakePendingVidu() {
  return {
    submitCalls: 0,
    async submit() {
      this.submitCalls += 1
      return { providerJobId: "vidu-task-1" }
    },
    async poll() {
      return { status: "POLLING" as const, raw: {} }
    },
    async cancel() {},
  }
}

function makeProductionRunsService({ provider = fakePendingVidu() } = {}) {
  const state = {
    attemptsByIdempotencyKey: new Map<string, any>(),
    run: null as any,
  }
  const prisma = {
    project: {
      findFirst: async () => ({ id: "project-1" }),
    },
    asset: {
      findFirst: async () => ({ id: "asset-image-1", projectId: "project-1", kind: "IMAGE", url: "https://api/assets/source.png" }),
    },
    generationJob: {
      create: async () => ({ id: "generation-1" }),
    },
    productionAttempt: {
      findUnique: async ({ where }: any) => state.attemptsByIdempotencyKey.get(where.idempotencyKey) ?? null,
      update: async ({ where, data }: any) => {
        const attempt = [...state.attemptsByIdempotencyKey.values()].find((item) => item.id === where.id)
        Object.assign(attempt, data)
        return attempt
      },
    },
    productionTask: {
      update: async ({ where, data }: any) => {
        const task = state.run.tasks.find((item: any) => item.id === where.id)
        Object.assign(task, data)
        return task
      },
    },
    productionRun: {
      create: async ({ data }: any) => {
        state.run = {
          id: "run-1",
          projectId: data.projectId,
          shotId: data.shotId,
          status: data.status,
          tasks: [
            {
              id: "task-1",
              status: data.tasks.create.status,
              attempts: [
                {
                  id: "attempt-1",
                  idempotencyKey: data.tasks.create.attempts.create.idempotencyKey,
                  status: data.tasks.create.attempts.create.status,
                  task: undefined,
                },
              ],
            },
          ],
        }
        state.run.tasks[0].attempts[0].task = state.run.tasks[0]
        state.run.tasks[0].attempts[0].task.run = state.run
        state.attemptsByIdempotencyKey.set(data.tasks.create.attempts.create.idempotencyKey, state.run.tasks[0].attempts[0])
        return state.run
      },
      findUnique: async () => state.run,
      update: async ({ data }: any) => {
        Object.assign(state.run, data)
        return state.run
      },
    },
    $transaction: async (callback: (tx: any) => Promise<unknown>) => callback(prisma),
  }
  const config = {
    get: (key: string) => {
      if (key === "DASHSCOPE_API_KEY") return "test-key"
      if (key === "VIDU_MODEL") return "vidu/viduq3-turbo_img2video"
      return undefined
    },
  }
  const assets = {
    registerRemoteAsset: async () => ({ id: "asset-video-1", url: "https://api/assets/video.mp4" }),
  }
  return new ProductionRunsService(prisma as any, config as any, assets as any, provider as any)
}

test("reuses an active task for the same project, shot, and idempotency key", async () => {
  const provider = fakePendingVidu()
  const service = makeProductionRunsService({ provider })
  const first = await service.createVideoRun(videoInput)
  const second = await service.createVideoRun(videoInput)
  assert.equal(second.run.id, first.run.id)
  assert.equal(provider.submitCalls, 1)
})
