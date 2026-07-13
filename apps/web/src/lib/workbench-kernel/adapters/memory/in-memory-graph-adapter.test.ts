import test from "node:test"
import assert from "node:assert/strict"
import type {
  DomainNode,
  GraphPatch,
  GraphPort,
  NodeUpdate,
} from "../../ports/graph-port.ts"
import { GraphStoreError, InMemoryGraphAdapter } from "./in-memory-graph-adapter.ts"

function node(
  id: string,
  scope: "project" | "workspace" = "project",
  workspaceIds?: string[],
  projectId = "project-1",
): DomainNode {
  return {
    id,
    projectId,
    visibility: { scope, ...(workspaceIds === undefined ? {} : { workspaceIds }) },
    kind: "asset",
    subtype: "script",
    title: id,
    inputRefs: ["asset://input/original"],
    outputRefs: ["asset://output/original"],
    metadata: { nested: { value: "original" } },
  }
}

let operationSequence = 0

function patch(operations: GraphPatch["operations"], workspaceId = "workspace-1"): GraphPatch {
  operationSequence += 1
  return {
    operationId: `operation-${operationSequence}`,
    projectId: "project-1",
    workspaceId,
    operations,
  }
}

async function assertGraphStoreError(
  action: () => Promise<unknown>,
  code: string,
): Promise<void> {
  await assert.rejects(action, (error: unknown) => {
    assert.ok(error instanceof GraphStoreError)
    assert.equal(error.name, "GraphStoreError")
    assert.equal(error.code, code)
    assert.match(error.message, new RegExp(code))
    assert.equal(typeof error.details, "object")
    return true
  })
}

test("实现 GraphPort 全部方法", () => {
  const graph: GraphPort = new InMemoryGraphAdapter()
  assert.equal(typeof graph.queryGraph, "function")
  assert.equal(typeof graph.getNode, "function")
  assert.equal(typeof graph.validatePatch, "function")
  assert.equal(typeof graph.applyPatch, "function")
})

test("原子应用包含创建、更新、建边和删边的多操作 patch", async () => {
  const graph = new InMemoryGraphAdapter()
  await graph.applyPatch(patch([
    { type: "node.create", node: node("a") },
    { type: "node.create", node: node("b") },
    { type: "edge.create", edge: { id: "old", source: "a", target: "b", relation: "feeds" } },
  ]))

  const result = await graph.applyPatch(patch([
    { type: "node.update", nodeId: "a", changes: { title: "updated", metadata: { nested: { value: "updated" } } } },
    { type: "edge.delete", edgeId: "old" },
    { type: "node.create", node: node("c") },
    { type: "edge.create", edge: { id: "new", source: "a", target: "c", relation: "produces" } },
  ]))

  assert.deepEqual(result.nodes.map(({ id, title }) => ({ id, title })), [
    { id: "a", title: "updated" },
    { id: "b", title: "b" },
    { id: "c", title: "c" },
  ])
  assert.deepEqual(result.edges, [{ id: "new", source: "a", target: "c", relation: "produces" }])
})

test("全量校验失败时不应用前面的合法操作", async () => {
  const graph = new InMemoryGraphAdapter()
  await graph.applyPatch(patch([{ type: "node.create", node: node("a") }]))

  await assertGraphStoreError(
    () => graph.applyPatch(patch([
      { type: "node.create", node: node("b") },
      { type: "edge.create", edge: { id: "broken", source: "b", target: "missing", relation: "feeds" } },
    ])),
    "EDGE_ENDPOINT_NOT_FOUND",
  )

  assert.equal(await graph.getNode("b"), null)
  assert.deepEqual((await graph.queryGraph({ projectId: "project-1" })).nodes.map(({ id }) => id), ["a"])
})

