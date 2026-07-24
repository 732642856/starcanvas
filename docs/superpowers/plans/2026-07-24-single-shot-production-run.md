# Single-Shot Production Run Implementation Plan
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver one recoverable Vidu video-generation path from a persisted source asset to a completed video asset that is safe to export.

**Architecture:** `ProductionRun`, `ProductionTask`, and `ProductionAttempt` become the production state authority in PostgreSQL. `Asset` becomes a durable metadata record for files managed by the existing Assets module. The NestJS API owns Vidu submit/poll/cancel and exposes run status; the canvas only submits, resumes polling, and projects completed assets onto the Shot.

**Tech Stack:** NestJS 11, Prisma/PostgreSQL, TypeScript, Next.js 16, React 19, Node `node:test`, Playwright.

## File Structure

- Modify: `apps/api/prisma/schema.prisma` — add durable asset and production-run relations and enums.
- Create: `apps/api/src/modules/production-runs/production-runs.service.ts` — transaction boundaries and run state transitions.
- Create: `apps/api/src/modules/production-runs/production-runs.controller.ts` — validated HTTP endpoints.
- Create: `apps/api/src/modules/production-runs/production-runs.module.ts` — compose assets, projects, providers, and Vidu adapter.
- Create: `apps/api/src/modules/production-runs/vidu/vidu-client.ts` — provider-only submit/query/cancel/normalization.
- Create: `apps/api/src/modules/production-runs/*.test.ts` — pure state-machine and adapter tests.
- Modify: `apps/api/src/modules/assets/assets.service.ts` and `assets.controller.ts` — create/query durable asset records after file writes.
- Modify: `apps/api/src/app.module.ts` — register the production-runs module.
- Modify: `apps/api/package.json` — add an API test script using Node's TypeScript test runner.
- Create: `apps/web/src/lib/production-runs/client.ts` — typed API client and poll helper.
- Create: `apps/web/src/lib/production-runs/client.test.ts` — client request/response tests.
- Modify: `apps/web/src/app/canvas/StarCanvas.tsx` — submit/resume one `generate-video-clip` run and write completed asset references back to a Shot.
- Modify: `apps/web/src/lib/jianying/jianyingDraftExport.ts` and its test — reject a Shot without a completed durable video asset.
- Modify: `apps/web/e2e/production-run-queue.spec.ts` — browser reload/resume coverage using API mocks.
- Create: `apps/api/scripts/vidu-production-smoke.mts` — opt-in authenticated smoke test, disabled unless explicit environment variables are set.

### Task 1: Add Durable Asset and Production Models

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Modify: `apps/api/src/modules/assets/assets.service.ts`
- Modify: `apps/api/src/modules/assets/assets.controller.ts`
- Test: `apps/api/src/modules/production-runs/production-run-state.test.ts`

- [ ] **Step 1: Write the failing state transition test**

```ts
import test from "node:test"
import assert from "node:assert/strict"
import { assertProductionTaskTransition } from "./production-run-state"

test("a queued task may enter submitting but may not complete directly", () => {
  assert.doesNotThrow(() => assertProductionTaskTransition("QUEUED", "SUBMITTING"))
  assert.throws(() => assertProductionTaskTransition("QUEUED", "COMPLETED"), /Invalid production task transition/)
})
```

- [ ] **Step 2: Run the test and confirm it fails because the module does not exist**

Run: `pnpm --filter api exec node --test --experimental-strip-types src/modules/production-runs/production-run-state.test.ts`

Expected: `ERR_MODULE_NOT_FOUND` for `production-run-state`.

- [ ] **Step 3: Add Prisma enums and models**

Add `AssetKind`, `ProductionRunStatus`, and `ProductionTaskStatus`. Add the following relations; `GenerationJob` remains optional audit data and is not used as the task state machine.

