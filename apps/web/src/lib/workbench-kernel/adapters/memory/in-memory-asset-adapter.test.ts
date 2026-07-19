import test from "node:test"
import assert from "node:assert/strict"
import type { ResourceRef } from "../../contracts/resource.ts"
import type { ArtifactInput, ArtifactVersionInput, AssetPort } from "../../ports/asset-port.ts"
import { AssetStoreError, InMemoryAssetAdapter } from "./in-memory-asset-adapter.ts"

const artifactInput: ArtifactInput = {
  id: "poster",
  type: "image",
  projectId: "project-1",
  metadata: { nested: { label: "original" } },
}

function versionInput(contentRef: ResourceRef, label: string): ArtifactVersionInput {
  return {
    contentRef,
    inputRefs: ["bible://characters/hero"],
    runId: "run-1",
    qualityRef: "quality://checks/1",
    metadata: { nested: { label } },
  }
}

async function assertAssetError(
  action: () => Promise<unknown>,
  code: string,
  details?: Record<string, unknown>,
): Promise<void> {
  await assert.rejects(action, (error: unknown) => {
    assert.ok(error instanceof AssetStoreError)
    assert.equal(error.name, "AssetStoreError")
    assert.equal(error.code, code)
    assert.match(error.message, new RegExp(code))
    if (details !== undefined) assert.deepEqual(error.details, details)
    return true
  })
}

async function createArtifact(store = new InMemoryAssetAdapter()): Promise<InMemoryAssetAdapter> {
  await store.putArtifact(artifactInput)
  return store
}

async function promoteFirst(store: InMemoryAssetAdapter): Promise<void> {
  await store.createCandidateVersion("poster", versionInput("asset://blobs/v1", "v1"), 0)
  await store.promoteVersion("poster", 1, "review://approvals/1", 0)
}

test("实现 AssetPort 全部方法", () => {
  const store: AssetPort = new InMemoryAssetAdapter()
  assert.equal(typeof store.resolve, "function")
  assert.equal(typeof store.putArtifact, "function")
  assert.equal(typeof store.createCandidateVersion, "function")
  assert.equal(typeof store.promoteVersion, "function")
  assert.equal(typeof store.rejectVersion, "function")
  assert.equal(typeof store.rollbackByNewVersion, "function")
  assert.equal(typeof store.linkAssets, "function")
})

test("完整生命周期保持 append-only，candidate 不改 head，reject 保留历史", async () => {
  const store = await createArtifact()
  const candidate1 = await store.createCandidateVersion(
    "poster",
    versionInput("asset://blobs/v1", "v1"),
    0,
  )
  assert.equal(candidate1.version, 1)
  assert.equal(candidate1.status, "candidate")
  assert.equal((await store.resolve("asset://artifacts/poster"))!.headVersion, 0)

  const promoted = await store.promoteVersion("poster", 1, "review://approvals/1", 0)
  assert.equal(promoted.status, "promoted")
  assert.equal(promoted.approvalRef, "review://approvals/1")
  assert.equal((await store.resolve("asset://artifacts/poster"))!.headVersion, 1)

  const candidate2 = await store.createCandidateVersion(
    "poster",
    versionInput("asset://blobs/v2", "v2"),
    1,
  )
  const rejected = await store.rejectVersion("poster", candidate2.version, "质量不足")
  assert.equal(rejected.status, "rejected")
  assert.equal(rejected.rejectionReason, "质量不足")

  const record = await store.resolve("asset://artifacts/poster")
  assert.equal(record!.headVersion, 1)
  assert.deepEqual(record!.versions.map(({ version, status }) => ({ version, status })), [
    { version: 1, status: "promoted" },
    { version: 2, status: "rejected" },
  ])
})