test("queryGraph 按 workspace 可见性过滤节点，并只返回双端可见的边", async () => {
  const graph = new InMemoryGraphAdapter()
  await graph.applyPatch(patch([
    { type: "node.create", node: node("project") },
    { type: "node.create", node: node("w1", "workspace", ["workspace-1"]) },
    { type: "node.create", node: node("shared", "workspace", ["workspace-1", "workspace-2"]) },
    { type: "edge.create", edge: { id: "project-w1", source: "project", target: "w1", relation: "feeds" } },
    { type: "edge.create", edge: { id: "w1-shared", source: "w1", target: "shared", relation: "feeds" } },
  ]))

  assert.deepEqual((await graph.queryGraph({ projectId: "project-1" })).nodes.map(({ id }) => id), ["project"])
  assert.deepEqual((await graph.queryGraph({ projectId: "project-1" })).edges, [])
  assert.deepEqual(
    (await graph.queryGraph({ projectId: "project-1", workspaceId: "workspace-1" })).nodes.map(({ id }) => id),
    ["project", "w1", "shared"],
  )
  assert.deepEqual(
    (await graph.queryGraph({ projectId: "project-1", workspaceId: "workspace-2" })).nodes.map(({ id }) => id),
    ["project", "shared"],
  )
  assert.deepEqual((await graph.queryGraph({ projectId: "project-1", workspaceId: "workspace-2" })).edges, [])
})

test("写入值、查询结果、getNode 和 applyPatch 返回值均为深克隆", async () => {
  const graph = new InMemoryGraphAdapter()
  const source = node("a")
  const created = await graph.applyPatch(patch([{ type: "node.create", node: source }]))
  ;(source.metadata.nested as { value: string }).value = "source-mutated"
  ;(created.nodes[0]!.metadata.nested as { value: string }).value = "result-mutated"

  const fetched = await graph.getNode("a")
  assert.ok(fetched)
  ;(fetched.metadata.nested as { value: string }).value = "get-mutated"
  const queried = await graph.queryGraph({ projectId: "project-1" })
  ;(queried.nodes[0]!.metadata.nested as { value: string }).value = "query-mutated"

  assert.deepEqual((await graph.getNode("a"))?.metadata, { nested: { value: "original" } })
})

test("拒绝已有或同 patch 内重复的节点和边 id", async () => {
  const graph = new InMemoryGraphAdapter()
  await graph.applyPatch(patch([
    { type: "node.create", node: node("a") },
    { type: "node.create", node: node("b") },
    { type: "edge.create", edge: { id: "edge-1", source: "a", target: "b", relation: "feeds" } },
  ]))

  await assertGraphStoreError(
    () => graph.validatePatch(patch([{ type: "node.create", node: node("a") }])),
    "DUPLICATE_NODE_ID",
  )
  await assertGraphStoreError(
    () => graph.validatePatch(patch([
      { type: "node.create", node: node("c") },
      { type: "node.create", node: node("c") },
    ])),
    "DUPLICATE_NODE_ID",
  )
  await assertGraphStoreError(
    () => graph.validatePatch(patch([
      { type: "edge.create", edge: { id: "edge-1", source: "a", target: "b", relation: "feeds" } },
    ])),
    "DUPLICATE_EDGE_ID",
  )
})

test("拒绝非法更新以及不存在的更新和删除目标", async () => {
  const graph = new InMemoryGraphAdapter()
  await graph.applyPatch(patch([
    { type: "node.create", node: node("a") },
    { type: "node.create", node: node("b") },
    { type: "edge.create", edge: { id: "edge-1", source: "a", target: "b", relation: "feeds" } },
  ]))

  for (const changes of [{ id: "changed" }, { projectId: "project-2" }]) {
    await assertGraphStoreError(
      () => graph.validatePatch(patch([
        { type: "node.update", nodeId: "a", changes: changes as NodeUpdate },
      ])),
      "IMMUTABLE_NODE_FIELD",
    )
  }
  await assertGraphStoreError(
    () => graph.validatePatch(patch([{ type: "node.update", nodeId: "missing", changes: { title: "x" } }])),
    "NODE_NOT_FOUND",
  )
  await assertGraphStoreError(
    () => graph.validatePatch(patch([{ type: "edge.delete", edgeId: "missing" }])),
    "EDGE_NOT_FOUND",
  )
})