```prisma
model Asset {
  id          String    @id @default(cuid())
  projectId   String?
  kind        AssetKind
  originalName String
  fileName    String
  mimeType    String
  size        Int
  storagePath String
  url         String
  project     Project?  @relation(fields: [projectId], references: [id], onDelete: SetNull)
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  outputAttempts ProductionAttempt[] @relation("ProductionOutputAsset")
  sourceAttempts ProductionAttempt[] @relation("ProductionSourceAsset")
  @@index([projectId, createdAt])
}

model ProductionRun {
  id        String              @id @default(cuid())
  projectId String
  shotId    String
  status    ProductionRunStatus @default(QUEUED)
  project   Project             @relation(fields: [projectId], references: [id], onDelete: Cascade)
  tasks     ProductionTask[]
  createdAt DateTime            @default(now())
  updatedAt DateTime            @updatedAt
  @@index([projectId, shotId, createdAt])
}

model ProductionTask {
  id        String               @id @default(cuid())
  runId     String
  action    String
  status    ProductionTaskStatus @default(QUEUED)
  input     Json
  run       ProductionRun        @relation(fields: [runId], references: [id], onDelete: Cascade)
  attempts  ProductionAttempt[]
  createdAt DateTime             @default(now())
  updatedAt DateTime             @updatedAt
  @@index([runId, status])
}

model ProductionAttempt {
  id                 String               @id @default(cuid())
  taskId             String
  generationJobId    String?
  providerJobId      String?
  idempotencyKey     String               @unique
  status             ProductionTaskStatus @default(QUEUED)
  request            Json
  providerResult     Json?
  errorMessage       String?
  sourceAssetId      String
  outputAssetId      String?
  task               ProductionTask       @relation(fields: [taskId], references: [id], onDelete: Cascade)
  generationJob      GenerationJob?       @relation(fields: [generationJobId], references: [id], onDelete: SetNull)
  sourceAsset        Asset                 @relation("ProductionSourceAsset", fields: [sourceAssetId], references: [id])
  outputAsset        Asset?                @relation("ProductionOutputAsset", fields: [outputAssetId], references: [id])
  createdAt          DateTime              @default(now())
  updatedAt          DateTime              @updatedAt
  @@index([providerJobId])
  @@index([taskId, createdAt])
}
```

Add corresponding back-relations to `Project` and `GenerationJob`. Run `pnpm --filter api prisma:generate` and create the named Prisma migration `add_production_runs`.

- [ ] **Step 4: Implement the minimal state guard**

Create `production-run-state.ts` with only the transitions needed in this release.

```ts
export type ProductionTaskState = "QUEUED" | "SUBMITTING" | "POLLING" | "COMPLETED" | "FAILED" | "CANCELED"

const allowed: Record<ProductionTaskState, ProductionTaskState[]> = {
  QUEUED: ["SUBMITTING", "CANCELED"],
  SUBMITTING: ["POLLING", "FAILED", "CANCELED"],
  POLLING: ["COMPLETED", "FAILED", "CANCELED"],
  COMPLETED: [], FAILED: ["QUEUED", "CANCELED"], CANCELED: [],
}

export function assertProductionTaskTransition(from: ProductionTaskState, to: ProductionTaskState) {
  if (!allowed[from].includes(to)) throw new Error(`Invalid production task transition: ${from} -> ${to}`)
}
```

Update `AssetsService.saveUpload` to persist an `Asset` record after the file write and return its database ID. Accept optional `projectId` in the upload DTO and verify the project through `ProjectsService` before writing.

- [ ] **Step 5: Run the focused tests and typecheck**

Run: `pnpm --filter api exec node --test --experimental-strip-types src/modules/production-runs/production-run-state.test.ts && pnpm --filter api typecheck`

Expected: one passing test and a zero-exit typecheck.

- [ ] **Step 6: Commit the model layer**

```bash
git add apps/api/prisma apps/api/src/modules/assets apps/api/src/modules/production-runs/production-run-state.ts apps/api/src/modules/production-runs/production-run-state.test.ts
git commit -m "feat(api): persist assets and production run state"
```

### Task 2: Move Vidu Protocol into the API

**Files:**
- Create: `apps/api/src/modules/production-runs/vidu/vidu-client.ts`
- Create: `apps/api/src/modules/production-runs/vidu/vidu-client.test.ts`
- Modify: `apps/web/src/app/api/ai/generate-video-vidu/route.ts`

- [ ] **Step 1: Write a failing Vidu normalization test**

