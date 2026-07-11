import type { ResourceRef } from "../contracts/resource.ts"

export interface DomainNode {
  id: string
  projectId: string
  visibility: {
    scope: "project" | "workspace"
    workspaceIds?: string[]
  }
  kind: "asset" | "skill" | "department" | "review" | "workflow" | "delivery"
  subtype: string
  title: string
  inputRefs: ResourceRef[]
  outputRefs: ResourceRef[]
  skillBinding?: {
    skillId: string
    skillVersion: string
  }
  runBinding?: {
    activeRunId?: string
    lastSuccessfulRunId?: string
  }
  metadata: Record<string, unknown>
}

export interface DomainEdge {
  id: string
  source: string
  target: string
  relation: string
}

export type NodeUpdate = Partial<Omit<DomainNode, "id" | "projectId">> & {
  id?: never
  projectId?: never
}

export type GraphOperation =
  | { type: "node.create"; node: DomainNode }
  | { type: "node.update"; nodeId: string; changes: NodeUpdate }
  | { type: "edge.create"; edge: DomainEdge }
  | { type: "edge.delete"; edgeId: string }

export interface GraphPatch {
  operationId: string
  projectId: string
  workspaceId: string
  operations: GraphOperation[]
}

export interface DomainGraph {
  nodes: DomainNode[]
  edges: DomainEdge[]
}

export interface GraphPort {
  queryGraph(query: { projectId: string; workspaceId?: string }): Promise<DomainGraph>
  getNode(
    nodeId: string,
    query?: { projectId?: string; workspaceId?: string },
  ): Promise<DomainNode | null>
  validatePatch(patch: GraphPatch): Promise<void>
  applyPatch(patch: GraphPatch): Promise<DomainGraph>
}