test("拒绝项目不一致、缺失端点及 patch workspace 不可见节点", async () => {
  const graph = new InMemoryGraphAdapter()
  await graph.applyPatch(patch([{ type: "node.create", node: node("a") }]))

  await assertGraphStoreError(
    () => graph.validatePatch(patch([{ type: "node.create", node: node("foreign", "project", undefined, "project-2") }])),
    "PROJECT_MISMATCH",
  )
  await assertGraphStoreError(
    () => graph.validatePatch(patch([
      { type: "edge.create", edge: { id: "broken", source: "a", target: "missing", relation: "feeds" } },
    ])),
    "EDGE_ENDPOINT_NOT_FOUND",
  )
  for (const workspaceIds of [undefined, [], ["workspace-2"]]) {
    await assertGraphStoreError(
      () => graph.validatePatch(patch([
        { type: "node.create", node: node(`workspace-${String(workspaceIds)}`, "workspace", workspaceIds) },
      ])),
      "WORKSPACE_VISIBILITY_MISMATCH",
    )
  }
})

test("同一 operationId 重试保持幂等，复用不同内容则拒绝", async () => {
  const graph = new InMemoryGraphAdapter()
  const original = patch([{ type: "node.create", node: node("a") }])

  const first = await graph.applyPatch(original)
  await graph.applyPatch({
    ...patch([{ type: "node.create", node: node("later") }]),
    operationId: "later-operation",
  })
  const retried = await graph.applyPatch(structuredClone(original))
  assert.deepEqual(retried, first)
  assert.equal((await graph.queryGraph({ projectId: "project-1" })).nodes.length, 2)

  await assertGraphStoreError(
    () => graph.applyPatch({
      ...patch([{ type: "node.create", node: node("b") }]),
      operationId: original.operationId,
    }),
    "OPERATION_ID_CONFLICT",
  )
})

test("同一 patch 内创建顺序不影响边和更新的全量校验", async () => {
  const graph = new InMemoryGraphAdapter()
  const result = await graph.applyPatch({
    ...patch([]),
    operationId: "unordered-patch",
    operations: [
      { type: "edge.create", edge: { id: "edge-1", source: "a", target: "b", relation: "feeds" } },
      { type: "node.update", nodeId: "a", changes: { title: "updated" } },
      { type: "node.create", node: node("b") },
      { type: "node.create", node: node("a") },
    ],
  })

  assert.equal(result.nodes.find(({ id }) => id === "a")?.title, "updated")
  assert.equal(result.edges.length, 1)
})

test("getNode 可按项目和工作区限制读取范围", async () => {
  const graph = new InMemoryGraphAdapter()
  await graph.applyPatch(patch([
    { type: "node.create", node: node("project") },
    { type: "node.create", node: node("private", "workspace", ["workspace-1"]) },
  ]))

  assert.equal(await graph.getNode("project", { projectId: "project-2" }), null)
  assert.equal(await graph.getNode("private", { projectId: "project-1", workspaceId: "workspace-2" }), null)
  assert.equal((await graph.getNode("private", { projectId: "project-1", workspaceId: "workspace-1" }))?.id, "private")
})

test("边操作拒绝 patch workspace 不可见端点及其他项目的既有边", async () => {
  const graph = new InMemoryGraphAdapter()
  await graph.applyPatch(patch([
    { type: "node.create", node: node("project") },
    { type: "node.create", node: node("workspace-2", "workspace", ["workspace-2"]) },
    { type: "edge.create", edge: { id: "foreign-edge", source: "project", target: "workspace-2", relation: "feeds" } },
  ], "workspace-2"))

  await assertGraphStoreError(
    () => graph.validatePatch(patch([
      { type: "edge.create", edge: { id: "hidden-edge", source: "project", target: "workspace-2", relation: "feeds" } },
    ])),
    "WORKSPACE_VISIBILITY_MISMATCH",
  )
  await assertGraphStoreError(
    () => graph.validatePatch({
      operationId: "foreign-delete",
      projectId: "project-2",
      workspaceId: "workspace-2",
      operations: [{ type: "edge.delete", edgeId: "foreign-edge" }],
    }),
    "PROJECT_MISMATCH",
  )
})