```ts
test("normalizes a successful Vidu task to completed with an output URL", () => {
  assert.deepEqual(normalizeViduTask({ state: "SUCCESS", creations: [{ url: "https://cdn.example/video.mp4" }] }), {
    status: "COMPLETED", videoUrl: "https://cdn.example/video.mp4", errorMessage: undefined,
  })
})
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `pnpm --filter api exec node --test --experimental-strip-types src/modules/production-runs/vidu/vidu-client.test.ts`

Expected: missing `vidu-client` module.

- [ ] **Step 3: Implement `ViduClient`**

Move the non-UI pieces of `vidu-auth.ts`, `vidu-model.ts`, `vidu-oss.ts`, and `vidu-task.ts` into the API module. `ViduClient` exposes exactly these methods:

```ts
export interface ViduSubmission { providerJobId: string }
export interface ViduTaskResult { status: "POLLING" | "COMPLETED" | "FAILED"; videoUrl?: string; errorMessage?: string; raw: unknown }
export interface ViduClient {
  submit(input: { apiKey: string; model: string; imageUrl: string; prompt: string; duration: number; referenceImageUrls: string[] }): Promise<ViduSubmission>
  poll(input: { apiKey: string; providerJobId: string }): Promise<ViduTaskResult>
  cancel(input: { apiKey: string; providerJobId: string }): Promise<void>
}
```

Read the Vidu key from server configuration only (`DASHSCOPE_API_KEY` plus the existing compatible settings); do not accept it from the browser. Keep `cancel` best-effort: a 404/unsupported cancellation becomes a persisted local cancellation, while transport failures are returned as diagnostics.

- [ ] **Step 4: Replace the Next route with a compatibility redirect or remove its production use**

Do not delete the route in this task. Mark it legacy and route new production calls through `NEXT_PUBLIC_API_BASE_URL/api/v1/production-runs`; retain its existing tests until callers migrate.

- [ ] **Step 5: Run adapter tests and API typecheck**

Run: `pnpm --filter api exec node --test --experimental-strip-types src/modules/production-runs/vidu/vidu-client.test.ts && pnpm --filter api typecheck`

Expected: all Vidu status mappings pass and TypeScript exits zero.

- [ ] **Step 6: Commit the Vidu adapter**

```bash
git add apps/api/src/modules/production-runs/vidu apps/web/src/app/api/ai/generate-video-vidu/route.ts
git commit -m "feat(api): add Vidu production adapter"
```

### Task 3: Implement Durable Production Run APIs

**Files:**
- Create: `apps/api/src/modules/production-runs/production-runs.service.ts`
- Create: `apps/api/src/modules/production-runs/production-runs.controller.ts`
- Create: `apps/api/src/modules/production-runs/production-runs.module.ts`
- Create: `apps/api/src/modules/production-runs/production-runs.service.test.ts`
- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/api/package.json`

- [ ] **Step 1: Write a failing service test for idempotent creation**

```ts
test("reuses an active task for the same project, shot, and idempotency key", async () => {
  const service = makeProductionRunsService({ provider: fakePendingVidu() })
  const first = await service.createVideoRun(videoInput)
  const second = await service.createVideoRun(videoInput)
  assert.equal(second.run.id, first.run.id)
  assert.equal(fakePendingVidu().submitCalls, 1)
})
```

- [ ] **Step 2: Run the service test and confirm it fails**

Run: `pnpm --filter api exec node --test --experimental-strip-types src/modules/production-runs/production-runs.service.test.ts`

Expected: missing `ProductionRunsService` or `makeProductionRunsService`.

- [ ] **Step 3: Implement transactional run creation and polling**

Create DTOs with `class-validator`:

```ts
export class CreateVideoProductionRunDto {
  projectId!: string
  shotId!: string
  sourceAssetId!: string
  prompt!: string
  durationSeconds!: number
  referenceAssetIds: string[] = []
  idempotencyKey!: string
}
```

`createVideoRun` must: validate asset kind `IMAGE`; verify the project and asset ownership; reject absent Vidu configuration; find an existing nonterminal attempt for the idempotency key; otherwise create a `GenerationJob` audit row, run/task/attempt in one transaction, submit Vidu once, then store `providerJobId` and change to `POLLING` in a second transaction. If submission fails, persist `FAILED` with a normalized message.