test("create 和 promote 使用 expectedHead 检测版本冲突且失败不产生部分更新", async () => {
  const store = await createArtifact()
  await assertAssetError(
    () => store.createCandidateVersion("poster", versionInput("asset://blobs/v1", "v1"), 1),
    "HEAD_VERSION_CONFLICT",
    { artifactId: "poster", expectedHeadVersion: 1, actualHeadVersion: 0 },
  )
  assert.deepEqual((await store.resolve("asset://artifacts/poster"))!.versions, [])

  await store.createCandidateVersion("poster", versionInput("asset://blobs/v1", "v1"), 0)
  await assertAssetError(
    () => store.promoteVersion("poster", 1, "review://approvals/1", 1),
    "HEAD_VERSION_CONFLICT",
    { artifactId: "poster", expectedHeadVersion: 1, actualHeadVersion: 0 },
  )
  const record = await store.resolve("asset://artifacts/poster")
  assert.equal(record!.headVersion, 0)
  assert.equal(record!.versions[0].status, "candidate")
})

test("promote 只接受 review approval 和 candidate，reject 也只接受 candidate", async () => {
  const store = await createArtifact()
  await store.createCandidateVersion("poster", versionInput("asset://blobs/v1", "v1"))
  await assertAssetError(
    () => store.promoteVersion("poster", 1, "asset://not-review", 0),
    "INVALID_APPROVAL_REF",
  )
  await store.promoteVersion("poster", 1, "review://approvals/1", 0)
  await assertAssetError(
    () => store.promoteVersion("poster", 1, "review://approvals/2", 1),
    "INVALID_VERSION_STATE",
  )
  await assertAssetError(
    () => store.rejectVersion("poster", 1, "late rejection"),
    "INVALID_VERSION_STATE",
  )
})

test("rollback 仅复制旧 promoted 版本为新 promoted 补偿版本且要求匹配 head", async () => {
  const store = await createArtifact()
  await promoteFirst(store)
  await store.createCandidateVersion("poster", versionInput("asset://blobs/v2", "v2"), 1)
  await store.promoteVersion("poster", 2, "review://approvals/2", 1)

  await assertAssetError(
    () => store.rollbackByNewVersion("poster", 1, 1),
    "HEAD_VERSION_CONFLICT",
    { artifactId: "poster", expectedHeadVersion: 1, actualHeadVersion: 2 },
  )
  const rollback = await store.rollbackByNewVersion("poster", 1, 2)
  assert.equal(rollback.version, 3)
  assert.equal(rollback.status, "promoted")
  assert.equal(rollback.rollbackOf, 1)
  assert.equal(rollback.contentRef, "asset://blobs/v1")
  assert.equal((await store.resolve("asset://artifacts/poster"))!.headVersion, 3)
  assert.deepEqual(
    (await store.resolve("asset://artifacts/poster"))!.versions.map((item) => item.version),
    [1, 2, 3],
  )

  await store.createCandidateVersion("poster", versionInput("asset://blobs/v4", "v4"), 3)
  await assertAssetError(
    () => store.rollbackByNewVersion("poster", 4, 3),
    "INVALID_VERSION_STATE",
  )
})

test("resolve 支持稳定 artifact/version URI 并拒绝非法或不存在资源", async () => {
  const store = await createArtifact()
  await promoteFirst(store)

  assert.equal((await store.resolve("asset://artifacts/poster"))!.id, "poster")
  assert.equal((await store.resolve("asset://artifacts/poster/versions/1"))!.version, 1)
  assert.equal(await store.resolve("asset://artifacts/missing"), null)
  assert.equal(await store.resolve("asset://artifacts/poster/versions/99"), null)
  await assertAssetError(() => store.resolve("run://runs/1"), "UNSUPPORTED_RESOURCE_REF")
  await assertAssetError(() => store.resolve("asset://bad/path"), "UNSUPPORTED_RESOURCE_REF")
})

