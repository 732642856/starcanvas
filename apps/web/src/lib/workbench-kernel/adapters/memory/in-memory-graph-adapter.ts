import type {
  DomainEdge,
  DomainGraph,
  DomainNode,
  GraphPatch,
  GraphPort,
} from "../../ports/graph-port.ts"

export type GraphStoreErrorCode =
  | "DUPLICATE_NODE_ID"
  | "DUPLICATE_EDGE_ID"
  | "NODE_NOT_FOUND"
  | "EDGE_NOT_FOUND"
  | "EDGE_ENDPOINT_NOT_FOUND"
  | "PROJECT_MISMATCH"
  | "IMMUTABLE_NODE_FIELD"
  | "WORKSPACE_VISIBILITY_MISMATCH"
  | "OPERATION_ID_CONFLICT"

export class GraphStoreError extends Error {
  readonly code: GraphStoreErrorCode
  readonly details: Record<string, unknown>

  constructor(code: GraphStoreErrorCode, details: Record<string, unknown>) {
    super(code)
    this.name = "GraphStoreError"
    this.code = code
    this.details = structuredClone(details)
  }
}

function clone<T>(value: T): T {
  return structuredClone(value)
}

function validateNodeForPatch(node: DomainNode, patch: GraphPatch): void {
  if (node.projectId !== patch.projectId) {
    throw new GraphStoreError("PROJECT_MISMATCH", {
      nodeId: node.id,
      nodeProjectId: node.projectId,
      patchProjectId: patch.projectId,
    })
  }
  if (
    node.visibility.scope === "workspace"
    && (!node.visibility.workspaceIds?.length
      || !node.visibility.workspaceIds.includes(patch.workspaceId))
  ) {
    throw new GraphStoreError("WORKSPACE_VISIBILITY_MISMATCH", {
      nodeId: node.id,
      workspaceId: patch.workspaceId,
      workspaceIds: node.visibility.workspaceIds,
    })
  }
}

function validateEdgeForPatch(
  edge: DomainEdge,
  nodes: Map<string, DomainNode>,
  patch: GraphPatch,
): void {
  const source = nodes.get(edge.source)
  const target = nodes.get(edge.target)
  if (source === undefined || target === undefined) {
    throw new GraphStoreError("EDGE_ENDPOINT_NOT_FOUND", {
      edgeId: edge.id,
      missingNodeIds: [
        ...(source === undefined ? [edge.source] : []),
        ...(target === undefined ? [edge.target] : []),
      ],
    })
  }
  validateNodeForPatch(source, patch)
  validateNodeForPatch(target, patch)
}

export class InMemoryGraphAdapter implements GraphPort {
  private nodes = new Map<string, DomainNode>()
  private edges = new Map<string, DomainEdge>()
  private readonly appliedOperations = new Map<string, { digest: string; result: DomainGraph }>()

  async queryGraph(query: { projectId: string; workspaceId?: string }): Promise<DomainGraph> {
    const nodes = [...this.nodes.values()].filter((node) =>
      node.projectId === query.projectId
      && (node.visibility.scope === "project"
        || (query.workspaceId !== undefined
          && node.visibility.workspaceIds?.includes(query.workspaceId) === true)),
    )
    const visibleIds = new Set(nodes.map(({ id }) => id))
    const edges = [...this.edges.values()].filter((edge) =>
      visibleIds.has(edge.source) && visibleIds.has(edge.target),
    )
    return clone({ nodes, edges })
  }

  async getNode(
    nodeId: string,
    query: { projectId?: string; workspaceId?: string } = {},
  ): Promise<DomainNode | null> {
    const node = this.nodes.get(nodeId)
    if (node === undefined || (query.projectId !== undefined && node.projectId !== query.projectId)) {
      return null
    }
    if (
      query.workspaceId !== undefined
      && node.visibility.scope === "workspace"
      && node.visibility.workspaceIds?.includes(query.workspaceId) !== true
    ) {
      return null
    }
    return clone(node)
  }

  async validatePatch(patch: GraphPatch): Promise<void> {
    this.simulatePatch(patch)
  }

  async applyPatch(patch: GraphPatch): Promise<DomainGraph> {
    const digest = JSON.stringify(patch)
    const applied = this.appliedOperations.get(patch.operationId)
    if (applied !== undefined) {
      if (applied.digest !== digest) {
        throw new GraphStoreError("OPERATION_ID_CONFLICT", { operationId: patch.operationId })
      }
      return clone(applied.result)
    }

    const next = this.simulatePatch(patch)
    this.nodes = next.nodes
    this.edges = next.edges
    const result = await this.queryGraph({ projectId: patch.projectId, workspaceId: patch.workspaceId })
    this.appliedOperations.set(patch.operationId, { digest, result: clone(result) })
    return result
  }

  private simulatePatch(patch: GraphPatch): {
    nodes: Map<string, DomainNode>
    edges: Map<string, DomainEdge>
  } {
    const nodes = clone(this.nodes)
    const edges = clone(this.edges)

    const phaseOrder = {
      "node.create": 0,
      "node.update": 1,
      "edge.delete": 2,
      "edge.create": 3,
    } as const
    const orderedOperations = patch.operations
      .map((operation, index) => ({ operation, index }))
      .sort((left, right) =>
        phaseOrder[left.operation.type] - phaseOrder[right.operation.type]
        || left.index - right.index,
      )
      .map(({ operation }) => operation)

    for (const operation of orderedOperations) {
      switch (operation.type) {
        case "node.create": {
          if (nodes.has(operation.node.id)) {
            throw new GraphStoreError("DUPLICATE_NODE_ID", { nodeId: operation.node.id })
          }
          validateNodeForPatch(operation.node, patch)
          nodes.set(operation.node.id, clone(operation.node))
          break
        }
        case "node.update": {
          const current = nodes.get(operation.nodeId)
          if (current === undefined) {
            throw new GraphStoreError("NODE_NOT_FOUND", { nodeId: operation.nodeId })
          }
          const runtimeChanges = operation.changes as Record<string, unknown>
          if ("id" in runtimeChanges || "projectId" in runtimeChanges) {
            throw new GraphStoreError("IMMUTABLE_NODE_FIELD", {
              nodeId: operation.nodeId,
              fields: ["id", "projectId"].filter((field) => field in runtimeChanges),
            })
          }
          if (current.projectId !== patch.projectId) {
            throw new GraphStoreError("PROJECT_MISMATCH", {
              nodeId: current.id,
              nodeProjectId: current.projectId,
              patchProjectId: patch.projectId,
            })
          }
          const updated = { ...current, ...clone(operation.changes) }
          validateNodeForPatch(updated, patch)
          nodes.set(operation.nodeId, updated)
          break
        }
        case "edge.create": {
          if (edges.has(operation.edge.id)) {
            throw new GraphStoreError("DUPLICATE_EDGE_ID", { edgeId: operation.edge.id })
          }
          validateEdgeForPatch(operation.edge, nodes, patch)
          edges.set(operation.edge.id, clone(operation.edge))
          break
        }
        case "edge.delete": {
          const edge = edges.get(operation.edgeId)
          if (edge === undefined) {
            throw new GraphStoreError("EDGE_NOT_FOUND", { edgeId: operation.edgeId })
          }
          validateEdgeForPatch(edge, nodes, patch)
          edges.delete(operation.edgeId)
          break
        }
      }
    }

    return { nodes, edges }
  }
}