`pollRun` must only poll persisted `POLLING` attempts. On success, download/register the video through `AssetsService`, atomically attach `outputAssetId`, complete attempt/task/run, and return the output asset DTO. On pending, retain `POLLING`; on failure, retain provider raw output and mark failed.

Expose:

```text
POST /api/v1/production-runs
GET  /api/v1/production-runs/:runId
POST /api/v1/production-runs/:runId/poll
POST /api/v1/production-runs/:runId/retry
POST /api/v1/production-runs/:runId/cancel
```

- [ ] **Step 4: Verify the service tests pass**

Run: `pnpm --filter api exec node --test --experimental-strip-types src/modules/production-runs/production-runs.service.test.ts && pnpm --filter api typecheck`

Expected: creation, recovery polling, failure, retry, and cancellation tests pass.

- [ ] **Step 5: Commit the run API**

```bash
git add apps/api/src/modules/production-runs apps/api/src/app.module.ts apps/api/package.json
git commit -m "feat(api): add durable production run endpoints"
```

### Task 4: Connect a Shot to the Run API

**Files:**
- Create: `apps/web/src/lib/production-runs/client.ts`
- Create: `apps/web/src/lib/production-runs/client.test.ts`
- Modify: `apps/web/src/app/canvas/StarCanvas.tsx`
- Modify: `apps/web/src/app/canvas/components/canvas/ProductionRunQueuePanel.tsx`
- Test: `apps/web/e2e/production-run-queue.spec.ts`

- [ ] **Step 1: Write the failing API-client test**

```ts
test("pollProductionRun returns a completed asset only after the API reports completed", async () => {
  const result = await pollProductionRun("run-1", fakeFetch({ status: "COMPLETED", outputAsset: { id: "asset-video", url: "https://api/video.mp4" } }))
  assert.equal(result.outputAsset?.id, "asset-video")
})
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `pnpm -C apps/web exec node --test --experimental-strip-types src/lib/production-runs/client.test.ts`

Expected: missing production-runs client module.

- [ ] **Step 3: Implement the client and narrow the canvas change**

Implement `createVideoProductionRun`, `getProductionRun`, `pollProductionRun`, `retryProductionRun`, and `cancelProductionRun` against `NEXT_PUBLIC_API_BASE_URL` with an explicit local default of `http://localhost:4000/api/v1`.

In the existing `generate-video-clip` branch of `StarCanvas.tsx`, replace direct `generateVideoFromImage` production execution with:

```ts
const run = await createVideoProductionRun({ projectId, shotId, sourceAssetId, prompt: motionPrompt, durationSeconds, referenceAssetIds, idempotencyKey })
updateShotProductionState(shotNode.id, { productionRunId: run.id, generationStatus: "generating" })
const completed = await waitForCompletedProductionRun(run.id, { signal })
updateShotProductionState(shotNode.id, {
  productionRunId: completed.id,
  videoAssetId: completed.outputAsset.id,
  videoUrl: completed.outputAsset.url,
  generationStatus: "completed",
})
```

Use the existing queue panel to show returned run state; it must never mark a task complete based solely on a client-side timeout. On canvas hydration, query active stored `productionRunId` values and resume polling.

- [ ] **Step 4: Add the reload E2E case**

Mock `GET /production-runs/run-1` as `POLLING` before reload and `COMPLETED` after reload. Assert the second browser session writes `videoAssetId` and a server URL to the same Shot, with no second `POST /production-runs`.

- [ ] **Step 5: Run focused browser and unit checks**

Run: `pnpm -C apps/web exec node --test --experimental-strip-types src/lib/production-runs/client.test.ts && pnpm -C apps/web exec playwright test e2e/production-run-queue.spec.ts && pnpm --filter web typecheck`

Expected: client tests, reload E2E test, and typecheck pass.

- [ ] **Step 6: Commit the canvas connection**