test("linkAssets 校验两端存在并对链接去重", async () => {
  const store = await createArtifact()
  await store.putArtifact({ id: "video", type: "video", projectId: "project-1" })

  await store.linkAssets("poster", "video")
  await store.linkAssets("poster", "video")
  assert.deepEqual((await store.resolve("asset://artifacts/poster"))!.links, ["video"])
  await assertAssetError(
    () => store.linkAssets("poster", "missing"),
    "ARTIFACT_NOT_FOUND",
    { artifactId: "missing" },
  )
})

test("禁止跨项目链接，并禁止旧 candidate 覆盖较新的正式 head", async () => {
  const store = await createArtifact()
  await store.putArtifact({ id: "foreign", type: "video", projectId: "project-2" })
  await assertAssetError(
    () => store.linkAssets("poster", "foreign"),
    "PROJECT_MISMATCH",
  )

  await store.createCandidateVersion("poster", versionInput("asset://blobs/old", "old"), 0)
  await store.createCandidateVersion("poster", versionInput("asset://blobs/new", "new"), 0)
  await store.promoteVersion("poster", 2, "review://approvals/2", 0)
  await assertAssetError(
    () => store.promoteVersion("poster", 1, "review://approvals/1", 2),
    "STALE_CANDIDATE_VERSION",
  )
  assert.equal((await store.resolve("asset://artifacts/poster"))!.headVersion, 2)
})

test("连续 rollback 保留补偿来源链", async () => {
  const store = await createArtifact()
  await promoteFirst(store)
  await store.createCandidateVersion("poster", versionInput("asset://blobs/v2", "v2"), 1)
  await store.promoteVersion("poster", 2, "review://approvals/2", 1)
  const firstRollback = await store.rollbackByNewVersion("poster", 1, 2)
  await store.createCandidateVersion("poster", versionInput("asset://blobs/v4", "v4"), firstRollback.version)
  await store.promoteVersion("poster", 4, "review://approvals/4", firstRollback.version)
  const secondRollback = await store.rollbackByNewVersion("poster", firstRollback.version, 4)

  assert.equal(secondRollback.rollbackOf, firstRollback.version)
  assert.deepEqual(secondRollback.rollbackLineage, [1, firstRollback.version])
})

test("put、version input、返回值和 resolve 结果均深克隆", async () => {
  const store = new InMemoryAssetAdapter()
  const source = structuredClone(artifactInput)
  const created = await store.putArtifact(source)
  ;(source.metadata!.nested as { label: string }).label = "changed-source"
  ;(created.metadata!.nested as { label: string }).label = "changed-return"

  const input = versionInput("asset://blobs/v1", "original-version")
  const candidate = await store.createCandidateVersion("poster", input)
  ;(input.metadata!.nested as { label: string }).label = "changed-source"
  ;(candidate.metadata!.nested as { label: string }).label = "changed-return"

  const record = await store.resolve("asset://artifacts/poster")
  ;(record!.metadata!.nested as { label: string }).label = "changed-resolve"
  ;(record!.versions[0].metadata!.nested as { label: string }).label = "changed-resolve"

  const final = await store.resolve("asset://artifacts/poster")
  assert.equal((final!.metadata!.nested as { label: string }).label, "original")
  assert.equal((final!.versions[0].metadata!.nested as { label: string }).label, "original-version")
})

test("重复 artifact 与缺失 artifact/version 使用结构化错误", async () => {
  const store = await createArtifact()
  await assertAssetError(
    () => store.putArtifact(artifactInput),
    "DUPLICATE_ARTIFACT",
    { artifactId: "poster" },
  )
  await assertAssetError(
    () => store.createCandidateVersion("missing", versionInput("asset://blobs/v1", "v1")),
    "ARTIFACT_NOT_FOUND",
    { artifactId: "missing" },
  )
  await assertAssetError(
    () => store.rejectVersion("poster", 99, "missing"),
    "VERSION_NOT_FOUND",
    { artifactId: "poster", version: 99 },
  )
})