```bash
git add apps/web/src/lib/production-runs apps/web/src/app/canvas/StarCanvas.tsx apps/web/src/app/canvas/components/canvas/ProductionRunQueuePanel.tsx apps/web/e2e/production-run-queue.spec.ts
git commit -m "feat(web): resume video production runs from shots"
```

### Task 5: Enforce Durable-Asset Export Preflight

**Files:**
- Modify: `apps/web/src/lib/jianying/jianyingDraftExport.ts`
- Modify: `apps/web/src/lib/jianying/jianyingDraftExport.test.ts`

- [ ] **Step 1: Write the failing export test**

```ts
test("rejects a shot whose video URL has no completed durable asset id", async () => {
  await assert.rejects(
    () => exportJianyingDraft({ shots: [{ id: "shot-1", title: "Shot 1", videoUrl: "https://temporary/video.mp4" }] }),
    /completed durable video asset/,
  )
})
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `pnpm -C apps/web exec node --test --experimental-strip-types src/lib/jianying/jianyingDraftExport.test.ts`

Expected: export succeeds or produces a synthetic path, proving the missing preflight.

- [ ] **Step 3: Implement exact preflight behavior**

Require every exported video Shot to provide `videoAssetId` and a nonempty server asset URL. Collect failures with Shot order/title, throw one `JianyingExportPreflightError`, and do not create a ZIP or a `videos/shot_*.mp4` placeholder for those failures.

- [ ] **Step 4: Run export tests and typecheck**

Run: `pnpm -C apps/web exec node --test --experimental-strip-types src/lib/jianying/jianyingDraftExport.test.ts && pnpm --filter web typecheck`

Expected: incomplete exports fail with a preflight message; completed durable assets export successfully.

- [ ] **Step 5: Commit export safety**

```bash
git add apps/web/src/lib/jianying/jianyingDraftExport.ts apps/web/src/lib/jianying/jianyingDraftExport.test.ts
git commit -m "fix(export): require completed durable video assets"
```

### Task 6: Add Opt-in Real Vidu Smoke Coverage

**Files:**
- Create: `apps/api/scripts/vidu-production-smoke.mts`
- Modify: `apps/api/package.json`
- Modify: `README.md`

- [ ] **Step 1: Write the failing guard test**

```ts
test("real Vidu smoke exits without a request unless explicitly enabled", async () => {
  const result = await runSmoke({ STARCANVAS_RUN_REAL_VIDU_SMOKE: undefined })
  assert.equal(result.skipped, true)
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `pnpm --filter api exec node --test --experimental-strip-types scripts/vidu-production-smoke.test.ts`

Expected: missing smoke runner module.

- [ ] **Step 3: Implement the guarded smoke runner**

Exit successfully with `{ skipped: true }` unless `STARCANVAS_RUN_REAL_VIDU_SMOKE=1`, `DASHSCOPE_API_KEY`, `STARCANVAS_SMOKE_SOURCE_ASSET_ID`, and `STARCANVAS_SMOKE_PROJECT_ID` are all supplied. When enabled, create a production run, poll until terminal state with a bounded timeout, assert a completed `outputAssetId`, and print only IDs/statuses, never secrets or signed URLs.

Add:

```json
"test:vidu:smoke": "node --experimental-strip-types scripts/vidu-production-smoke.mts"
```

Document the exact opt-in command and the expected spend warning in `README.md`.

- [ ] **Step 4: Verify guards, tests, and build**

Run: `pnpm --filter api exec node --test --experimental-strip-types scripts/vidu-production-smoke.test.ts && pnpm --filter api typecheck && pnpm --filter web typecheck`

Expected: the smoke guard exits without network access by default; both typechecks pass.

- [ ] **Step 5: Commit verification tooling**

```bash
git add apps/api/scripts apps/api/package.json README.md
git commit -m "test: add opt-in Vidu production smoke"
```

## Plan Review

- Asset persistence is Task 1 and is not assumed to exist.
- Vidu is moved from the Next route into `apps/api` in Task 2.
- `GenerationJob` is created only as audit/usage linkage in Task 3; `ProductionTask` owns recoverable execution state.
- Tasks 4-6 cover reload recovery, export safety, contract tests, browser tests, and authenticated opt-in smoke coverage.
